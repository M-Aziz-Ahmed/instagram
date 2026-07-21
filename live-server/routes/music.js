const express = require("express");
const ytSearch = require("yt-search");
const router = express.Router();

router.get("/search", async (req, res) => {
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ results: [] });

    try {
        const results = await ytSearch(q);
        const videos = (results.videos || []).slice(0, 15).map((v) => ({
            videoId: v.videoId,
            title: v.title,
            channelName: v.author?.name || "",
            thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
            duration: v.seconds || 0,
            durationText: v.timestamp || "",
            viewCount: v.views ? v.views.toLocaleString() : "",
        }));
        res.json({ results: videos });
    } catch (err) {
        console.error("YouTube search error:", err);
        res.status(500).json({ error: "Search failed" });
    }
});

module.exports = router;
