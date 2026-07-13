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

        const query = tag ? { hashtags: tag.toLowerCase() } : {};
        let posts = await Post.find(query).sort({ timeStamp: -1 }).lean();
        posts = await enrichPosts(posts);
        return Response.json(posts);
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch posts" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { text, imageUrl: providedUrl, imageData, sender, color } = await request.json();

        if (!sender?.trim()) {
            return Response.json({ error: "Sender is required" }, { status: 400 });
        }
        if (!text?.trim() && !providedUrl && !imageData) {
            return Response.json({ error: "Post must have text or an image" }, { status: 400 });
        }

        await connectDB();

        let imageUrl = providedUrl ?? "";
        if (!imageUrl && imageData) {
            imageUrl = await uploadImage(imageData);
        }

        const hashtags = extractHashtags(text ?? "");
        const mentions  = extractMentions(text ?? "", sender);

        const user = await User.findOne({ username: sender }).select("avatarUrl").lean();

        const post = await Post.create({
            text:     text?.trim() ?? "",
            imageUrl,
            sender:   sender.trim(),
            color:    color || "#3b82f6",
            avatarUrl: user?.avatarUrl || "",
            hashtags,
            mentions,
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
        return Response.json({ error: "Failed to create post" }, { status: 500 });
    }
}
