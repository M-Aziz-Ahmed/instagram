const express = require("express");
const Post = require("../models/post");
const User = require("../models/user");
const Notification = require("../models/notification");
const { verifyToken, optionalAuth } = require("../middleware/auth");

const router = express.Router();

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function extractHashtags(text) {
    if (!text) return [];
    const matches = text.match(/#(\w+)/g);
    return matches ? [...new Set(matches.map((h) => h.slice(1).toLowerCase()))] : [];
}

function extractMentions(text, sender) {
    if (!text) return [];
    const matches = text.match(/@(\w+)/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))].filter((u) => u !== sender);
}

async function enrichPosts(posts) {
    const allUsernames = new Set();
    posts.forEach((p) => {
        allUsernames.add(p.sender);
        (p.comments || []).forEach((c) => allUsernames.add(c.sender));
        if (p._originalPost?.sender) allUsernames.add(p._originalPost.sender);
    });
    if (allUsernames.size === 0) return posts;

    const users = await User.find({ username: { $in: [...allUsernames] } })
        .select("username avatarUrl isVerified isAdmin roles")
        .populate("roles", "name badge color")
        .lean();

    const userMap = {};
    users.forEach((u) => {
        userMap[u.username] = {
            avatarUrl:  u.avatarUrl || "",
            isVerified: u.isVerified || false,
            isAdmin:    u.isAdmin || false,
            roles:      (u.roles || []).map((r) => ({
                id:    r._id?.toString() ?? "",
                name:  r.name  ?? "",
                badge: r.badge ?? "",
                color: r.color ?? "",
            })),
        };
    });

    return posts.map((p) => ({
        ...p,
        _author: userMap[p.sender] || null,
        _originalPost: p._originalPost ? {
            ...p._originalPost,
            _author: userMap[p._originalPost.sender] || null,
        } : null,
        comments: (p.comments || []).map((c) => ({
            ...c,
            _author: userMap[c.sender] || null,
        })),
    }));
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

// GET /
router.get("/", async (req, res) => {
    try {
        const { tag, feed, username, lang, before } = req.query;
        const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);

        let viewer = null;
        if (username) {
            viewer = await User.findOne({ username }).select("mutedWords closeFriends following").lean();
        }

        const matchStage = {};
        matchStage.$or = [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }];

        if (tag) matchStage.hashtags = tag.toLowerCase();
        if (feed === "following" && username) {
            if (viewer?.following?.length) {
                matchStage.sender = { $in: viewer.following };
            } else {
                return res.json({ posts: [], hasMore: false });
            }
        }
        if (before) matchStage.timeStamp = { $lt: new Date(before) };

        const extraMatch = {};
        if (username && viewer) {
            extraMatch.$or = [
                { visibility: { $ne: "closeFriends" } },
                { sender: { $in: viewer.closeFriends || [] } },
                { sender: username },
            ];
        }

        const pipeline = [];
        if (Object.keys(matchStage).length > 0) pipeline.push({ $match: matchStage });
        if (Object.keys(extraMatch).length > 0) pipeline.push({ $match: extraMatch });
        pipeline.push({ $sort: { timeStamp: -1 } });
        pipeline.push({ $limit: limit + 10 });
        pipeline.push({ $lookup: { from: "posts", localField: "originalPostId", foreignField: "_id", as: "_originalPost" } });
        pipeline.push({ $addFields: { _originalPost: { $first: "$_originalPost" } } });

        const rawPosts = await Post.aggregate(pipeline).allowDiskUse(true);

        const mutedSet = new Set((viewer?.mutedWords || []).map((w) => w.toLowerCase()));
        const closeFriendsSet = new Set(viewer?.closeFriends || []);

        const filtered = rawPosts.filter((p) => {
            if (mutedSet.size > 0) {
                const text = (p.text || "").toLowerCase();
                for (const w of mutedSet) {
                    if (text.includes(w)) return false;
                }
                if (p.hashtags) {
                    for (const h of p.hashtags) {
                        if (mutedSet.has(h.toLowerCase())) return false;
                    }
                }
            }
            if (p.visibility === "closeFriends") {
                if (p.sender !== username && !closeFriendsSet.has(p.sender)) return false;
            }
            return true;
        });

        const hasMore = filtered.length > limit;
        const sliced = hasMore ? filtered.slice(0, limit) : filtered;
        const posts = await enrichPosts(sliced);

        return res.json({ posts, hasMore });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch posts" });
    }
});

