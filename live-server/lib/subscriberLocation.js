const SubscriberLocation = require("../models/subscriberLocation");
const { MAX_HISTORY, MAX_PLACES } = require("../models/subscriberLocation");
const { resolveLocation } = require("./geo");

/**
 * Subscriber location records.
 *
 * The distinction that matters throughout:
 *
 *   ORIGIN     where the account was created from. Written once, on the User
 *              document, never expires. This is `User.signupLocation`.
 *   OBSERVED   where the account has connected from since. Written on app open,
 *              expires after RETENTION_DAYS.
 *
 * An investigator asking "where was this account made from" needs the first;
 * "where was he last seen" needs the second. Keeping them apart means a dormant
 * account still answers the first question, which it would not if origin lived
 * in the TTL'd collection.
 *
 * ── Why the raw address is stored ───────────────────────────────────────────
 * A city name is not actionable. Turning an address into a person's name
 * requires the ISP that allocated it, so the address is the record and the
 * derived place is a convenience attached to it. Nothing here is ever returned
 * by a public endpoint, and every disclosure is written to SystemLog by the
 * route that performs it (see routes/adminSubscribers.js).
 */

/** A stable identity for a place, so repeats collapse into one entry. */
function placeKey(loc) {
    const cc = (loc.countryCode || "").toUpperCase();
    const region = (loc.region || "").trim().toLowerCase();
    const city = (loc.city || "").trim().toLowerCase();
    // Falling back to a rounded coordinate keeps distinct towns separate when
    // the provider omits a city, instead of merging everything unnamed into one
    // bucket that then reads as "this account only ever visits one place".
    const approx = Number.isFinite(loc.lat) && Number.isFinite(loc.lon)
        ? `${loc.lat.toFixed(1)},${loc.lon.toFixed(1)}`
        : "unknown";
    return `${cc}|${region}|${city || approx}`;
}

/** Human-readable one-liner used in the admin UI and disclosures. */
function formatPlace(loc) {
    return [loc.city, loc.region, loc.country].filter(Boolean).join(", ") || "Unknown location";
}

/**
 * Stamp the permanent origin record on a user document.
 *
 * Uses $setOnInsert-style semantics via a guarded update so a retried signup
 * cannot move the origin: the filter requires the field to still be empty, and
 * a second attempt simply matches nothing. That is deliberate — "where was this
 * account made from" should mean the first connection, not the most recent
 * retry of a flaky OTP flow.
 */
async function recordSignupOrigin(userId, resolved, device = "") {
    if (!userId || !resolved?.ip) return null;
    const loc = resolved.location || {};
    const origin = {
        ip: resolved.ip,
        network: resolved.network || "",
        country: loc.country || "",
        countryCode: loc.countryCode || "",
        region: loc.region || "",
        city: loc.city || "",
        lat: Number.isFinite(loc.lat) ? loc.lat : null,
        lon: Number.isFinite(loc.lon) ? loc.lon : null,
        tz: loc.tz || "",
        device: typeof device === "string" ? device.slice(0, 24) : "",
        at: new Date(),
    };

    const User = require("../models/user");
    // Filter on the existing value rather than on a boolean flag, so a
    // concurrent double-signup cannot have the second writer win.
    const res = await User.updateOne(
        {
            _id: userId,
            $or: [
                { "signupLocation.at": null },
                { "signupLocation.at": { $exists: false } },
            ],
        },
        { $set: { signupLocation: origin } },
    );
    return res.modifiedCount > 0 ? origin : null;
}

/**
 * Record an observation for a signed-in account.
 *
 * Written on app open, not on every page view, so this is one small upsert per
 * session rather than a write per navigation. Callers throttle; see
 * routes/presence.js.
 *
 * Read-then-write rather than one clever upsert. An upsert with arrayFilters
 * cannot both "update the matching element" and "insert a new element", and
 * `$inc` through a positional filter on a document created by the same upsert
 * fails outright because the array does not exist yet. Since this runs once per
 * app open and the document is one small row, a read first is the version that
 * is actually correct.
 */
