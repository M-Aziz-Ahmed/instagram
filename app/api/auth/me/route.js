import connectDB from "@/utils/db";
import User from "@/models/user";
import { getSession } from "@/utils/session";

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.userId) return Response.json({ user: null });

        await connectDB();
        let user = await User.findById(session.userId).populate("roles");
        if (!user) return Response.json({ user: null });

        if (!user.isAdmin && user.email.toLowerCase() === (process.env.ADMIN_EMAIL || "").toLowerCase().trim()) {
            user.isAdmin = true;
            await user.save();
            user = user.toObject();
        }

        return Response.json({
            user: {
                id:          user._id.toString(),
                email:       user.email,
                username:    user.username,
                bio:         user.bio,
                avatarColor: user.avatarColor,
                avatarUrl:   user.avatarUrl || "",
                isVerified:  user.isVerified || false,
                isAdmin:     user.isAdmin || false,
                roles:       (user.roles || []).map((r) => ({
                    id:    r._id.toString(),
                    name:  r.name,
                    badge: r.badge,
                    color: r.color,
                })),
                needsSetup: !user.username,
            },
        });
    } catch (error) {
        console.error(error);
        return Response.json({ user: null });
    }
}