// POST /
router.post("/", verifyToken, async (req, res) => {
    try {
        const { text, imageUrl, audioUrl, visibility, poll } = req.body;
        const username = req.body.sender || req.session?.userId;

        const senderUser = await User.findById(req.userId).select("username avatarUrl").lean();
        const sender = senderUser?.username || username;
        if (!sender?.trim()) {
            return res.status(400).json({ error: "Sender is required" });
        }

        const sanitizedText = text?.trim() || "";
        if (sanitizedText.length > 1000) {
            return res.status(400).json({ error: "Text exceeds maximum length of 1000 characters" });
        }
        if (!sanitizedText && !imageUrl && !audioUrl) {
            return res.status(400).json({ error: "Post must have text, an image, or audio" });
        }

        const hashtags = extractHashtags(sanitizedText);
        const mentions = extractMentions(sanitizedText, sender);

        const post = await Post.create({
            text:     sanitizedText,
            imageUrl: imageUrl || "",
            audioUrl: audioUrl || "",
            sender:   sender.trim(),
            color:    senderUser?.avatarColor || "#3b82f6",
            avatarUrl: senderUser?.avatarUrl || "",
            hashtags,
            mentions,
            visibility: visibility || "public",
            ...(poll?.enabled && poll.options?.length >= 2 ? {
                poll: {
                    enabled: true,
                    options: poll.options.map((o) => ({ text: o.text.trim().slice(0, 100), votes: [] })),
                    expiresAt: poll.expiresAt || null,
                },
            } : {}),
        });

        if (mentions.length > 0) {
            const notifs = mentions.map((recipient) => ({
                recipient,
                type:      "mention",
                fromUser:  sender,
                fromColor: senderUser?.avatarColor || "#3b82f6",
                postId:    post._id.toString(),
                text:      text?.trim() ?? "",
                postText:  text?.trim()?.slice(0, 120) ?? "",
                postImageUrl: "",
            }));
            await Notification.insertMany(notifs);
        }

        return res.status(201).json(post);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to create post" });
    }
});

// GET /:id
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ error: "Invalid post ID" });
        }
        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });
        const enriched = await enrichPost(post);
        return res.json(enriched);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch post" });
    }
});

// DELETE /:id
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ error: "Invalid post ID" });
        }
        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const username = req.body.username || req.body.sender || (await User.findById(req.userId).select("username").lean())?.username;
        if (post.sender !== username) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        await Post.findByIdAndDelete(id);
        await Notification.deleteMany({ postId: id });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to delete post" });
    }
});

// PUT /:id — edit post
router.put("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ error: "Invalid post ID" });
        }

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const username = (await User.findById(req.userId).select("username").lean())?.username;
        if (!username || post.sender !== username) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const { text, imageUrl, audioUrl } = req.body;
        const sanitizedText = text?.trim() || "";

        if (!sanitizedText && !imageUrl && !audioUrl) {
            return res.status(400).json({ error: "Post must have text, an image, or audio" });
        }

        if (sanitizedText.length > 1000) {
            return res.status(400).json({ error: "Text exceeds maximum length of 1000 characters" });
        }

        if (sanitizedText) {
            post.text = sanitizedText;
            post.hashtags = extractHashtags(sanitizedText);
            post.mentions = extractMentions(sanitizedText, username);
        }
        if (imageUrl !== undefined) post.imageUrl = imageUrl;
        if (audioUrl !== undefined) post.audioUrl = audioUrl;
        post.editedAt = new Date();

        await post.save();
        const enriched = await enrichPost(post);
        return res.json(enriched);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to edit post" });
    }
});

