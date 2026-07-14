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

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        
        // Validate ObjectId format
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return Response.json({ error: "Invalid post ID" }, { status: 400 });
        }
        
        await connectDB();
        const post = await Post.findById(id);
        if (!post) return Response.json({ error: "Not found" }, { status: 404 });
        const enriched = await enrichPost(post);
        return Response.json(enriched);
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch post" }, { status: 500 });
    }
}

export async function PATCH(request, { params }) {
    try {
        const { id } = await params;
        
        // Validate ObjectId format
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return Response.json({ error: "Invalid post ID" }, { status: 400 });
        }
        
        const { username, action, text, color, parentId, imageUrl } = await request.json();

        await connectDB();
        const post = await Post.findById(id);
        if (!post) return Response.json({ error: "Not found" }, { status: 404 });

        if (action === "view") {
            post.viewCount = (post.viewCount || 0) + 1;
            await post.save();
            return Response.json({ viewCount: post.viewCount });
        }

        if (!username) {
            return Response.json({ error: "Username required" }, { status: 400 });
        }

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
                likes:     [],
                replies:   0,
                mentions:  extractMentions(text || ""),
            };
            post.comments.push(comment);
            
            // Update parent reply count if this is a reply
            if (parentId) {
                const parentComment = post.comments.find(c => c.commentId === parentId);
                if (parentComment) {
                    parentComment.replies = (parentComment.replies || 0) + 1;
                }
            }
            
            await post.save();

            // Notify post owner
            if (post.sender !== username) {
                await Notification.create({
                    recipient: post.sender,
                    type:      parentId ? "reply" : "comment",
                    fromUser:  username,
                    fromColor: color || "#3b82f6",
                    fromAvatarUrl: commenter?.avatarUrl || "",
                    postId:    id,
                    commentId: comment.commentId,
                    text:      text?.trim() ?? "",
                });
            }

            // Notify mentioned users
            const mentions = extractMentions(text || "", username).filter((u) => u !== post.sender && u !== username);
            if (mentions.length > 0) {
                await Notification.insertMany(mentions.map((recipient) => ({
                    recipient,
                    type:      "mention",
                    fromUser:  username,
                    fromColor: color || "#3b82f6",
                    fromAvatarUrl: commenter?.avatarUrl || "",
                    postId:    id,
                    commentId: comment.commentId,
                    text:      text?.trim() ?? "",
                })));
            }

            const enriched = await enrichPost(post);
            return Response.json(enriched);
        }

        if (action === "deleteComment") {
            const { commentId } = await request.json();
            const comment = post.comments.find(c => c.commentId === commentId);
            
            // If deleting a parent comment, also delete replies
            post.comments = post.comments.filter((c) => c.commentId !== commentId && c.parentId !== commentId);
            
            // Update parent reply count if this was a reply
            if (comment?.parentId) {
                const parentComment = post.comments.find(c => c.commentId === comment.parentId);
                if (parentComment && parentComment.replies > 0) {
                    parentComment.replies -= 1;
                }
            }
            
            await post.save();
            const enriched = await enrichPost(post);
            return Response.json(enriched);
        }

        if (action === "react") {
            const { reactionType } = await request.json();
            const validReactions = ["like", "love", "laugh", "fire", "sad", "angry"];
            
            if (!reactionType || !validReactions.includes(reactionType)) {
                return Response.json({ error: "Invalid reaction type" }, { status: 400 });
            }

            // Initialize reactions if needed
            if (!post.reactions) {
                post.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
            }

            // Remove user from all other reaction types
            validReactions.forEach(type => {
                if (!post.reactions[type]) post.reactions[type] = [];
                const idx = post.reactions[type].indexOf(username);
                if (idx !== -1) {
                    post.reactions[type].splice(idx, 1);
                }
            });

            // Toggle the selected reaction
            if (!post.reactions[reactionType]) post.reactions[reactionType] = [];
            const idx = post.reactions[reactionType].indexOf(username);
            
            if (idx === -1) {
                // Add reaction
                post.reactions[reactionType].push(username);
                
                // Notify post owner (only for non-like reactions)
                if (post.sender !== username && reactionType !== "like") {
                    await Notification.create({
                        recipient: post.sender,
                        type:      reactionType,
                        fromUser:  username,
                        fromColor: color || "#3b82f6",
                        postId:    id,
                        text:      post.text?.slice(0, 80) ?? "",
                    });
                }
            } else {
                // Remove reaction
                post.reactions[reactionType].splice(idx, 1);
            }

            await post.save();
            const enriched = await enrichPost(post);
            return Response.json(enriched);
        }

        // Legacy like support (converts to "like" reaction)
        if (action === "like" || !action) {
            const idx = post.reactions?.like?.indexOf(username) ?? -1;
            const isLiking = idx === -1;

            if (!post.reactions) {
                post.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
            }
            if (!post.reactions.like) post.reactions.like = [];

            if (isLiking) {
                post.reactions.like.push(username);
                
                // Also update legacy likes array for backward compatibility
                if (!post.likes.includes(username)) {
                    post.likes.push(username);
                }
                
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
                post.reactions.like.splice(idx, 1);
                
                // Also update legacy likes array
                const legacyIdx = post.likes.indexOf(username);
                if (legacyIdx !== -1) {
                    post.likes.splice(legacyIdx, 1);
                }
            }
            
            await post.save();
            const enriched = await enrichPost(post);
            return Response.json(enriched);
        }

        return Response.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to update post" }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        
        // Validate ObjectId format
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return Response.json({ error: "Invalid post ID" }, { status: 400 });
        }
        
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
