import connectDB from "@/utils/db";
import Post from "@/models/post";
import User from "@/models/user";
import Notification from "@/models/notification";
import { extractMentions } from "@/utils/parseText";

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

async function enrichPost(post) {
    const allUsernames = new Set();
    allUsernames.add(post.sender);
    (post.comments || []).forEach((c) => allUsernames.add(c.sender));

    const users = await User.find({ username: { $in: [...allUsernames] } })
        .select("username avatarUrl isVerified roles")
        .populate("roles", "name badge color")
        .lean();

    const userMap = {};
    users.forEach((u) => {
        userMap[u.username] = {
            avatarUrl:  u.avatarUrl || "",
            isVerified: u.isVerified || false,
            roles:      (u.roles || []).map((r) => ({
                id:    r._id?.toString() ?? "",
                name:  r.name  ?? "",
                badge: r.badge ?? "",
                color: r.color ?? "",
            })),
        };
    });

    const obj = post.toObject ? post.toObject() : { ...post };
    obj._author = userMap[post.sender] || null;
    obj.comments = (obj.comments || []).map((c) => ({
        ...c,
        _author: userMap[c.sender] || null,
    }));
    return obj;
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

            const commenter = await User.findOne({ username }).select("avatarUrl isVerified roles").populate("roles", "name badge color").lean();

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

            const enriched = await enrichPost(post);
            return Response.json(enriched);
        }

        if (action === "deleteComment") {
            const { commentId } = await request.json();
            post.comments = post.comments.filter((c) => c.commentId !== commentId);
            post.comments = post.comments.filter((c) => c.parentId !== commentId);
            await post.save();
            const enriched = await enrichPost(post);
            return Response.json(enriched);
        }

        if (action === "view") {
            post.viewCount = (post.viewCount || 0) + 1;
            await post.save();
            return Response.json({ viewCount: post.viewCount });
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

        const enriched = await enrichPost(post);
        return Response.json(enriched);
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
