const express = require("express");
const mongoose = require("mongoose");
const Message = require("../models/messages");
const Notification = require("../models/notification");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");
const { getBlockedUsers } = require("../lib/visibility");
const { isProUserDoc } = require("../lib/economy");
const { requireFeature } = require("../lib/featureFlags");
const { logChat } = require("../logService");
const { sendPushNotification } = require("../push");
const { resolveLinkPreview } = require("../utils/linkPreview");

const router = express.Router();

// Resolves a recipient and enforces every messaging rule that must hold before
// a message can be delivered, so the send and forward paths cannot drift apart.
//
// Blocking is enforced here, not in the UI, because the UI is not the only way
// to post a message â€” the socket layer and any direct API caller must be held to
// the same rule. A block is symmetric: if either side has blocked the other, the
// message is not delivered.
//
// Mute is deliberately NOT consulted. Muting hides someone's posts; it must not
// cut off a DM thread, otherwise "mute" silently becomes "block" for messaging
// and the UI's promise that you can still message a muted user becomes a lie.
//
// Returns `{ status, body }` on failure, or the resolved recipient on success.
async function resolveRecipient(sender, senderDoc, recipientNameRaw) {
    if (!recipientNameRaw?.trim()) {
        return { status: 400, body: { error: "Recipient is required" } };
    }
    const recipientName = recipientNameRaw.trim();
    if (recipientName.toLowerCase() === sender.toLowerCase()) {
        return { status: 400, body: { error: "You cannot message yourself" } };
    }

    // getBlockedUsers returns a de-duplicated array of lowercased usernames;
    // normalise to a Set here so the lookups below are O(1) and cannot be
    // broken by the helper's return type.
    const [blockedBySender, recipientDoc] = await Promise.all([
        getBlockedUsers(sender, senderDoc),
        User.findOne({ username: recipientName }).select("username avatarColor blockedUsers").lean(),
    ]);
    const senderBlocked = new Set(blockedBySender);

    const recipientNameLower = recipientName.toLowerCase();
    if (!recipientDoc) return { status: 404, body: { error: "Recipient not found" } };

    const recipientBlocked = new Set(
        (recipientDoc.blockedUsers || []).map((u) => String(u).toLowerCase())
    );

    if (senderBlocked.has(recipientNameLower)) {
        return { status: 403, body: { error: "You have blocked this account" } };
    }
    if (recipientBlocked.has(sender.toLowerCase())) {
        // Deliberately the same shape as a missing user, so the API cannot be
        // used to discover who has blocked you.
        return { status: 404, body: { error: "Recipient not found" } };
    }

    return { recipientName, recipientDoc };
}

