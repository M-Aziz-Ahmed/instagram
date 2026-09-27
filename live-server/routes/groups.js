const express = require("express");
const GroupChat = require("../models/groupChat");
const GroupMessage = require("../models/groupMessage");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");
const { isProUserDoc } = require("../lib/economy");
const { resolveLinkPreview } = require("../utils/linkPreview");
const { rejectIfBlocked } = require("../lib/textFilter");
const { enforceMedia } = require("../lib/mediaModeration");
const { extractMentions } = require("../lib/mentions");

/**
 * How long a sender may un-send their own group message. The ordinary `delete`
 * action has no time limit and always did, which is why the client could not
 * honestly call it a recall; this window is what makes "un-send" meaningful.
 */
const GROUP_RECALL_WINDOW_MS = 60 * 1000;

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

        // Same hole as GET /:id/messages: the full group document, including the
        // member list, was readable by anyone holding the id.
        const viewer = await User.findById(req.userId).select("username").lean();
        const viewerName = viewer?.username;
        const isMember = viewerName && (group.members || []).some((m) => m.username === viewerName);
        if (!isMember) {
            return res.status(403).json({ error: "You are not a member of this group" });
        }

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
            // A group with a member cap silently accepted members past it, so the
            // cap has to be enforced here rather than only displayed in settings.
            if (group.maxMembers > 0 && group.members.length >= group.maxMembers) {
                return res.status(400).json({ error: `This group is full (${group.maxMembers} members)` });
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

        if (action === "demote") {
            if (!isAdmin) return res.status(403).json({ error: "Not authorized" });
            const member = group.members.find((m) => m.username === updates.memberUsername);
            if (!member) return res.status(404).json({ error: "Not a member" });
            if (member.username === group.creator) {
                return res.status(400).json({ error: "The group creator cannot be demoted" });
            }
            // Refuse to remove the LAST admin, which would leave a group nobody
            // can moderate and that no one can leave without auto-promoting.
            const otherAdmins = group.members.filter((m) => m.role === "admin" && m.username !== member.username);
            if (member.role === "admin" && otherAdmins.length === 0) {
                return res.status(400).json({ error: "A group must keep at least one admin" });
            }
            member.role = "member";
            await group.save();
            return res.json(group);
        }

        if (action === "announcement") {
            if (!isAdmin) return res.status(403).json({ error: "Only admins can set an announcement" });
            group.announcement = {
                text: String(updates.text ?? "").trim().slice(0, 500),
                setBy: username,
                setAt: new Date(),
            };
            await group.save();
            return res.json(group);
        }

        if (action === "setSlowMode") {
            if (!isAdmin) return res.status(403).json({ error: "Only admins can change slow mode" });
            const secs = Number(updates.seconds);
            if (!Number.isFinite(secs) || secs < 0 || secs > 86400) {
                return res.status(400).json({ error: "seconds must be between 0 and 86400" });
            }
            group.slowModeSeconds = Math.floor(secs);
            await group.save();
            return res.json(group);
        }

        if (action === "setMaxMembers") {
            if (!isAdmin) return res.status(403).json({ error: "Only admins can change the member limit" });
            const max = Number(updates.maxMembers);
            if (!Number.isFinite(max) || max < 0 || max > 1000) {
                return res.status(400).json({ error: "maxMembers must be between 0 and 1000" });
            }
            // Lowering the cap below the current size is allowed — the limit is a
            // rule for new members, not a reason to eject existing ones.
            group.maxMembers = Math.floor(max);
            await group.save();
            return res.json(group);
        }

        if (action === "regenerateInvite") {
            if (!isAdmin) return res.status(403).json({ error: "Only admins can rotate the invite link" });
            // Short, unambiguous token. Uniqueness is enforced by a sparse
            // unique index, so a collision is retried rather than accepted.
            const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // no l/o/0/1
            for (let attempt = 0; attempt < 8; attempt++) {
                let code = "";
                for (let i = 0; i < 10; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
                const clash = await GroupChat.findOne({ inviteCode: code }).select("_id").lean();
                if (!clash) {
                    group.inviteCode = code;
                    await group.save();
                    return res.json(group);
                }
            }
            return res.status(500).json({ error: "Could not generate a unique invite code, try again" });
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

        // This route had NO membership check, while every write route did. A
        // 24-character group id was therefore enough to read a group's entire
        // history without being a member — and group ids are returned to any
        // member, so they leak. Membership is now required.
        const reader = await User.findById(req.userId).select("username").lean();
        const readerName = reader?.username;
        if (!readerName) return res.status(401).json({ error: "Could not resolve your account" });

        const group = await GroupChat.findById(id).select("members.username").lean();
        if (!group) return res.status(404).json({ error: "Group not found" });
        const isMember = (group.members || []).some((m) => m.username === readerName);
        if (!isMember) {
            // 403 rather than 404: the caller proved they are authenticated, so
            // pretending the group does not exist would just be confusing.
            return res.status(403).json({ error: "You are not a member of this group" });
        }

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
        const { text, imageUrl, audioUrl, replyTo, linkPreview, videoUrl, attachments, location, poll, contact, kind } = req.body;
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

        // Slow mode. Admins are exempt — otherwise a moderator could not
        // respond to the very thing they are moderating. The remaining time is
        // returned so the client can show a live countdown rather than a static
        // error the sender has to guess at.
        if (group.slowModeSeconds > 0 && senderRole !== "admin") {
            const last = await GroupMessage.findOne({ groupId: id, sender })
                .sort({ timeStamp: -1 })
                .select("timeStamp")
                .lean();
            if (last?.timeStamp) {
                const elapsed = Date.now() - new Date(last.timeStamp).getTime();
                const waitMs = group.slowModeSeconds * 1000 - elapsed;
                if (waitMs > 0) {
                    return res.status(429).json({
                        error: `Slow mode: wait ${Math.ceil(waitMs / 1000)}s before sending again`,
                        retryAfterSeconds: Math.ceil(waitMs / 1000),
                        slowModeSeconds: group.slowModeSeconds,
                    });
                }
            }
        }

        // See the DM route: the server re-resolves a preview whenever the client
        // omits one, so an explicit opt-out has to be honoured here too.
        const resolvedPreview = req.body?.suppressPreview
            ? null
            : await resolveLinkPreview(text, linkPreview);

        // Same normalisation the DM route does, for the same reason: these
        // fields are declared on the schema but nothing wrote them, and a
        // file/poll/location-only group message was rejected outright.
        const attachmentList = (Array.isArray(attachments) ? attachments : [])
            .filter((a) => a && typeof a === "object" && a.url)
            .slice(0, 10)
            .map((a) => ({
                url: String(a.url).slice(0, 2000),
                name: String(a.name ?? "").slice(0, 200),
                mimeType: String(a.mimeType ?? "").slice(0, 120),
                size: Number.isFinite(Number(a.size)) ? Math.max(0, Number(a.size)) : 0,
            }));
        const hasPoll = !!(poll && typeof poll === "object" && String(poll.question || "").trim() && Array.isArray(poll.options));
        const pollOptions = hasPoll
            ? poll.options.map((o) => String(o?.text ?? "").trim().slice(0, 100)).filter(Boolean).slice(0, 6)
            : [];
        const hasLocation = !!(location && typeof location === "object"
            && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng)));

        if (!text?.trim() && !imageUrl && !audioUrl && !videoUrl && attachmentList.length === 0 && !hasPoll && !hasLocation) {
            return res.status(400).json({ error: "A message needs text, media, a file, a poll or a location" });
        }
        if (poll && String(poll.question || "").trim() && pollOptions.length < 2) {
            return res.status(400).json({ error: "A poll needs at least 2 options" });
        }

        const resolvedKind = ["code", "contact", "poll", "location"].includes(String(kind))
            ? String(kind)
            : hasPoll ? "poll"
                : hasLocation ? "location"
                    : videoUrl ? "video"
                        : attachmentList.length ? "file"
                            : imageUrl ? "image"
                                : audioUrl ? "audio"
                                    : "text";

        // Group chat had no text moderation. The GroupMessage model also carries
        // a pre-save backstop; checking here gives a clean 400 instead of a 500.
        if (await rejectIfBlocked(text, "group", res)) return;

        if (imageUrl) {
            const groupMedia = await enforceMedia([imageUrl], {
                surface: "group",
                message: "This image was blocked by the automated media filter.",
            });
            if (!groupMedia.ok) {
                return res.status(400).json({ error: groupMedia.message, filtered: true, reason: groupMedia.error });
            }
        }

        const msg = await GroupMessage.create({
            groupId: id,
            sender,
            text: text || "",
            imageUrl: imageUrl || "",
            audioUrl: audioUrl || "",
            videoUrl: videoUrl || "",
            attachments: attachmentList,
            kind: resolvedKind,
            location: hasLocation
                ? { lat: Number(location.lat), lng: Number(location.lng), label: String(location.label ?? "").slice(0, 200) }
                : null,
            poll: hasPoll
                ? {
                    question: String(poll.question).trim().slice(0, 200),
                    options: pollOptions.map((t) => ({ text: t, votes: [] })),
                    votes: [],
                }
                : null,
            // Declared on the schema now, so the mention list survives an edit
            // instead of being dropped by strict mode.
            mentions: extractMentions(text || "", sender),
            color: senderDoc?.avatarColor || "#3b82f6",
            replyTo: replyTo || { sender: null, text: "", messageId: null },
            linkPreview: resolvedPreview,
        });

        group.lastMessage = {
            text: text
                || (hasPoll ? "\uD83D\uDCC3 Poll"
                    : hasLocation ? "\uD83D\uDCCD Location"
                        : videoUrl ? "\uD83C\uDFAC Video"
                            : attachmentList.length ? "\uD83D\uDCCE File"
                                : imageUrl ? "\uD83D\uDCF7 Image"
                                    : audioUrl ? "\uD83C\uDFA4 Voice" : ""),
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
            if (await rejectIfBlocked(text, "group", res)) return;
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

        // Group message pinning. Both client passes rendered a pin control and
        // both reported the dispatcher answering "Invalid request" for it, so
        // they had to disable themselves. A pin is visible to every member, so
        // it is a property of the message rather than a per-user array — and
        // unpinning is open to any member, because a stale pin nobody can remove
        // is worse than one member removing a pin they did not set.
        if ((action === "pin" || action === "unpin") && messageId) {
            const msg = await GroupMessage.findOne({ _id: messageId, groupId: id });
            if (!msg) return res.status(404).json({ error: "Message not found" });
            if (msg.deleted) return res.status(400).json({ error: "Cannot pin a deleted message" });
            if (action === "pin" && group.permissions?.whoCanPin === "admin" && !isAdmin) {
                return res.status(403).json({ error: "Only admins can pin messages in this group" });
            }
            msg.pinned = action === "pin";
            msg.pinnedBy = action === "pin" ? username : "";
            await msg.save();
            return res.json({ pinned: msg.pinned, pinnedBy: msg.pinnedBy });
        }

        // Sender un-send, distinct from the ordinary delete. The group delete
        // action has no time limit and is reachable forever, which is why the
        // client could not honestly label it "recall" — this gives it one.
        if (action === "recall" && messageId) {
            const msg = await GroupMessage.findOne({ _id: messageId, groupId: id });
            if (!msg) return res.status(404).json({ error: "Message not found" });
            if (msg.sender !== username) return res.status(403).json({ error: "Only the sender can un-send a message" });
            const ageMs = Date.now() - new Date(msg.timeStamp).getTime();
            if (ageMs > GROUP_RECALL_WINDOW_MS) {
                return res.status(400).json({
                    error: "The time to un-send this message has passed",
                    ageSeconds: Math.round(ageMs / 1000),
                    windowSeconds: GROUP_RECALL_WINDOW_MS / 1000,
                });
            }
            msg.text = ""; msg.imageUrl = ""; msg.audioUrl = ""; msg.videoUrl = "";
            msg.attachments = []; msg.linkPreview = null; msg.pinned = false;
            msg.deleted = true; msg.editedAt = null;
            await msg.save();
            return res.json({ recalled: true, message: msg.toObject() });
        }

        // Group poll voting. Without this the poll renders but can never be
        // voted in, which is a dead control rather than an incomplete one.
        if (action === "vote" && messageId) {
            const optionIndex = Number(req.body?.optionIndex);
            if (!Number.isInteger(optionIndex) || optionIndex < 0) {
                return res.status(400).json({ error: "optionIndex must be a non-negative integer" });
            }
            const msg = await GroupMessage.findOne({ _id: messageId, groupId: id, kind: "poll" });
            if (!msg) return res.status(404).json({ error: "Poll not found" });
            if (!Array.isArray(msg.poll?.options) || optionIndex >= msg.poll.options.length) {
                return res.status(400).json({ error: "That option does not exist on this poll" });
            }
            // Changing a vote is allowed: remove the previous one first rather
            // than stacking, so `poll.votes` can never contain a duplicate and
            // the total can never exceed the number of voters.
            const previous = msg.poll.votes.findIndex((v) => v.username === username);
            if (previous !== -1 && msg.poll.votes[previous].optionIndex === optionIndex) {
                return res.json({ poll: msg.poll, unchanged: true });
            }
            if (previous !== -1) msg.poll.votes.splice(previous, 1);
            msg.poll.options.forEach((o) => { o.votes = (o.votes || []).filter((u) => u !== username); });
            msg.poll.options[optionIndex].votes.push(username);
            msg.poll.votes.push({ username, optionIndex });
            await msg.save();
            return res.json({ poll: msg.poll, changed: true });
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

/**
 * POST /join — join a group from a share link.
 *
 * Route order checked rather than assumed: the only other single-segment POST is
 * `router.post("/")`, which does not match `/join`, and every `/:id/...` pattern
 * is two segments, so nothing here is shadowed. `GET /invite/:code` is safe for
 * the same reason — `GET /:id/messages` pins its second segment to the literal
 * "messages". Moving either of these next to a `/:id/...` route would need this
 * to be re-checked.
 */
router.post("/join", verifyToken, async (req, res) => {
    try {
        const code = String(req.body?.code ?? "").trim();
        if (!code) return res.status(400).json({ error: "code required" });

        const username = (await User.findById(req.userId).select("username avatarUrl avatarColor").lean())?.username;
        if (!username) return res.status(401).json({ error: "Could not resolve your account" });

        const group = await GroupChat.findOne({ inviteCode: code }).lean();
        if (!group) return res.status(404).json({ error: "This invite link is not valid. It may have been rotated." });
        if (group.members.some((m) => m.username === username)) {
            return res.status(400).json({ error: "You are already in this group" });
        }
        if (group.maxMembers > 0 && group.members.length >= group.maxMembers) {
            return res.status(400).json({ error: `This group is full (${group.maxMembers} members)` });
        }

        const me = await User.findById(req.userId).select("avatarUrl avatarColor").lean();
        await GroupChat.updateOne(
            { _id: group._id },
            {
                $push: {
                    members: {
                        username,
                        avatarUrl: me?.avatarUrl || "",
                        color: me?.avatarColor || "#3b82f6",
                        role: "member",
                        joinedAt: new Date(),
                    },
                },
                $set: { updatedAt: new Date() },
            }
        );
        const updated = await GroupChat.findById(group._id).lean();
        return res.json({ ok: true, group: updated, approvalRequired: group.approvalRequired === true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed", detail: err.message });
    }
});

/** GET /invite/:code — resolve a link before joining, so a dead one is obvious. */
router.get("/invite/:code", verifyToken, async (req, res) => {
    try {
        const group = await GroupChat.findOne({ inviteCode: String(req.params.code).trim() })
            .select("name description avatarUrl members.username maxMembers")
            .lean();
        if (!group) return res.status(404).json({ error: "This invite link is not valid" });
        const username = (await User.findById(req.userId).select("username").lean())?.username;
        return res.json({
            group: {
                name: group.name,
                description: group.description,
                avatarUrl: group.avatarUrl,
                memberCount: (group.members || []).length,
                maxMembers: group.maxMembers,
                isMember: (group.members || []).some((m) => m.username === username),
            },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed", detail: err.message });
    }
});

module.exports = router;
