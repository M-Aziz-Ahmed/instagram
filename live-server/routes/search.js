const express = require("express");
const Post = require("../models/post");
const User = require("../models/user");

const router = express.Router();

// GET /
router.get("/", async (req, res) => {
    try {
        const q = req.query.q?.trim();
        if (!q) return res.json({ users: [], posts: [], hashtags: [] });

        const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

        const users = await User.find({ username: regex })
            .select("username avatarColor avatarUrl isVerified isAdmin roles")
            .populate("roles", "name badge color")
            .limit(10).lean();

        const posts = await Post.find({ $or: [{ text: regex }, { hashtags: regex }] })
            .sort({ timeStamp: -1 }).limit(20).lean();

        const hashtagResults = await Post.aggregate([
            { $unwind: "$hashtags" },
            { $match: { hashtags: regex } },
            { $group: { _id: "$hashtags", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]);

        const hashtags = hashtagResults.map((r) => ({ tag: r._id, count: r.count }));
        return res.json({ users, posts, hashtags });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Search failed" });
    }
});

module.exports = router;
