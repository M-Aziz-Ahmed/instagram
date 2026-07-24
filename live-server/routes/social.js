const express = require("express");
const Post = require("../models/post");
const User = require("../models/user");

const router = express.Router();

// GET /leaderboard — top users by different metrics
router.get("/leaderboard", async (req, res) => {
    try {
        const { period, metric, limit: limitStr } = req.query;
        const limit = Math.min(parseInt(limitStr || "20", 10), 50);

        let matchStage = { isScheduled: false };
        if (period === "week") {
            matchStage.timeStamp = { $gte: new Date(Date.now() - 7 * 86400000) };
        } else if (period === "month") {
            matchStage.timeStamp = { $gte: new Date(Date.now() - 30 * 86400000) };
        }

        if (metric === "views") {
            const result = await Post.aggregate([
                { $match: matchStage },
                { $group: { _id: "$sender", totalViews: { $sum: "$viewCount" }, totalPosts: { $sum: 1 } } },
                { $sort: { totalViews: -1 } },
                { $limit: limit },
            ]);
            return res.json(result.map((r) => ({ username: r._id, totalViews: r.totalViews, totalPosts: r.totalPosts })));
        }

        if (metric === "comments") {
            const result = await Post.aggregate([
                { $match: matchStage },
                { $unwind: "$comments" },
                { $group: { _id: "$sender", totalComments: { $sum: 1 } } },
                { $sort: { totalComments: -1 } },
                { $limit: limit },
            ]);
            return res.json(result.map((r) => ({ username: r._id, totalComments: r.totalComments })));
        }

        const result = await Post.aggregate([
            { $match: matchStage },
            { $project: { sender: 1, likeCount: { $size: "$likes" } } },
            { $group: { _id: "$sender", totalLikes: { $sum: "$likeCount" }, totalPosts: { $sum: 1 } } },
            { $sort: { totalLikes: -1 } },
            { $limit: limit },
        ]);

        const usernames = result.map((r) => r._id);
        const users = await User.find({ username: { $in: usernames } })
            .select("username avatarUrl avatarColor isVerified isAdmin achievements postingStreak")
            .lean();
        const userMap = {};
        users.forEach((u) => { userMap[u.username] = u; });

        return res.json(result.map((r) => ({
            username: r._id,
            totalLikes: r.totalLikes,
            totalPosts: r.totalPosts,
            avatarUrl: userMap[r._id]?.avatarUrl || "",
            avatarColor: userMap[r._id]?.avatarColor || "#3b82f6",
            isVerified: userMap[r._id]?.isVerified || false,
            isAdmin: userMap[r._id]?.isAdmin || false,
            achievements: userMap[r._id]?.achievements || [],
            postingStreak: userMap[r._id]?.postingStreak || 0,
        })));
    } catch (error) {
        console.error("[leaderboard] Error:", error.message);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /trending — trending hashtags and hot posts
router.get("/trending", async (req, res) => {
    try {
        const since = new Date(Date.now() - 24 * 86400000);
        const hashtagResult = await Post.aggregate([
            { $match: { timeStamp: { $gte: since }, isScheduled: false, isRemoved: { $ne: true } } },
            { $unwind: "$hashtags" },
            { $group: { _id: "$hashtags", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]);

        const hotPosts = await Post.aggregate([
            { $match: { timeStamp: { $gte: since }, isScheduled: false, isRemoved: { $ne: true } } },
            { $project: { sender: 1, text: { $substrCP: ["$text", 0, 200] }, likeCount: { $size: "$likes" }, commentCount: { $size: "$comments" }, viewCount: 1, timeStamp: 1 } },
            { $addFields: { score: { $add: ["$likeCount", { $multiply: ["$commentCount", 2] }, { $divide: ["$viewCount", 10] }] } } },
            { $sort: { score: -1 } },
            { $limit: 5 },
        ]);

        const hotUsernames = hotPosts.map((p) => p.sender);
        const hotUsers = await User.find({ username: { $in: hotUsernames } })
            .select("username avatarUrl avatarColor isVerified isAdmin")
            .lean();
        const hotUserMap = {};
        hotUsers.forEach((u) => { hotUserMap[u.username] = u; });

        return res.json({
            hashtags: hashtagResult.map((h) => ({ tag: h._id, count: h.count })),
            hotPosts: hotPosts.map((p) => ({
                id: p._id.toString(),
                sender: p.sender,
                text: p.text,
                likeCount: p.likeCount,
                commentCount: p.commentCount,
                viewCount: p.viewCount,
                score: p.score,
                timeStamp: p.timeStamp,
                avatarUrl: hotUserMap[p.sender]?.avatarUrl || "",
                avatarColor: hotUserMap[p.sender]?.avatarColor || "#3b82f6",
                isVerified: hotUserMap[p.sender]?.isVerified || false,
            })),
        });
    } catch (error) {
        console.error("[trending] Error:", error.message);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /suggested — suggested users to follow
router.get("/suggested", async (req, res) => {
    try {
        const { username, limit: limitStr } = req.query;
        const limit = Math.min(parseInt(limitStr || "10", 10), 30);

        let currentUser = null;
        if (username) {
            currentUser = await User.findOne({ username }).select("following").lean();
        }

        const followingSet = new Set(currentUser?.following || []);
        followingSet.add(username);

        const since = new Date(Date.now() - 30 * 86400000);

        const activeUsers = await Post.aggregate([
            { $match: { timeStamp: { $gte: since }, isScheduled: false } },
            { $group: { _id: "$sender", postCount: { $sum: 1 }, totalLikes: { $sum: { $size: "$likes" } } } },
            { $match: { _id: { $nin: [...followingSet] } } },
            { $sort: { totalLikes: -1 } },
            { $limit: limit * 2 },
        ]);

        const candidates = activeUsers.map((u) => u._id);
        const users = await User.find({ username: { $in: candidates } })
            .select("username avatarUrl avatarColor isVerified isAdmin bio postingStreak achievements")
            .lean();

        const statsMap = {};
        activeUsers.forEach((u) => { statsMap[u._id] = { postCount: u.postCount, totalLikes: u.totalLikes }; });

        return res.json(users.slice(0, limit).map((u) => ({
            username: u.username,
            avatarUrl: u.avatarUrl || "",
            avatarColor: u.avatarColor || "#3b82f6",
            isVerified: u.isVerified || false,
            isAdmin: u.isAdmin || false,
            bio: (u.bio || "").slice(0, 100),
            postingStreak: u.postingStreak || 0,
            achievements: u.achievements || [],
            postCount: statsMap[u.username]?.postCount || 0,
            totalLikes: statsMap[u.username]?.totalLikes || 0,
        })));
    } catch (error) {
        console.error("[suggested] Error:", error.message);
        return res.status(500).json({ error: "Failed" });
    }
});

module.exports = router;
