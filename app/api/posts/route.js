import connectDB from "@/utils/db";
import Post from "@/models/post";
import User from "@/models/user";
import Notification from "@/models/notification";
import { uploadImage } from "@/utils/cloudinary";
import { extractHashtags, extractMentions } from "@/utils/parseText";

async function enrichPosts(posts) {
    const allUsernames = new Set();
    posts.forEach((p) => {
        allUsernames.add(p.sender);
        (p.comments || []).forEach((c) => allUsernames.add(c.sender));
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
        const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);
        const before = searchParams.get("before");

        let query = {};

        if (tag) {
            query.hashtags = tag.toLowerCase();
        }

        if (feed === "following" && username) {
            const user = await User.findOne({ username }).select("following").lean();
            if (user?.following?.length) {
                query.sender = { $in: user.following };
            } else {
                return Response.json({ posts: [], hasMore: false });
            }
        }

        if (before) {
            query.timeStamp = { $lt: new Date(before) };
        }

        let posts = await Post.find(query)
            .sort({ timeStamp: -1 })
            .limit(limit + 50)
            .lean();

        if (username) {
            const viewer = await User.findOne({ username }).select("mutedWords closeFriends").lean();
            const muted = new Set((viewer?.mutedWords || []).map((w) => w.toLowerCase()));

            posts = posts.filter((p) => {
                const words = (p.text || "").toLowerCase().split(/\s+/);
                const tags = (p.hashtags || []).map((t) => t.toLowerCase());
                if ([...words, ...tags].some((w) => muted.has(w))) return false;
                if (p.visibility === "closeFriends") {
                    return viewer?.closeFriends?.includes(p.sender) || p.sender === username;
                }
                return true;
            });
        }

        const hasMore = posts.length > limit;
        const sliced = hasMore ? posts.slice(0, limit) : posts;
        const enriched = await enrichPosts(sliced);

        return Response.json({ posts: enriched, hasMore });
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
        const { text, imageUrl: providedUrl, imageData, sender, color, visibility } = await request.json();

        if (!sender?.trim()) {
            return Response.json({ error: "Sender is required" }, { status: 400 });
        }
        
        // Sanitize and validate text input
        const sanitizedText = text?.trim() || "";
        if (sanitizedText.length > 1000) {
            return Response.json({ error: "Text exceeds maximum length of 1000 characters" }, { status: 400 });
        }
        
        if (!sanitizedText && !providedUrl && !imageData) {
            return Response.json({ error: "Post must have text or an image" }, { status: 400 });
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
            sender:   sender.trim(),
            color:    color || "#3b82f6",
            avatarUrl: user?.avatarUrl || "",
            hashtags,
            mentions,
            visibility: visibility || "public",
        });

        if (mentions.length > 0) {
            const notifs = mentions.map((recipient) => ({
                recipient,
                type:      "mention",
                fromUser:  sender,
                fromColor: color || "#3b82f6",
                postId:    post._id.toString(),
                text:      text?.trim() ?? "",
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
