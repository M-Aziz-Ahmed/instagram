import connectDB from "@/utils/db";
import User from "@/models/user";

export async function POST(request, { params }) {
    try {
        const { username } = await params;
        await connectDB();
        await User.updateOne(
            { username },
            { $set: { lastActive: new Date() } }
        );
        return Response.json({ ok: true });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}

export async function GET(request, { params }) {
    try {
        const { username } = await params;
        await connectDB();
        const user = await User.findOne({ username }).select("lastActive").lean();
        if (!user) return Response.json({ error: "Not found" }, { status: 404 });
        const threshold = new Date(Date.now() - 5 * 60 * 1000);
        const isOnline = user.lastActive && user.lastActive > threshold;
        return Response.json({ isOnline, lastActive: user.lastActive });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}
