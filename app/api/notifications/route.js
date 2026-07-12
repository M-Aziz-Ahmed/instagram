import connectDB from "@/utils/db";
import Notification from "@/models/notification";

// GET /api/notifications?username=X  — fetch latest 30 for user
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const username = searchParams.get("username");
        if (!username) return Response.json({ error: "Username required" }, { status: 400 });

        await connectDB();
        const notifs = await Notification.find({ recipient: username })
            .sort({ createdAt: -1 })
            .limit(30)
            .lean();

        return Response.json(notifs);
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch notifications" }, { status: 500 });
    }
}

// PATCH /api/notifications  — mark all read for user
export async function PATCH(request) {
    try {
        const { username } = await request.json();
        if (!username) return Response.json({ error: "Username required" }, { status: 400 });

        await connectDB();
        await Notification.updateMany({ recipient: username, read: false }, { read: true });
        return Response.json({ ok: true });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to mark read" }, { status: 500 });
    }
}
