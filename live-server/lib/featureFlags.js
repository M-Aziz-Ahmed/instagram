const { getSettings } = require("../models/siteSettings");

// Server-side kill switches.
//
// `maintenance.active` already existed in siteSettings and was published to the
// client through /api/app/config, but nothing on the server ever acted on it -
// only `signupsOpen` was checked. So flipping "maintenance" in the admin panel
// changed a boolean the frontend could read and then ignore, and the site kept
// accepting writes the whole time. This module is where a flag is finally
// enforced, and it adds the granular switches that were missing.
//
// Defaults are chosen so that a problem reading settings can never take the
// site down or lock an operator out: every feature defaults to ON and
// maintenance defaults to OFF. A transient Mongo error must not silently
// disable posting or, worse, wedge everyone out of the site.

const DEFAULT_FLAGS = {
    maintenance: false,
    signupsOpen: true,
    posting: true,
    uploads: true,
    dms: true,
    liveStreams: true,
    voiceChat: true,
    comments: true,
    // QR invites. Its own switch rather than riding on `dms`, because it is
    // the one messaging feature that lets a stranger start a thread with you,
    // so it is the one most likely to need killing in a hurry.
    invites: true,
};

// Flags a client is allowed to read. Anything not listed here stays
// server-side: an internal switch is not something to advertise.
const PUBLIC_FLAGS = ["maintenance", "signupsOpen"];

let cache = { at: 0, value: null };
const TTL_MS = 5000;

// Short TTL rather than no cache: a kill switch that takes up to a few seconds
// to take effect is fine, but a Mongo round-trip on every single request is
// not. Cleared on write so an admin's change is visible immediately.
function invalidate() {
    cache = { at: 0, value: null };
}

async function getFlags() {
    const now = Date.now();
    if (cache.value && now - cache.at < TTL_MS) return cache.value;

    // Always start from the defaults and merge settings *over* them. Building a
    // fresh object from the stored document instead would mean any flag the
    // document happens to omit comes back `undefined` rather than keeping its
    // default - and `undefined` reads as "not enabled" to a truthiness check,
    // so a partial settings document would silently switch features off.
    let value = { ...DEFAULT_FLAGS };
    try {
        const s = await getSettings();
        const stored = { ...(s.features || {}) };
        // Drop explicit undefineds so they cannot clobber a default either.
        for (const k of Object.keys(stored)) {
            if (stored[k] === undefined) delete stored[k];
        }
        value = {
            ...DEFAULT_FLAGS,
            maintenance: !!s.maintenance?.active,
            signupsOpen: s.signupsOpen !== false,
            ...stored,
        };
    } catch (err) {
        // Fail open to the defaults and say so, rather than letting a settings
        // read failure surface as a 500 on every request.
        console.error("[featureFlags] failed to read settings, using defaults:", err.message);
    }

    // Coerce to booleans: a hand-edited settings document should not be able to
    // put a string where the enforcement code expects a boolean.
    for (const k of Object.keys(value)) value[k] = value[k] !== false && value[k] !== "false";

    cache = { at: now, value };
    return value;
}

async function isEnabled(flag) {
    const flags = await getFlags();
    // An unknown flag name is a programming error, not a request to disable
    // something. `!== false` would report a typo'd name as "enabled" and hide
    // it, so it is reported loudly and treated as enabled.
    if (!(flag in flags)) {
        console.warn(`[featureFlags] unknown flag "${flag}" - treating as enabled`);
        return true;
    }
    return flags[flag] !== false;
}

function publicFlags(flags) {
    const out = {};
    for (const k of PUBLIC_FLAGS) out[k] = flags[k];
    return out;
}

// ── Middleware ─────────────────────────────────────────────────────────────

// Blocks the routes behind a kill switch.
//
// Placed per-router rather than globally so that flipping "uploads" cannot
// accidentally take down, say, the games. A disabled flag yields 503 with the
// feature named, because a 403 would read as "you are not allowed" and send
// users looking for an account problem they do not have.
function requireFeature(flag) {
    return async (req, res, next) => {
        try {
            if (await isEnabled(flag)) return next();
            return res.status(503).json({
                error: `${flag} is temporarily disabled by an administrator`,
                feature: flag,
            });
        } catch {
            return next();
        }
    };
}

// Global maintenance gate.
//
// Read requests (GET/HEAD/OPTIONS) are always allowed so the app still renders
// and the client can show the maintenance banner. Writes are refused, which is
// the whole point of the switch.
//
// Two things are deliberately exempt so an operator can always undo this:
//   • /api/admin/* - otherwise the switch is a one-way door.
//   • auth routes - the operator still has to be able to log in to reach admin.
const MAINTENANCE_EXEMPT = [/^\/api\/admin(\/|$)/, /^\/api\/auth(\/|$)/];

function maintenanceGate() {
    return async (req, res, next) => {
        const method = (req.method || "GET").toUpperCase();
        if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

        const path = req.originalUrl || req.url || "";
        if (MAINTENANCE_EXEMPT.some((re) => re.test(path))) return next();

        try {
            const flags = await getFlags();
            if (!flags.maintenance) return next();

            let message = "We'll be right back — scheduled maintenance.";
            try {
                const s = await getSettings();
                if (s.maintenance?.message) message = s.maintenance.message;
            } catch {}

            return res.status(503).json({ error: message, maintenance: true });
        } catch {
            // Settings unreadable: do not block writes on a guess.
            return next();
        }
    };
}

module.exports = {
    DEFAULT_FLAGS,
    PUBLIC_FLAGS,
    getFlags,
    isEnabled,
    publicFlags,
    invalidate,
    requireFeature,
    maintenanceGate,
};
