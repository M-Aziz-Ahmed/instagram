import connectDB from "@/utils/db";
import Post from "@/models/post";
import User from "@/models/user";

export async function GET() {
    try {
        await connectDB();

        const totalUsers = await User.countDocuments();
        const totalPosts = await Post.countDocuments();

        const users = await User.find()
            .select("username createdAt")
            .lean();

        const posts = await Post.find()
            .select("sender likes comments viewCount timeStamp hashtags mentions")
            .lean();

        const totalLikes = posts.reduce((sum, p) => sum + (p.likes?.length || 0), 0);
        const totalComments = posts.reduce((sum, p) => sum + (p.comments?.length || 0), 0);
        const totalViews = posts.reduce((sum, p) => sum + (p.viewCount || 0), 0);

        const postsByDay = {};
        const usersByDay = {};
        const likesByDay = {};
        const commentsByDay = {};

        posts.forEach((post) => {
            const date = new Date(post.timeStamp).toISOString().split("T")[0];
            postsByDay[date] = (postsByDay[date] || 0) + 1;
            likesByDay[date] = (likesByDay[date] || 0) + (post.likes?.length || 0);
            commentsByDay[date] = (commentsByDay[date] || 0) + (post.comments?.length || 0);
        });

        users.forEach((user) => {
            const date = new Date(user.createdAt).toISOString().split("T")[0];
            usersByDay[date] = (usersByDay[date] || 0) + 1;
        });

        const postCounts = {};
        posts.forEach((post) => {
            postCounts[post.sender] = (postCounts[post.sender] || 0) + 1;
        });
        const topPosters = Object.entries(postCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([username, count]) => ({ username, count }));

        const likeCounts = {};
        posts.forEach((post) => {
            (post.likes || []).forEach((username) => {
                likeCounts[username] = (likeCounts[username] || 0) + 1;
            });
        });
        const topLikers = Object.entries(likeCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([username, count]) => ({ username, count }));

        const hashtagCount = {};
        posts.forEach((post) => {
            (post.hashtags || []).forEach((tag) => {
                hashtagCount[tag] = (hashtagCount[tag] || 0) + 1;
            });
        });
        const topHashtags = Object.entries(hashtagCount)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([tag, count]) => ({ tag, count }));

        const topPosts = [...posts]
            .sort((a, b) => ((b.likes?.length || 0) + (b.comments?.length || 0)) - ((a.likes?.length || 0) + (a.comments?.length || 0)))
            .slice(0, 10)
            .map((p) => ({
                id: p._id,
                sender: p.sender,
                text: p.text?.slice(0, 100) || "",
                likes: p.likes?.length || 0,
                comments: p.comments?.length || 0,
                views: p.viewCount || 0,
                timeStamp: p.timeStamp,
            }));

        return Response.json({
            stats: {
                totalUsers,
                totalPosts,
                totalLikes,
                totalComments,
                totalViews,
                avgPostsPerUser: totalUsers > 0 ? (totalPosts / totalUsers).toFixed(1) : 0,
            },
            charts: {
                postsByDay,
                usersByDay,
                likesByDay,
                commentsByDay,
            },
            topPosters,
            topLikers,
            topHashtags,
            topPosts,
        });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch admin analytics" }, { status: 500 });
    }
}
