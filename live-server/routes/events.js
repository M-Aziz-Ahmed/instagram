const express = require("express");
const AnalyticsEvent = require("../models/analyticsEvent");
const { resolveLocation } = require("../lib/geo");
const { optionalAuth } = require("../middleware/auth");

const router = express.Router();

// POST /track — fire-and-forget telemetry beacon from the browser client.
//
// The client only sends what it legitimately knows (page, referrer, device
// shape, its own session id). Two things are deliberately NOT taken from the
// body:
//   - `location` — resolved server-side from the connection IP in lib/geo.js,
//     so a caller can't fabricate a city and the raw IP never leaves the server.
//   - `userId`   — read from the session cookie, so events can't be attributed
//     to an arbitrary account by a hostile client.
//
// Failures are swallowed: analytics must never break the page that sent them.
router.post("/", optionalAuth, async (req, res) => {
    try {
        const { type, path, referrer, sessionId, device } = req.body || {};

        // Resolving geo can mean a (cached) outbound call, so kick it off
        // alongside the validation instead of serially ahead of the write.
        const locationPromise = resolveLocation(req);

        let location = null;
        try {
            location = await locationPromise;
        } catch {
            location = null;
        }

        const ev = new AnalyticsEvent({
            type: typeof type === "string" && type.length <= 32 ? type : "page_view",
            userId: req.userId || null,
            sessionId: typeof sessionId === "string" ? sessionId.slice(0, 64) : "",
            path: typeof path === "string" ? path.slice(0, 500) : "",
            referrer: typeof referrer === "string" ? referrer.slice(0, 300) : "",
            device: {
                type: ["mobile", "tablet", "desktop", "bot", ""].includes(device?.type) ? device.type : "",
                os: typeof device?.os === "string" ? device.os.slice(0, 40) : "",
                browser: typeof device?.browser === "string" ? device.browser.slice(0, 40) : "",
            },
            location: {
                country: location?.country || "",
                countryCode: location?.countryCode || "",
                region: location?.region || "",
                city: location?.city || "",
                lat: location?.lat ?? null,
                lon: location?.lon ?? null,
                tz: location?.tz || "",
            },
        });

        await ev.save();
        res.status(201).json({ ok: true });
    } catch (err) {
        console.warn("[TRACK] failed to store event:", err.message);
        res.status(200).json({ ok: false }); // never fail loudly
    }
});

module.exports = router;
