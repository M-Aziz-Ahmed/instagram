import connectDB from "@/utils/db";
import User from "@/models/user";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const usernames = searchParams.get("usernames");

        if (!usernames) {
            return Response.json({ error: "usernames parameter required (comma-separated)" }, { status: 400 });
        }

        const list = usernames.split(",").map((u) => u.trim()).filter(Boolean).slice(0, 50);
        if (list.length === 0) {
            return Response.json({ users: {} });
        }

        await connectDB();

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        const users = await User.find({ username: { $in: list } })
            .select("username lastActive isOnline")
            .lean()
            .maxTimeMS(5000);

        const result = {};
        for (const u of users) {
            result[u.username] = {
                isOnline: u.isOnline && new Date(u.lastActive) > fiveMinutesAgo,
                lastActive: u.lastActive,
            };
        }

        return Response.json({ users: result });
    } catch (error) {
        console.error("Failed to get online statuses:", error);
        return Response.json({ error: "Failed to get online statuses" }, { status: 500 });
    }
}
