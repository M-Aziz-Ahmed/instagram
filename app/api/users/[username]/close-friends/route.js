import connectDB from "@/utils/db";
import User from "@/models/user";

export async function GET(request, { params }) {
    try {
        const { username } = await params;
        await connectDB();
        const user = await User.findOne({ username }).select("closeFriends").lean();
        if (!user) return Response.json({ error: "Not found" }, { status: 404 });
        return Response.json({ closeFriends: user.closeFriends || [] });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}

export async function PATCH(request, { params }) {
    try {
        const { username } = await params;
        const { targetUsername, action } = await request.json();
        await connectDB();

        const user = await User.findOne({ username });
        if (!user) return Response.json({ error: "Not found" }, { status: 404 });

        if (action === "add") {
            if (!user.closeFriends.includes(targetUsername)) {
                user.closeFriends.push(targetUsername);
            }
        } else if (action === "remove") {
            user.closeFriends = user.closeFriends.filter((u) => u !== targetUsername);
        } else {
            return Response.json({ error: "Invalid action" }, { status: 400 });
        }

        await user.save();
        return Response.json({ closeFriends: user.closeFriends });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}