import connectDB from "@/utils/db";
import Message from "@/models/messages";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const username = searchParams.get("username");
        if (!username) return Response.json({ error: "Username required" }, { status: 400 });

        await connectDB();
        const result = await Message.aggregate([
            { $match: { recipient: username, isRead: false } },
            { $count: "total" },
        ]);

        return Response.json({ total: result[0]?.total || 0 });
    } catch (error) {
        console.error(error);
        return Response.json({ total: 0 });
    }
}
