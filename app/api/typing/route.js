import connectDB from "@/utils/db";
import Typing from "@/models/typing";

export async function POST(request) {
    try {
        const { username, typingTo } = await request.json();
        await connectDB();

        if (typingTo) {
            await Typing.findOneAndUpdate(
                { username },
                { typingTo, updatedAt: new Date() },
                { upsert: true, new: true }
            );
        } else {
            await Typing.deleteOne({ username });
        }
        return Response.json({ ok: true });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const username = searchParams.get("username");
        if (!username) return Response.json({ error: "username required" }, { status: 400 });

        await connectDB();
        // Find who is typing TO this username (not what this username is typing to)
        const typing = await Typing.findOne({ typingTo: username }).lean();
        return Response.json({ typingTo: typing?.username || "" });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}