async function recordObservation({ userId, username, resolved, device = "" }) {
    if (!userId || !resolved?.ip) return null;
    const loc = resolved.location || null;
    const now = new Date();

    const observation = {
        ip: resolved.ip,
        network: resolved.network || "",
        country: loc?.country || "",
        countryCode: loc?.countryCode || "",
        region: loc?.region || "",
        city: loc?.city || "",
        lat: Number.isFinite(loc?.lat) ? loc.lat : null,
        lon: Number.isFinite(loc?.lon) ? loc.lon : null,
        tz: loc?.tz || "",
        device: typeof device === "string" ? device.slice(0, 24) : "",
        at: now,
    };

    // No usable place: record the address, but do not pollute `places` with an
    // "unknown" bucket or spend a history slot on it. The address alone is
    // still the most useful part of the record.
    const key = loc ? placeKey(loc) : null;

    const existing = await SubscriberLocation.findOne({ userId })
        .select("latest places")
        .lean();

    // A place change is what earns a history slot. Staying on the same wifi all
    // afternoon updates `latest` and the visit counter without filling the
    // journey with one entry repeated twenty times.
    const previousKey = existing?.latest ? placeKey(existing.latest) : null;
    const changedPlace = key !== null && key !== previousKey;
    const knownPlace = key !== null && existing?.places?.some((p) => p.key === key);

    const set = { username: username || "", latest: observation, updatedAt: now };
    const inc = {};
    const push = {};
    // Scoped to the ONE place being counted. An unscoped `[{ "p.key": { $exists:
    // true } }]` would match every entry and rewrite all of their counters.
    const arrayFilters = knownPlace ? [{ "p.key": key }] : undefined;

    if (knownPlace) {
        // $inc rather than a read-modify-write of `count`: two app opens racing
        // would otherwise lose one visit.
        inc["places.$[p].count"] = 1;
        set["places.$[p].lastSeen"] = now;
    }

    if (key && !knownPlace) {
        // Positive `$slice` with `$position: 0` keeps the NEWEST N. A negative
        // slice would keep the oldest and silently discard the observation that
        // just arrived.
        push.places = {
            $each: [{
                key,
                country: observation.country,
                countryCode: observation.countryCode,
                region: observation.region,
                city: observation.city,
                lat: observation.lat,
                lon: observation.lon,
                tz: observation.tz,
                count: 1,
                firstSeen: now,
                lastSeen: now,
            }],
            $position: 0,
            $slice: MAX_PLACES,
        };
    }

    if (changedPlace) {
        push.history = { $each: [observation], $position: 0, $slice: MAX_HISTORY };
    }

    const doc = await SubscriberLocation.findOneAndUpdate(
        { userId },
        {
            $set: set,
            ...(Object.keys(inc).length ? { $inc: inc } : {}),
            ...(Object.keys(push).length ? { $push: push } : {}),
        },
        { upsert: true, new: true, ...(arrayFilters ? { arrayFilters } : {}) },
    );

    return doc;
}

/**
 * Everything an investigator needs for one account, in a shape the UI can
 * render without further joins.
 */
async function getSubscriberRecord(user) {
    if (!user?._id) return null;
    const obs = await SubscriberLocation.findOne({ userId: user._id }).lean();
    const origin = user.signupLocation || null;
    return {
        username: user.username,
        accountCreatedAt: user.createdAt || null,
        origin: origin?.at
            ? { ...origin, place: formatPlace(origin) }
            : { available: false },
        // "Last location" is only meaningful with its age, and the age is what
        // decides whether it is evidence or rumour, so it is computed here
        // rather than in the browser.
        latest: obs?.latest
            ? { ...obs.latest, place: formatPlace(obs.latest) }
            : null,
        lastSeenAt: obs?.latest?.at || null,
        lastSeenAgeMs: obs?.latest?.at ? Date.now() - new Date(obs.latest.at).getTime() : null,
        history: (obs?.history || []).map((h) => ({ ...h, place: formatPlace(h) })),
        frequentPlaces: (obs?.places || [])
            .slice()
            .sort((a, b) => b.count - a.count)
            .map((p) => ({
                ...p,
                place: formatPlace(p),
                lastSeenAgeMs: p.lastSeen ? Date.now() - new Date(p.lastSeen).getTime() : null,
            })),
        distinctPlaceCount: (obs?.places || []).length,
    };
}

module.exports = {
    recordSignupOrigin,
    recordObservation,
    getSubscriberRecord,
    placeKey,
    formatPlace,
    RETENTION_DAYS: SubscriberLocation.RETENTION_DAYS,
};
