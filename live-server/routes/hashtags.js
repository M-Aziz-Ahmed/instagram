const express = require("express");
const Post = require("../models/post");

const router = express.Router();

// GET /trending
//
// `?search=` turns this into a prefix search instead of a pure trending list.
// The composer's hashtag autocomplete needs that: it used to call
// /api/search (the *user* search) whenever a hashtag was actually typed, and only
// reached this endpoint for the empty query, so the dropdown was never populated
// with hashtags. Searching here rather than filtering the trending ten on the
// client matters — the tag someone is typing is often not a trending one.
router.get("/trending", async (req, res) => {
    try {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const raw = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
        // Escape the input: it is interpolated into a RegExp, and an unescaped
        // "(" from a user typing "#a(b" would throw.
        const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const pipeline = [
            { $match: { timeStamp: { $gte: since }, hashtags: { $exists: true, $ne: [] }, isRemoved: { $ne: true } } },
            { $unwind: "$hashtags" },
            // Hashtags are stored lowercased, so a case-insensitive prefix match
            // on the stored form is enough.
            ...(escaped ? [{ $match: { hashtags: { $regex: `^${escaped}` } } }] : []),
            { $group: { _id: "$hashtags", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ];

        const result = await Post.aggregate(pipeline);

        return res.json(result.map((r) => ({ tag: r._id, count: r.count })));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

module.exports = router;
