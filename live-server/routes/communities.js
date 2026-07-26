const express = require("express");
const Community = require("../models/community");
const Post = require("../models/post");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");
const crypto = require("crypto");

const router = express.Router();

function generateInviteCode() {
    return crypto.randomBytes(4).toString("hex");
}

function getMember(community, username) {
    return community.members.find((m) => m.username === username);
}

function hasPermission(member, setting, community) {
    if (!member) return false;
    if (member.role === "owner") return true;
    const allowed = community.settings[setting];
    if (allowed === "owner") return member.role === "owner";
    if (allowed === "admin") return ["owner", "admin"].includes(member.role);
    return true;
}

// ── Community CRUD ────────────────────────────────────────────

// Create community
router.post("/", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const { name, description, avatarUrl, bannerUrl, color, isPublic } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: "Community name required" });
        if (name.length > 100) return res.status(400).json({ error: "Name too long (max 100)" });

        const community = await Community.create({
            name: name.trim(),
            description: description?.trim() || "",
            avatarUrl: avatarUrl || "",
            bannerUrl: bannerUrl || "",
            color: color || "#3b82f6",
            creator: user.username,
            members: [{ username: user.username, role: "owner" }],
            memberCount: 1,
            inviteCode: generateInviteCode(),
            channels: [
                { id: "general", name: "General", type: "text", description: "General discussion" },
                { id: "voice-general", name: "General", type: "voice", description: "Voice chat" },
            ],
            settings: { isPublic: isPublic !== false },
        });

        return res.status(201).json(community);
    } catch (err) {
        console.error("Community CREATE error:", err);
        return res.status(500).json({ error: "Failed to create community" });
    }
});

// List public communities
router.get("/", verifyToken, async (req, res) => {
    try {
        const { search, sort = "memberCount", page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = { "settings.isPublic": true };
        if (search) query.$text = { $search: search };

        const sortObj = sort === "newest" ? { createdAt: -1 } : { memberCount: -1 };

        const communities = await Community.find(query)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        return res.json(communities);
    } catch (err) {
        console.error("Community LIST error:", err);
        return res.status(500).json({ error: "Failed to fetch communities" });
    }
});

// Get user's communities
router.get("/mine", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const communities = await Community.find({ "members.username": user.username })
            .sort({ updatedAt: -1 })
            .lean();

        return res.json(communities);
    } catch (err) {
        console.error("Community MINE error:", err);
        return res.status(500).json({ error: "Failed to fetch your communities" });
    }
});

// Get single community
router.get("/:id", verifyToken, async (req, res) => {
    try {
        const community = await Community.findById(req.params.id).lean();
        if (!community) return res.status(404).json({ error: "Community not found" });

        const user = await User.findById(req.userId).select("username").lean();
        const isMember = user?.username && getMember(community, user.username);

        if (!community.settings.isPublic && !isMember) {
            return res.status(403).json({ error: "This is a private community" });
        }

        return res.json({ ...community, isMember: !!isMember });
    } catch (err) {
        console.error("Community GET error:", err);
        return res.status(500).json({ error: "Failed to fetch community" });
    }
});

// Update community
router.patch("/:id", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });

        const member = getMember(community, user.username);
        if (!member || !["owner", "admin"].includes(member.role)) {
            return res.status(403).json({ error: "Admin access required" });
        }

        const allowed = ["name", "description", "avatarUrl", "bannerUrl", "color", "settings"];
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                if (key === "settings") {
                    Object.assign(community.settings, req.body.settings);
                } else {
                    community[key] = req.body[key];
                }
            }
        }

        await community.save();
        return res.json(community);
    } catch (err) {
        console.error("Community UPDATE error:", err);
        return res.status(500).json({ error: "Failed to update community" });
    }
});

