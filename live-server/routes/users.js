const express = require("express");
const User = require("../models/user");
const Notification = require("../models/notification");
const { verifyToken, optionalAuth } = require("../middleware/auth");
const { isProUserDoc } = require("../lib/economy");

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

// GET /me/permissions
// The Next.js layer owns a few features that the live server does not host
// (the in-app web browser is the big one) and therefore cannot use the
// requirePermission middleware directly. This endpoint lets those handlers ask
// what the caller is allowed to do instead of duplicating role resolution.
router.get("/me/permissions", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId)
            .select("isAdmin roles")
            .populate("roles", "permissions name badge color")
            .lean();

        if (!user) return res.status(401).json({ error: "User not found" });

        const permissions = new Set();
        for (const role of user.roles || []) {
            for (const p of role.permissions || []) permissions.add(p);
        }

        return res.json({
            isAdmin: !!user.isAdmin,
            permissions: [...permissions],
            roles: (user.roles || []).map((r) => ({
                name: r.name, badge: r.badge, color: r.color,
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
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
            .select("username bio avatarColor avatarUrl isVerified isAdmin isPrivate roles followers following createdAt")
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
        // Derived from proUntil on every read, so a lapsed subscription can
        // never leave a stale Pro badge showing.
        isPro: isProUserDoc(user),
        isPrivate: user.isPrivate || false,
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
            targetUser.pendingFollowRequests = (targetUser.pendingFollowRequests || []).filter((u) => u !== username);
        } else {
            if (targetUser.isPrivate) {
                if (!targetUser.pendingFollowRequests.includes(username)) {
                    targetUser.pendingFollowRequests.push(username);
                }
                Notification.create({
                    recipient: targetUsername,
                    type: "follow_request",
                    fromUser: username,
                    fromColor: currentUser.avatarColor || "#3b82f6",
                    fromAvatarUrl: currentUser.avatarUrl || "",
                    text: "",
                }).catch(() => {});
                await targetUser.save();
                return res.json({
                    following: false,
                    pending: true,
                    followersCount: targetUser.followers.length,
                    followingCount: currentUser.following.length,
                });
            }

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
            pending: false,
            followersCount: targetUser.followers.length,
            followingCount: targetUser.following.length,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:username/follow/accept — accept a follow request
router.post("/:username/follow/accept", verifyToken, async (req, res) => {
    try {
        const { username } = req.params;
        const requesterUsername = req.body.requester;
        if (!requesterUsername) return res.status(400).json({ error: "requester required" });

        const userDoc = await User.findById(req.userId).select("username");
        if (userDoc?.username !== username) return res.status(403).json({ error: "Unauthorized" });

        const [targetUser, requesterUser] = await Promise.all([
            User.findOne({ username }),
            User.findOne({ username: requesterUsername }),
        ]);
        if (!targetUser || !requesterUser) return res.status(404).json({ error: "User not found" });

        targetUser.pendingFollowRequests = (targetUser.pendingFollowRequests || []).filter((u) => u !== requesterUsername);
        if (!targetUser.followers.includes(requesterUsername)) targetUser.followers.push(requesterUsername);
        if (!requesterUser.following.includes(username)) requesterUser.following.push(username);

        await Promise.all([targetUser.save(), requesterUser.save()]);

        Notification.create({
            recipient: requesterUsername,
            type: "follow_accept",
            fromUser: username,
            fromColor: targetUser.avatarColor || "#3b82f6",
            fromAvatarUrl: targetUser.avatarUrl || "",
            text: "",
        }).catch(() => {});

        return res.json({ ok: true, pendingFollowRequests: targetUser.pendingFollowRequests });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:username/follow/deny — deny a follow request
router.post("/:username/follow/deny", verifyToken, async (req, res) => {
    try {
        const { username } = req.params;
        const requesterUsername = req.body.requester;
        if (!requesterUsername) return res.status(400).json({ error: "requester required" });

        const userDoc = await User.findById(req.userId).select("username");
        if (userDoc?.username !== username) return res.status(403).json({ error: "Unauthorized" });

        const targetUser = await User.findOne({ username });
        if (!targetUser) return res.status(404).json({ error: "User not found" });

        targetUser.pendingFollowRequests = (targetUser.pendingFollowRequests || []).filter((u) => u !== requesterUsername);
        await targetUser.save();

        return res.json({ ok: true, pendingFollowRequests: targetUser.pendingFollowRequests });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /:username/follow-requests — list pending follow requests
router.get("/:username/follow-requests", verifyToken, async (req, res) => {
    try {
        const { username } = req.params;
        const userDoc = await User.findById(req.userId).select("username");
        if (userDoc?.username !== username) return res.status(403).json({ error: "Unauthorized" });

        const user = await User.findOne({ username }).select("pendingFollowRequests").lean();
        if (!user) return res.status(404).json({ error: "User not found" });

        const requests = user.pendingFollowRequests || [];
        if (requests.length === 0) return res.json({ users: [] });

        const users = await User.find({ username: { $in: requests } })
            .select("username avatarColor avatarUrl isVerified isAdmin roles")
            .populate("roles", "name badge color")
            .lean();

        return res.json({ users });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /:username/privacy — toggle private account
router.patch("/:username/privacy", verifyToken, async (req, res) => {
    try {
        const { username } = req.params;
        const userDoc = await User.findById(req.userId).select("username");
        if (userDoc?.username !== username) return res.status(403).json({ error: "Unauthorized" });

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: "Not found" });

        user.isPrivate = !user.isPrivate;
        await user.save();

        return res.json({ isPrivate: user.isPrivate });
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

// ── Blocking & muting accounts ─────────────────────────────────────────────
// Mute  = soft. Their posts, comments and suggestions disappear from your
//         surfaces, but you can still follow them and message them.
// Block = hard. Nothing of theirs is shown, and neither side can DM the other.
//
// Both are stored as lowercase usernames so every comparison below is
// case-insensitive. Route names follow the existing muted-words convention.

// GET /:username/blocks — lists both lists so the settings screen can render
// muted and blocked accounts from one call.
router.get("/:username/blocks", verifyToken, async (req, res) => {
    try {
        const { username } = req.params;
        const userDoc = await User.findById(req.userId).select("username");
        if (userDoc?.username !== username) return res.status(403).json({ error: "Unauthorized" });

        const user = await User.findOne({ username })
            .select("blockedUsers mutedUsers")
            .lean();
        if (!user) return res.status(404).json({ error: "Not found" });

        return res.json({
            blockedUsers: user.blockedUsers || [],
            mutedUsers: user.mutedUsers || [],
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:username/block | /:username/mute
// The path segment is the *viewer*, matching the muted-words routes above;
// the account being acted on comes from `target` in the body. We verify the
// caller's session really is that viewer, so this cannot be used to edit
// somebody else's block list.
//
// Blocking also removes any existing follow edges in both directions and drops
// the pending follow request, because a blocked account should not keep
// appearing in the blocker's follower list.
router.post("/:username/:action(block|mute)", verifyToken, async (req, res) => {
    try {
        const { username, action } = req.params;
        if (action !== "block" && action !== "mute") {
            return res.status(404).json({ error: "Not found" });
        }

        const me = await User.findById(req.userId);
        if (!me) return res.status(401).json({ error: "User not found" });
        if (me.username !== username) return res.status(403).json({ error: "Unauthorized" });

        const target = String(req.body?.target || "").trim();
        if (!target) return res.status(400).json({ error: "Target username required" });
        if (target.toLowerCase() === me.username.toLowerCase()) {
            return res.status(400).json({ error: "You cannot do that to yourself" });
        }

        const targetUser = await User.findOne({ username: target }).select("username");
        if (!targetUser) return res.status(404).json({ error: "User not found" });

        // Store the canonical casing from the DB so later lowercase comparisons
        // in the feed and message queries line up.
        const canonical = targetUser.username;
        const key = canonical.toLowerCase();
        const field = action === "block" ? "blockedUsers" : "mutedUsers";
        const otherField = action === "block" ? "mutedUsers" : "blockedUsers";

        if (!me[field].some((u) => u.toLowerCase() === key)) {
            me[field].push(canonical);
        }
        // Muting someone you already blocked (or vice versa) is meaningless:
        // the stricter action wins.
        me[otherField] = me[otherField].filter((u) => u.toLowerCase() !== key);

        if (action === "block") {
            me.following = me.following.filter((u) => u.toLowerCase() !== key);
            me.followers = me.followers.filter((u) => u.toLowerCase() !== key);
            me.pendingFollowRequests = me.pendingFollowRequests.filter((u) => u.toLowerCase() !== key);

            // Drop the reverse follow edges too, so the blocked account is not
            // left following someone who blocked them.
            await User.updateOne(
                { username: canonical },
                { $pull: { following: me.username, followers: me.username } }
            );
        }

        await me.save();
        return res.json({ blockedUsers: me.blockedUsers, mutedUsers: me.mutedUsers });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// DELETE /:username/block | /:username/mute — unblock / unmute.
router.delete("/:username/:action(block|mute)", verifyToken, async (req, res) => {
    try {
        const { username, action } = req.params;
        if (action !== "block" && action !== "mute") {
            return res.status(404).json({ error: "Not found" });
        }

        const me = await User.findById(req.userId);
        if (!me) return res.status(401).json({ error: "User not found" });
        if (me.username !== username) return res.status(403).json({ error: "Unauthorized" });

        // Accept the target from either the body or the query string so the
        // settings screen can unblock straight from a list without extra work.
        const raw = String(req.body?.target || req.query?.target || "").trim();
        if (!raw) return res.status(400).json({ error: "Target username required" });
        const key = raw.toLowerCase();

        const field = action === "block" ? "blockedUsers" : "mutedUsers";
        me[field] = me[field].filter((u) => String(u).toLowerCase() !== key);
        await me.save();

        return res.json({ blockedUsers: me.blockedUsers, mutedUsers: me.mutedUsers });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

module.exports = router;
