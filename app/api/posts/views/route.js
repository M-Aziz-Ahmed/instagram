import connectDB from "@/utils/db";
import Post from "@/models/post";

export async function POST(request) {
    try {
        const { postIds } = await request.json();

        if (!Array.isArray(postIds) || postIds.length === 0) {
            return Response.json({ error: "postIds array required" }, { status: 400 });
        }

        const ids = postIds.slice(0, 50);
        await connectDB();

        const result = await Post.updateMany(
            { _id: { $in: ids } },
            { $inc: { viewCount: 1 } }
        );

        return Response.json({ updated: result.modifiedCount });
    } catch (error) {
        console.error("Failed to track views:", error);
        return Response.json({ error: "Failed to track views" }, { status: 500 });
    }
}