// PATCH /:id  — unified action dispatcher (mirrors Next.js API route)
router.patch("/:id", optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ error: "Invalid post ID" });
        }

        const { username: bodyUsername, action, text, color, parentId, imageUrl, audioUrl, reactionType, commentId } = req.body;

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const username = bodyUsername || (req.userId ? (await User.findById(req.userId).select("username").lean())?.username : null);

        if (action === "view") {
            post.viewCount = (post.viewCount || 0) + 1;
            await post.save();
            return res.json({ viewCount: post.viewCount });
        }

        if (!username) {
            return res.status(400).json({ error: "Username required" });
        }

        if (action === "comment") {
            const hasText = text?.trim();
            const hasImage = imageUrl;
            const hasAudio = audioUrl;
            if (!hasText && !hasImage && !hasAudio) {
                return res.status(400).json({ error: "Comment must have text, an image, or audio" });
            }

            const commenter = await User.findOne({ username }).select("username avatarColor avatarUrl isVerified roles").populate("roles", "name badge color").lean();

            const comment = {
                commentId: uid(),
                text:      text?.trim() ?? "",
                imageUrl:  imageUrl || "",
                audioUrl:  audioUrl || "",
                sender:    username,
                color:     commenter?.avatarColor || color || "#3b82f6",
                avatarUrl: commenter?.avatarUrl || "",
                parentId:  parentId || null,
                likes:     [],
                replies:   0,
                mentions:  extractMentions(text || ""),
            };
            post.comments.push(comment);

            if (parentId) {
                const parentComment = post.comments.find(c => c.commentId === parentId);
                if (parentComment) parentComment.replies = (parentComment.replies || 0) + 1;
            }

            await post.save();

            if (post.sender !== username) {
                await Notification.create({
                    recipient: post.sender,
                    type:      parentId ? "reply" : "comment",
                    fromUser:  username,
                    fromColor: commenter?.avatarColor || color || "#3b82f6",
                    fromAvatarUrl: commenter?.avatarUrl || "",
                    postId:    id,
                    commentId: comment.commentId,
                    text:      text?.trim() ?? "",
                    postText:  post.text?.slice(0, 120) ?? "",
                    postImageUrl: post.imageUrl || "",
                });
            }

            const enriched = await enrichPost(post);
            return res.json(enriched);
        }

        if (action === "deleteComment") {
            const comment = post.comments.find(c => c.commentId === commentId);
            post.comments = post.comments.filter((c) => c.commentId !== commentId && c.parentId !== commentId);

            if (comment?.parentId) {
                const parentComment = post.comments.find(c => c.commentId === comment.parentId);
                if (parentComment && parentComment.replies > 0) parentComment.replies -= 1;
            }

            await post.save();
            const enriched = await enrichPost(post);
            return res.json(enriched);
        }

        if (action === "editComment") {
            if (!commentId || !text?.trim()) {
                return res.status(400).json({ error: "commentId and text required" });
            }
            const comment = post.comments.find(c => c.commentId === commentId);
            if (!comment) return res.status(404).json({ error: "Comment not found" });
            if (comment.sender !== username) return res.status(403).json({ error: "Unauthorized" });

            comment.text = text.trim();
            comment.mentions = extractMentions(text, username);
            comment.editedAt = new Date();
            await post.save();
            const enriched = await enrichPost(post);
            return res.json(enriched);
        }

        if (action === "react") {
            const validReactions = ["like", "love", "laugh", "fire", "sad", "angry"];
            if (!reactionType || !validReactions.includes(reactionType)) {
                return res.status(400).json({ error: "Invalid reaction type" });
            }

            if (!post.reactions) {
                post.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
            }

            validReactions.forEach(type => {
                if (!post.reactions[type]) post.reactions[type] = [];
                const idx = post.reactions[type].indexOf(username);
                if (idx !== -1) post.reactions[type].splice(idx, 1);
            });

            if (!post.reactions[reactionType]) post.reactions[reactionType] = [];
            const idx = post.reactions[reactionType].indexOf(username);

            if (idx === -1) {
                post.reactions[reactionType].push(username);
                if (reactionType === "like" && !post.likes.includes(username)) {
                    post.likes.push(username);
                }
                if (post.sender !== username) {
                    await Notification.create({
                        recipient: post.sender,
                        type:      reactionType,
                        fromUser:  username,
                        fromColor: color || "#3b82f6",
                        postId:    id,
                        text:      post.text?.slice(0, 80) ?? "",
                        postText:  post.text?.slice(0, 120) ?? "",
                        postImageUrl: post.imageUrl || "",
                    });
                }
            } else {
                post.reactions[reactionType].splice(idx, 1);
                if (reactionType === "like") {
                    const legacyIdx = post.likes.indexOf(username);
                    if (legacyIdx !== -1) post.likes.splice(legacyIdx, 1);
                }
            }

            await post.save();
            const enriched = await enrichPost(post);
            return res.json(enriched);
        }

        // Legacy like (no action or action=like)
        if (action === "like" || !action) {
            if (!post.reactions) {
                post.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
            }
            if (!post.reactions.like) post.reactions.like = [];

            const idx = post.reactions.like.indexOf(username);
            const isLiking = idx === -1;

            if (isLiking) {
                post.reactions.like.push(username);
                if (!post.likes.includes(username)) post.likes.push(username);
                if (post.sender !== username) {
                    await Notification.create({
                        recipient: post.sender,
                        type:      "like",
                        fromUser:  username,
                        fromColor: color || "#3b82f6",
                        postId:    id,
                        text:      post.text?.slice(0, 80) ?? "",
                        postText:  post.text?.slice(0, 120) ?? "",
                        postImageUrl: post.imageUrl || "",
                    });
                }
            } else {
                post.reactions.like.splice(idx, 1);
                const legacyIdx = post.likes.indexOf(username);
                if (legacyIdx !== -1) post.likes.splice(legacyIdx, 1);
            }

            await post.save();
            const enriched = await enrichPost(post);
            return res.json(enriched);
        }

        if (action === "reactComment") {
            const validReactions = ["like", "love", "laugh", "fire", "sad", "angry"];
            if (!commentId || !reactionType || !validReactions.includes(reactionType)) {
                return res.status(400).json({ error: "Invalid comment reaction" });
            }
            const comment = post.comments.find(c => c.commentId === commentId);
            if (!comment) return res.status(404).json({ error: "Comment not found" });

            if (!comment.reactions) {
                comment.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
            }

            validReactions.forEach(type => {
                if (!comment.reactions[type]) comment.reactions[type] = [];
                const idx = comment.reactions[type].indexOf(username);
                if (idx !== -1) comment.reactions[type].splice(idx, 1);
            });

            if (!comment.reactions[reactionType]) comment.reactions[reactionType] = [];
            const idx = comment.reactions[reactionType].indexOf(username);
            if (idx === -1) comment.reactions[reactionType].push(username);

            await post.save();
            const enriched = await enrichPost(post);
            return res.json(enriched);
        }

        return res.status(400).json({ error: "Invalid action" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to update post" });
    }
});

