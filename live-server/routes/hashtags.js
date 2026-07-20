const express = require("express");
const Post = require("../models/post");

const router = express.Router();

// GET /trending
router.get("/trending", async (req, res) => {
    try {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const result = await Post.aggregate([
            { $match: { timeStamp: { $gte: since }, hashtags: { $exists: true, $ne: [] } } },
            { $unwind: "$hashtags" },
            { $group: { _id: "$hashtags", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]);

        return res.json(result.map((r) => ({ tag: r._id, count: r.count })));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

module.exports = router;
