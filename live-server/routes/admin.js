const express = require("express");
const User = require("../models/user");
const Role = require("../models/role");
const Ad = require("../models/ad");
const Post = require("../models/post");
const ContentFilter = require("../models/contentFilter");
const ModerationLog = require("../models/moderationLog");
const Community = require("../models/community");
const { requireAdmin, requirePermission } = require("../middleware/auth");
const { getLogs } = require("../logBuffer");
const { VALID_PERMISSIONS } = require("../models/role");
const { logModeration, logUser } = require("../logService");
const { isValidPin, hashPin } = require("../utils/pin");

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

        const changes = [];
        if (isVerified !== undefined) changes.push(`verified=${isVerified}`);
        if (makeAdmin !== undefined) changes.push(`admin=${makeAdmin}`);
        if (liveStreamAllowed !== undefined) changes.push(`live=${liveStreamAllowed}`);
        if (addRole) changes.push(`added role`);
        if (removeRole) changes.push(`removed role`);
        logUser("user_updated", req.userId?.toString(), { targetUser: user.username, message: `User ${user.username} updated: ${changes.join(", ")}`, meta: { userId: user._id.toString(), changes } });

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

// POST /users — admin creates a user with a login PIN ("create user with a code")
router.post("/users", requireAdmin, async (req, res) => {
    try {
        const { email, username, pin } = req.body;
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: "Valid email required" });
        }
        if (!username?.trim() || !/^[a-zA-Z0-9_]{2,30}$/.test(username.trim())) {
            return res.status(400).json({ error: "Username must be 2\u201330 characters (letters, numbers, underscores)" });
        }
        if (!isValidPin(pin)) {
            return res.status(400).json({ error: "PIN must be 4\u20138 digits" });
        }

        const emailLower = email.toLowerCase();
        const existing = await User.findOne({
            $or: [{ email: emailLower }, { username: { $regex: `^${username.trim()}$`, $options: "i" } }],
        }).lean();
        if (existing) {
            return res.status(409).json({ error: "A user with this email or username already exists" });
        }

        const user = await User.create({
            email:      emailLower,
            username:   username.trim(),
            pinHash:    hashPin(pin),
            pinChangedAt: new Date(),
            isVerified: false,
        });

        logUser("user_created", req.userId?.toString(), { targetUser: user.username, message: `Admin created user ${user.username}`, meta: { userId: user._id.toString() } });
        return res.status(201).json({ ok: true, user: { id: user._id.toString(), email: user.email, username: user.username } });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to create user" });
    }
});