// POST /:id/like
router.post("/:id/like", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(req.userId).select("username avatarColor").lean();
        const username = user?.username;
        if (!username) return res.status(400).json({ error: "Username not found" });

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        if (!post.reactions) {
            post.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
        }
        if (!post.reactions.like) post.reactions.like = [];

        const idx = post.reactions.like.indexOf(username);
        const isLiking = idx === -1;

        if (isLiking) {
            post.reactions.like.push(username);
            if (!post.likes.includes(username)) post.likes.push(username);

            if (post.sender !== username) {
                await Notification.create({
                    recipient: post.sender,
                    type:      "like",
                    fromUser:  username,
                    fromColor: user.avatarColor || "#3b82f6",
                    postId:    id,
                    text:      post.text?.slice(0, 80) ?? "",
                    postText:  post.text?.slice(0, 120) ?? "",
                    postImageUrl: post.imageUrl || "",
                });
            }
        } else {
            post.reactions.like.splice(idx, 1);
            const legacyIdx = post.likes.indexOf(username);
            if (legacyIdx !== -1) post.likes.splice(legacyIdx, 1);
        }

        await post.save();
        return res.json({ liked: isLiking, likeCount: post.reactions.like.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to toggle like" });
    }
});

// POST /:id/react
router.post("/:id/react", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { reaction } = req.body;
        const validReactions = ["like", "love", "laugh", "fire", "sad", "angry"];
        if (!reaction || !validReactions.includes(reaction)) {
            return res.status(400).json({ error: "Invalid reaction type" });
        }

        const user = await User.findById(req.userId).select("username").lean();
        const username = user?.username;
        if (!username) return res.status(400).json({ error: "Username not found" });

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        if (!post.reactions) {
            post.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
        }

        // Remove from all other reactions
        validReactions.forEach((type) => {
            if (!post.reactions[type]) post.reactions[type] = [];
            const i = post.reactions[type].indexOf(username);
            if (i !== -1) post.reactions[type].splice(i, 1);
        });

        // Toggle selected reaction
        if (!post.reactions[reaction]) post.reactions[reaction] = [];
        const idx = post.reactions[reaction].indexOf(username);
        let userReaction = null;

        if (idx === -1) {
            post.reactions[reaction].push(username);
            userReaction = reaction;
            if (reaction === "like" && !post.likes.includes(username)) {
                post.likes.push(username);
            }
            if (post.sender !== username) {
                await Notification.create({
                    recipient: post.sender,
                    type:      reaction,
                    fromUser:  username,
                    fromColor: user.avatarColor || "#3b82f6",
                    postId:    id,
                    text:      post.text?.slice(0, 80) ?? "",
                    postText:  post.text?.slice(0, 120) ?? "",
                    postImageUrl: post.imageUrl || "",
                });
            }
        } else {
            post.reactions[reaction].splice(idx, 1);
            if (reaction === "like") {
                const legacyIdx = post.likes.indexOf(username);
                if (legacyIdx !== -1) post.likes.splice(legacyIdx, 1);
            }
        }

        await post.save();
        return res.json({ reactions: post.reactions, userReaction });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to react" });
    }
});

