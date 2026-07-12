import connectDB from "@/utils/db";
import User from "@/models/user";
import { getSession } from "@/utils/session";

export async function POST(request) {
    try {
        const session = await getSession();
        if (!session?.userId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
        }

        const { username, bio, avatarColor } = await request.json();

        if (!username?.trim()) {
            return Response.json({ error: "Username required" }, { status: 400 });
        }
        if (username.trim().length < 2 || username.trim().length > 30) {
            return Response.json({ error: "Username must be 2–30 characters" }, { status: 400 });
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
            return Response.json({ error: "Username can only contain letters, numbers and underscores" }, { status: 400 });
        }

        await connectDB();

        // Check uniqueness (case-insensitive)
        const existing = await User.findOne({
            username: { $regex: `^${username.trim()}$`, $options: "i" },
            _id: { $ne: session.userId },
        });
        if (existing) {
            return Response.json({ error: "Username already taken" }, { status: 409 });
        }

        const user = await User.findByIdAndUpdate(
            session.userId,
            {
                username:    username.trim(),
                bio:         bio?.trim() ?? "",
                avatarColor: avatarColor || "#3b82f6",
            },
            { new: true }
        );

        return Response.json({
            user: {
                id:          user._id.toString(),
                email:       user.email,
                username:    user.username,
                bio:         user.bio,
                avatarColor: user.avatarColor,
                needsSetup:  false,
            },
        });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Setup failed" }, { status: 500 });
    }
}
