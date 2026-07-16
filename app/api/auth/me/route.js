import connectDB from "@/utils/db";
import User from "@/models/user";
import { getSession, signToken } from "@/utils/session";
import { cookies } from "next/headers";

const COOKIE = "af_session";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function GET(request) {
    const debug = new URL(request.url).searchParams.get("debug") === "1";
    try {
        const session = await getSession();
        // Debug: raw cookie value when DEBUG_COOKIES=1
        const rawCookie = process.env.DEBUG_COOKIES === "1" ? (await cookies()).get(COOKIE)?.value ?? null : undefined;
        if (!session?.userId) {
            return Response.json({ user: null, debug: debug ? { session, rawCookie } : undefined });
        }

        await connectDB();
        let user = await User.findById(session.userId).populate("roles");
        if (!user) {
            return Response.json({ user: null, debug: debug ? { session, rawCookie } : undefined });
        }

        if (!user.isAdmin && user.email.toLowerCase() === (process.env.ADMIN_EMAIL || "").toLowerCase().trim()) {
            user.isAdmin = true;
            user.isVerified = true;
            await user.save();
            user = user.toObject();
        }

        const payload = {
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
                bookmarks:   user.bookmarks || [],
                following:   user.following || [],
                followers:   user.followers || [],
                language:    user.language || "en",
                needsSetup: !user.username,
            },
        };

        if (process.env.DEBUG_COOKIES === "1") {
            payload._debugCookie = rawCookie ?? null;
        }

        const response = Response.json(payload);

        if (session.exp) {
            const now = Math.floor(Date.now() / 1000);
            const remaining = session.exp - now;
            if (remaining < MAX_AGE / 2) {
                const newToken = await signToken({ userId: user._id.toString() });
                const isSecure = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
                const secureFlag = isSecure ? "; Secure" : "";
                const sameSite = isSecure ? "None" : "Lax";
                response.headers.set(
                    "Set-Cookie",
                    `${COOKIE}=${newToken}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${MAX_AGE}${secureFlag}`
                );
            }
        }

        return response;
    } catch (error) {
        console.error(error);
        return Response.json({ user: null, debug: debug ? { error: String(error) } : undefined });
    }
}
