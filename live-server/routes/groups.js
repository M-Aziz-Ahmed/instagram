const express = require("express");
const GroupChat = require("../models/groupChat");
const GroupMessage = require("../models/groupMessage");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");
const { isProUserDoc } = require("../lib/economy");
const { resolveLinkPreview } = require("../utils/linkPreview");
const { extractMentions } = require("../lib/mentions");

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
                .select("username avatarUrl isVerified isAdmin roles proUntil")
                .populate("roles", "name badge color").lean()
            : [];

        const userMap = {};
        users.forEach((u) => {
            userMap[u.username] = {
                avatarUrl: u.avatarUrl || "",
                isVerified: u.isVerified || false,
                isAdmin: u.isAdmin || false,
                isPro: isProUserDoc(u),
                isPro: isProUserDoc(u),
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
            .select("username avatarUrl isVerified isAdmin roles proUntil")
            .populate("roles", "name badge color").lean();

        const userMap = {};
        users.forEach((u) => {
            userMap[u.username] = {
                avatarUrl: u.avatarUrl || "",
                isVerified: u.isVerified || false,
                isAdmin: u.isAdmin || false,
                isPro: isProUserDoc(u),
                isPro: isProUserDoc(u),
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
            if (group.permissions?.whoCanAdd === "admin" && !isAdmin) {
                return res.status(403).json({ error: "Only admins can add members" });
            }
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

        if (action === "updatePermissions") {
            if (!isAdmin) return res.status(403).json({ error: "Not authorized" });
            if (updates.whoCanSend) group.permissions.whoCanSend = updates.whoCanSend;
            if (updates.whoCanAdd) group.permissions.whoCanAdd = updates.whoCanAdd;
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
                .select("username avatarUrl isVerified isAdmin roles proUntil")
                .populate("roles", "name badge color").lean()
            : [];

        const userMap = {};
        users.forEach((u) => {
            userMap[u.username] = {
                avatarUrl: u.avatarUrl || "",
                isVerified: u.isVerified || false,
                isAdmin: u.isAdmin || false,
                isPro: isProUserDoc(u),
                isPro: isProUserDoc(u),
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
        const { text, imageUrl, audioUrl, replyTo, linkPreview } = req.body;
        const senderDoc = await User.findById(req.userId).select("username avatarColor").lean();
        const sender = senderDoc?.username;
        if (!sender) return res.status(400).json({ error: "sender required" });

        const group = await GroupChat.findById(id);
        if (!group) return res.status(404).json({ error: "Group not found" });
        if (!group.members.find((m) => m.username === sender)) {
            return res.status(403).json({ error: "Not a member" });
        }

        const senderRole = group.members.find((m) => m.username === sender)?.role;
        if (group.permissions?.whoCanSend === "admin" && senderRole !== "admin") {
            return res.status(403).json({ error: "Only admins can send messages" });
        }

        const resolvedPreview = await resolveLinkPreview(text, linkPreview);

        const msg = await GroupMessage.create({
            groupId: id,
            sender,
            text: text || "",
            imageUrl: imageUrl || "",
            audioUrl: audioUrl || "",
            color: senderDoc?.avatarColor || "#3b82f6",
            replyTo: replyTo || { sender: null, text: "", messageId: null },
            linkPreview: resolvedPreview,
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
            .select("username avatarUrl isVerified isAdmin roles proUntil")
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

// PATCH /:id/messages â€” unified action dispatcher (read, react, delete)
router.patch("/:id/messages", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { action, messageId, reactionType } = req.body;

        // Was unauthenticated and read the actor from `req.body.username`, which
        // meant an unauthenticated caller could pass the name of any member and
        // delete that member's messages, react as them, or mark the group read.
        // The actor now comes from the session, and every action is gated on
        // group membership — without which knowing a group id was enough.
        const me = await User.findById(req.userId).select("username").lean();
        const username = me?.username;
        if (!username) return res.status(401).json({ error: "Unauthorized" });

        const group = await GroupChat.findById(id).select("members").lean();
        if (!group) return res.status(404).json({ error: "Group not found" });
        const isMember = (group.members || []).some((m) => (m.username || m) === username);
        if (!isMember) return res.status(403).json({ error: "Not a member of this group" });

        if (action === "read") {
            await GroupMessage.updateMany(
                { groupId: id, sender: { $ne: username }, readBy: { $ne: username } },
                { $addToSet: { readBy: username } }
            );
            return res.json({ ok: true });
        }

        if (action === "react" && messageId && reactionType) {
            const validReactions = ["like", "love", "laugh", "fire", "sad", "angry"];
            if (!validReactions.includes(reactionType)) {
                return res.status(400).json({ error: "Invalid reaction" });
            }

            // Scoped to the group in the URL as well as the id, so a message from
            // another group cannot be reached through this one.
            const msg = await GroupMessage.findOne({ _id: messageId, groupId: id });
            if (!msg) return res.status(404).json({ error: "Message not found" });

            if (!msg.reactions) {
                msg.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
            }

            validReactions.forEach(type => {
                if (!msg.reactions[type]) msg.reactions[type] = [];
                const idx = msg.reactions[type].indexOf(username);
                if (idx !== -1) msg.reactions[type].splice(idx, 1);
            });

            if (!msg.reactions[reactionType]) msg.reactions[reactionType] = [];
            const idx = msg.reactions[reactionType].indexOf(username);
            if (idx === -1) {
                msg.reactions[reactionType].push(username);
            }

            await msg.save();
            return res.json({ reactions: msg.reactions });
        }

        if (action === "star" && messageId) {
            const msg = await GroupMessage.findOne({ _id: messageId, groupId: id });
            if (!msg) return res.status(404).json({ error: "Message not found" });
            msg.starredBy = msg.starredBy || [];
            const idx = msg.starredBy.indexOf(username);
            const starred = idx === -1;
            if (starred) msg.starredBy.push(username);
            else msg.starredBy.splice(idx, 1);
            await msg.save();
            return res.json({ starred });
        }

        // Group messages had no way to be edited, unlike DMs.
        if (action === "edit" && messageId) {
            const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
            if (!text) return res.status(400).json({ error: "Text required" });
            if (text.length > 1000) return res.status(400).json({ error: "Message too long" });
            const msg = await GroupMessage.findOne({ _id: messageId, groupId: id });
            if (!msg) return res.status(404).json({ error: "Message not found" });
            if (msg.sender !== username) return res.status(403).json({ error: "Unauthorized" });
            if (msg.deleted) return res.status(400).json({ error: "Message was deleted" });
            msg.text = text;
            msg.mentions = extractMentions(text, username);
            msg.editedAt = new Date();
            await msg.save();
            return res.json({ text: msg.text, editedAt: msg.editedAt });
        }

        if (action === "delete" && messageId) {
            const msg = await GroupMessage.findOne({ _id: messageId, groupId: id });
            if (!msg) return res.status(404).json({ error: "Message not found" });
            if (msg.sender !== username) return res.status(403).json({ error: "Unauthorized" });

            // Soft delete, matching DMs. This used to remove the row outright,
            // which meant the sender's own optimistic bubble disappeared with no
            // explanation and a failed delete was indistinguishable from a
            // successful one.
            if (msg.deleted) return res.json({ ok: true, alreadyDeleted: true });
            msg.deleted = true;
            msg.text = "";
            msg.imageUrl = "";
            msg.audioUrl = "";
            await msg.save();
            return res.json({ ok: true, deleted: true });
        }

        return res.status(400).json({ error: "Invalid request" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /:id/members
// DEAD ENDPOINT - no client calls it. `GET /` and `GET /:id` both return the
// group document with `members` already embedded, which is what
// `components/Inbox/GroupSettings.jsx` reads, so this duplicates that. Kept
// rather than deleted because it is a reachable public API path; do not build
// on it.
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
// DEAD ENDPOINT - no client calls it, and it only ever *adds* a member: it
// destructures { username, avatarUrl, color } and ignores `action` entirely, so
// the `action: "promote"` this used to be sent came back 400 "Already a member"
// and GroupSettings' Promote button silently did nothing. The route that really
// changes a role is PATCH /:id with `action: "updateRole"`, and the one that
// really removes a member is PATCH /:id with `action: "removeMember"`; both are
// what the client calls today. Kept, not deleted, because it is a reachable
// public API path.
router.post("/:id/members", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { username: memberUsername, avatarUrl, color } = req.body;
        const username = (await User.findById(req.userId).select("username").lean())?.username;

        const group = await GroupChat.findById(id);
        if (!group) return res.status(404).json({ error: "Group not found" });

        const isAdmin = group.members.find((m) => m.username === username)?.role === "admin";
        if (group.permissions?.whoCanAdd === "admin" && !isAdmin) {
            return res.status(403).json({ error: "Only admins can add members" });
        }

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
// DEAD ENDPOINT - no client calls it. Removal goes through
// PATCH /:id { action: "removeMember" } (see GroupSettings.jsx), which is also
// the only path that keeps the group consistent: this route deletes the whole
// group document outright when the last member leaves, with none of the
// bookkeeping the PATCH path does. Kept, not deleted, because it is a reachable
// public API path.
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
