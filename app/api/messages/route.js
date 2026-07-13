import connectDB from "@/utils/db";
import Message from "@/models/messages";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const user1 = searchParams.get("user1");
        const user2 = searchParams.get("user2");
        const username = searchParams.get("username");

        await connectDB();

        if (user1 && user2) {
            const messages = await Message.find({
                $or: [
                    { sender: user1, recipient: user2 },
                    { sender: user2, recipient: user1 },
                ],
            }).sort({ timeStamp: 1 }).lean();

            await Message.updateMany(
                { sender: user2, recipient: user1, delivered: false },
                { $set: { delivered: true } }
            );

            return Response.json(messages);
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
            ]);

            const conversationsWithUsers = await Promise.all(
                conversations.map(async (conv) => {
                    const User = (await import("@/models/user")).default;
                    const user = await User.findOne({ username: conv._id })
                        .select("username avatarUrl color")
                        .lean();
                    return {
                        username: conv._id,
                        user: user || { username: conv._id, avatarUrl: "", color: "#3b82f6" },
                        lastMessage: conv.lastMessage,
                        unreadCount: conv.unreadCount,
                    };
                })
            );

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
        const { text, sender, recipient, color } = await request.json();

        if (!text?.trim())     return Response.json({ error: "Message text is required" }, { status: 400 });
        if (!sender?.trim())   return Response.json({ error: "Sender is required" }, { status: 400 });
        if (!recipient?.trim()) return Response.json({ error: "Recipient is required" }, { status: 400 });

        await connectDB();
        const message = await Message.create({
            text:      text.trim(),
            sender:    sender.trim(),
            recipient: recipient.trim(),
            color:     color || "#3b82f6",
        });

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
