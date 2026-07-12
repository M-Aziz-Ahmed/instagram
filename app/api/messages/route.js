import connectDB from "@/utils/db";
import Message from "@/models/messages";

export async function GET() {
    try {
        await connectDB();
        const messages = await Message.find({}).sort({ timeStamp: 1 }).lean();
        return Response.json(messages);
    } catch (error) {
        return Response.json({ error: "Failed to fetch messages" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { text, sender, color } = await request.json();

        if (!text?.trim())   return Response.json({ error: "Message text is required" }, { status: 400 });
        if (!sender?.trim()) return Response.json({ error: "Sender is required" }, { status: 400 });

        await connectDB();
        const message = await Message.create({
            text:   text.trim(),
            sender: sender.trim(),
            color:  color || "#3b82f6",
        });

        // Broadcast to all SSE listeners
        broadcastMessage(message.toObject());

        return Response.json(message, { status: 201 });
    } catch (error) {
        return Response.json({ error: "Failed to send message" }, { status: 500 });
    }
}

// ─── SSE broadcast registry ──────────────────────────────────────────────────
// Global set of active SSE controllers (survives hot-reload via globalThis)
if (!globalThis._sseClients) globalThis._sseClients = new Set();
const sseClients = globalThis._sseClients;

export function broadcastMessage(message) {
    const data = `data: ${JSON.stringify(message)}\n\n`;
    for (const controller of sseClients) {
        try { controller.enqueue(new TextEncoder().encode(data)); }
        catch { sseClients.delete(controller); }
    }
}