// GET /roles
router.get("/roles", requireAdmin, async (req, res) => {
    try {
        const roles = await Role.find({}).sort({ createdAt: -1 }).lean();
        return res.json(roles.map((r) => ({ id: r._id.toString(), name: r.name, badge: r.badge, color: r.color, permissions: r.permissions || [] })));
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

// POST /roles/seed-normal — create "Normal User" role (no badge) and assign to all users without roles
router.post("/roles/seed-normal", requireAdmin, async (req, res) => {
    try {
        let normalRole = await Role.findOne({ name: "Normal User" });
        if (!normalRole) {
            normalRole = await Role.create({
                name: "Normal User",
                badge: "",
                color: "#6b7280",
                permissions: [
                    "create_post", "delete_own_post",
                    "create_comment", "delete_own_comment",
                    "react", "bookmark", "repost",
                    "use_voice_chat", "use_live_stream", "access_entertainment",
                ],
            });
        }

        const result = await User.updateMany(
            { roles: { $eq: [] } },
            { $addToSet: { roles: normalRole._id } }
        );

        return res.json({
            roleId: normalRole._id.toString(),
            roleName: normalRole.name,
            usersUpdated: result.modifiedCount,
        });
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

// GET /permissions — list all valid permission keys
router.get("/permissions", requireAdmin, (req, res) => {
    return res.json(VALID_PERMISSIONS);
});

// PATCH /roles/:id/permissions — set permissions for a role
router.patch("/roles/:id/permissions", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;
        if (!Array.isArray(permissions)) return res.status(400).json({ error: "permissions array required" });

        const valid = permissions.filter((p) => VALID_PERMISSIONS.includes(p));
        const role = await Role.findByIdAndUpdate(id, { permissions: valid }, { returnDocument: "after" }).lean();
        if (!role) return res.status(404).json({ error: "Role not found" });
        return res.json({ id: role._id.toString(), name: role.name, badge: role.badge, color: role.color, permissions: role.permissions });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /moderation — list moderation logs
router.get("/moderation", requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
        const logs = await ModerationLog.find({}).sort({ timeStamp: -1 }).limit(limit).lean();
        return res.json(logs.map((l) => ({
            id: l._id.toString(),
            postId: l.postId?.toString() || "",
            action: l.action,
            moderator: l.moderator,
            reason: l.reason,
            postOwner: l.postOwner,
            postPreview: l.postPreview,
            timeStamp: l.timeStamp,
        })));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /moderation/flagged — list removed posts
router.get("/moderation/flagged", requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
        const posts = await Post.find({ isRemoved: true }).sort({ removedAt: -1 }).limit(limit).lean();
        return res.json(posts.map((p) => ({
            id: p._id.toString(),
            text: (p.text || "").slice(0, 200),
            sender: p.sender,
            imageUrl: p.imageUrl || "",
            removedBy: p.removedBy,
            removedReason: p.removedReason,
            removedAt: p.removedAt,
            timeStamp: p.timeStamp,
        })));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /moderation/remove — take down a post
router.post("/moderation/remove", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const { postId, reason } = req.body;
        if (!postId) return res.status(400).json({ error: "postId required" });

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ error: "Post not found" });

        const moderator = await User.findById(req.userId).select("username").lean();

        post.isRemoved = true;
        post.removedBy = moderator?.username || "admin";
        post.removedReason = reason || "No reason provided";
        post.removedAt = new Date();
        await post.save();

        await ModerationLog.create({
            postId: post._id,
            action: "remove",
            moderator: moderator?.username || "admin",
            reason: reason || "No reason provided",
            postOwner: post.sender,
            postPreview: (post.text || "").slice(0, 200),
        });

        logModeration("post_removed", { username: moderator?.username, targetUser: post.sender, message: `Post removed by ${moderator?.username}: ${reason || "No reason"}`, meta: { postId: post._id.toString() } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /moderation/restore — restore a taken-down post
router.post("/moderation/restore", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const { postId } = req.body;
        if (!postId) return res.status(400).json({ error: "postId required" });

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ error: "Post not found" });

        const moderator = await User.findById(req.userId).select("username").lean();

        post.isRemoved = false;
        post.removedBy = null;
        post.removedReason = "";
        post.removedAt = null;
        await post.save();

        await ModerationLog.create({
            postId: post._id,
            action: "restore",
            moderator: moderator?.username || "admin",
            reason: "Restored by moderator",
            postOwner: post.sender,
            postPreview: (post.text || "").slice(0, 200),
        });

        logModeration("post_restored", { username: moderator?.username, targetUser: post.sender, message: `Post restored by ${moderator?.username}`, meta: { postId: post._id.toString() } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /content-filter — get content filter settings
router.get("/content-filter", requireAdmin, async (req, res) => {
    try {
        let filter = await ContentFilter.findOne({}).lean();
        if (!filter) {
            filter = await ContentFilter.create({ toxicWords: [], nudityKeywords: [], blockNudity: true, blurToxicWords: true });
            filter = filter.toObject();
        }
        return res.json({
            toxicWords: filter.toxicWords || [],
            nudityKeywords: filter.nudityKeywords || [],
            blockNudity: filter.blockNudity !== false,
            blurToxicWords: filter.blurToxicWords !== false,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /content-filter — update content filter settings
router.patch("/content-filter", requireAdmin, async (req, res) => {
    try {
        const { toxicWords, nudityKeywords, blockNudity, blurToxicWords } = req.body;
        const update = { updatedAt: new Date() };
        if (Array.isArray(toxicWords)) update.toxicWords = toxicWords;
        if (Array.isArray(nudityKeywords)) update.nudityKeywords = nudityKeywords;
        if (typeof blockNudity === "boolean") update.blockNudity = blockNudity;
        if (typeof blurToxicWords === "boolean") update.blurToxicWords = blurToxicWords;

        let filter = await ContentFilter.findOne({});
        if (!filter) {
            filter = await ContentFilter.create(update);
        } else {
            Object.assign(filter, update);
            await filter.save();
        }

        return res.json({
            toxicWords: filter.toxicWords || [],
            nudityKeywords: filter.nudityKeywords || [],
            blockNudity: filter.blockNudity !== false,
            blurToxicWords: filter.blurToxicWords !== false,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /content-filter/public — public endpoint for client-side toxic word blurring (no auth required)
router.get("/content-filter/public", async (req, res) => {
    try {
        let filter = await ContentFilter.findOne({}).lean();
        if (!filter) {
            return res.json({ toxicWords: [], blurToxicWords: true });
        }
        return res.json({
            toxicWords: filter.toxicWords || [],
            blurToxicWords: filter.blurToxicWords !== false,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /debug/user-permissions/:userId — debug the permission resolution chain for a user
router.get("/debug/user-permissions/:userId", requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId).lean();
        if (!user) return res.status(404).json({ error: "User not found" });

        const rawRoles = (user.roles || []).map((r) => r.toString());
        const populatedUser = await User.findById(userId).select("isAdmin roles").populate("roles", "permissions name badge color").lean();

        const roleDetails = (populatedUser.roles || []).map((r) => ({
            id: r._id?.toString(),
            name: r.name,
            badge: r.badge,
            color: r.color,
            permissions: r.permissions || [],
        }));

        const allPerms = roleDetails.flatMap((r) => r.permissions);
        const uniquePerms = [...new Set(allPerms)];

        return res.json({
            userId: user._id.toString(),
            username: user.username,
            isAdmin: user.isAdmin,
            suspended: user.suspended || false,
            rawRoleIds: rawRoles,
            roleCount: roleDetails.length,
            roles: roleDetails,
            resolvedPermissions: uniquePerms,
        });
    } catch (error) {
        console.error("[debug/user-permissions] Error:", error.message, error.stack);
        return res.status(500).json({ error: error.message });
    }
});

// PATCH /users/:id/suspend — suspend/unsuspend a user
router.patch("/users/:id/suspend", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { suspended, suspendedUntil, suspendedReason } = req.body;

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: "User not found" });

        user.suspended = !!suspended;
        user.suspendedUntil = suspendedUntil || null;
        user.suspendedReason = suspendedReason || "";
        await user.save();

        logUser(suspended ? "user_suspended" : "user_unsuspended", user.username, { targetUser: user.username, message: `User ${suspended ? "suspended" : "unsuspended"}: ${user.username}`, level: suspended ? "warn" : "info" });
        return res.json({ ok: true, suspended: user.suspended });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// ── Community Management ────────────────────────────────────────────────

// GET /communities — list all communities for admin
router.get("/communities", requireAdmin, async (req, res) => {
    try {
        const { search, sort = "memberCount", page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const query = {};
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { creator: { $regex: search, $options: "i" } },
            ];
        }
        const sortObj = sort === "newest" ? { createdAt: -1 } : sort === "name" ? { name: 1 } : { memberCount: -1 };
        const communities = await Community.find(query).sort(sortObj).skip(skip).limit(parseInt(limit)).lean();
        const total = await Community.countDocuments(query);
        return res.json({ communities, total });
    } catch (error) {
        console.error("Admin communities error:", error);
        return res.status(500).json({ error: "Failed" });
    }
});

// DELETE /communities/:id — admin delete any community
router.delete("/communities/:id", requireAdmin, async (req, res) => {
    try {
        const community = await Community.findByIdAndDelete(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });
        logModeration("community_deleted", "admin", { target: community.name, level: "warn" });
        return res.json({ ok: true });
    } catch (error) {
        console.error("Admin community delete error:", error);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /communities/:id — admin edit any community
router.patch("/communities/:id", requireAdmin, async (req, res) => {
    try {
        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });

        const allowed = ["name", "description", "avatarUrl", "bannerUrl", "color", "settings", "rules", "flairs"];
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                if (key === "settings") {
                    Object.assign(community.settings, req.body.settings);
                } else if (key === "flairs") {
                    community.flairs = (req.body.flairs || []).map((f, i) => ({
                        id: f.id || `flair-${Date.now()}-${i}`,
                        name: f.name,
                        color: f.color || "#3b82f6",
                        emoji: f.emoji || "",
                    }));
                } else if (key === "rules") {
                    community.rules = req.body.rules || [];
                } else {
                    community[key] = req.body[key];
                }
            }
        }
        await community.save();
        return res.json(community);
    } catch (error) {
        console.error("Admin community update error:", error);
        return res.status(500).json({ error: "Failed" });
    }
});

module.exports = router;
