import connectDB from "@/utils/db";
import Post from "@/models/post";
import User from "@/models/user";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const q = searchParams.get("q")?.trim();
        if (!q) return Response.json({ users: [], posts: [], hashtags: [] });

        await connectDB();

        const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

        const users = await User.find({ username: regex })
            .select("username avatarColor avatarUrl isVerified isAdmin roles")
            .populate("roles", "name badge color")
            .limit(10)
            .lean();

        const posts = await Post.find({
            $or: [{ text: regex }, { hashtags: regex }],
        })
            .sort({ timeStamp: -1 })
            .limit(20)
            .lean();

        const hashtagResults = await Post.aggregate([
            { $unwind: "$hashtags" },
            { $match: { hashtags: regex } },
            { $group: { _id: "$hashtags", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]);

        const hashtags = hashtagResults.map((r) => ({ tag: r._id, count: r.count }));

        return Response.json({ users, posts, hashtags });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Search failed" }, { status: 500 });
    }
}
