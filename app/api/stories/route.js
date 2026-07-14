import connectDB from "@/utils/db";
import Story from "@/models/story";
import User from "@/models/user";
import { uploadImage } from "@/utils/cloudinary";

export async function GET(request) {
    try {
        await connectDB();
        const { searchParams } = new URL(request.url);
        const username = searchParams.get("username");

        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        let query = { createdAt: { $gt: cutoff } };

        if (username) {
            const user = await User.findOne({ username }).select("following").lean();
            const visibleUsernames = [username, ...((user?.following) || [])];
            query.sender = { $in: visibleUsernames };
        }

        const stories = await Story.find(query)
            .sort({ createdAt: -1 })
            .lean();

        // Group by sender, latest first
        const grouped = {};
        stories.forEach((s) => {
            if (!grouped[s.sender]) grouped[s.sender] = [];
            grouped[s.sender].push(s);
        });

        // Sort groups: unseen first, then by latest story
        const result = Object.entries(grouped)
            .map(([sender, items]) => ({
                sender,
                color: items[0].color,
                avatarUrl: items[0].avatarUrl,
                stories: items,
                seen: username ? items.every((s) => s.views?.includes(username)) : false,
                latestAt: items[0].createdAt,
            }))
            .sort((a, b) => {
                if (a.seen !== b.seen) return a.seen ? 1 : -1;
                return new Date(b.latestAt) - new Date(a.latestAt);
            });

        return Response.json(result);
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch stories" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { text, imageData, imageUrl: providedUrl, sender, color, bgColor } = await request.json();
        if (!sender) return Response.json({ error: "Sender required" }, { status: 400 });
        if (!text?.trim() && !providedUrl && !imageData) {
            return Response.json({ error: "Story must have text or image" }, { status: 400 });
        }

        await connectDB();

        let imageUrl = providedUrl ?? "";
        if (!imageUrl && imageData) {
            imageUrl = await uploadImage(imageData);
        }

        const user = await User.findOne({ username: sender }).select("avatarUrl").lean();

        const story = await Story.create({
            sender,
            color: color || "#3b82f6",
            avatarUrl: user?.avatarUrl || "",
            imageUrl,
            text: text?.trim() ?? "",
            bgColor: bgColor || "#1a1a2e",
        });

        return Response.json(story, { status: 201 });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to create story" }, { status: 500 });
    }
}