// POST /:id/comment
router.post("/:id/comment", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { text, imageUrl, audioUrl, parentId } = req.body;

        const hasText = text?.trim();
        const hasImage = imageUrl;
        const hasAudio = audioUrl;
        if (!hasText && !hasImage && !hasAudio) {
            return res.status(400).json({ error: "Comment must have text, an image, or audio" });
        }

        const user = await User.findById(req.userId).select("username avatarColor").lean();
        const username = user?.username;
        if (!username) return res.status(400).json({ error: "Username not found" });

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const comment = {
            commentId: uid(),
            text:      text?.trim() ?? "",
            imageUrl:  imageUrl || "",
            audioUrl:  audioUrl || "",
            sender:    username,
            color:     user.avatarColor || "#3b82f6",
            avatarUrl: user.avatarUrl || "",
            parentId:  parentId || null,
            likes:     [],
            replies:   0,
            mentions:  extractMentions(text || ""),
        };
        post.comments.push(comment);

        if (parentId) {
            const parentComment = post.comments.find((c) => c.commentId === parentId);
            if (parentComment) parentComment.replies = (parentComment.replies || 0) + 1;
        }

        await post.save();

        if (post.sender !== username) {
            await Notification.create({
                recipient: post.sender,
                type:      parentId ? "reply" : "comment",
                fromUser:  username,
                fromColor: user.avatarColor || "#3b82f6",
                fromAvatarUrl: user.avatarUrl || "",
                postId:    id,
                commentId: comment.commentId,
                text:      text?.trim() ?? "",
                postText:  post.text?.slice(0, 120) ?? "",
                postImageUrl: post.imageUrl || "",
            });
        }

        return res.json(comment);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to add comment" });
    }
});

// DELETE /:id/comment/:commentId
router.delete("/:id/comment/:commentId", verifyToken, async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const user = await User.findById(req.userId).select("username").lean();
        const username = user?.username;

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const comment = post.comments.find((c) => c.commentId === commentId);
        if (!comment) return res.status(404).json({ error: "Comment not found" });
        if (comment.sender !== username) return res.status(403).json({ error: "Unauthorized" });

        post.comments = post.comments.filter((c) => c.commentId !== commentId && c.parentId !== commentId);
        if (comment?.parentId) {
            const parentComment = post.comments.find((c) => c.commentId === comment.parentId);
            if (parentComment && parentComment.replies > 0) parentComment.replies -= 1;
        }

        await post.save();
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to delete comment" });
    }
});

