import connectDB from "@/utils/db";
import Message from "@/models/messages";
import Notification from "@/models/notification";
import { translateBatch } from "@/utils/translate";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const user1 = searchParams.get("user1");
        const user2 = searchParams.get("user2");
        const username = searchParams.get("username");
        const lang = searchParams.get("lang");

        await connectDB();

        if (user1 && user2) {
            const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
            const before = searchParams.get("before");
            const query = {
                $or: [
                    { sender: user1, recipient: user2 },
                    { sender: user2, recipient: user1 },
                ],
            };

            if (before) {
                query.timeStamp = { $lt: new Date(before) };
            }

            const messages = await Message.find(query)
                .sort({ timeStamp: -1 })
                .limit(limit + 1)
                .maxTimeMS(10000)
                .lean();

            const hasMore = messages.length > limit;
            const sliced = hasMore ? messages.slice(0, limit) : messages;
            const ordered = sliced.reverse();

            // Non-blocking update - don't wait for it
            Message.updateMany(
                { sender: user2, recipient: user1, delivered: false },
                { $set: { delivered: true } }
            ).catch(err => console.error("Failed to update delivery status:", err));

            const result = { messages: ordered, hasMore };

            if (lang) {
                const itemsToTranslate = ordered
                    .filter((m) => m.text && m.sender !== user1)
                    .map((m) => ({ id: m._id.toString(), text: m.text }));

                if (itemsToTranslate.length > 0) {
                    const translations = await translateBatch(itemsToTranslate, lang);
                    if (Object.keys(translations).length > 0) {
                        result.translations = translations;
                    }
                }
            }

            return Response.json(result);
        }

        if (username) {
            const conversations = await Message.aggregate([
                { $match: { $or: [{ sender: username }, { recipient: username }] } },
                { $sort: { timeStamp: -1 } },
                {
                    $group: {
                        _id: {
                            $cond: [
                                { $eq: ["$sender", username] },
                                "$recipient",
                                "$sender",
                            ],
                        },
                        lastMessage: { $first: "$$ROOT" },
                        unreadCount: {
                            $sum: {
                                $cond: [
                                    { $and: [{ $eq: ["$recipient", username] }, { $eq: ["$isRead", false] }] },
                                    1,
                                    0,
                                ],
                            },
                        },
                    },
                },
                { $sort: { "lastMessage.timeStamp": -1 } },
                { $limit: 100 }, // Limit conversations
            ], { maxTimeMS: 10000 });

            // Optimize: Batch user lookup instead of N+1 queries
            const usernames = conversations.map(conv => conv._id);
            const User = (await import("@/models/user")).default;
            const users = await User.find({ username: { $in: usernames } })
                .select("username avatarUrl color isVerified isAdmin roles")
                .populate("roles", "name badge color")
                .lean()
                .maxTimeMS(5000);

            const userMap = new Map(users.map(u => [u.username, u]));

            const conversationsWithUsers = conversations.map(conv => ({
                username: conv._id,
                user: userMap.get(conv._id) || { username: conv._id, avatarUrl: "", color: "#3b82f6" },
                lastMessage: conv.lastMessage,
                unreadCount: conv.unreadCount,
            }));

            return Response.json(conversationsWithUsers);
        }

        return Response.json({ error: "Parameters required" }, { status: 400 });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch messages" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { text, imageUrl, audioUrl, sender, recipient, color, replyTo } = await request.json();

        if (!sender?.trim())   return Response.json({ error: "Sender is required" }, { status: 400 });
        if (!recipient?.trim()) return Response.json({ error: "Recipient is required" }, { status: 400 });
        if (!text?.trim() && !imageUrl && !audioUrl) return Response.json({ error: "Message text, image, or audio is required" }, { status: 400 });

        await connectDB();
        const message = await Message.create({
            text:      text?.trim() || "",
            imageUrl:  imageUrl || "",
            audioUrl:  audioUrl || "",
            sender:    sender.trim(),
            recipient: recipient.trim(),
            color:     color || "#3b82f6",
            replyTo:   (replyTo && replyTo.sender && replyTo.text) ? { sender: replyTo.sender, text: String(replyTo.text).slice(0, 500) } : null,
        });

        const preview = text?.trim() ? text.trim().slice(0, 120) : audioUrl ? "🎤 Voice message" : "📷 Image";

        Notification.create({
            recipient: recipient.trim(),
            type: "message",
            fromUser: sender.trim(),
            fromColor: color || "#3b82f6",
            postId: message._id.toString(),
            text: preview,
        }).catch(() => {});

        return Response.json(message.toObject(), { status: 201 });
    } catch (error) {
        return Response.json({ error: "Failed to send message" }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const { sender, recipient } = await request.json();

        if (!sender || !recipient) {
            return Response.json({ error: "Sender and recipient required" }, { status: 400 });
        }

        await connectDB();
        await Message.updateMany(
            { sender: recipient, recipient: sender, isRead: false },
            { $set: { isRead: true } }
        );

        return Response.json({ ok: true });
    } catch (error) {
        return Response.json({ error: "Failed to mark messages as read" }, { status: 500 });
    }
}

const RECALL_WINDOW_MS = 60 * 1000;

export async function DELETE(request) {
    try {
        const { messageId, username } = await request.json();

        if (!messageId || !username) {
            return Response.json({ error: "messageId and username required" }, { status: 400 });
        }

        await connectDB();
        const message = await Message.findById(messageId);
        if (!message) {
            return Response.json({ error: "Message not found" }, { status: 404 });
        }

        if (message.sender !== username) {
            return Response.json({ error: "Unauthorized" }, { status: 403 });
        }

        const elapsed = Date.now() - new Date(message.timeStamp).getTime();
        if (elapsed > RECALL_WINDOW_MS) {
            return Response.json({ error: "Recall window expired" }, { status: 400 });
        }

        await Message.findByIdAndDelete(messageId);
        return Response.json({ ok: true });
    } catch (error) {
        return Response.json({ error: "Failed to recall message" }, { status: 500 });
    }
}
