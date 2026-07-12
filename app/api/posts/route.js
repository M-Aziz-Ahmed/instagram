import connectDB from "@/utils/db";
import Post from "@/models/post";
import { uploadImage } from "@/utils/cloudinary";

export async function GET() {
    try {
        await connectDB();
        const posts = await Post.find({}).sort({ timeStamp: -1 }).lean();
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
        if (imageData) {
            imageUrl = await uploadImage(imageData);
        }

        const post = await Post.create({
            text:     text?.trim() ?? "",
            imageUrl,
            sender:   sender.trim(),
            color:    color || "#3b82f6",
        });

        return Response.json(post, { status: 201 });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to create post" }, { status: 500 });
    }
}