// POST /:id/comment/:commentId/like
router.post("/:id/comment/:commentId/like", verifyToken, async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const user = await User.findById(req.userId).select("username").lean();
        const username = user?.username;

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const comment = post.comments.find((c) => c.commentId === commentId);
        if (!comment) return res.status(404).json({ error: "Comment not found" });

        if (!comment.likes) comment.likes = [];
        const idx = comment.likes.indexOf(username);
        if (idx === -1) comment.likes.push(username);
        else comment.likes.splice(idx, 1);

        await post.save();
        return res.json({ liked: idx === -1, likeCount: comment.likes.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:id/comment/:commentId/react
router.post("/:id/comment/:commentId/react", verifyToken, async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const { reaction } = req.body;
        const validReactions = ["like", "love", "laugh", "fire", "sad", "angry"];
        if (!reaction || !validReactions.includes(reaction)) {
            return res.status(400).json({ error: "Invalid reaction" });
        }

        const user = await User.findById(req.userId).select("username").lean();
        const username = user?.username;

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const comment = post.comments.find((c) => c.commentId === commentId);
        if (!comment) return res.status(404).json({ error: "Comment not found" });

        if (!comment.reactions) {
            comment.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
        }

        validReactions.forEach((type) => {
            if (!comment.reactions[type]) comment.reactions[type] = [];
            const i = comment.reactions[type].indexOf(username);
            if (i !== -1) comment.reactions[type].splice(i, 1);
        });

        if (!comment.reactions[reaction]) comment.reactions[reaction] = [];
        const idx = comment.reactions[reaction].indexOf(username);
        if (idx === -1) comment.reactions[reaction].push(username);

        await post.save();
        return res.json({ reactions: comment.reactions });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:id/view
router.post("/:id/view", async (req, res) => {
    try {
        const { id } = req.params;
        const post = await Post.findByIdAndUpdate(id, { $inc: { viewCount: 1 } }, { returnDocument: 'after' });
        if (!post) return res.status(404).json({ error: "Not found" });
        return res.json({ viewCount: post.viewCount });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:id/bookmark
router.post("/:id/bookmark", verifyToken, async (req, res) => {
    try {
        const postId = req.params.id;
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const isBookmarked = user.bookmarks.includes(postId);
        if (isBookmarked) {
            user.bookmarks = user.bookmarks.filter((b) => b !== postId);
        } else {
            user.bookmarks.push(postId);
        }
        await user.save();
        return res.json({ bookmarked: !isBookmarked });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:id/repost
router.post("/:id/repost", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;

        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ error: "Invalid post ID" });
        }

        const userDoc = await User.findById(req.userId).select("username avatarColor avatarUrl");
        const username = userDoc?.username;
        if (!username) return res.status(400).json({ error: "Username required" });

        const originalPost = await Post.findById(id);
        if (!originalPost) return res.status(404).json({ error: "Original post not found" });

        const existingRepost = await Post.findOne({ sender: username, isRepost: true, originalPostId: id });
        if (existingRepost) return res.status(400).json({ error: "Already reposted" });

        const repostComment = comment?.trim() || "";
        const repost = await Post.create({
            text: "",
            sender: username,
            color: userDoc.avatarColor || "#3b82f6",
            avatarUrl: userDoc.avatarUrl || "",
            isRepost: true,
            originalPostId: id,
            originalSender: originalPost.sender,
            repostComment,
            hashtags: extractHashtags(repostComment),
            mentions: extractMentions(repostComment),
            visibility: "public",
        });

        originalPost.repostCount = (originalPost.repostCount || 0) + 1;
        await originalPost.save();

        if (originalPost.sender !== username) {
            await Notification.create({
                recipient: originalPost.sender,
                type: "repost",
                fromUser: username,
                fromColor: userDoc.avatarColor || "#3b82f6",
                fromAvatarUrl: userDoc.avatarUrl || "",
                postId: id,
                text: repostComment,
                postText: originalPost.text?.slice(0, 120) ?? "",
                postImageUrl: originalPost.imageUrl || "",
            });
        }

        return res.json({
            success: true,
            repost: { _id: repost._id, isRepost: true, originalPostId: id, repostComment },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to repost" });
    }
});

// POST /:id/poll/vote
router.post("/:id/poll/vote", async (req, res) => {
    try {
        const { id } = req.params;
        const { username, optionIndex } = req.body;

        if (optionIndex === undefined) {
            return res.status(400).json({ error: "optionIndex required" });
        }

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Post not found" });
        if (!post.poll?.enabled) return res.status(400).json({ error: "Post has no poll" });

        if (post.poll.expiresAt && new Date(post.poll.expiresAt) < new Date()) {
            return res.status(400).json({ error: "Poll has expired" });
        }

        if (optionIndex < 0 || optionIndex >= post.poll.options.length) {
            return res.status(400).json({ error: "Invalid option index" });
        }

        let alreadyVoted = false;
        post.poll.options.forEach((opt) => {
            const idx = opt.votes.indexOf(username || "anonymous");
            if (idx !== -1) {
                opt.votes.splice(idx, 1);
                alreadyVoted = true;
            }
        });

        post.poll.options[optionIndex].votes.push(username || "anonymous");
        await post.save();

        return res.json({ poll: post.poll, changedVote: alreadyVoted });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to vote" });
    }
});

// POST /views - batch view increment
router.post("/views", async (req, res) => {
    try {
        const { postIds } = req.body;
        if (!Array.isArray(postIds) || postIds.length === 0) {
            return res.status(400).json({ error: "postIds array required" });
        }
        const ids = postIds.slice(0, 50);
        const result = await Post.updateMany({ _id: { $in: ids } }, { $inc: { viewCount: 1 } });
        return res.json({ updated: result.modifiedCount });
    } catch (error) {
        console.error("Failed to track views:", error);
        return res.status(500).json({ error: "Failed to track views" });
    }
});

// GET /bookmarks - get bookmarked posts
router.get("/bookmarks", async (req, res) => {
    try {
        const idsParam = req.query.ids;
        if (!idsParam) return res.status(400).json({ error: "ids required" });

        const ids = idsParam.split(",").filter(Boolean).slice(0, 50);
        const posts = await Post.find({
            _id: { $in: ids },
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        }).lean();
        if (posts.length === 0) return res.json([]);

        const authorUsernames = [...new Set(posts.map((p) => p.sender))];
        const repostOriginalIds = posts.filter((p) => p.isRepost && p.originalPostId).map((p) => p.originalPostId);

        const [users, originalPosts] = await Promise.all([
            User.find({ username: { $in: authorUsernames } })
                .select("username avatarUrl isVerified isAdmin roles")
                .populate("roles", "name badge color")
                .lean(),
            repostOriginalIds.length > 0
                ? Post.find({ _id: { $in: repostOriginalIds } }).lean()
                : Promise.resolve([]),
        ]);

        const userMap = {};
        users.forEach((u) => {
            userMap[u.username] = {
                avatarUrl: u.avatarUrl || "", isVerified: u.isVerified || false,
                isAdmin: u.isAdmin || false,
                roles: (u.roles || []).map((r) => ({
                    id: r._id?.toString() ?? "", name: r.name ?? "", badge: r.badge ?? "", color: r.color ?? "",
                })),
            };
        });

        const origMap = {};
        originalPosts.forEach((p) => { origMap[p._id.toString()] = { ...p, _author: userMap[p.sender] || null }; });

        const enriched = posts
            .sort((a, b) => new Date(b.timeStamp) - new Date(a.timeStamp))
            .map((p) => ({
                ...p, _author: userMap[p.sender] || null,
                _originalPost: (p.isRepost && p.originalPostId) ? (origMap[p.originalPostId.toString()] || null) : null,
                comments: (p.comments || []).map((c) => ({ ...c, _author: c.sender === p.sender ? userMap[c.sender] : null })),
            }));

        return res.json(enriched);
    } catch (error) {
        console.error("Failed to fetch bookmarks:", error);
        return res.status(500).json({ error: "Failed to fetch bookmarks" });
    }
});

// GET /user/:username - user profile posts
router.get("/user/:username", async (req, res) => {
    try {
        const { username } = req.params;
        const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
        const before = req.query.before;
        const viewer = req.query.viewer;

        const userDoc = await User.findOne({ username }).populate("roles").lean();

        const isPrivate = userDoc?.isPrivate;
        const isSelf = viewer === username;
        const isFollower = userDoc?.followers?.includes(viewer);
        const isAdmin = req.query.admin === "true";

        if (isPrivate && !isSelf && !isFollower && !isAdmin) {
            return res.json({
                posts: [],
                totalLikes: 0,
                postCount: 0,
                profile: userDoc ? {
                    username: userDoc.username,
                    bio: userDoc.bio,
                    avatarColor: userDoc.avatarColor,
                    avatarUrl: userDoc.avatarUrl || "",
                    isVerified: userDoc.isVerified || false,
                    isAdmin: userDoc.isAdmin || false,
                    isPrivate: true,
                    roles: (userDoc.roles || []).map((r) => ({
                        id: r._id.toString(), name: r.name, badge: r.badge, color: r.color,
                    })),
                    followersCount: (userDoc.followers || []).length,
                    followingCount: (userDoc.following || []).length,
                } : null,
                hasMore: false,
                nextCursor: null,
                isPrivate: true,
            });
        }

        const query = {
            sender: username,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        };
        if (before) query.timeStamp = { $lt: new Date(before) };

        const [rawPosts, totalPosts] = await Promise.all([
            Post.find(query).sort({ timeStamp: -1 }).limit(limit + 1).lean(),
            Post.countDocuments({ sender: username }),
        ]);

        const hasMore = rawPosts.length > limit;
        const posts = hasMore ? rawPosts.slice(0, limit) : rawPosts;

        const repostIds = posts.filter((p) => p.isRepost && p.originalPostId).map((p) => p.originalPostId);
        let originalPostsMap = {};
        if (repostIds.length > 0) {
            const originalPosts = await Post.find({ _id: { $in: repostIds } }).lean();
            const origAuthors = [...new Set(originalPosts.map((p) => p.sender))];
            const origUsers = await User.find({ username: { $in: origAuthors } })
                .select("username avatarUrl isVerified isAdmin roles")
                .populate("roles", "name badge color").lean();
            const origUserMap = {};
            origUsers.forEach((u) => {
                origUserMap[u.username] = {
                    avatarUrl: u.avatarUrl || "", isVerified: u.isVerified || false,
                    isAdmin: u.isAdmin || false,
                    roles: (u.roles || []).map((r) => ({
                        id: r._id?.toString() ?? "", name: r.name ?? "", badge: r.badge ?? "", color: r.color ?? "",
                    })),
                };
            });
            originalPosts.forEach((p) => {
                originalPostsMap[p._id.toString()] = { ...p, _author: origUserMap[p.sender] || null };
            });
        }

        const totalLikes = posts.reduce((sum, p) => sum + p.likes.length, 0);

        const profile = userDoc ? {
            username: userDoc.username, bio: userDoc.bio,
            avatarColor: userDoc.avatarColor, avatarUrl: userDoc.avatarUrl || "",
            isVerified: userDoc.isVerified || false, isAdmin: userDoc.isAdmin || false,
            isPrivate: userDoc.isPrivate || false,
            roles: (userDoc.roles || []).map((r) => ({
                id: r._id.toString(), name: r.name, badge: r.badge, color: r.color,
            })),
            followersCount: (userDoc.followers || []).length,
            followingCount: (userDoc.following || []).length,
        } : null;

        const authorData = profile ? {
            avatarUrl: profile.avatarUrl, isVerified: profile.isVerified,
            isAdmin: profile.isAdmin, roles: profile.roles,
        } : null;

        const enrichedPosts = posts.map((p) => ({
            ...p, _author: authorData,
            _originalPost: (p.isRepost && p.originalPostId)
                ? (originalPostsMap[p.originalPostId.toString()] || null) : null,
            comments: (p.comments || []).map((c) => ({
                ...c, _author: c.sender === username ? authorData : null,
            })),
        }));

        return res.json({
            posts: enrichedPosts, totalLikes, postCount: totalPosts, profile, hasMore,
            nextCursor: hasMore && enrichedPosts.length > 0 ? enrichedPosts[enrichedPosts.length - 1].timeStamp : null,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch profile" });
    }
});

module.exports = router;
