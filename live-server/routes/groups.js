const express = require("express");
const GroupChat = require("../models/groupChat");
const GroupMessage = require("../models/groupMessage");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// GET /
router.get("/", verifyToken, async (req, res) => {
    try {
        const username = req.query.username || (await User.findById(req.userId).select("username").lean())?.username;
        if (!username) return res.status(400).json({ error: "username required" });

        const groups = await GroupChat.find({ "members.username": username })
            .sort({ updatedAt: -1 }).limit(100).lean();

        const allMembernames = [...new Set(groups.flatMap((g) => g.members.map((m) => m.username)))];
        const users = allMembernames.length > 0
            ? await User.find({ username: { $in: allMembernames } })
                .select("username avatarUrl isVerified isAdmin roles")
                .populate("roles", "name badge color").lean()
            : [];

        const userMap = {};
        users.forEach((u) => {
            userMap[u.username] = {
                avatarUrl: u.avatarUrl || "",
                isVerified: u.isVerified || false,
                isAdmin: u.isAdmin || false,
                roles: (u.roles || []).map((r) => ({ id: r._id?.toString() ?? "", name: r.name ?? "", badge: r.badge ?? "", color: r.color ?? "" })),
            };
        });

        const enriched = groups.map((g) => ({
            ...g,
            members: g.members.map((m) => ({ ...m, _profile: userMap[m.username] || null })),
        }));

        return res.json(enriched);
    } catch (err) {
        console.error("Groups GET error:", err);
        return res.status(500).json({ error: "Failed to fetch groups" });
    }
});

// POST /
router.post("/", verifyToken, async (req, res) => {
    try {
        const { name, description, avatarUrl, members } = req.body;
        const creatorDoc = await User.findById(req.userId).select("username avatarUrl avatarColor").lean();
        const creator = creatorDoc?.username;
        if (!name?.trim() || !creator) {
            return res.status(400).json({ error: "name required" });
        }

        const memberUsernames = [creator, ...(members || [])].filter(Boolean);
        const uniqueUsernames = [...new Set(memberUsernames.map((u) => typeof u === "string" ? u : u.username))];

        const memberDocs = await User.find({ username: { $in: uniqueUsernames } })
            .select("username avatarUrl avatarColor").lean();
        const memberMap = {};
        memberDocs.forEach((u) => { memberMap[u.username] = u; });

        const memberEntries = uniqueUsernames.map((u) => ({
            username: u,
            avatarUrl: memberMap[u]?.avatarUrl || "",
            color: memberMap[u]?.avatarColor || "#3b82f6",
            role: u === creator ? "admin" : "member",
        }));

        const group = await GroupChat.create({
            name: name.trim().slice(0, 50),
            description: (description || "").trim().slice(0, 200),
            avatarUrl: avatarUrl || "",
            creator,
            members: memberEntries,
        });

        return res.status(201).json(group);
    } catch (err) {
        console.error("Groups POST error:", err);
        return res.status(500).json({ error: "Failed to create group" });
    }
});

// GET /:id
router.get("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const group = await GroupChat.findById(id).lean();
        if (!group) return res.status(404).json({ error: "Group not found" });

        const memberNames = group.members.map((m) => m.username);
        const users = await User.find({ username: { $in: memberNames } })
            .select("username avatarUrl isVerified isAdmin roles")
            .populate("roles", "name badge color").lean();

        const userMap = {};
        users.forEach((u) => {
            userMap[u.username] = {
                avatarUrl: u.avatarUrl || "",
                isVerified: u.isVerified || false,
                isAdmin: u.isAdmin || false,
                roles: (u.roles || []).map((r) => ({ id: r._id?.toString() ?? "", name: r.name ?? "", badge: r.badge ?? "", color: r.color ?? "" })),
            };
        });

        return res.json({
            ...group,
            members: group.members.map((m) => ({ ...m, _profile: userMap[m.username] || null })),
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch group" });
    }
});

