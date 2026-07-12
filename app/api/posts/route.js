import connectDB from "@/utils/db";
import Post from "@/models/post";
import Notification from "@/models/notification";
import { uploadImage } from "@/utils/cloudinary";
import { extractHashtags, extractMentions } from "@/utils/parseText";

export async function GET(request) {
    try {
        await connectDB();
        const { searchParams } = new URL(request.url);
        const tag = searchParams.get("tag");

        const query = tag ? { hashtags: tag.toLowerCase() } : {};
        const posts = await Post.find(query).sort({ timeStamp: -1 }).lean();
        return Response.json(posts);
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch posts" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { text, imageData, sender, color } = await request.json();

        if (!sender?.trim()) {
            return Response.json({ error: "Sender is required" }, { status: 400 });
        }
        if (!text?.trim() && !imageData) {
            return Response.json({ error: "Post must have text or an image" }, { status: 400 });
        }

        await connectDB();

        let imageUrl = "";
        if (imageData) imageUrl = await uploadImage(imageData);

        const hashtags = extractHashtags(text ?? "");
        const mentions  = extractMentions(text ?? "", sender);

        const post = await Post.create({
            text:     text?.trim() ?? "",
            imageUrl,
            sender:   sender.trim(),
            color:    color || "#3b82f6",
            hashtags,
        });

        // Notify @mentioned users
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
