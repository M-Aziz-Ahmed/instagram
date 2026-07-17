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

        // Fetch original posts for reposts
        const repostIds = rawPosts.filter((p) => p.isRepost && p.originalPostId).map((p) => p.originalPostId);
        let originalPostsMap = {};
        if (repostIds.length > 0) {
            const originalPosts = await Post.find({ _id: { $in: repostIds } }).lean();
            const origAuthors = [...new Set(originalPosts.map((p) => p.sender))];
            const origUsers = await User.find({ username: { $in: origAuthors } })
                .select("username avatarUrl isVerified isAdmin roles")
                .populate("roles", "name badge color")
                .lean();
            const origUserMap = {};
            origUsers.forEach((u) => {
                origUserMap[u.username] = {
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
            originalPosts.forEach((p) => {
                originalPostsMap[p._id.toString()] = { ...p, _author: origUserMap[p.sender] || null };
            });
        }

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
            followersCount: (userDoc.followers || []).length,
            followingCount: (userDoc.following || []).length,
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
            _originalPost: (p.isRepost && p.originalPostId)
                ? (originalPostsMap[p.originalPostId.toString()] || null)
                : null,
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
