import connectDB from "@/utils/db";
import GroupChat from "@/models/groupChat";
import User from "@/models/user";

export async function POST(request, { params }) {
    try {
        const { id } = await params;
        const { username, action, memberUsername } = await request.json();

        await connectDB();
        const group = await GroupChat.findById(id);
        if (!group) return Response.json({ error: "Group not found" }, { status: 404 });

        const isAdmin = group.members.find(m => m.username === username)?.role === "admin";

        if (action === "add") {
            if (!isAdmin) return Response.json({ error: "Not authorized" }, { status: 403 });
            if (group.members.find(m => m.username === memberUsername)) {
                return Response.json({ error: "Already a member" }, { status: 400 });
            }
            const userDoc = await User.findOne({ username: memberUsername })
                .select("username avatarUrl avatarColor").lean();
            if (!userDoc) return Response.json({ error: "User not found" }, { status: 404 });
            group.members.push({
                username: userDoc.username,
                avatarUrl: userDoc.avatarUrl || "",
                color: userDoc.avatarColor || "#3b82f6",
                role: "member",
            });
            await group.save();
            return Response.json(group);
        }

        if (action === "remove") {
            if (!isAdmin && username !== memberUsername) return Response.json({ error: "Not authorized" }, { status: 403 });
            group.members = group.members.filter(m => m.username !== memberUsername);
            if (group.members.length === 0) {
                await GroupChat.findByIdAndDelete(id);
                return Response.json({ deleted: true });
            }
            if (!group.members.find(m => m.role === "admin") && group.members.length > 0) {
                group.members[0].role = "admin";
            }
            await group.save();
            return Response.json(group);
        }

        if (action === "promote") {
            if (!isAdmin) return Response.json({ error: "Not authorized" }, { status: 403 });
            const member = group.members.find(m => m.username === memberUsername);
            if (member) member.role = "admin";
            await group.save();
            return Response.json(group);
        }

        return Response.json({ error: "Invalid action" }, { status: 400 });
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}
