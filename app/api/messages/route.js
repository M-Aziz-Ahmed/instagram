import connectDB from "@/utils/db";
import Message from "@/models/messages";

export async function GET() {
    try {
        await connectDB();
        const messages = await Message.find({}).sort({ timeStamp: 1 });
        return Response.json(messages);
    } catch (error) {
        return Response.json({ error: "Failed to fetch messages" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { text } = await request.json();

        if (!text || text.trim() === "") {
            return Response.json({ error: "Message text is required" }, { status: 400 });
        }

        await connectDB();
        const message = await Message.create({ text: text.trim() });
        return Response.json(message, { status: 201 });
    } catch (error) {
        return Response.json({ error: "Failed to send message" }, { status: 500 });
    }
}
