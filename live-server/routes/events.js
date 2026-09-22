const express = require("express");
const AnalyticsEvent = require("../models/analyticsEvent");

const router = express.Router();

// POST /track — fire-and-forget telemetry beacon from the browser client.
// The client resolves device info + rough geo itself and sends it along, so
// the server never has to block on external lookups. Body is validated,
// trimmed and written; failures are swallowed (analytics must never break UX).
router.post("/", async (req, res) => {
    try {
        const { type, path, referrer, sessionId, device, location, userId } = req.body || {};

        const ev = new AnalyticsEvent({
            type: typeof type === "string" && type.length <= 32 ? type : "page_view",
            userId: userId || null,
            sessionId: typeof sessionId === "string" ? sessionId.slice(0, 64) : "",
            path: typeof path === "string" ? path.slice(0, 500) : "",
            referrer: typeof referrer === "string" ? referrer.slice(0, 300) : "",
            device: {
                type: device?.type || "",
                os: typeof device?.os === "string" ? device.os.slice(0, 40) : "",
                browser: typeof device?.browser === "string" ? device.browser.slice(0, 40) : "",
            },
            location: {
                country: typeof location?.country === "string" ? location.country.slice(0, 64) : "",
                countryCode: typeof location?.countryCode === "string" ? location.countryCode.slice(0, 3).toUpperCase() : "",
                region: typeof location?.region === "string" ? location.region.slice(0, 64) : "",
                city: typeof location?.city === "string" ? location.city.slice(0, 64) : "",
                lat: Number.isFinite(location?.lat) ? location.lat : null,
                lon: Number.isFinite(location?.lon) ? location.lon : null,
                tz: typeof location?.tz === "string" ? location.tz.slice(0, 32) : "",
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