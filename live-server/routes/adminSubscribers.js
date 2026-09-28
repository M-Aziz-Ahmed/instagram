const express = require("express");
const User = require("../models/user");
const SubscriberLocation = require("../models/subscriberLocation");
const { requireAdmin } = require("../middleware/auth");
const { getSubscriberRecord, formatPlace, RETENTION_DAYS } = require("../lib/subscriberLocation");
const { logUser } = require("../logService");

const router = express.Router();
router.use(requireAdmin);

/**
 * Compliance disclosure of subscriber location records.
 *
 * ── The three questions ─────────────────────────────────────────────────────
 *
 *   1. "Where was this account made from?"  → origin. Written once at signup to
 *      `User.signupLocation`, permanent. `GET /:username/location`.
 *   2. "Where was he last seen?"            → latest. Written on app open to
 *      SubscriberLocation, expires after RETENTION_DAYS.
 *   3. "Where does he usually connect from?"→ places. Visit counts over the
 *      same window, same response as (1) and (2).
 *
 * ── Non-negotiables ─────────────────────────────────────────────────────────
 *
 * AUDITED. Every read of a subscriber location writes a SystemLog row naming
 * the admin, the subject, and the admin's own address. A tool that quietly
 * exports subscriber locations is the thing that ends up in a news report; a
 * tool that records who read what is the thing that survives one. The log write
 * is AWAITED before the response is sent, so a disclosure can never be served
 * without its audit row.
 *
 * ADMIN ONLY. `requireAdmin` for the whole router, not per-route.
 *
 * NO REVERSE LOOKUP ON THE DISCLOSURE ROUTE. "Who is in this city" is a real
 * question, but it trades one account's location for everyone else's, so it is
 * a separately-named route that must be asked for deliberately.
 *
 * ROUTE ORDER MATTERS. `/search` and `/place/:key` are declared before
 * `/:username/location` so a username can never shadow them.
 */

/**
 * The JWT carries only a userId, so the admin's own identity has to be resolved
 * before it can be written into an audit row. Memoised on the request: every
 * route below needs it, and an audit that recorded a raw id instead of a name
 * would be far less use to whoever reads it afterwards.
 */
async function adminName(req) {
    if (req._adminName) return req._adminName;
    const u = await User.findById(req.userId).select("username").lean();
    req._adminName = u?.username || "unknown-admin";
    return req._adminName;
}

// ── GET /api/admin/subscribers/search?q= ───────────────────────────────────
// Resolves a place name to the opaque place key the place route needs, so an
// investigator can type "Karachi" rather than construct "PK|karachi|karachi".
router.get("/search", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        if (q.length < 2) return res.status(400).json({ error: "At least 2 characters" });
        // Escaped, because this is a user-supplied pattern: unescaped, a query of
        // "." would match every document and time the collection out.
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

        const rows = await SubscriberLocation.aggregate([
            { $unwind: "$places" },
            {
                $match: {
                    $or: [
                        { "places.city": rx },
                        { "places.region": rx },
                        { "places.country": rx },
                        { "places.countryCode": rx },
                        { username: rx },
                    ],
                },
            },
            {
                $group: {
                    _id: "$places.key",
                    count: { $sum: "$places.count" },
                    accounts: { $sum: 1 },
                    country: { $first: "$places.country" },
                    countryCode: { $first: "$places.countryCode" },
                    region: { $first: "$places.region" },
                    city: { $first: "$places.city" },
                    lat: { $first: "$places.lat" },
                    lon: { $first: "$places.lon" },
                },
            },
            { $sort: { count: -1 } },
            { $limit: 40 },
        ]);

        return res.json({
            retentionDays: RETENTION_DAYS,
            results: rows.map((r) => ({
                key: r._id,
                label: formatPlace(r),
                city: r.city,
                region: r.region,
                country: r.country,
                countryCode: r.countryCode,
                lat: r.lat,
                lon: r.lon,
                visits: r.count,
                accounts: r.accounts,
            })),
        });
    } catch (err) {
        console.error("[adminSubscribers] search failed:", err.message);
        return res.status(500).json({ error: "Search failed" });
    }
});

