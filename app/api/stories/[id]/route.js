import connectDB from "@/utils/db";
import Story from "@/models/story";
import Notification from "@/models/notification";

export async function PATCH(request, { params }) {
    try {
        const { id } = await params;
        const { username, action, text } = await request.json();
        await connectDB();

        const story = await Story.findById(id);
        if (!story) return Response.json({ error: "Not found" }, { status: 404 });

        if (action === "view") {
            if (!story.views.includes(username)) {
                story.views.push(username);
                await story.save();
            }
            return Response.json(story);
        }

        if (action === "reply") {
            story.replies.push({ fromUser: username, text: text || "" });
            await story.save();

            if (story.sender !== username) {
                await Notification.create({
                    recipient: story.sender,
                    type: "message",
                    fromUser: username,
                    fromColor: story.color,
                    postId: story._id.toString(),
                    text: text?.slice(0, 80) || "Replied to your story",
                });
            }

            return Response.json(story);
        }

        return Response.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to update story" }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        const { username } = await request.json();
        await connectDB();

        const story = await Story.findById(id);
        if (!story) return Response.json({ error: "Not found" }, { status: 404 });
        if (story.sender !== username) return Response.json({ error: "Unauthorized" }, { status: 403 });

        await Story.findByIdAndDelete(id);
        return Response.json({ ok: true });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to delete story" }, { status: 500 });
    }
}
