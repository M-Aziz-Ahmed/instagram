const express = require("express");
const Ad = require("../models/ad");

const router = express.Router();

// GET /config
// Publishes the AdSense publisher id to the client at request time.
//
// This used to be read only from NEXT_PUBLIC_ADSENSE_CLIENT, which is inlined
// into the client bundle at *build* time. That meant the only way to configure
// it was a full rebuild + redeploy of the frontend, so an admin who added an
// AdSense ad saw an empty slot with no way to tell why. Reading a plain
// (non-NEXT_PUBLIC) server env var here means the live server can be
// reconfigured on its own.
//
// A publisher id is not a secret — it ships in every page AdSense serves — so
// this is safe to expose without auth.
router.get("/config", (req, res) => {
    return res.json({
        adsenseClient:
            process.env.ADSENSE_CLIENT || process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "",
    });
});

// GET /
router.get("/", async (req, res) => {
    try {
        const now = new Date();
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const position = req.query.position; // optional: filter by position (e.g., "pre-roll", "mid-roll", "banner")
        const page = req.query.page; // optional: filter by page/context

        const query = {
            isActive: true,
            $and: [
                { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
                { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
            ],
        };

        if (position) {
            query.position = position;
        }
        if (page) {
            query.page = page;
        }

        const ads = await Ad.find(query)
            .sort({ position: 1, createdAt: -1 })
            .limit(limit)
            .lean();

        return res.json(ads);
    } catch (err) {
        console.error("Ads GET error:", err);
        return res.status(500).json({ error: "Failed to fetch ads" });
    }
});

module.exports = router;