// PATCH /:id
router.patch("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { action, ...updates } = req.body;
        const username = (await User.findById(req.userId).select("username").lean())?.username;

        const group = await GroupChat.findById(id);
        if (!group) return res.status(404).json({ error: "Group not found" });

        const isAdmin = group.members.find((m) => m.username === username)?.role === "admin";

        if (action === "addMember") {
            if (!isAdmin) return res.status(403).json({ error: "Not authorized" });
            const userDoc = await User.findOne({ username: updates.memberUsername }).select("username avatarUrl avatarColor").lean();
            if (!userDoc) return res.status(404).json({ error: "User not found" });
            if (group.members.find((m) => m.username === updates.memberUsername)) {
                return res.status(400).json({ error: "Already a member" });
            }
            group.members.push({ username: userDoc.username, avatarUrl: userDoc.avatarUrl || "", color: userDoc.avatarColor || "#3b82f6", role: "member" });
            await group.save();
            return res.json(group);
        }

        if (action === "removeMember") {
            if (!isAdmin && username !== updates.memberUsername) return res.status(403).json({ error: "Not authorized" });
            group.members = group.members.filter((m) => m.username !== updates.memberUsername);
            await group.save();
            return res.json(group);
        }

        if (action === "updateRole") {
            if (!isAdmin) return res.status(403).json({ error: "Not authorized" });
            const member = group.members.find((m) => m.username === updates.memberUsername);
            if (member) member.role = updates.role === "admin" ? "admin" : "member";
            await group.save();
            return res.json(group);
        }

        if (action === "leave") {
            group.members = group.members.filter((m) => m.username !== username);
            if (group.members.length === 0) {
                await GroupChat.findByIdAndDelete(id);
                await GroupMessage.deleteMany({ groupId: id });
                return res.json({ deleted: true });
            }
            if (!group.members.find((m) => m.role === "admin") && group.members.length > 0) {
                group.members[0].role = "admin";
            }
            await group.save();
            return res.json(group);
        }

        if (action === "updateInfo") {
            if (!isAdmin) return res.status(403).json({ error: "Not authorized" });
            if (updates.name) group.name = updates.name.trim().slice(0, 50);
            if (updates.description !== undefined) group.description = updates.description.trim().slice(0, 200);
            if (updates.avatarUrl !== undefined) group.avatarUrl = updates.avatarUrl;
            await group.save();
            return res.json(group);
        }

        if (action === "toggleMute") {
            const isMuted = group.mutedBy.includes(username);
            if (isMuted) group.mutedBy = group.mutedBy.filter((u) => u !== username);
            else group.mutedBy.push(username);
            await group.save();
            return res.json(group);
        }

        if (action === "delete") {
            if (!isAdmin) return res.status(403).json({ error: "Not authorized" });
            await GroupChat.findByIdAndDelete(id);
            await GroupMessage.deleteMany({ groupId: id });
            return res.json({ deleted: true });
        }

        return res.status(400).json({ error: "Invalid action" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to update group" });
    }
});

// DELETE /:id
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const username = (await User.findById(req.userId).select("username").lean())?.username;

        const group = await GroupChat.findById(id);
        if (!group) return res.status(404).json({ error: "Group not found" });

        const isAdmin = group.members.find((m) => m.username === username)?.role === "admin";
        if (!isAdmin && group.creator !== username) {
            return res.status(403).json({ error: "Not authorized" });
        }

        await GroupChat.findByIdAndDelete(id);
        await GroupMessage.deleteMany({ groupId: id });
        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /:id/messages
router.get("/:id/messages", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
        const { before } = req.query;

        const query = { groupId: id };
        if (before) query.timeStamp = { $lt: new Date(before) };

        const messages = await GroupMessage.find(query)
            .sort({ timeStamp: -1 }).limit(limit + 1).lean();

        const hasMore = messages.length > limit;
        const sliced = hasMore ? messages.slice(0, limit) : messages;

        const senderNames = [...new Set(sliced.map((m) => m.sender))];
        const users = senderNames.length > 0
            ? await User.find({ username: { $in: senderNames } })
                .select("username avatarUrl isVerified isAdmin roles")
                .populate("roles", "name badge color").lean()
            : [];

        const userMap = {};
        users.forEach((u) => {
            userMap[u.username] = {
                avatarUrl: u.avatarUrl || "",
                isVerified: u.isVerified || false,
                isAdmin: u.isAdmin || false,
                roles: (u.roles || []).map((r) => ({ id: r._id?.toString() ?? "", name: r.name ?? "", badge: r.badge ?? "", color: r.color ?? "" })),
            };
        });

        const enriched = sliced.map((m) => ({
            ...m,
            _author: userMap[m.sender] || null,
        })).reverse();

        return res.json({ messages: enriched, hasMore });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch messages" });
    }
});

