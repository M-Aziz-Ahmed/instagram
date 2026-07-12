import connectDB from "@/utils/db";
import User from "@/models/user";
import { getSession } from "@/utils/session";

export async function PATCH(request) {
    try {
        const session = await getSession();
        if (!session?.userId) return Response.json({ error: "Not authenticated" }, { status: 401 });

        const { bio, avatarColor } = await request.json();
        await connectDB();

        const user = await User.findByIdAndUpdate(
            session.userId,
            { bio: bio?.trim() ?? "", avatarColor: avatarColor || "#3b82f6" },
            { new: true }
        );

        return Response.json({
            user: {
                id: user._id.toString(), email: user.email,
                username: user.username, bio: user.bio,
                avatarColor: user.avatarColor, needsSetup: false,
            },
        });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to update profile" }, { status: 500 });
    }
}
