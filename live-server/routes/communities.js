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

router.post("/", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const { name, description, avatarUrl, bannerUrl, color, isPublic, rules, flairs } = req.body;
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
            rules: (rules || []).slice(0, 10),
            flairs: (flairs || []).map((f, i) => ({
                id: `flair-${Date.now()}-${i}`,
                name: f.name,
                color: f.color || "#3b82f6",
                emoji: f.emoji || "",
            })),
            voiceChannels: [{ id: "vc-general", name: "General" }],
            settings: { isPublic: isPublic !== false },
        });

        return res.status(201).json(community);
    } catch (err) {
        console.error("Community CREATE error:", err);
        return res.status(500).json({ error: "Failed to create community" });
    }
});

router.get("/", async (req, res) => {
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

        const allowed = ["name", "description", "avatarUrl", "bannerUrl", "color", "settings", "rules", "flairs"];
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                if (key === "settings") {
                    Object.assign(community.settings, req.body.settings);
                } else if (key === "flairs") {
                    community.flairs = req.body.flairs.map((f, i) => ({
                        id: f.id || `flair-${Date.now()}-${i}`,
                        name: f.name,
                        color: f.color || "#3b82f6",
                        emoji: f.emoji || "",
                    }));
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

// ── Community Posts (with voting & sorting) ────────────────────

router.get("/:id/posts", verifyToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, sort = "hot", flair } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const community = await Community.findById(req.params.id).lean();
        if (!community) return res.status(404).json({ error: "Community not found" });

        const user = await User.findById(req.userId).select("username").lean();
        const isMember = user?.username && getMember(community, user.username);

        if (!community.settings.isPublic && !isMember) {
            return res.status(403).json({ error: "Not a member" });
        }

        const query = { communityId: req.params.id, isRemoved: { $ne: true } };
        if (flair) query["flair.id"] = flair;

        let sortObj;
        switch (sort) {
            case "new":
                sortObj = { timeStamp: -1 };
                break;
            case "top":
                sortObj = { score: -1 };
                break;
            case "hot":
            default:
                // Hot = combination of score and recency
                sortObj = { score: -1, timeStamp: -1 };
                break;
        }

        const posts = await Post.find(query)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        return res.json(posts);
    } catch (err) {
        console.error("Community POSTS error:", err);
        return res.status(500).json({ error: "Failed to fetch posts" });
    }
});

// ── Voice Channels ────────────────────────────────────────────

router.post("/:id/voice-channels", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });

        const member = getMember(community, user.username);
        if (!member || !["owner", "admin"].includes(member.role)) {
            return res.status(403).json({ error: "Admin access required" });
        }

        const { name } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: "Channel name required" });

        const id = `vc-${Date.now()}`;
        community.voiceChannels.push({ id, name: name.trim() });
        await community.save();

        return res.json(community);
    } catch (err) {
        console.error("Community VOICE CHANNEL CREATE error:", err);
        return res.status(500).json({ error: "Failed to create voice channel" });
    }
});

router.delete("/:id/voice-channels/:channelId", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });

        const member = getMember(community, user.username);
        if (!member || !["owner", "admin"].includes(member.role)) {
            return res.status(403).json({ error: "Admin access required" });
        }

        community.voiceChannels = community.voiceChannels.filter((ch) => ch.id !== req.params.channelId);
        await community.save();

        return res.json(community);
    } catch (err) {
        console.error("Community VOICE CHANNEL DELETE error:", err);
        return res.status(500).json({ error: "Failed to delete voice channel" });
    }
});

module.exports = router;
