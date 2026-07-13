import connectDB from "@/utils/db";
import User from "@/models/user";
import { getSession, signToken } from "@/utils/session";

const COOKIE = "af_session";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

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

        const response = Response.json({
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

        if (session.exp) {
            const now = Math.floor(Date.now() / 1000);
            const remaining = session.exp - now;
            if (remaining < MAX_AGE / 2) {
                const newToken = await signToken({ userId: user._id.toString() });
                response.headers.set(
                    "Set-Cookie",
                    `${COOKIE}=${newToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`
                );
            }
        }

        return response;
    } catch (error) {
        console.error(error);
        return Response.json({ user: null });
    }
}
