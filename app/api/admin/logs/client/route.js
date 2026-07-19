import { getSession } from "@/utils/session";
import connectDB from "@/utils/db";
import User from "@/models/user";
import { getClientLogs, pushClientLog } from "@/utils/clientLogBuffer";

export async function GET(req) {
    const session = await getSession();
    if (!session?.userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const user = await User.findById(session.userId).lean();
    if (!user?.isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const level = searchParams.get("level");
    const since = searchParams.get("since");
    const limit = searchParams.get("limit");

    const logs = getClientLogs({ level, since, limit: parseInt(limit) || 200 });
    return Response.json(logs);
}

export async function POST(req) {
    const session = await getSession();
    if (!session?.userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const entries = Array.isArray(body) ? body : [body];

        for (const entry of entries) {
            const level = ["info", "warn", "error"].includes(entry.level) ? entry.level : "info";
            const msg = typeof entry.msg === "string" ? entry.msg : "";
            const meta = entry.meta || undefined;
            pushClientLog(level, msg, meta);
        }

        return Response.json({ ok: true });
    } catch {
        return Response.json({ error: "Invalid payload" }, { status: 400 });
    }
}
