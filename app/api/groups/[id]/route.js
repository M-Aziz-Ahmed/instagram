import connectDB from "@/utils/db";
import GroupChat from "@/models/groupChat";
import GroupMessage from "@/models/groupMessage";
import User from "@/models/user";

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        await connectDB();
        const group = await GroupChat.findById(id).lean();
        if (!group) return Response.json({ error: "Group not found" }, { status: 404 });

        // Enrich members
        const memberNames = group.members.map(m => m.username);
        const users = await User.find({ username: { $in: memberNames } })
            .select("username avatarUrl isVerified isAdmin roles")
            .populate("roles", "name badge color")
            .lean();
        const userMap = {};
        users.forEach(u => {
            userMap[u.username] = {
                avatarUrl: u.avatarUrl || "",
                isVerified: u.isVerified || false,
                isAdmin: u.isAdmin || false,
                roles: (u.roles || []).map(r => ({ id: r._id?.toString() ?? "", name: r.name ?? "", badge: r.badge ?? "", color: r.color ?? "" })),
            };
        });

        return Response.json({
            ...group,
            members: group.members.map(m => ({ ...m, _profile: userMap[m.username] || null })),
        });
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Failed to fetch group" }, { status: 500 });
    }
}

export async function PATCH(request, { params }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { username, action, ...updates } = body;

        await connectDB();
        const group = await GroupChat.findById(id);
        if (!group) return Response.json({ error: "Group not found" }, { status: 404 });

        // Admin check for most operations
        const isAdmin = group.members.find(m => m.username === username)?.role === "admin";

        if (action === "addMember") {
            const userDoc = await User.findOne({ username: updates.memberUsername }).select("username avatarUrl avatarColor").lean();
            if (!userDoc) return Response.json({ error: "User not found" }, { status: 404 });
            if (group.members.find(m => m.username === updates.memberUsername)) {
                return Response.json({ error: "Already a member" }, { status: 400 });
            }
            group.members.push({
                username: userDoc.username,
                avatarUrl: userDoc.avatarUrl || "",
                color: userDoc.avatarColor || "#3b82f6",
                role: "member",
            });
            await group.save();
            return Response.json(group);
        }

        if (action === "removeMember") {
            if (!isAdmin && username !== updates.memberUsername) {
                return Response.json({ error: "Not authorized" }, { status: 403 });
            }
            group.members = group.members.filter(m => m.username !== updates.memberUsername);
            await group.save();
            return Response.json(group);
        }

        if (action === "updateRole") {
            if (!isAdmin) return Response.json({ error: "Not authorized" }, { status: 403 });
            const member = group.members.find(m => m.username === updates.memberUsername);
            if (member) {
                member.role = updates.role === "admin" ? "admin" : "member";
                await group.save();
            }
            return Response.json(group);
        }

        if (action === "leave") {
            group.members = group.members.filter(m => m.username !== username);
            if (group.members.length === 0) {
                await GroupChat.findByIdAndDelete(id);
                await GroupMessage.deleteMany({ groupId: id });
                return Response.json({ deleted: true });
            }
            // If leaving admin, promote oldest member
            if (!group.members.find(m => m.role === "admin") && group.members.length > 0) {
                group.members[0].role = "admin";
            }
            await group.save();
            return Response.json(group);
        }

        if (action === "updateInfo") {
            if (!isAdmin) return Response.json({ error: "Not authorized" }, { status: 403 });
            if (updates.name) group.name = updates.name.trim().slice(0, 50);
            if (updates.description !== undefined) group.description = updates.description.trim().slice(0, 200);
            if (updates.avatarUrl !== undefined) group.avatarUrl = updates.avatarUrl;
            await group.save();
            return Response.json(group);
        }

        if (action === "toggleMute") {
            const isMuted = group.mutedBy.includes(username);
            if (isMuted) {
                group.mutedBy = group.mutedBy.filter(u => u !== username);
            } else {
                group.mutedBy.push(username);
            }
            await group.save();
            return Response.json(group);
        }

        if (action === "delete") {
            if (!isAdmin) return Response.json({ error: "Not authorized" }, { status: 403 });
            await GroupChat.findByIdAndDelete(id);
            await GroupMessage.deleteMany({ groupId: id });
            return Response.json({ deleted: true });
        }

        return Response.json({ error: "Invalid action" }, { status: 400 });
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Failed to update group" }, { status: 500 });
    }
}
