const express = require("express");
const User = require("../models/user");
const Notification = require("../models/notification");
const { verifyToken, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// GET /online
router.get("/online", async (req, res) => {
    try {
        const { usernames } = req.query;
        if (!usernames) {
            return res.status(400).json({ error: "usernames parameter required (comma-separated)" });
        }

        const list = usernames.split(",").map((u) => u.trim()).filter(Boolean).slice(0, 50);
        if (list.length === 0) return res.json({ users: {} });

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const users = await User.find({ username: { $in: list } })
            .select("username lastActive isOnline")
            .lean().maxTimeMS(5000);

        const result = {};
        for (const u of users) {
            result[u.username] = {
                isOnline: u.isOnline && new Date(u.lastActive) > fiveMinutesAgo,
                lastActive: u.lastActive,
            };
        }
        return res.json({ users: result });
    } catch (error) {
        console.error("Failed to get online statuses:", error);
        return res.status(500).json({ error: "Failed to get online statuses" });
    }
});

// GET /active
router.get("/active", async (req, res) => {
    try {
        const { usernames } = req.query;
        if (!usernames) {
            return res.status(400).json({ error: "usernames parameter required (comma-separated)" });
        }

        const list = usernames.split(",").map((u) => u.trim()).filter(Boolean).slice(0, 50);
        if (list.length === 0) return res.json({ users: {} });

        const users = await User.find({ username: { $in: list } })
            .select("username lastActive isOnline")
            .lean().maxTimeMS(5000);

        const result = {};
        for (const u of users) {
            result[u.username] = {
                lastActive: u.lastActive,
                isOnline: u.isOnline,
            };
        }
        return res.json({ users: result });
    } catch (error) {
        console.error("Failed to get user activity:", error);
        return res.status(500).json({ error: "Failed to get activity" });
    }
});

// POST /active (update) — supports both /active?username=X and /:username/active
router.post("/active", optionalAuth, async (req, res) => {
    try {
        const username = req.params.username || req.query.username;
        const { isOnline } = req.body || {};
        if (!username) return res.status(400).json({ error: "Username required" });

        const update = { lastActive: new Date() };
        if (typeof isOnline === "boolean") update.isOnline = isOnline;

        const user = await User.findOneAndUpdate(
            { username },
            { $set: update },
            { returnDocument: 'after', maxTimeMS: 5000 }
        ).select("username lastActive isOnline").lean();

        if (!user) return res.status(404).json({ error: "User not found" });
        return res.json({ ok: true, lastActive: user.lastActive, isOnline: user.isOnline });
    } catch (error) {
        console.error("Failed to update user activity:", error);
        return res.status(500).json({ error: "Failed to update activity" });
    }
});

// GET /:username/active
router.get("/:username/active", async (req, res) => {
    try {
        const { username } = req.params;
        if (!username) return res.status(400).json({ error: "Username required" });

        const user = await User.findOne({ username })
            .select("username lastActive isOnline").lean().maxTimeMS(5000);

        if (!user) return res.status(404).json({ error: "User not found" });

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const isActive = user.isOnline && new Date(user.lastActive) > fiveMinutesAgo;
        return res.json({ username: user.username, isOnline: isActive, lastActive: user.lastActive });
    } catch (error) {
        console.error("Failed to get user activity:", error);
        return res.status(500).json({ error: "Failed to get activity" });
    }
});

// POST /:username/active
router.post("/:username/active", optionalAuth, async (req, res) => {
    try {
        const { username } = req.params;
        const { isOnline } = req.body || {};
        if (!username) return res.status(400).json({ error: "Username required" });

        const update = { lastActive: new Date() };
        if (typeof isOnline === "boolean") update.isOnline = isOnline;

        const user = await User.findOneAndUpdate(
            { username },
            { $set: update },
            { returnDocument: 'after', maxTimeMS: 5000 }
        ).select("username lastActive isOnline").lean();

        if (!user) return res.status(404).json({ error: "User not found" });
        return res.json({ ok: true, lastActive: user.lastActive, isOnline: user.isOnline });
    } catch (error) {
        console.error("Failed to update user activity:", error);
        return res.status(500).json({ error: "Failed to update activity" });
    }
});

// GET /:username
router.get("/:username", async (req, res) => {
    try {
        const { username } = req.params;
        const user = await User.findOne({ username })
            .select("username bio avatarColor avatarUrl isVerified isAdmin roles followers following createdAt")
            .populate("roles", "name badge color")
            .lean();

        if (!user) return res.status(404).json({ error: "User not found" });

        return res.json({
            username: user.username,
            bio: user.bio,
            avatarColor: user.avatarColor,
            avatarUrl: user.avatarUrl || "",
            isVerified: user.isVerified || false,
            isAdmin: user.isAdmin || false,
            roles: (user.roles || []).map((r) => ({
                id: r._id?.toString() ?? "",
                name: r.name ?? "",
                badge: r.badge ?? "",
                color: r.color ?? "",
            })),
            followersCount: user.followers?.length || 0,
            followingCount: user.following?.length || 0,
            createdAt: user.createdAt,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch user" });
    }
});

// POST /:username/follow
router.post("/:username/follow", verifyToken, async (req, res) => {
    try {
        const targetUsername = req.params.username;
        const currentUser = await User.findById(req.userId).select("username following avatarColor avatarUrl");
        const username = currentUser?.username;
        if (!username) return res.status(400).json({ error: "Username not found" });

        if (username === targetUsername) {
            return res.status(400).json({ error: "Cannot follow yourself" });
        }

        const targetUser = await User.findOne({ username: targetUsername });
        if (!currentUser || !targetUser) return res.status(404).json({ error: "User not found" });

        const isFollowing = currentUser.following.includes(targetUsername);

        if (isFollowing) {
            currentUser.following = currentUser.following.filter((u) => u !== targetUsername);
            targetUser.followers = targetUser.followers.filter((u) => u !== username);
        } else {
            if (!currentUser.following.includes(targetUsername)) currentUser.following.push(targetUsername);
            if (!targetUser.followers.includes(username)) targetUser.followers.push(username);

            Notification.create({
                recipient: targetUsername,
                type: "follow",
                fromUser: username,
                fromColor: currentUser.avatarColor || "#3b82f6",
                fromAvatarUrl: currentUser.avatarUrl || "",
                text: "",
            }).catch(() => {});
        }

        await Promise.all([currentUser.save(), targetUser.save()]);
        return res.json({
            following: !isFollowing,
            followersCount: targetUser.followers.length,
            followingCount: targetUser.following.length,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /:username/followers
router.get("/:username/followers", async (req, res) => {
    try {
        const { username } = req.params;
        const type = req.query.type || "followers";
        const user = await User.findOne({ username }).select("followers following").lean();
        if (!user) return res.status(404).json({ error: "User not found" });

        const usernames = type === "following" ? (user.following || []) : (user.followers || []);
        if (usernames.length === 0) return res.json({ users: [] });

        const users = await User.find({ username: { $in: usernames } })
            .select("username avatarColor avatarUrl isVerified isAdmin roles")
            .populate("roles", "name badge color")
            .lean();

        return res.json({ users });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch users" });
    }
});

// GET /:username/following (same as followers with type=following)
router.get("/:username/following", async (req, res) => {
    try {
        const { username } = req.params;
        const user = await User.findOne({ username }).select("following").lean();
        if (!user) return res.status(404).json({ error: "User not found" });

        const usernames = user.following || [];
        if (usernames.length === 0) return res.json({ users: [] });

        const users = await User.find({ username: { $in: usernames } })
            .select("username avatarColor avatarUrl isVerified isAdmin roles")
            .populate("roles", "name badge color")
            .lean();

        return res.json({ users });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch users" });
    }
});

// PATCH /:username/close-friends
router.patch("/:username/close-friends", verifyToken, async (req, res) => {
    try {
        const { username } = req.params;
        const userDoc = await User.findById(req.userId).select("username");
        if (userDoc?.username !== username) return res.status(403).json({ error: "Unauthorized" });

        const { targetUsername, action } = req.body;
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: "Not found" });

        if (action === "add") {
            if (!user.closeFriends.includes(targetUsername)) user.closeFriends.push(targetUsername);
        } else if (action === "remove") {
            user.closeFriends = user.closeFriends.filter((u) => u !== targetUsername);
        } else {
            return res.status(400).json({ error: "Invalid action" });
        }

        await user.save();
        return res.json({ closeFriends: user.closeFriends });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /:username/muted-words
router.get("/:username/muted-words", verifyToken, async (req, res) => {
    try {
        const { username } = req.params;
        const userDoc = await User.findById(req.userId).select("username");
        if (userDoc?.username !== username) return res.status(403).json({ error: "Unauthorized" });

        const user = await User.findOne({ username }).select("mutedWords").lean();
        if (!user) return res.status(404).json({ error: "Not found" });
        return res.json({ mutedWords: user.mutedWords || [] });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:username/muted-words
router.post("/:username/muted-words", verifyToken, async (req, res) => {
    try {
        const { username } = req.params;
        const userDoc = await User.findById(req.userId).select("username");
        if (userDoc?.username !== username) return res.status(403).json({ error: "Unauthorized" });

        const { word } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: "Not found" });

        const normalized = (word || "").toLowerCase().replace(/^#/, "").trim();
        if (!normalized) return res.status(400).json({ error: "Word required" });

        if (!user.mutedWords.includes(normalized)) user.mutedWords.push(normalized);
        await user.save();
        return res.json({ mutedWords: user.mutedWords });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /:username/muted-words — add or remove
router.patch("/:username/muted-words", verifyToken, async (req, res) => {
    try {
        const { username } = req.params;
        const userDoc = await User.findById(req.userId).select("username");
        if (userDoc?.username !== username) return res.status(403).json({ error: "Unauthorized" });

        const { word, action } = req.body;
        const normalized = (word || "").toLowerCase().replace(/^#/, "").trim();
        if (!normalized) return res.status(400).json({ error: "Word required" });

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: "Not found" });

        if (action === "remove") {
            user.mutedWords = user.mutedWords.filter((w) => w !== normalized);
        } else {
            if (!user.mutedWords.includes(normalized)) user.mutedWords.push(normalized);
        }
        await user.save();
        return res.json({ mutedWords: user.mutedWords });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// DELETE /:username/muted-words/:word
router.delete("/:username/muted-words/:word", verifyToken, async (req, res) => {
    try {
        const { username, word } = req.params;
        const userDoc = await User.findById(req.userId).select("username");
        if (userDoc?.username !== username) return res.status(403).json({ error: "Unauthorized" });

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: "Not found" });

        const normalized = word.toLowerCase().replace(/^#/, "").trim();
        user.mutedWords = user.mutedWords.filter((w) => w !== normalized);
        await user.save();
        return res.json({ mutedWords: user.mutedWords });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

module.exports = router;
