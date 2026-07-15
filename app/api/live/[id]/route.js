import connectDB from "@/utils/db";
import LiveStream from "@/models/liveStream";

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const action = searchParams.get("action");

        await connectDB();
        const stream = await LiveStream.findById(id).lean();
        if (!stream) {
            return Response.json({ error: "Stream not found" }, { status: 404 });
        }

        if (action === "chat") {
            const since = searchParams.get("since");
            const sinceDate = since ? new Date(since) : new Date(0);
            const messages = stream.chat.filter((m) => new Date(m.createdAt) > sinceDate);
            return Response.json({ messages });
        }

        return Response.json(stream);
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch stream" }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    try {
        const { id } = await params;
        const { username, action, to, type, data, since, text, color, avatarUrl } = await request.json();

        await connectDB();
        const stream = await LiveStream.findById(id);
        if (!stream) {
            return Response.json({ error: "Stream not found" }, { status: 404 });
        }

        if (action === "join") {
            if (!stream.viewers.includes(username)) {
                stream.viewers.push(username);
                if (stream.viewers.length > stream.maxViewers) {
                    stream.maxViewers = stream.viewers.length;
                }
                await stream.save();
            }
            return Response.json({ ok: true, viewers: stream.viewers.length });
        }

        if (action === "leave") {
            stream.viewers = stream.viewers.filter((v) => v !== username);
            await stream.save();
            return Response.json({ ok: true, viewers: stream.viewers.length });
        }

        if (action === "signal") {
            stream.signals.push({ from: username, to: to || "", type, data });
            await stream.save();
            return Response.json({ ok: true });
        }

        if (action === "poll") {
            const sinceDate = since ? new Date(since) : new Date(0);
            const mySignals = stream.signals.filter(
                (s) => (s.to === username || s.to === "") && new Date(s.createdAt) > sinceDate
            );
            return Response.json({ signals: mySignals, viewers: stream.viewers.length });
        }

        if (action === "chat") {
            if (!text?.trim()) {
                return Response.json({ error: "Empty message" }, { status: 400 });
            }
            const msg = { username, color: color || "#3b82f6", avatarUrl: avatarUrl || "", text: text.trim() };
            stream.chat.push(msg);
            if (stream.chat.length > 200) {
                stream.chat = stream.chat.slice(-200);
            }
            await stream.save();
            return Response.json({ ok: true, message: msg });
        }

        return Response.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        const { username } = await request.json();

        await connectDB();
        const stream = await LiveStream.findById(id);
        if (!stream) {
            return Response.json({ error: "Stream not found" }, { status: 404 });
        }
        if (stream.host !== username) {
            return Response.json({ error: "Unauthorized" }, { status: 403 });
        }

        stream.status = "ended";
        stream.endedAt = new Date();
        await stream.save();

        return Response.json({ ok: true });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to end stream" }, { status: 500 });
    }
}
