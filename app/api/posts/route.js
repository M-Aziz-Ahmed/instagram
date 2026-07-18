import connectDB from "@/utils/db";
import Post from "@/models/post";
import User from "@/models/user";
import Notification from "@/models/notification";
import { uploadImage } from "@/utils/cloudinary";
import { extractHashtags, extractMentions } from "@/utils/parseText";
import { translateBatch } from "@/utils/translate";

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

export async function GET(request) {
    try {
        await connectDB();
        const { searchParams } = new URL(request.url);
        const tag = searchParams.get("tag");
        const feed = searchParams.get("feed");
        const username = searchParams.get("username");
        const lang = searchParams.get("lang");
        const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);
        const before = searchParams.get("before");

        let viewer = null;
        if (username) {
            viewer = await User.findOne({ username }).select("mutedWords closeFriends").lean();
        }

        const pipeline = [];
        const matchStage = {};

        // Filter out expired posts and closed polls
        matchStage.$or = [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } },
        ];

        if (tag) {
            matchStage.hashtags = tag.toLowerCase();
        }
        if (feed === "following" && username) {
            if (viewer?.following?.length) {
                matchStage.sender = { $in: viewer.following };
            } else {
                return Response.json({ posts: [], hasMore: false });
            }
        }
        if (before) {
            matchStage.timeStamp = { $lt: new Date(before) };
        }

        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage });
        }

        if (username && viewer?.mutedWords?.length) {
            const mutedList = viewer.mutedWords.map((w) => w.toLowerCase());
            const escapedWords = mutedList.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
            const wordPattern = escapedWords.join("|");
            const wordRegex = `\\b(${wordPattern})\\b`;

            pipeline.push({
                $match: {
                    $expr: {
                        $and: [
                            {
                                $not: {
                                    $regexMatch: {
                                        input: { $toLower: "$text" },
                                        regex: wordPattern,
                                    },
                                },
                            },
                            {
                                $eq: [
                                    {
                                        $size: {
                                            $filter: {
                                                input: { $map: { input: "$hashtags", as: "h", in: { $toLower: "$$h" } } },
                                                cond: { $in: ["$$this", mutedList] },
                                            },
                                        },
                                    },
                                    0,
                                ],
                            },
                        ],
                    },
                },
            });
        }

        if (username && viewer) {
            pipeline.push({
                $match: {
                    $expr: {
                        $or: [
                            { $ne: ["$visibility", "closeFriends"] },
                            { $in: ["$sender", viewer.closeFriends || []] },
                            { $eq: ["$sender", username] },
                        ],
                    },
                },
            });
        }

        pipeline.push({ $sort: { timeStamp: -1 } });
        pipeline.push({ $limit: limit + 1 });

        // Lookup original post for reposts
        pipeline.push({
            $lookup: {
                from: "posts",
                localField: "originalPostId",
                foreignField: "_id",
                as: "_originalPost",
            },
        });
        pipeline.push({
            $addFields: {
                _originalPost: { $first: "$_originalPost" },
            },
        });

        const rawPosts = await Post.aggregate(pipeline).allowDiskUse(true);

        const hasMore = rawPosts.length > limit;
        const sliced = hasMore ? rawPosts.slice(0, limit) : rawPosts;

        const posts = await enrichPosts(sliced);

        const result = { posts, hasMore };

        if (lang && username) {
            const itemsToTranslate = posts
                .filter((p) => p.text && p.sender !== username)
                .map((p) => ({ id: p._id, text: p.text }));

            if (itemsToTranslate.length > 0) {
                const translations = await translateBatch(itemsToTranslate, lang);
                if (Object.keys(translations).length > 0) {
                    result.translations = translations;
                }
            }
        }

        return Response.json(result);
    } catch (error) {
        console.error(error);
        const includeDetails = process.env.DEBUG_ERRORS === "1";
        return Response.json(
            includeDetails ? { error: "Failed to fetch posts", details: error.message } : { error: "Failed to fetch posts" },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const { text, imageUrl: providedUrl, imageData, audioUrl, sender, color, visibility, poll, expiresIn } = await request.json();

        if (!sender?.trim()) {
            return Response.json({ error: "Sender is required" }, { status: 400 });
        }
        
        // Sanitize and validate text input
        const sanitizedText = text?.trim() || "";
        if (sanitizedText.length > 1000) {
            return Response.json({ error: "Text exceeds maximum length of 1000 characters" }, { status: 400 });
        }
        
        if (!sanitizedText && !providedUrl && !imageData && !audioUrl) {
            return Response.json({ error: "Post must have text, an image, or audio" }, { status: 400 });
        }

        await connectDB();

        let imageUrl = providedUrl ?? "";
        if (!imageUrl && imageData) {
            try {
                imageUrl = await uploadImage(imageData);
            } catch (uploadError) {
                console.error("Image upload failed:", uploadError);
                return Response.json({ error: "Failed to upload image" }, { status: 500 });
            }
        }

        const hashtags = extractHashtags(sanitizedText);
        const mentions  = extractMentions(sanitizedText, sender);

        const user = await User.findOne({ username: sender }).select("avatarUrl").lean();

        const post = await Post.create({
            text:     sanitizedText,
            imageUrl,
            audioUrl: audioUrl || "",
            sender:   sender.trim(),
            color:    color || "#3b82f6",
            avatarUrl: user?.avatarUrl || "",
            hashtags,
            mentions,
            visibility: visibility || "public",
            ...(poll?.enabled && poll.options?.length >= 2 ? {
                poll: {
                    enabled: true,
                    options: poll.options.map((o) => ({ text: o.text.trim().slice(0, 100), votes: [] })),
                    expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : null,
                },
            } : {}),
            ...(expiresIn && !poll?.enabled ? { expiresAt: new Date(Date.now() + expiresIn) } : {}),
        });

        if (mentions.length > 0) {
            const notifs = mentions.map((recipient) => ({
                recipient,
                type:      "mention",
                fromUser:  sender,
                fromColor: color || "#3b82f6",
                postId:    post._id.toString(),
                text:      text?.trim() ?? "",
                postText:  text?.trim()?.slice(0, 120) ?? "",
                postImageUrl: "",
            }));
            await Notification.insertMany(notifs);
        }

        return Response.json(post, { status: 201 });
    } catch (error) {
        console.error(error);
        const includeDetails = process.env.DEBUG_ERRORS === "1";
        return Response.json(
            includeDetails ? { error: "Failed to create post", details: error.message } : { error: "Failed to create post" },
            { status: 500 }
        );
    }
}
