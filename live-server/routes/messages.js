const express = require("express");
const Message = require("../models/messages");
const Notification = require("../models/notification");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// GET /
router.get("/", verifyToken, async (req, res) => {
    try {
        const { user1, user2, username, before, limit: limitStr } = req.query;
        const limit = Math.min(parseInt(limitStr || "20", 10), 100);

        if (user1 && user2) {
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
                { $sort: { "lastMessage.timeStamp": -1 } },
                { $limit: 100 },
            ], { maxTimeMS: 10000 });

            const usernames = conversations.map((conv) => conv._id);
            const users = await User.find({ username: { $in: usernames } })
                .select("username avatarUrl color isVerified isAdmin roles")
                .populate("roles", "name badge color")
                .lean().maxTimeMS(5000);

            const userMap = new Map(users.map((u) => [u.username, u]));
            const result = conversations.map((conv) => ({
                username: conv._id,
                user: userMap.get(conv._id) || { username: conv._id, avatarUrl: "", color: "#3b82f6" },
                lastMessage: conv.lastMessage,
                unreadCount: conv.unreadCount,
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
router.post("/", verifyToken, async (req, res) => {
    try {
        const { text, imageUrl, audioUrl, recipient, color, replyTo } = req.body;
        const senderDoc = await User.findById(req.userId).select("username avatarColor").lean();
        const sender = senderDoc?.username;
        if (!sender) return res.status(400).json({ error: "Sender not found" });
        if (!recipient?.trim()) return res.status(400).json({ error: "Recipient is required" });
        if (!text?.trim() && !imageUrl && !audioUrl) {
            return res.status(400).json({ error: "Message text, image, or audio is required" });
        }

        const message = await Message.create({
            text:      text?.trim() || "",
            imageUrl:  imageUrl || "",
            audioUrl:  audioUrl || "",
            sender,
            recipient: recipient.trim(),
            color:     color || senderDoc?.avatarColor || "#3b82f6",
            replyTo:   (replyTo && replyTo.sender && replyTo.text) ? { sender: replyTo.sender, text: String(replyTo.text).slice(0, 500) } : null,
        });

        const preview = text?.trim() ? text.trim().slice(0, 120) : audioUrl ? "\uD83C\uDFA4 Voice message" : "\uD83D\uDCF7 Image";

        Notification.create({
            recipient: recipient.trim(),
            type: "message",
            fromUser: sender,
            fromColor: color || senderDoc?.avatarColor || "#3b82f6",
            postId: message._id.toString(),
            text: preview,
        }).catch(() => {});

        return res.status(201).json(message.toObject());
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to send message" });
    }
});

// PATCH / — unified action dispatcher (react, mark-read)
router.patch("/", async (req, res) => {
    try {
        const { sender, recipient, messageId, action, reactionType } = req.body;

        // Mark messages as read when opening a conversation
        if (sender && recipient) {
            await Message.updateMany(
                { sender: recipient, recipient: sender, isRead: false },
                { $set: { isRead: true } }
            );
            return res.json({ ok: true });
        }

        // React to a message
        if (action === "react" && messageId && reactionType) {
            const validReactions = ["like", "love", "laugh", "fire", "sad", "angry"];
            if (!validReactions.includes(reactionType)) {
                return res.status(400).json({ error: "Invalid reaction" });
            }
            if (!sender) return res.status(400).json({ error: "Sender required" });

            const msg = await Message.findById(messageId);
            if (!msg) return res.status(404).json({ error: "Message not found" });

            if (!msg.reactions) {
                msg.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
            }

            // Remove from all other reaction types
            validReactions.forEach(type => {
                if (!msg.reactions[type]) msg.reactions[type] = [];
                const idx = msg.reactions[type].indexOf(sender);
                if (idx !== -1) msg.reactions[type].splice(idx, 1);
            });

            // Toggle the selected reaction
            if (!msg.reactions[reactionType]) msg.reactions[reactionType] = [];
            const idx = msg.reactions[reactionType].indexOf(sender);
            if (idx === -1) {
                msg.reactions[reactionType].push(sender);
            }

            await msg.save();
            return res.json({ reactions: msg.reactions });
        }

        return res.status(400).json({ error: "Invalid request" });
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

// PUT /:id — edit message
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

// DELETE /:id — soft-delete message
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