// ── GET /api/admin/subscribers/place/:key ─────────────────────────────────
// "Who is in this place?"
//
// Capped, and keyed on an exact place key rather than a free-text match, so it
// cannot be used to sweep the collection by trying progressively shorter
// strings the way /search's regex could be.
router.get("/place/:key", async (req, res) => {
    try {
        const key = String(req.params.key || "").trim();
        if (!key || key.length > 200) return res.status(400).json({ error: "Invalid place key" });

        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
        const rows = await SubscriberLocation.find({ "places.key": key })
            .select("username places latest")
            .limit(limit)
            .lean();

        const people = rows.map((r) => {
            const place = r.places.find((p) => p.key === key);
            return {
                username: r.username,
                visits: place?.count ?? 0,
                firstSeen: place?.firstSeen || null,
                lastSeen: place?.lastSeen || null,
                lastSeenAgeMs: place?.lastSeen ? Date.now() - new Date(place.lastSeen).getTime() : null,
                lastKnownPlace: r.latest ? formatPlace(r.latest) : "",
            };
        }).sort((a, b) => b.visits - a.visits);

        const sample = rows[0]?.places.find((p) => p.key === key);

        await logUser("subscriber_place_enumerated", await adminName(req), {
            level: "warn",
            message: `Enumerated ${people.length} account(s) at place ${key}`,
            ip: req.ip,
            meta: { placeKey: key, returned: people.length, retentionDays: RETENTION_DAYS },
        });

        return res.json({
            place: sample
                ? {
                    key,
                    country: sample.country,
                    countryCode: sample.countryCode,
                    region: sample.region,
                    city: sample.city,
                    lat: sample.lat,
                    lon: sample.lon,
                    label: formatPlace(sample),
                }
                : { key, label: key },
            count: people.length,
            truncated: people.length >= limit,
            people,
            retentionDays: RETENTION_DAYS,
        });
    } catch (err) {
        console.error("[adminSubscribers] place lookup failed:", err.message);
        return res.status(500).json({ error: "Could not look up that place" });
    }
});

// ── GET /api/admin/subscribers/:username/location ──────────────────────────
router.get("/:username/location", async (req, res) => {
    try {
        const username = String(req.params.username || "").trim();
        if (!username) return res.status(400).json({ error: "username required" });

        const user = await User.findOne({ username }).select(
            "username email createdAt lastActive signupLocation isAdmin suspended",
        ).lean();
        if (!user) return res.status(404).json({ error: "No account with that username" });

        const record = await getSubscriberRecord(user);
        const admin = await adminName(req);

        // Awaited, not fire-and-forget.
        await logUser("subscriber_location_disclosed", admin, {
            level: "warn",
            message: `Location record disclosed for @${user.username}`,
            targetUser: user.username,
            ip: req.ip,
            meta: {
                subject: user.username,
                // What was actually in the response, so the audit answers "what
                // did they see" and not merely "what did they ask for".
                hadOrigin: !!(record.origin && record.origin.ip),
                hadLatest: !!record.latest,
                originAt: record.origin?.at || null,
                latestAt: record.lastSeenAt || null,
                distinctPlaces: record.distinctPlaceCount,
                retentionDays: RETENTION_DAYS,
            },
        });

        return res.json({
            subject: {
                username: user.username,
                email: user.email,
                accountCreatedAt: user.createdAt,
                lastActive: user.lastActive,
                isAdmin: !!user.isAdmin,
                suspended: !!user.suspended,
            },
            ...record,
            // Stated in the payload rather than left for the UI to know, so a
            // saved or forwarded copy of this response is self-describing.
            retention: { observationDays: RETENTION_DAYS, originRetained: "indefinitely" },
            disclosedAt: new Date(),
            disclosedBy: admin,
        });
    } catch (err) {
        console.error("[adminSubscribers] disclosure failed:", err.message);
        return res.status(500).json({ error: "Could not load the location record" });
    }
});

module.exports = router;