// Delete community
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });
        if (community.creator !== user.username) {
            return res.status(403).json({ error: "Only the owner can delete" });
        }

        await Community.findByIdAndDelete(req.params.id);
        return res.json({ ok: true });
    } catch (err) {
        console.error("Community DELETE error:", err);
        return res.status(500).json({ error: "Failed to delete community" });
    }
});

// ── Membership ────────────────────────────────────────────────

// Join via invite code
router.post("/join/:inviteCode", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const community = await Community.findOne({ inviteCode: req.params.inviteCode });
        if (!community) return res.status(404).json({ error: "Invalid invite code" });

        if (getMember(community, user.username)) {
            return res.json(community);
        }

        community.members.push({ username: user.username, role: "member" });
        community.memberCount = community.members.length;
        await community.save();

        return res.json(community);
    } catch (err) {
        console.error("Community JOIN error:", err);
        return res.status(500).json({ error: "Failed to join community" });
    }
});

// Join by community ID
router.post("/:id/join", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });

        if (!community.settings.isPublic) {
            return res.status(403).json({ error: "This is a private community" });
        }

        if (getMember(community, user.username)) {
            return res.json(community);
        }

        community.members.push({ username: user.username, role: "member" });
        community.memberCount = community.members.length;
        await community.save();

        return res.json(community);
    } catch (err) {
        console.error("Community JOIN error:", err);
        return res.status(500).json({ error: "Failed to join community" });
    }
});

// Leave community
router.post("/:id/leave", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });

        if (community.creator === user.username) {
            return res.status(400).json({ error: "Owner cannot leave. Transfer ownership or delete." });
        }

        community.members = community.members.filter((m) => m.username !== user.username);
        community.memberCount = community.members.length;
        await community.save();

        return res.json({ ok: true });
    } catch (err) {
        console.error("Community LEAVE error:", err);
        return res.status(500).json({ error: "Failed to leave community" });
    }
});

// Update member role
router.patch("/:id/members/:username", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });

        const adminMember = getMember(community, user.username);
        if (!adminMember || !["owner", "admin"].includes(adminMember.role)) {
            return res.status(403).json({ error: "Admin access required" });
        }

        const targetMember = getMember(community, req.params.username);
        if (!targetMember) return res.status(404).json({ error: "Member not found" });
        if (targetMember.role === "owner") return res.status(400).json({ error: "Cannot change owner role" });

        const { role } = req.body;
        if (!["admin", "moderator", "member"].includes(role)) {
            return res.status(400).json({ error: "Invalid role" });
        }

        targetMember.role = role;
        await community.save();

        return res.json(community);
    } catch (err) {
        console.error("Community MEMBER UPDATE error:", err);
        return res.status(500).json({ error: "Failed to update member" });
    }
});

// Remove member
router.delete("/:id/members/:username", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });

        const adminMember = getMember(community, user.username);
        if (!adminMember || !["owner", "admin"].includes(adminMember.role)) {
            return res.status(403).json({ error: "Admin access required" });
        }

        const targetMember = getMember(community, req.params.username);
        if (!targetMember) return res.status(404).json({ error: "Member not found" });
        if (targetMember.role === "owner") return res.status(400).json({ error: "Cannot remove owner" });

        community.members = community.members.filter((m) => m.username !== req.params.username);
        community.memberCount = community.members.length;
        await community.save();

        return res.json(community);
    } catch (err) {
        console.error("Community MEMBER REMOVE error:", err);
        return res.status(500).json({ error: "Failed to remove member" });
    }
});

