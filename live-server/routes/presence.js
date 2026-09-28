const express = require("express");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");
const { resolveLocation } = require("../lib/geo");
const { recordObservation } = require("../lib/subscriberLocation");
const { presenceLimiter } = require("../middleware/rateLimit");

const router = express.Router();

/**
 * POST /api/presence — "the app was opened, from here".
 *
 * This is the write path behind the admin's "where is this account's last known
 * location". It is deliberately its own tiny endpoint rather than an extra
 * effect on /api/track, for three reasons:
 *
 *  1. It needs the EXACT address, not the /24 the aggregate globe uses. A
 *     subscriber record and a population counter are different questions and
 *     cannot share one lookup.
 *  2. It needs to be throttled far harder. /api/track fires on every
 *     navigation and must never block; this fires on app open, and a hostile
 *     client looping it would be writing rows continuously.
 *  3. It must be authenticated, so an anonymous visitor cannot be recorded
 *     against an account, and a client cannot choose which account it is.
 *
 * Failure is always silent (200 with ok:false). A geolocation provider being
 * slow or down must never stop someone opening the app.
 */
router.post("/", verifyToken, presenceLimiter, async (req, res) => {
    try {
        // Throttle server-side as well as in the client: a day is the window
        // that makes "last known location" meaningful, and anything inside it
        // would only bump a counter for a place the account is already in.
        const MIN_INTERVAL_MS = 30 * 60 * 1000;
        const user = await User.findById(req.userId).select("username lastActive").lean();
        if (!user?.username) return res.status(200).json({ ok: false });

        const now = Date.now();
        if (user.lastActive && now - new Date(user.lastActive).getTime() < MIN_INTERVAL_MS) {
            // Recent enough. Still report the current time so the client can
            // settle its own backoff, but do not re-resolve geo.
            return res.status(200).json({ ok: true, throttled: true });
        }

        const resolved = await resolveLocation(req, { precise: true });
        if (!resolved) return res.status(200).json({ ok: false });

        await recordObservation({
            userId: req.userId,
            username: user.username,
            resolved,
            device: String(req.headers["user-agent"] || "").slice(0, 120),
        });

        // `lastActive` doubles as the throttle clock, so the two can never
        // disagree about when this account was last seen.
        await User.updateOne({ _id: req.userId }, { $set: { lastActive: new Date(now) } });

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.warn("[presence] record failed:", err.message);
        return res.status(200).json({ ok: false });
    }
});

module.exports = router;
