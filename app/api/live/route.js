import connectDB from "@/utils/db";
import LiveStream from "@/models/liveStream";

export async function POST(request) {
    try {
        const { username, title } = await request.json();
        if (!username) {
            return Response.json({ error: "Username required" }, { status: 400 });
        }

        await connectDB();

        const existing = await LiveStream.findOne({ host: username, status: "live" });
        if (existing) {
            return Response.json({ streamId: existing._id, message: "Already live" });
        }

        const stream = await LiveStream.create({
            host: username,
            title: title || "",
            status: "live",
        });

        return Response.json({ streamId: stream._id, title: stream.title });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to start stream" }, { status: 500 });
    }
}

export async function GET() {
    try {
        await connectDB();
        const streams = await LiveStream.find({ status: "live" })
            .sort({ startedAt: -1 })
            .limit(20)
            .lean();
        return Response.json({ streams });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch streams" }, { status: 500 });
    }
}
