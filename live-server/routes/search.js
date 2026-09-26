const express = require("express");
const Post = require("../models/post");
const User = require("../models/user");
const { getHiddenUsers } = require("../lib/visibility");

const router = express.Router();

// GET /
router.get("/", async (req, res) => {
    try {
        const q = req.query.q?.trim();
        if (!q) return res.json({ users: [], posts: [], hashtags: [] });

        const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

        // Blocked/muted accounts stay unsearchable, and their posts do not
        // surface in results for anyone who blocked them.
        const hidden = await getHiddenUsers(req.query.username);
        const hiddenVariants = [...new Set(hidden.flatMap((h) => [h, h.toLowerCase()]))];

        const userQuery = { username: regex };
        if (hiddenVariants.length) {
            userQuery.username = { $regex: regex.source, $options: "i", $nin: hiddenVariants };
        }

        const users = await User.find(userQuery)
            .select("username avatarColor avatarUrl isVerified isAdmin roles")
            .populate("roles", "name badge color")
            .limit(10).lean();

        const postQuery = {
            $or: [{ text: regex }, { hashtags: regex }],
            isRemoved: { $ne: true },
        };
        if (hiddenVariants.length) postQuery.sender = { $nin: hiddenVariants };

        const posts = await Post.find(postQuery)
            .sort({ timeStamp: -1 }).limit(20).lean();

        const hashtagResults = await Post.aggregate([
            { $match: { isRemoved: { $ne: true }, ...(hiddenVariants.length ? { sender: { $nin: hiddenVariants } } : {}) } },
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
