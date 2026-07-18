import connectDB from "@/utils/db";
import GroupChat from "@/models/groupChat";
import User from "@/models/user";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const username = searchParams.get("username");
        if (!username) return Response.json({ error: "username required" }, { status: 400 });

        await connectDB();
        const groups = await GroupChat.find({ "members.username": username })
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean();

        // Enrich with member profiles
        const allMembernames = [...new Set(groups.flatMap(g => g.members.map(m => m.username)))];
        const users = allMembernames.length > 0
            ? await User.find({ username: { $in: allMembernames } })
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

        const enriched = groups.map(g => ({
            ...g,
            members: g.members.map(m => ({ ...m, _profile: userMap[m.username] || null })),
        }));

        return Response.json(enriched);
    } catch (err) {
        console.error("Groups GET error:", err);
        return Response.json({ error: "Failed to fetch groups" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { name, description, avatarUrl, creator, members } = await request.json();
        if (!name?.trim() || !creator) {
            return Response.json({ error: "name and creator required" }, { status: 400 });
        }

        await connectDB();

        // Fetch creator profile
        const creatorDoc = await User.findOne({ username: creator }).select("username avatarUrl avatarColor").lean();
        const memberUsernames = [creator, ...(members || [])].filter(Boolean);
        const uniqueUsernames = [...new Set(memberUsernames.map(u => typeof u === "string" ? u : u.username))];

        // Fetch member profiles
        const memberDocs = await User.find({ username: { $in: uniqueUsernames } })
            .select("username avatarUrl avatarColor").lean();
        const memberMap = {};
        memberDocs.forEach(u => { memberMap[u.username] = u; });

        const memberEntries = uniqueUsernames.map(u => ({
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

        return Response.json(group, { status: 201 });
    } catch (err) {
        console.error("Groups POST error:", err);
        return Response.json({ error: "Failed to create group" }, { status: 500 });
    }
}
