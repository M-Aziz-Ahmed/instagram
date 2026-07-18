import connectDB from "@/utils/db";
import GroupChat from "@/models/groupChat";
import GroupMessage from "@/models/groupMessage";
import User from "@/models/user";

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
        const before = searchParams.get("before");
        const lang = searchParams.get("lang");

        await connectDB();
        const query = { groupId: id };
        if (before) query.timeStamp = { $lt: new Date(before) };

        const messages = await GroupMessage.find(query)
            .sort({ timeStamp: -1 })
            .limit(limit + 1)
            .lean();

        const hasMore = messages.length > limit;
        const sliced = hasMore ? messages.slice(0, limit) : messages;

        // Enrich senders
        const senderNames = [...new Set(sliced.map(m => m.sender))];
        const users = senderNames.length > 0
            ? await User.find({ username: { $in: senderNames } })
                .select("username avatarUrl isVerified isAdmin roles")
                .populate("roles", "name badge color")
                .lean()
            : [];
        const userMap = {};
        users.forEach(u => {
            userMap[u.username] = {
                avatarUrl: u.avatarUrl || "",
                isVerified: u.isVerified || false,
                isAdmin: u.isAdmin || false,
                roles: (u.roles || []).map(r => ({ id: r._id?.toString() ?? "", name: r.name ?? "", badge: r.badge ?? "", color: r.color ?? "" })),
            };
        });

        const enriched = sliced.map(m => ({
            ...m,
            _author: userMap[m.sender] || null,
        })).reverse();

        const result = { messages: enriched, hasMore };

        return Response.json(result);
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Failed to fetch messages" }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    try {
        const { id } = await params;
        const { sender, text, imageUrl, audioUrl, color, replyTo, mentions } = await request.json();

        if (!sender) return Response.json({ error: "sender required" }, { status: 400 });

        await connectDB();

        const group = await GroupChat.findById(id);
        if (!group) return Response.json({ error: "Group not found" }, { status: 404 });
        if (!group.members.find(m => m.username === sender)) {
            return Response.json({ error: "Not a member" }, { status: 403 });
        }

        const msg = await GroupMessage.create({
            groupId: id,
            sender,
            text: text || "",
            imageUrl: imageUrl || "",
            audioUrl: audioUrl || "",
            color: color || "#3b82f6",
            replyTo: replyTo || { sender: null, text: "", messageId: null },
        });

        // Update group last message
        group.lastMessage = {
            text: text || (imageUrl ? "📷 Image" : audioUrl ? "🎤 Voice" : ""),
            sender,
            imageUrl: imageUrl || "",
            timeStamp: new Date(),
        };
        group.updatedAt = new Date();
        await group.save();

        // Enrich with author data
        const userDoc = await User.findOne({ username: sender })
            .select("username avatarUrl isVerified isAdmin roles")
            .populate("roles", "name badge color")
            .lean();
        const author = userDoc ? {
            avatarUrl: userDoc.avatarUrl || "",
            isVerified: userDoc.isVerified || false,
            isAdmin: userDoc.isAdmin || false,
            roles: (userDoc.roles || []).map(r => ({ id: r._id?.toString() ?? "", name: r.name ?? "", badge: r.badge ?? "", color: r.color ?? "" })),
        } : null;

        return Response.json({ ...msg.toObject(), _author: author }, { status: 201 });
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Failed to send message" }, { status: 500 });
    }
}

export async function PATCH(request, { params }) {
    try {
        const { id } = await params;
        const { username, action, messageId, reactionType, readBy } = await request.json();

        await connectDB();

        if (action === "react") {
            const msg = await GroupMessage.findById(messageId);
            if (!msg) return Response.json({ error: "Message not found" }, { status: 404 });
            // Remove existing reaction
            for (const type of ["like","love","laugh","fire","sad","angry"]) {
                msg.reactions[type] = msg.reactions[type].filter(u => u !== username);
            }
            msg.reactions[reactionType] = msg.reactions[reactionType] || [];
            if (!msg.reactions[reactionType].includes(username)) {
                msg.reactions[reactionType].push(username);
            }
            await msg.save();
            return Response.json(msg);
        }

        if (action === "read") {
            // Mark messages as read by user
            await GroupMessage.updateMany(
                { groupId: id, sender: { $ne: readBy || username } },
                { $addToSet: { readBy: readBy || username } }
            );
            return Response.json({ ok: true });
        }

        if (action === "delete") {
            const msg = await GroupMessage.findById(messageId);
            if (!msg) return Response.json({ error: "Message not found" }, { status: 404 });
            if (msg.sender !== username) return Response.json({ error: "Not authorized" }, { status: 403 });
            await GroupMessage.findByIdAndDelete(messageId);
            return Response.json({ deleted: true });
        }

        return Response.json({ error: "Invalid action" }, { status: 400 });
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}
