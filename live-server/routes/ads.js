const express = require("express");
const Ad = require("../models/ad");

const router = express.Router();

// GET /
router.get("/", async (req, res) => {
    try {
        const now = new Date();
        const ads = await Ad.find({
            isActive: true,
            $and: [
                { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
                { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
            ],
        }).sort({ position: 1, createdAt: -1 }).lean();

        return res.json(ads);
    } catch (err) {
        console.error("Ads GET error:", err);
        return res.status(500).json({ error: "Failed to fetch ads" });
    }
});

module.exports = router;