// Get members
router.get("/:id/members", verifyToken, async (req, res) => {
    try {
        const community = await Community.findById(req.params.id).lean();
        if (!community) return res.status(404).json({ error: "Community not found" });

        const usernames = community.members.map((m) => m.username);
        const users = usernames.length > 0
            ? await User.find({ username: { $in: usernames } })
                .select("username avatarUrl isVerified isAdmin roles")
                .populate("roles", "name badge color")
                .lean()
            : [];

        const userMap = {};
        users.forEach((u) => {
            userMap[u.username] = {
                avatarUrl: u.avatarUrl || "",
                isVerified: u.isVerified || false,
                isAdmin: u.isAdmin || false,
                roles: (u.roles || []).map((r) => ({ name: r.name, badge: r.badge, color: r.color })),
            };
        });

        const enriched = community.members.map((m) => ({
            ...m,
            _profile: userMap[m.username] || null,
        }));

        return res.json(enriched);
    } catch (err) {
        console.error("Community MEMBERS error:", err);
        return res.status(500).json({ error: "Failed to fetch members" });
    }
});

// ── Invite ────────────────────────────────────────────────────

// Regenerate invite code
router.post("/:id/invite", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });

        const member = getMember(community, user.username);
        if (!member || !hasPermission(member, "whoCanInvite", community)) {
            return res.status(403).json({ error: "No invite permission" });
        }

        community.inviteCode = generateInviteCode();
        await community.save();

        return res.json({ inviteCode: community.inviteCode });
    } catch (err) {
        console.error("Community INVITE error:", err);
        return res.status(500).json({ error: "Failed to generate invite" });
    }
});

// ── Channels ──────────────────────────────────────────────────

// Create channel
router.post("/:id/channels", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });

        const member = getMember(community, user.username);
        if (!member || !hasPermission(member, "whoCanCreateChannels", community)) {
            return res.status(403).json({ error: "No permission to create channels" });
        }

        const { name, type = "text", description } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: "Channel name required" });

        const id = `${type === "voice" ? "voice-" : ""}${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

        community.channels.push({ id, name: name.trim(), type, description: description || "" });
        await community.save();

        return res.json(community);
    } catch (err) {
        console.error("Community CHANNEL CREATE error:", err);
        return res.status(500).json({ error: "Failed to create channel" });
    }
});

// Update channel
router.patch("/:id/channels/:channelId", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });

        const member = getMember(community, user.username);
        if (!member || !["owner", "admin"].includes(member.role)) {
            return res.status(403).json({ error: "Admin access required" });
        }

        const channel = community.channels.find((c) => c.id === req.params.channelId);
        if (!channel) return res.status(404).json({ error: "Channel not found" });

        const allowed = ["name", "description", "permissions"];
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                if (key === "permissions") {
                    Object.assign(channel.permissions, req.body.permissions);
                } else {
                    channel[key] = req.body[key];
                }
            }
        }

        await community.save();
        return res.json(community);
    } catch (err) {
        console.error("Community CHANNEL UPDATE error:", err);
        return res.status(500).json({ error: "Failed to update channel" });
    }
});

// Delete channel
router.delete("/:id/channels/:channelId", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });

        const member = getMember(community, user.username);
        if (!member || !["owner", "admin"].includes(member.role)) {
            return res.status(403).json({ error: "Admin access required" });
        }

        community.channels = community.channels.filter((c) => c.id !== req.params.channelId);
        await community.save();

        return res.json(community);
    } catch (err) {
        console.error("Community CHANNEL DELETE error:", err);
        return res.status(500).json({ error: "Failed to delete channel" });
    }
});

// ── Community Posts ───────────────────────────────────────────

// Get posts for a community
router.get("/:id/posts", verifyToken, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const community = await Community.findById(req.params.id).lean();
        if (!community) return res.status(404).json({ error: "Community not found" });

        const user = await User.findById(req.userId).select("username").lean();
        const isMember = user?.username && getMember(community, user.username);

        if (!community.settings.isPublic && !isMember) {
            return res.status(403).json({ error: "Not a member" });
        }

        const posts = await Post.find({ communityId: req.params.id, isRemoved: { $ne: true } })
            .sort({ timeStamp: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        return res.json(posts);
    } catch (err) {
        console.error("Community POSTS error:", err);
        return res.status(500).json({ error: "Failed to fetch posts" });
    }
});

module.exports = router;
