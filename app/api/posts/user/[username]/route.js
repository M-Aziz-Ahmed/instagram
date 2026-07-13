import connectDB from "@/utils/db";
import Post from "@/models/post";
import User from "@/models/user";

export async function GET(request, { params }) {
    try {
        const { username } = await params;
        await connectDB();

        const [rawPosts, userDoc] = await Promise.all([
            Post.find({ sender: username }).sort({ timeStamp: -1 }).lean(),
            User.findOne({ username }).populate("roles").lean(),
        ]);

        const totalLikes = rawPosts.reduce((sum, p) => sum + p.likes.length, 0);

        const profile = userDoc ? {
            username:    userDoc.username,
            bio:         userDoc.bio,
            avatarColor: userDoc.avatarColor,
            avatarUrl:   userDoc.avatarUrl || "",
            isVerified:  userDoc.isVerified || false,
            isAdmin:     userDoc.isAdmin || false,
            roles:       (userDoc.roles || []).map((r) => ({
                id:    r._id.toString(),
                name:  r.name,
                badge: r.badge,
                color: r.color,
            })),
        } : null;

        const authorData = profile ? {
            avatarUrl:  profile.avatarUrl,
            isVerified: profile.isVerified,
            isAdmin:    profile.isAdmin,
            roles:      profile.roles,
        } : null;

        const posts = rawPosts.map((p) => ({
            ...p,
            _author: authorData,
            comments: (p.comments || []).map((c) => ({
                ...c,
                _author: c.sender === username ? authorData : null,
            })),
        }));

        return Response.json({
            posts,
            totalLikes,
            postCount: posts.length,
            profile,
        });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch profile" }, { status: 500 });
    }
}
