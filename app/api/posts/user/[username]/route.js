import connectDB from "@/utils/db";
import Post from "@/models/post";

export async function GET(request, { params }) {
    try {
        const { username } = await params;
        await connectDB();

        const posts = await Post.find({ sender: username })
            .sort({ timeStamp: -1 })
            .lean();

        // Also compute stats
        const totalLikes = posts.reduce((sum, p) => sum + p.likes.length, 0);

        return Response.json({ posts, totalLikes, postCount: posts.length });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch profile" }, { status: 500 });
    }
}
