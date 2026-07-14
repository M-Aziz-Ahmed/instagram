import connectDB from "@/utils/db";
import User from "@/models/user";

export async function GET(request, { params }) {
    try {
        const { username } = await params;
        await connectDB();
        const user = await User.findOne({ username }).select("mutedWords").lean();
        if (!user) return Response.json({ error: "Not found" }, { status: 404 });
        return Response.json({ mutedWords: user.mutedWords || [] });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}

export async function PATCH(request, { params }) {
    try {
        const { username } = await params;
        const { word, action } = await request.json();
        await connectDB();

        const user = await User.findOne({ username });
        if (!user) return Response.json({ error: "Not found" }, { status: 404 });

        const normalized = word.toLowerCase().replace(/^#/, "").trim();
        if (!normalized) return Response.json({ error: "Word required" }, { status: 400 });

        if (action === "add") {
            if (!user.mutedWords.includes(normalized)) {
                user.mutedWords.push(normalized);
            }
        } else if (action === "remove") {
            user.mutedWords = user.mutedWords.filter((w) => w !== normalized);
        } else {
            return Response.json({ error: "Invalid action" }, { status: 400 });
        }

        await user.save();
        return Response.json({ mutedWords: user.mutedWords });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}
