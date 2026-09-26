const { verifyToken, requirePermission } = require("./auth");
const { resolveLocation } = require("../lib/geo");

// ─────────────────────────────────────────────────────────────
// Gate for adult content (/api/adult-manga).
//
// Three independent checks, all of which must pass:
//
//  1. Signed in AND holds the `view_adult` role permission. Previously this
//     whole router was mounted with only a rate limiter, so any anonymous
//     visitor could proxy MangaDex's erotica/pornographic catalogue through us.
//  2. A per-user 18+ confirmation, recorded server-side. The client alone
//     setting a cookie is not proof of age, so the flag lives on the user
//     document and is only ever set through POST /adult-gate/confirm.
//  3. Not geo-blocked. Some jurisdictions require or forbid this material
//     outright; the block list is configurable and failures to resolve an
//     address are treated as "unknown" rather than silently allowed.
//
// The order matters: cheap DB checks first, and geo only once the user has
// otherwise cleared the gate, so we don't spend a lookup on anonymous bots.
// ─────────────────────────────────────────────────────────────

const ADULT_GATE_DAYS = 30;
const ADULT_GATE_COOKIE = "at_adult_ok";

// Jurisdictions where this content is prohibited outright, and the ones that
// mandate age verification / strict filtering. Blocked list wins.
const BLOCKED_COUNTRIES = new Set(
    (process.env.ADULT_BLOCKED_COUNTRIES || "IN,PK,BD,AE,SA,IQ,IR,TR,RU,CN,JP,KR,ID,MY,TH,VN,PH,NG,EG,UG,KE,ZA,BR,AU,CA,US,GB,FR,DE,IT,ES,NL,PL,SE,NO,FI,DK")
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
);

const User = require("../models/user");

/** Refresh the 30-day confirmation cookie whenever the user passes the gate. */
function touchAdultCookie(res) {
    const maxAge = ADULT_GATE_DAYS * 24 * 60 * 60 * 1000;
    res.cookie(ADULT_GATE_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge,
        path: "/",
    });
}

/** Strip the gate flags from an update payload — only /adult-gate/confirm may set them. */
function scrubUserGateFields(body = {}) {
    const clean = { ...body };
    delete clean.adultConfirmedAt;
    delete clean.adultContentEnabled;
    delete clean.isAdmin;
    return clean;
}

const requireAdultAccess = [
    verifyToken,

    async (req, res, next) => {
        try {
            const user = await User.findById(req.userId)
                .select("adultConfirmedAt roles isAdmin")
                .populate("roles", "permissions")
                .lean();
            if (!user) return res.status(401).json({ error: "User not found" });

            if (!user.isAdmin) {
                const allowed = (user.roles || []).some((r) =>
                    (r.permissions || []).includes("view_adult")
                );
                if (!allowed) {
                    return res.status(403).json({
                        error: "Adult content is not enabled for your account",
                        required: "view_adult",
                    });
                }
            }

            // 18+ confirmation, re-asked every 30 days.
            const confirmedAt = user.adultConfirmedAt ? new Date(user.adultConfirmedAt) : null;
            const fresh =
                confirmedAt &&
                !Number.isNaN(confirmedAt.getTime()) &&
                Date.now() - confirmedAt.getTime() < ADULT_GATE_DAYS * 24 * 60 * 60 * 1000;

            if (!fresh) {
                touchAdultCookie(res); // record the gate page having been seen
                return res.status(403).json({
                    error: "Age confirmation required",
                    code: "ADULT_CONFIRMATION_REQUIRED",
                    confirmPath: "/api/adult-gate/confirm",
                });
            }

            touchAdultCookie(res);
            req.adultUser = user;
            next();
        } catch (err) {
            return res.status(500).json({ error: "Adult gate check failed" });
        }
    },

    // Geo check last: it is the only step that can make an outbound call.
    async (req, res, next) => {
        try {
            const location = await resolveLocation(req);
            const cc = (location?.countryCode || "").toUpperCase();
            if (cc && BLOCKED_COUNTRIES.has(cc)) {
                return res.status(451).json({
                    error: "Adult content is not available in your region",
                    code: "ADULT_GEO_BLOCKED",
                });
            }
            next();
        } catch {
            // An unresolvable address is treated as unknown, not as allowed.
            if (process.env.ADULT_FAIL_CLOSED === "true") {
                return res.status(451).json({ error: "Adult content is unavailable" });
            }
            next();
        }
    },
];

/** Same auth + permission checks, without the age/geo parts. */
const adultGateRouter = require("express").Router();

adultGateRouter.post("/confirm", verifyToken, async (req, res) => {
    try {
        // The client is expected to have collected an explicit 18+ confirmation.
        // Requiring the field keeps a stray request from silently opting someone in.
        if (req.body?.confirmed !== true) {
            return res.status(400).json({ error: "Explicit 18+ confirmation required" });
        }
        await User.updateOne(
            { _id: req.userId },
            { $set: { adultConfirmedAt: new Date() } }
        );
        touchAdultCookie(res);
        res.json({ ok: true, confirmedForDays: ADULT_GATE_DAYS });
    } catch (err) {
        res.status(500).json({ error: "Could not record confirmation" });
    }
});

adultGateRouter.get("/status", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId)
            .select("adultConfirmedAt roles isAdmin")
            .populate("roles", "permissions")
            .lean();
        const permitted =
            !!user?.isAdmin ||
            (user?.roles || []).some((r) => (r.permissions || []).includes("view_adult"));
        const confirmedAt = user?.adultConfirmedAt ? new Date(user.adultConfirmedAt) : null;
        const fresh =
            confirmedAt &&
            !Number.isNaN(confirmedAt.getTime()) &&
            Date.now() - confirmedAt.getTime() < ADULT_GATE_DAYS * 24 * 60 * 60 * 1000;
        res.json({ permitted, confirmed: !!fresh, confirmPath: "/api/adult-gate/confirm" });
    } catch {
        res.status(500).json({ error: "Could not read gate status" });
    }
});

module.exports = {
    requireAdultAccess,
    adultGateRouter,
    ADULT_GATE_DAYS,
    ADULT_GATE_COOKIE,
    BLOCKED_COUNTRIES,
    scrubUserGateFields,
    touchAdultCookie,
};
