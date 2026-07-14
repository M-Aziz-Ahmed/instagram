import connectDB from "@/utils/db";
import Post from "@/models/post";
import User from "@/models/user";
import Notification from "@/models/notification";
import { extractHashtags, extractMentions } from "@/utils/parseText";

export async function POST(request, { params }) {
    try {
        const { id } = await params;
        
        // Validate ObjectId format
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return Response.json({ error: "Invalid post ID" }, { status: 400 });
        }
        
        const { username, comment } = await request.json();
        
        if (!username) {
            return Response.json({ error: "Username required" }, { status: 400 });
        }

        await connectDB();
        
        // Get original post
        const originalPost = await Post.findById(id);
        if (!originalPost) {
            return Response.json({ error: "Original post not found" }, { status: 404 });
        }

        // Get user info
        const user = await User.findOne({ username }).select("avatarColor avatarUrl");
        if (!user) {
            return Response.json({ error: "User not found" }, { status: 404 });
        }

        // Check if user already reposted this
        const existingRepost = await Post.findOne({
            sender: username,
            isRepost: true,
            originalPostId: id,
        });

        if (existingRepost) {
            return Response.json({ error: "Already reposted" }, { status: 400 });
        }

        // Create repost
        const repostComment = comment?.trim() || "";
        const repost = await Post.create({
            text: "",
            sender: username,
            color: user.avatarColor || "#3b82f6",
            avatarUrl: user.avatarUrl || "",
            isRepost: true,
            originalPostId: id,
            originalSender: originalPost.sender,
            repostComment,
            hashtags: extractHashtags(repostComment),
            mentions: extractMentions(repostComment),
            visibility: "public",
        });

        // Increment repost count on original
        originalPost.repostCount = (originalPost.repostCount || 0) + 1;
        await originalPost.save();

        // Notify original poster
        if (originalPost.sender !== username) {
            await Notification.create({
                recipient: originalPost.sender,
                type: "repost",
                fromUser: username,
                fromColor: user.avatarColor || "#3b82f6",
                fromAvatarUrl: user.avatarUrl || "",
                postId: id,
                text: repostComment,
            });
        }

        // Notify mentioned users in repost comment
        const mentions = extractMentions(repostComment, username)
            .filter((u) => u !== originalPost.sender && u !== username);
        
        if (mentions.length > 0) {
            await Notification.insertMany(mentions.map((recipient) => ({
                recipient,
                type: "mention",
                fromUser: username,
                fromColor: user.avatarColor || "#3b82f6",
                fromAvatarUrl: user.avatarUrl || "",
                postId: repost._id.toString(),
                text: repostComment,
            })));
        }

        return Response.json({
            success: true,
            repost: {
                _id: repost._id,
                isRepost: true,
                originalPostId: id,
                repostComment,
            }
        });
    } catch (error) {
        console.error("Repost error:", error);
        return Response.json({ error: "Failed to repost" }, { status: 500 });
    }
}

// DELETE to unrepost
export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return Response.json({ error: "Invalid post ID" }, { status: 400 });
        }
        
        const { username } = await request.json();
        
        if (!username) {
            return Response.json({ error: "Username required" }, { status: 400 });
        }

        await connectDB();

        // Find and delete the repost
        const repost = await Post.findOne({
            sender: username,
            isRepost: true,
            originalPostId: id,
        });

        if (!repost) {
            return Response.json({ error: "Repost not found" }, { status: 404 });
        }

        await Post.findByIdAndDelete(repost._id);

        // Decrement repost count on original
        await Post.findByIdAndUpdate(id, {
            $inc: { repostCount: -1 }
        });

        // Delete repost notification
        await Notification.deleteOne({
            type: "repost",
            fromUser: username,
            postId: id,
        });

        return Response.json({ success: true });
    } catch (error) {
        console.error("Unrepost error:", error);
        return Response.json({ error: "Failed to unrepost" }, { status: 500 });
    }
}
