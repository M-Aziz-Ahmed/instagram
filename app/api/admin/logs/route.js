import { getSession } from "@/utils/session";
import connectDB from "@/utils/db";
import User from "@/models/user";
import { getLogs } from "@/utils/logBuffer";

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

    const logs = getLogs({ level, since, limit: parseInt(limit) || 200 });
    return Response.json(logs);
}