// POST /:id/messages
router.post("/:id/messages", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { text, imageUrl, audioUrl, replyTo } = req.body;
        const senderDoc = await User.findById(req.userId).select("username avatarColor").lean();
        const sender = senderDoc?.username;
        if (!sender) return res.status(400).json({ error: "sender required" });

        const group = await GroupChat.findById(id);
        if (!group) return res.status(404).json({ error: "Group not found" });
        if (!group.members.find((m) => m.username === sender)) {
            return res.status(403).json({ error: "Not a member" });
        }

        const msg = await GroupMessage.create({
            groupId: id,
            sender,
            text: text || "",
            imageUrl: imageUrl || "",
            audioUrl: audioUrl || "",
            color: senderDoc?.avatarColor || "#3b82f6",
            replyTo: replyTo || { sender: null, text: "", messageId: null },
        });

        group.lastMessage = {
            text: text || (imageUrl ? "\uD83D\uDCF7 Image" : audioUrl ? "\uD83C\uDFA4 Voice" : ""),
            sender,
            imageUrl: imageUrl || "",
            timeStamp: new Date(),
        };
        group.updatedAt = new Date();
        await group.save();

        const userDoc = await User.findOne({ username: sender })
            .select("username avatarUrl isVerified isAdmin roles")
            .populate("roles", "name badge color").lean();

        const author = userDoc ? {
            avatarUrl: userDoc.avatarUrl || "",
            isVerified: userDoc.isVerified || false,
            isAdmin: userDoc.isAdmin || false,
            roles: (userDoc.roles || []).map((r) => ({ id: r._id?.toString() ?? "", name: r.name ?? "", badge: r.badge ?? "", color: r.color ?? "" })),
        } : null;

        return res.status(201).json({ ...msg.toObject(), _author: author });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to send message" });
    }
});

// GET /:id/members
router.get("/:id/members", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const group = await GroupChat.findById(id).lean();
        if (!group) return res.status(404).json({ error: "Group not found" });
        return res.json({ members: group.members });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:id/members
router.post("/:id/members", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { username: memberUsername, avatarUrl, color } = req.body;
        const username = (await User.findById(req.userId).select("username").lean())?.username;

        const group = await GroupChat.findById(id);
        if (!group) return res.status(404).json({ error: "Group not found" });

        const isAdmin = group.members.find((m) => m.username === username)?.role === "admin";
        if (!isAdmin) return res.status(403).json({ error: "Not authorized" });

        if (group.members.find((m) => m.username === memberUsername)) {
            return res.status(400).json({ error: "Already a member" });
        }

        const userDoc = await User.findOne({ username: memberUsername })
            .select("username avatarUrl avatarColor").lean();

        group.members.push({
            username: memberUsername,
            avatarUrl: avatarUrl || userDoc?.avatarUrl || "",
            color: color || userDoc?.avatarColor || "#3b82f6",
            role: "member",
        });
        await group.save();
        return res.json(group);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed" });
    }
});

// DELETE /:id/members/:username
router.delete("/:id/members/:username", verifyToken, async (req, res) => {
    try {
        const { id, username: memberUsername } = req.params;
        const username = (await User.findById(req.userId).select("username").lean())?.username;

        const group = await GroupChat.findById(id);
        if (!group) return res.status(404).json({ error: "Group not found" });

        const isAdmin = group.members.find((m) => m.username === username)?.role === "admin";
        if (!isAdmin && username !== memberUsername) return res.status(403).json({ error: "Not authorized" });

        group.members = group.members.filter((m) => m.username !== memberUsername);
        if (group.members.length === 0) {
            await GroupChat.findByIdAndDelete(id);
            return res.json({ deleted: true });
        }
        if (!group.members.find((m) => m.role === "admin") && group.members.length > 0) {
            group.members[0].role = "admin";
        }
        await group.save();
        return res.json(group);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed" });
    }
});

module.exports = router;
