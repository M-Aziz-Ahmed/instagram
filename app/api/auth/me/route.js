import connectDB from "@/utils/db";
import User from "@/models/user";
import { getSession } from "@/utils/session";

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.userId) {
            return Response.json({ user: null });
        }

        await connectDB();
        const user = await User.findById(session.userId).lean();
        if (!user) return Response.json({ user: null });

        return Response.json({
            user: {
                id:          user._id.toString(),
                email:       user.email,
                username:    user.username,
                bio:         user.bio,
                avatarColor: user.avatarColor,
                needsSetup:  !user.username,
            },
        });
    } catch (error) {
        console.error(error);
        return Response.json({ user: null });
    }
}
