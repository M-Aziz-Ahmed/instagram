import connectDB from "@/utils/db";
import Post from "@/models/post";

// Returns top 10 hashtags by post count in last 7 days
export async function GET() {
    try {
        await connectDB();
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const result = await Post.aggregate([
            { $match: { timeStamp: { $gte: since }, hashtags: { $exists: true, $ne: [] } } },
            { $unwind: "$hashtags" },
            { $group: { _id: "$hashtags", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]);

        return Response.json(result.map((r) => ({ tag: r._id, count: r.count })));
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}
