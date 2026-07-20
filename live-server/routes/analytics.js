const express = require("express");
const Post = require("../models/post");
const User = require("../models/user");

const router = express.Router();

// GET /
router.get("/", async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ error: "Username required" });

        const user = await User.findOne({ username })
            .select("username avatarUrl isVerified roles createdAt")
            .populate("roles", "name badge color").lean();

        if (!user) return res.status(404).json({ error: "User not found" });

        const posts = await Post.find({ sender: username })
            .select("text imageUrl likes comments viewCount mentions hashtags timeStamp")
            .sort({ timeStamp: -1 }).lean();

        const totalPosts = posts.length;
        const totalLikes = posts.reduce((sum, p) => sum + (p.likes?.length || 0), 0);
        const totalComments = posts.reduce((sum, p) => sum + (p.comments?.length || 0), 0);
        const totalViews = posts.reduce((sum, p) => sum + (p.viewCount || 0), 0);

        const engagementRate = totalPosts > 0
            ? ((totalLikes + totalComments) / totalPosts).toFixed(1)
            : 0;

        const postsByDay = {}, likesByDay = {}, commentsByDay = {}, viewsByDay = {};

        posts.forEach((post) => {
            const date = new Date(post.timeStamp).toISOString().split("T")[0];
            postsByDay[date] = (postsByDay[date] || 0) + 1;
            likesByDay[date] = (likesByDay[date] || 0) + (post.likes?.length || 0);
            commentsByDay[date] = (commentsByDay[date] || 0) + (post.comments?.length || 0);
            viewsByDay[date] = (viewsByDay[date] || 0) + (post.viewCount || 0);
        });

        const topPosts = [...posts]
            .sort((a, b) => ((b.likes?.length || 0) + (b.comments?.length || 0)) - ((a.likes?.length || 0) + (a.comments?.length || 0)))
            .slice(0, 5)
            .map((p) => ({
                id: p._id, text: p.text?.slice(0, 100) || "", imageUrl: p.imageUrl,
                likes: p.likes?.length || 0, comments: p.comments?.length || 0,
                views: p.viewCount || 0, timeStamp: p.timeStamp,
            }));

        const hashtagCount = {};
        posts.forEach((post) => {
            (post.hashtags || []).forEach((tag) => { hashtagCount[tag] = (hashtagCount[tag] || 0) + 1; });
        });
        const topHashtags = Object.entries(hashtagCount)
            .sort(([, a], [, b]) => b - a).slice(0, 10)
            .map(([tag, count]) => ({ tag, count }));

        return res.json({
            user: {
                username: user.username, avatarUrl: user.avatarUrl,
                isVerified: user.isVerified,
                roles: (user.roles || []).map((r) => ({
                    id: r._id?.toString() ?? "", name: r.name ?? "",
                    badge: r.badge ?? "", color: r.color ?? "",
                })),
                createdAt: user.createdAt,
            },
            stats: {
                totalPosts, totalLikes, totalComments, totalViews,
                engagementRate: parseFloat(engagementRate),
            },
            charts: { postsByDay, likesByDay, commentsByDay, viewsByDay },
            topPosts, topHashtags,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch analytics" });
    }
});

module.exports = router;