// GET /
router.get("/", verifyToken, async (req, res) => {
    try {
        const { user1, user2, username, before, limit: limitStr } = req.query;
        const limit = Math.min(parseInt(limitStr || "20", 10), 100);

        if (user1 && user2) {
            // Reading a thread with someone you blocked should behave as if it
            // never happened, in both directions of the block.
            const [a, b] = [String(user1), String(user2)];
                const [hiddenByA, hiddenByB] = await Promise.all([
                    getBlockedUsers(a),
                    getBlockedUsers(b),
                ]);
            const aBlocksB = hiddenByA.includes(b.toLowerCase());
            const bBlocksA = hiddenByB.includes(a.toLowerCase());
            if (aBlocksB || bBlocksA) {
                return res.json({ messages: [], hasMore: false, blocked: true });
            }

            const query = {
                $or: [
                    { sender: user1, recipient: user2 },
                    { sender: user2, recipient: user1 },
                ],
            };
            if (before) query.timeStamp = { $lt: new Date(before) };

            const messages = await Message.find(query)
                .sort({ timeStamp: -1 })
                .limit(limit + 1)
                .maxTimeMS(10000)
                .lean();

            const hasMore = messages.length > limit;
            const sliced = hasMore ? messages.slice(0, limit) : messages;
            const ordered = sliced.reverse();

            Message.updateMany(
                { sender: user2, recipient: user1, delivered: false },
                { $set: { delivered: true } }
            ).catch(() => {});

            return res.json({ messages: ordered, hasMore });
        }

        if (username) {
            // Conversations with *blocked* accounts drop out of the inbox
            // entirely, and their unread messages stop counting toward the
            // badge so a blocked user cannot nag you back into their DMs.
            // Muted accounts stay: muting hides their posts, it does not
            // revoke an existing conversation thread.
            const hidden = await getBlockedUsers(username);
            const hiddenVariants = [...new Set(hidden.flatMap((h) => [h, h.toLowerCase()]))];

            const conversations = await Message.aggregate([
                { $match: { $or: [{ sender: username }, { recipient: username }] } },
                { $sort: { timeStamp: -1 } },
                {
                    $group: {
                        _id: { $cond: [{ $eq: ["$sender", username] }, "$recipient", "$sender"] },
                        lastMessage: { $first: "$$ROOT" },
                        unreadCount: {
                            $sum: {
                                $cond: [
                                    { $and: [{ $eq: ["$recipient", username] }, { $eq: ["$isRead", false] }] },
                                    1, 0,
                                ],
                            },
                        },
                    },
                },
                ...(hiddenVariants.length
                    ? [{ $match: { _id: { $nin: hiddenVariants } } }]
                    : []),
                { $sort: { "lastMessage.timeStamp": -1 } },
                { $limit: 100 },
            ], { maxTimeMS: 10000 });

            const usernames = conversations.map((conv) => conv._id);
            const users = await User.find({ username: { $in: usernames } })
                .select("username avatarUrl color isVerified isAdmin roles proUntil")
                .populate("roles", "name badge color")
                .lean().maxTimeMS(5000);

            // isPro is derived here rather than sent as a stored flag so the
            // conversation list's badge follows the same expiry check as every
            // other surface, with no chance of a stale cached value.
            const userMap = new Map(users.map((u) => [u.username, { ...u, isPro: isProUserDoc(u) }]));

            // Archived and muted conversations stay in the payload, flagged,
            // rather than being filtered out server-side. The client can then
            // offer an "Archived" / "Muted" section and the reader can un-archive
            // something — a list they cannot see is a list they cannot undo.
            const me = await User.findById(req.userId).select("archivedChats mutedChats").lean().maxTimeMS(5000);
            const archived = new Set((me?.archivedChats || []).map((c) => String(c).toLowerCase()));
            const muted = new Set((me?.mutedChats || []).map((c) => String(c).toLowerCase()));

            const result = conversations.map((conv) => ({
                username: conv._id,
                user: userMap.get(conv._id) || { username: conv._id, avatarUrl: "", color: "#3b82f6", isPro: false },
                lastMessage: conv.lastMessage,
                unreadCount: conv.unreadCount,
                archived: archived.has(String(conv._id).toLowerCase()),
                muted: muted.has(String(conv._id).toLowerCase()),
            }));

            return res.json(result);
        }

        return res.status(400).json({ error: "Parameters required" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch messages" });
    }
});

// POST /
// GET /search?q= â€” full-text search across the caller's own DM history.
//
// Scoped to the caller on both sides of the conversation, so this can never
// surface a message the requester was not a party to. Deleted messages are
// excluded, and conversations that are blocked in either direction drop out
// entirely, matching what the inbox itself already shows.
router.get("/search", verifyToken, async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        if (!q) return res.json({ results: [] });
        if (q.length > 200) return res.status(400).json({ error: "Query is too long" });

        const limit = Math.min(parseInt(req.query.limit || "30", 10) || 30, 50);

        // Regex metacharacters are escaped so a user typing "((" gets a literal
        // search rather than a pattern error, and cannot smuggle in an
        // unanchored wildcard that turns the scan into a full collection match.
        const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

        const senderDoc = await User.findById(req.userId).select("username blockedUsers").lean();
        const me = senderDoc?.username;
        if (!me) return res.json({ results: [] });

        const meLower = me.toLowerCase();
        const blockedByMe = new Set(await getBlockedUsers(me, senderDoc));

        const messages = await Message.find({
            $or: [{ sender: me }, { recipient: me }],
            deleted: { $ne: true },
            text: pattern,
        })
            .sort({ timeStamp: -1 })
            .limit(limit * 3) // headroom, trimmed below once blocks are applied
            .maxTimeMS(10000)
            .select("text imageUrl audioUrl sender recipient timeStamp")
            .lean();

        // A block is symmetric, so the other side's block list has to be
        // consulted too. Resolved in one query over the distinct counterparties
        // rather than per result.
        const counterparts = [
            ...new Set(messages.map((m) => (m.sender === me ? m.recipient : m.sender))),
        ];
        const otherDocs = await User.find({ username: { $in: counterparts } })
            .select("username blockedUsers")
            .lean();
        const blockedMeByThem = new Set();
        for (const d of otherDocs) {
            if ((d.blockedUsers || []).some((u) => String(u).toLowerCase() === meLower)) {
                blockedMeByThem.add(d.username.toLowerCase());
            }
        }

        const results = [];
        const seen = new Set();
        for (const m of messages) {
            const other = m.sender === me ? m.recipient : m.sender;
            const otherLower = String(other).toLowerCase();
            if (blockedByMe.has(otherLower) || blockedMeByThem.has(otherLower)) continue;

            // Collapse duplicate hits from the same conversation to the newest
            // match, so one long thread cannot fill the entire result list.
            const dedupeKey = `${otherLower}:${String(m.text).slice(0, 40)}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            results.push({
                id: m._id,
                with: other,
                text: m.text || "",
                hasImage: !!m.imageUrl,
                hasAudio: !!m.audioUrl,
                sentByMe: m.sender === me,
                timeStamp: m.timeStamp,
            });
            if (results.length >= limit) break;
        }

        return res.json({ results });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to search messages" });
    }
});

router.post("/", verifyToken, requireFeature("dms"), async (req, res) => {
    try {
        const { text, imageUrl, audioUrl, recipient, color, replyTo, linkPreview } = req.body;
        const senderDoc = await User.findById(req.userId).select("username avatarColor blockedUsers mutedUsers").lean();
        const sender = senderDoc?.username;
        if (!sender) return res.status(400).json({ error: "Sender not found" });
        if (!recipient?.trim()) return res.status(400).json({ error: "Recipient is required" });
        if (!text?.trim() && !imageUrl && !audioUrl) {
            return res.status(400).json({ error: "Message text, image, or audio is required" });
        }

        const resolved = await resolveRecipient(sender, senderDoc, recipient);
        if (resolved.status) return res.status(resolved.status).json(resolved.body);
        const { recipientName, recipientDoc } = resolved;

        const resolvedPreview = await resolveLinkPreview(text, linkPreview);

        const message = await Message.create({
            text:      text?.trim() || "",
            imageUrl:  imageUrl || "",
            audioUrl:  audioUrl || "",
            sender,
            recipient: recipientName,
            color:     color || senderDoc?.avatarColor || "#3b82f6",
            replyTo:   (replyTo && replyTo.sender && replyTo.text) ? { sender: replyTo.sender, text: String(replyTo.text).slice(0, 500) } : null,
            linkPreview: resolvedPreview,
        });

        const preview = text?.trim() ? text.trim().slice(0, 120) : audioUrl ? "\uD83C\uDFA4 Voice message" : "\uD83D\uDCF7 Image";

        Notification.create({
            recipient: recipientName,
            type: "message",
            fromUser: sender,
            fromColor: color || senderDoc?.avatarColor || "#3b82f6",
            postId: message._id.toString(),
            text: preview,
        }).catch(() => {});

        // OS push so the recipient gets notified even when the app is closed
        if (recipientName.toLowerCase() !== sender.toLowerCase()) {
            sendPushNotification({
                recipientUsername: recipientName,
                type: "message",
                fromUser: sender,
                text: preview,
                url: `/inbox?user=${encodeURIComponent(sender)}`,
            });
        }

        // Real-time socket event so an open/background tab can notify instantly
        // (works without Web Push / VAPID).
        try {
            const io = req.app.locals?.io;
            if (io) {
                io.to(recipientName).emit("message:new", {
                    from: sender,
                    body: preview,
                    timeStamp: message.timeStamp || Date.now(),
                });
            }
        } catch {}

        logChat("dm_sent", { username: sender, targetUser: recipientName, message: `DM from ${sender} to ${recipientName}: ${(text || "").slice(0, 100)}` });
        return res.status(201).json(message.toObject());
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to send message" });
    }
});

// PATCH / â€” unified action dispatcher (react, mark-read)
// POST /forward â€” re-send one of the caller's own messages to someone else.
//
// The original is copied as a fresh message rather than mutated, so the two
// threads stay independent: editing or deleting the forward never touches the
// source, and the source author is recorded in `forwardedFrom` for provenance.
// Blocks are re-checked against the *new* recipient, since forwarding to a
// third party is a fresh delivery that must not become a back door around one.
router.post("/forward", verifyToken, async (req, res) => {
    try {
        const { messageId, recipient, note } = req.body;
        if (!messageId) return res.status(400).json({ error: "Message id is required" });

        const senderDoc = await User.findById(req.userId)
            .select("username avatarColor blockedUsers mutedUsers")
            .lean();
        const sender = senderDoc?.username;
        if (!sender) return res.status(400).json({ error: "Sender not found" });

        if (!mongoose.isValidObjectId(messageId)) {
            return res.status(400).json({ error: "Invalid message id" });
        }

        // Scoped to the caller so a guessed id cannot be used to read and
        // re-send somebody else's conversation.
        const original = await Message.findOne({
            _id: messageId,
            $or: [{ sender }, { recipient: sender }],
            deleted: { $ne: true },
        })
            .select("text imageUrl audioUrl sender timeStamp deleted")
            .lean();

        if (!original) return res.status(404).json({ error: "Message not found" });
        if (!original.text && !original.imageUrl && !original.audioUrl) {
            return res.status(400).json({ error: "This message has no content to forward" });
        }

        const resolved = await resolveRecipient(sender, senderDoc, recipient);
        if (resolved.status) return res.status(resolved.status).json(resolved.body);
        const { recipientName } = resolved;

        const forwarded = await Message.create({
            text:      original.text || "",
            imageUrl:  original.imageUrl || "",
            audioUrl:  original.audioUrl || "",
            sender,
            recipient: recipientName,
            color:     senderDoc?.avatarColor || "#3b82f6",
            forwardedFrom: {
                sender: original.sender,
                text: String(original.text || "").slice(0, 200),
            },
        });

        const noteText = note?.trim() ? String(note).trim().slice(0, 500) : "";
        if (noteText) {
            await Message.create({
                text:      noteText,
                sender,
                recipient: recipientName,
                color:     senderDoc?.avatarColor || "#3b82f6",
                replyTo:   { sender: original.sender, text: String(original.text || "").slice(0, 200) },
            });
        }

        const preview = original.text?.trim()
            ? original.text.trim().slice(0, 120)
            : original.audioUrl ? "ðŸŽ¤ Voice message" : "ðŸ“· Image";

        Notification.create({
            recipient: recipientName,
            type: "message",
            fromUser: sender,
            fromColor: senderDoc?.avatarColor || "#3b82f6",
            postId: forwarded._id.toString(),
            text: preview,
        }).catch(() => {});

        sendPushNotification({
            recipientUsername: recipientName,
            type: "message",
            fromUser: sender,
            text: preview,
            url: `/inbox?user=${encodeURIComponent(sender)}`,
        });

        try {
            const io = req.app.locals?.io;
            if (io) {
                io.to(recipientName).emit("message:new", {
                    from: sender,
                    body: preview,
                    timeStamp: forwarded.timeStamp || Date.now(),
                });
            }
        } catch {}

        logChat("dm_forwarded", {
            username: sender,
            targetUser: recipientName,
            message: `Forwarded message from ${original.sender} to ${recipientName}`,
        });

        return res.status(201).json(forwarded.toObject());
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to forward message" });
    }
});

// Was completely unauthenticated and took the caller's identity from the body,
// so anyone could mark any conversation read, or react as any user, just by
// posting their name. Both now require a session and derive the actor from it.
router.patch("/", verifyToken, async (req, res) => {
    try {
        const { sender, recipient, messageId, action, reactionType } = req.body;

        // The body still names the other party, but never the actor.
        const me = await User.findById(req.userId).select("username").lean();
        const username = me?.username;
        if (!username) return res.status(401).json({ error: "Unauthorized" });

        // Mark messages as read when opening a conversation
        if (sender && recipient) {
            await Message.updateMany(
                { sender: recipient, recipient: sender, isRead: false },
                { $set: { isRead: true, readAt: new Date() } }
            );
            return res.json({ ok: true });
        }

        // React to a message
        if (action === "react" && messageId && reactionType) {
            const validReactions = ["like", "love", "laugh", "fire", "sad", "angry"];
            if (!validReactions.includes(reactionType)) {
                return res.status(400).json({ error: "Invalid reaction" });
            }

            const msg = await Message.findById(messageId);
            if (!msg) return res.status(404).json({ error: "Message not found" });

            // You can only react to a message you were actually sent or sent
            // yourself. Without this, any logged-in user could react to (and so
            // enumerate the existence of) anyone's private message by id.
            if (msg.sender !== username && msg.recipient !== username) {
                return res.status(403).json({ error: "Not your message" });
            }

            if (!msg.reactions) {
                msg.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
            }

            // Remove from all other reaction types
            validReactions.forEach(type => {
                if (!msg.reactions[type]) msg.reactions[type] = [];
                const idx = msg.reactions[type].indexOf(username);
                if (idx !== -1) msg.reactions[type].splice(idx, 1);
            });

            // Toggle the selected reaction
            if (!msg.reactions[reactionType]) msg.reactions[reactionType] = [];
            const idx = msg.reactions[reactionType].indexOf(username);
            if (idx === -1) {
                msg.reactions[reactionType].push(username);
            }

            await msg.save();
            return res.json({ reactions: msg.reactions });
        }

        if (action === "star" && messageId) {
            const msg = await Message.findById(messageId);
            if (!msg) return res.status(404).json({ error: "Message not found" });
            if (msg.sender !== username && msg.recipient !== username) {
                return res.status(403).json({ error: "Not your message" });
            }
            msg.starredBy = msg.starredBy || [];
            const idx = msg.starredBy.indexOf(username);
            const starred = idx === -1;
            if (starred) msg.starredBy.push(username);
            else msg.starredBy.splice(idx, 1);
            await msg.save();
            return res.json({ starred });
        }

        return res.status(400).json({ error: "Invalid request" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /conversation
// Archive or mute a whole thread. Distinct from block/mute-user: this changes
// only what *you* see, and messages keep arriving either way.
//
// Separate route rather than another branch on PATCH "/" because that one keys
// off `sender`/`recipient` in the body, which is exactly the shape this does not
// have.
router.patch("/conversation", verifyToken, async (req, res) => {
    try {
        const { with: other, action } = req.body || {};
        if (!other || (action !== "archive" && action !== "unarchive" && action !== "mute" && action !== "unmute")) {
            return res.status(400).json({ error: "with and a valid action are required" });
        }

        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        if (user.username === other) {
            return res.status(400).json({ error: "You cannot archive a chat with yourself" });
        }

        const field = action === "archive" || action === "unarchive" ? "archivedChats" : "mutedChats";
        const removing = action.startsWith("un");
        const key = String(other).toLowerCase();
        const current = user[field] || [];
        const present = current.some((c) => String(c).toLowerCase() === key);

        if (removing && present) {
            user[field] = current.filter((c) => String(c).toLowerCase() !== key);
        } else if (!removing && !present) {
            current.push(other);
            user[field] = current;
        }
        // Guard against unbounded growth from a script.
        if (user[field].length > 500) user[field] = user[field].slice(-500);

        await user.save();
        return res.json({ [field]: user[field] });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /starred
// Everything the viewer has starred, newest first, across every conversation.
// Scoped to the session user — a `?username=` param would be a way to read
// someone else's saved messages.
router.get("/starred", verifyToken, async (req, res) => {
    try {
        const me = await User.findById(req.userId).select("username").lean();
        const username = me?.username;
        if (!username) return res.status(401).json({ error: "Unauthorized" });

        const messages = await Message.find({ starredBy: username })
            .sort({ timeStamp: -1 })
            .limit(100)
            .lean();

        return res.json(messages.map((m) => ({
            ...m,
            with: m.sender === username ? m.recipient : m.sender,
        })));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /:id/read
router.patch("/:id/read", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        await Message.findByIdAndUpdate(id, { $set: { isRead: true } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /read-all
router.patch("/read-all", verifyToken, async (req, res) => {
    try {
        const { sender } = req.query;
        const userDoc = await User.findById(req.userId).select("username").lean();
        const recipient = userDoc?.username;
        if (!recipient) return res.status(400).json({ error: "User not found" });

        await Message.updateMany(
            { sender: sender || recipient, recipient: sender ? recipient : { $ne: "" }, isRead: false },
            { $set: { isRead: true } }
        );
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /unread
router.get("/unread", verifyToken, async (req, res) => {
    try {
        const userDoc = await User.findById(req.userId).select("username").lean();
        const username = userDoc?.username;
        if (!username) return res.status(400).json({ error: "User not found" });

        const result = await Message.aggregate([
            { $match: { recipient: username, isRead: false } },
            { $count: "total" },
        ]);

        return res.json({ total: result[0]?.total || 0 });
    } catch (error) {
        console.error(error);
        return res.json({ total: 0 });
    }
});

// PUT /:id â€” edit message
router.put("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;

        const userDoc = await User.findById(req.userId).select("username").lean();
        const username = userDoc?.username;
        if (!username) return res.status(400).json({ error: "User not found" });

        const message = await Message.findById(id);
        if (!message) return res.status(404).json({ error: "Message not found" });
        if (message.sender !== username) return res.status(403).json({ error: "Unauthorized" });

        const newText = text?.trim();
        if (!newText) return res.status(400).json({ error: "Text required" });

        message.text = newText;
        message.editedAt = new Date();
        await message.save();

        return res.json(message.toObject());
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to edit message" });
    }
});

// DELETE /:id â€” soft-delete message
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        const userDoc = await User.findById(req.userId).select("username").lean();
        const username = userDoc?.username;
        if (!username) return res.status(400).json({ error: "User not found" });

        const message = await Message.findById(id);
        if (!message) return res.status(404).json({ error: "Message not found" });
        if (message.sender !== username) return res.status(403).json({ error: "Unauthorized" });

        message.text = "";
        message.deleted = true;
        message.editedAt = null;
        await message.save();

        return res.json(message.toObject());
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to delete message" });
    }
});

module.exports = router;
