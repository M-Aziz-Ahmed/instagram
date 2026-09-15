const express = require("express");
const Ad = require("../models/ad");

const router = express.Router();

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
