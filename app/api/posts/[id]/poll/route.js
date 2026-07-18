import connectDB from "@/utils/db";
import Post from "@/models/post";

export async function POST(request, { params }) {
    try {
        const { id } = await params;
        const { username, optionIndex } = await request.json();

        if (!username || optionIndex === undefined) {
            return Response.json({ error: "username and optionIndex required" }, { status: 400 });
        }

        await connectDB();
        const post = await Post.findById(id);
        if (!post) return Response.json({ error: "Post not found" }, { status: 404 });
        if (!post.poll?.enabled) return Response.json({ error: "Post has no poll" }, { status: 400 });

        if (post.poll.expiresAt && new Date(post.poll.expiresAt) < new Date()) {
            return Response.json({ error: "Poll has expired" }, { status: 400 });
        }

        if (optionIndex < 0 || optionIndex >= post.poll.options.length) {
            return Response.json({ error: "Invalid option index" }, { status: 400 });
        }

        // Remove any existing vote from this user across all options
        let alreadyVoted = false;
        post.poll.options.forEach((opt) => {
            const idx = opt.votes.indexOf(username);
            if (idx !== -1) {
                opt.votes.splice(idx, 1);
                alreadyVoted = true;
            }
        });

        // Add new vote
        post.poll.options[optionIndex].votes.push(username);

        await post.save();

        return Response.json({
            poll: post.poll,
            changedVote: alreadyVoted,
        });
    } catch (err) {
        console.error("Poll vote error:", err);
        return Response.json({ error: "Failed to vote" }, { status: 500 });
    }
}
