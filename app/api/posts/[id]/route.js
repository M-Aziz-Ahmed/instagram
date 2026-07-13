import connectDB from "@/utils/db";
import Post from "@/models/post";
import User from "@/models/user";
import Notification from "@/models/notification";
import { extractMentions } from "@/utils/parseText";

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export async function PATCH(request, { params }) {
    try {
        const { id } = await params;
        const { username, action, text, color, parentId, imageUrl } = await request.json();

        if (!username) {
            return Response.json({ error: "Username required" }, { status: 400 });
        }

        await connectDB();
        const post = await Post.findById(id);
        if (!post) return Response.json({ error: "Not found" }, { status: 404 });

        if (action === "comment") {
            const hasText = text?.trim();
            const hasImage = imageUrl;
            if (!hasText && !hasImage) {
                return Response.json({ error: "Comment must have text or an image" }, { status: 400 });
            }

            const commenter = await User.findOne({ username }).select("avatarUrl").lean();

            const comment = {
                commentId: uid(),
                text:      text?.trim() ?? "",
                imageUrl:  imageUrl || "",
                sender:    username,
                color:     color || "#3b82f6",
                avatarUrl: commenter?.avatarUrl || "",
                parentId:  parentId || null,
            };
            post.comments.push(comment);
            await post.save();

            if (post.sender !== username) {
                await Notification.create({
                    recipient: post.sender,
                    type:      "comment",
                    fromUser:  username,
                    fromColor: color || "#3b82f6",
                    postId:    id,
                    text:      text?.trim() ?? "",
                });
            }

            const mentions = extractMentions(text || "", username).filter((u) => u !== post.sender);
            if (mentions.length > 0) {
                await Notification.insertMany(mentions.map((recipient) => ({
                    recipient,
                    type:      "mention",
                    fromUser:  username,
                    fromColor: color || "#3b82f6",
                    postId:    id,
                    text:      text?.trim() ?? "",
                })));
            }

            return Response.json(post);
        }

        if (action === "deleteComment") {
            const { commentId } = await request.json();
            post.comments = post.comments.filter((c) => c.commentId !== commentId);
            post.comments = post.comments.filter((c) => c.parentId !== commentId);
            await post.save();
            return Response.json(post);
        }

        const idx = post.likes.indexOf(username);
        const isLiking = idx === -1;

        if (isLiking) {
            post.likes.push(username);
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
        await Notification.deleteMany({ postId: id });
        return Response.json({ ok: true });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to delete post" }, { status: 500 });
    }
}
