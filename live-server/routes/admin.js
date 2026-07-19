const express = require("express");
const User = require("../models/user");
const Role = require("../models/role");
const Ad = require("../models/ad");
const Post = require("../models/post");
const { requireAdmin } = require("../middleware/auth");
const { getLogs } = require("../logBuffer");

const router = express.Router();

// GET /users
router.get("/users", requireAdmin, async (req, res) => {
    try {
        const users = await User.find({}).populate("roles").sort({ createdAt: -1 }).lean();
        return res.json(users.map((u) => ({
            id:         u._id.toString(),
            username:   u.username,
            email:      u.email,
            isVerified: u.isVerified || false,
            isAdmin:    u.isAdmin || false,
            liveStreamAllowed: u.liveStreamAllowed || false,
            voiceChatBanned: u.voiceChatBanned || false,
            voiceChatBannedUntil: u.voiceChatBannedUntil || null,
            voiceChatBannedReason: u.voiceChatBannedReason || "",
            avatarColor: u.avatarColor,
            avatarUrl:  u.avatarUrl || "",
            roles:      (u.roles || []).map((r) => ({ id: r._id.toString(), name: r.name, badge: r.badge, color: r.color })),
        })));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /users
router.patch("/users", requireAdmin, async (req, res) => {
    try {
        const { userId, isVerified, isAdmin: makeAdmin, liveStreamAllowed, voiceChatBanned, voiceChatBannedUntil, voiceChatBannedReason, addRole, removeRole } = req.body;
        if (!userId) return res.status(400).json({ error: "userId required" });

        const update = {};
        if (isVerified !== undefined) update.isVerified = isVerified;
        if (makeAdmin !== undefined) update.isAdmin = makeAdmin;
        if (liveStreamAllowed !== undefined) update.liveStreamAllowed = liveStreamAllowed;
        if (voiceChatBanned !== undefined) update.voiceChatBanned = voiceChatBanned;
        if (voiceChatBannedUntil !== undefined) update.voiceChatBannedUntil = voiceChatBannedUntil;
        if (voiceChatBannedReason !== undefined) update.voiceChatBannedReason = voiceChatBannedReason;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        if (addRole) user.roles.addToSet(addRole);
        if (removeRole) user.roles.pull(removeRole);
        Object.assign(user, update);
        await user.save();
        await user.populate("roles");

        return res.json({
            ok: true,
            user: {
                id: user._id.toString(), username: user.username,
                isVerified: user.isVerified, isAdmin: user.isAdmin,
                roles: user.roles.map((r) => ({ id: r._id.toString(), name: r.name, badge: r.badge, color: r.color })),
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /roles
router.get("/roles", requireAdmin, async (req, res) => {
    try {
        const roles = await Role.find({}).sort({ createdAt: -1 }).lean();
        return res.json(roles.map((r) => ({ id: r._id.toString(), name: r.name, badge: r.badge, color: r.color })));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /roles
router.post("/roles", requireAdmin, async (req, res) => {
    try {
        const { name, badge, color } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: "Name required" });
        const role = await Role.create({ name: name.trim(), badge: badge || "\u2B50", color: color || "#6b7280" });
        return res.status(201).json({ id: role._id.toString(), name: role.name, badge: role.badge, color: role.color });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// DELETE /roles
router.delete("/roles", requireAdmin, async (req, res) => {
    try {
        const { id } = req.body;
        await Role.findByIdAndDelete(id);
        await User.updateMany({ roles: id }, { $pull: { roles: id } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /ads
router.get("/ads", requireAdmin, async (req, res) => {
    try {
        const ads = await Ad.find({}).sort({ createdAt: -1 }).lean();
        return res.json(ads);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /ads
router.post("/ads", requireAdmin, async (req, res) => {
    try {
        const { title, description, imageUrl, linkUrl, adType, adsterraCode, adsenseSlot, ctaText, startDate, endDate, isActive } = req.body;
        if (!title?.trim()) return res.status(400).json({ error: "Title required" });

        const ad = await Ad.create({
            title: title.trim().slice(0, 100),
            description: (description || "").trim().slice(0, 300),
            imageUrl: imageUrl || "",
            linkUrl: linkUrl || "",
            adType: adType || "custom",
            adsterraCode: adsterraCode || "",
            adsenseSlot: adsenseSlot || "",
            ctaText: ctaText || "Learn More",
            startDate: startDate || null,
            endDate: endDate || null,
            isActive: isActive !== false,
            createdBy: "admin",
        });

        return res.status(201).json(ad);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to create ad" });
    }
});

// PATCH /ads
router.patch("/ads", requireAdmin, async (req, res) => {
    try {
        const { id, ...updates } = req.body;
        if (!id) return res.status(400).json({ error: "id required" });

        const ad = await Ad.findByIdAndUpdate(id, { ...updates, updatedAt: new Date() }, { returnDocument: 'after' }).lean();
        if (!ad) return res.status(404).json({ error: "Ad not found" });
        return res.json(ad);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// DELETE /ads
router.delete("/ads", requireAdmin, async (req, res) => {
    try {
        const id = req.query.id;
        if (!id) return res.status(400).json({ error: "id required" });
        await Ad.findByIdAndDelete(id);
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /ads/:id
router.patch("/ads/:id", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, imageUrl, linkUrl, adType, adsterraCode, adsenseSlot, ctaText, startDate, endDate, isActive } = req.body;

        const ad = await Ad.findByIdAndUpdate(id, {
            ...(title !== undefined && { title: title.trim().slice(0, 100) }),
            ...(description !== undefined && { description: description.trim().slice(0, 300) }),
            ...(imageUrl !== undefined && { imageUrl }),
            ...(linkUrl !== undefined && { linkUrl }),
            ...(adType !== undefined && { adType }),
            ...(adsterraCode !== undefined && { adsterraCode }),
            ...(adsenseSlot !== undefined && { adsenseSlot }),
            ...(ctaText !== undefined && { ctaText }),
            ...(startDate !== undefined && { startDate: startDate || null }),
            ...(endDate !== undefined && { endDate: endDate || null }),
            ...(isActive !== undefined && { isActive }),
            updatedAt: new Date(),
        }, { returnDocument: 'after' }).lean();

        if (!ad) return res.status(404).json({ error: "Ad not found" });
        return res.json(ad);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// DELETE /ads/:id
router.delete("/ads/:id", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await Ad.findByIdAndDelete(id);
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /ads/:id/track
router.post("/ads/:id/track", async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body;
        const update = {};
        if (action === "impression") update.$inc = { impressions: 1 };
        else if (action === "click") update.$inc = { clicks: 1 };
        else return res.status(400).json({ error: "Invalid action" });

        await Ad.findByIdAndUpdate(id, update);
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /analytics
router.get("/analytics", async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalPosts = await Post.countDocuments();

        const users = await User.find().select("username createdAt").lean();
        const posts = await Post.find()
            .select("sender likes comments viewCount timeStamp hashtags mentions")
            .lean();

        const totalLikes = posts.reduce((sum, p) => sum + (p.likes?.length || 0), 0);
        const totalComments = posts.reduce((sum, p) => sum + (p.comments?.length || 0), 0);
        const totalViews = posts.reduce((sum, p) => sum + (p.viewCount || 0), 0);

        const postsByDay = {}, usersByDay = {}, likesByDay = {}, commentsByDay = {};

        posts.forEach((post) => {
            const date = new Date(post.timeStamp).toISOString().split("T")[0];
            postsByDay[date] = (postsByDay[date] || 0) + 1;
            likesByDay[date] = (likesByDay[date] || 0) + (post.likes?.length || 0);
            commentsByDay[date] = (commentsByDay[date] || 0) + (post.comments?.length || 0);
        });

        users.forEach((user) => {
            const date = new Date(user.createdAt).toISOString().split("T")[0];
            usersByDay[date] = (usersByDay[date] || 0) + 1;
        });

        const postCounts = {};
        posts.forEach((post) => { postCounts[post.sender] = (postCounts[post.sender] || 0) + 1; });
        const topPosters = Object.entries(postCounts)
            .sort(([, a], [, b]) => b - a).slice(0, 10)
            .map(([username, count]) => ({ username, count }));

        const likeCounts = {};
        posts.forEach((post) => {
            (post.likes || []).forEach((username) => { likeCounts[username] = (likeCounts[username] || 0) + 1; });
        });
        const topLikers = Object.entries(likeCounts)
            .sort(([, a], [, b]) => b - a).slice(0, 10)
            .map(([username, count]) => ({ username, count }));

        const hashtagCount = {};
        posts.forEach((post) => {
            (post.hashtags || []).forEach((tag) => { hashtagCount[tag] = (hashtagCount[tag] || 0) + 1; });
        });
        const topHashtags = Object.entries(hashtagCount)
            .sort(([, a], [, b]) => b - a).slice(0, 10)
            .map(([tag, count]) => ({ tag, count }));

        const topPosts = [...posts]
            .sort((a, b) => ((b.likes?.length || 0) + (b.comments?.length || 0)) - ((a.likes?.length || 0) + (a.comments?.length || 0)))
            .slice(0, 10)
            .map((p) => ({
                id: p._id, sender: p.sender, text: p.text?.slice(0, 100) || "",
                likes: p.likes?.length || 0, comments: p.comments?.length || 0,
                views: p.viewCount || 0, timeStamp: p.timeStamp,
            }));

        return res.json({
            stats: {
                totalUsers, totalPosts, totalLikes, totalComments, totalViews,
                avgPostsPerUser: totalUsers > 0 ? (totalPosts / totalUsers).toFixed(1) : 0,
            },
            charts: { postsByDay, usersByDay, likesByDay, commentsByDay },
            topPosters, topLikers, topHashtags, topPosts,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch admin analytics" });
    }
});

// GET /logs
router.get("/logs", requireAdmin, (req, res) => {
    try {
        const { level, since, limit } = req.query;
        const logs = getLogs({ level, since, limit: parseInt(limit) || 200 });
        return res.json(logs);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

module.exports = router;
