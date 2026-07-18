import connectDB from "@/utils/db";
import Post from "@/models/post";
import User from "@/models/user";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const idsParam = searchParams.get("ids");
        if (!idsParam) return Response.json({ error: "ids required" }, { status: 400 });

        const ids = idsParam.split(",").filter(Boolean).slice(0, 50);
        await connectDB();

        const posts = await Post.find({ _id: { $in: ids } }).lean();
        if (posts.length === 0) return Response.json([]);

        const authorUsernames = [...new Set(posts.map((p) => p.sender))];
        const repostOriginalIds = posts.filter((p) => p.isRepost && p.originalPostId).map((p) => p.originalPostId);
        const allUsernames = new Set(authorUsernames);

        const [users, originalPosts] = await Promise.all([
            User.find({ username: { $in: [...allUsernames] } })
                .select("username avatarUrl isVerified isAdmin roles")
                .populate("roles", "name badge color")
                .lean(),
            repostOriginalIds.length > 0
                ? Post.find({ _id: { $in: repostOriginalIds } }).lean()
                : Promise.resolve([]),
        ]);

        const userMap = {};
        users.forEach((u) => {
            userMap[u.username] = {
                avatarUrl: u.avatarUrl || "",
                isVerified: u.isVerified || false,
                isAdmin: u.isAdmin || false,
                roles: (u.roles || []).map((r) => ({
                    id: r._id?.toString() ?? "",
                    name: r.name ?? "",
                    badge: r.badge ?? "",
                    color: r.color ?? "",
                })),
            };
        });

        const origMap = {};
        originalPosts.forEach((p) => {
            origMap[p._id.toString()] = { ...p, _author: userMap[p.sender] || null };
        });

        const enriched = posts
            .sort((a, b) => new Date(b.timeStamp) - new Date(a.timeStamp))
            .map((p) => ({
                ...p,
                _author: userMap[p.sender] || null,
                _originalPost: (p.isRepost && p.originalPostId)
                    ? (origMap[p.originalPostId.toString()] || null)
                    : null,
                comments: (p.comments || []).map((c) => ({
                    ...c,
                    _author: c.sender === p.sender ? userMap[c.sender] : null,
                })),
            }));

        return Response.json(enriched);
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch bookmarks" }, { status: 500 });
    }
}
