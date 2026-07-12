import connectDB from "@/utils/db";
import Post from "@/models/post";
import Notification from "@/models/notification";
import { extractMentions } from "@/utils/parseText";

export async function PATCH(request, { params }) {
    try {
        const { id } = await params;
        const { username, action, text, color } = await request.json();

        if (!username) {
            return Response.json({ error: "Username required" }, { status: 400 });
        }

        await connectDB();
        const post = await Post.findById(id);
        if (!post) return Response.json({ error: "Not found" }, { status: 404 });

        if (action === "comment") {
            if (!text?.trim()) {
                return Response.json({ error: "Comment text required" }, { status: 400 });
            }
            post.comments.push({ text: text.trim(), sender: username, color: color || "#3b82f6" });
            await post.save();

            // Notify post owner (not self)
            if (post.sender !== username) {
                await Notification.create({
                    recipient: post.sender,
                    type:      "comment",
                    fromUser:  username,
                    fromColor: color || "#3b82f6",
                    postId:    id,
                    text:      text.trim(),
                });
            }

            // Notify @mentions in the comment (excluding commenter + post owner already notified)
            const mentions = extractMentions(text, username).filter((u) => u !== post.sender);
            if (mentions.length > 0) {
                await Notification.insertMany(mentions.map((recipient) => ({
                    recipient,
                    type:      "mention",
                    fromUser:  username,
                    fromColor: color || "#3b82f6",
                    postId:    id,
                    text:      text.trim(),
                })));
            }
        } else {
            // Toggle like
            const idx = post.likes.indexOf(username);
            const isLiking = idx === -1;

            if (isLiking) {
                post.likes.push(username);
                // Notify post owner (not self)
                if (post.sender !== username) {
                    await Notification.create({
                        recipient: post.sender,
                        type:      "like",
                        fromUser:  username,
                        fromColor: color || "#3b82f6",
                        postId:    id,
                        text:      post.text?.slice(0, 80) ?? "",
                    });
                }
            } else {
                post.likes.splice(idx, 1);
            }
            await post.save();
        }

        return Response.json(post);
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to update post" }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        const { username } = await request.json();

        await connectDB();
        const post = await Post.findById(id);
        if (!post) return Response.json({ error: "Not found" }, { status: 404 });
        if (post.sender !== username) {
            return Response.json({ error: "Unauthorized" }, { status: 403 });
        }

        await Post.findByIdAndDelete(id);
        // Clean up notifications for this post
        await Notification.deleteMany({ postId: id });
        return Response.json({ ok: true });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to delete post" }, { status: 500 });
    }
}
