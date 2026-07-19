import { NextResponse } from "next/server";
import connectDB from "@/utils/db";
import User from "@/models/user";
import Role from "@/models/role";
import bcrypt from "bcryptjs";
import { signToken } from "@/utils/session";

const COOKIE = "af_session";
const MAX_AGE = 60 * 60 * 24 * 365;

export async function POST(request) {
    try {
        const { email, pin } = await request.json();
        if (!email || !pin) {
            return NextResponse.json({ error: "Email and PIN required" }, { status: 400 });
        }

        await connectDB();

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !user.pin) {
            return NextResponse.json({ error: "No PIN set for this account" }, { status: 404 });
        }

        const valid = await bcrypt.compare(pin, user.pin);
        if (!valid) {
            return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
        }

        const token = await signToken({ userId: user._id.toString() });
        const needsSetup = !user.username;

        let userData = null;
        if (!needsSetup) {
            await user.populate("roles");
            userData = {
                id:          user._id.toString(),
                email:       user.email,
                username:    user.username,
                bio:         user.bio,
                avatarColor: user.avatarColor,
                avatarUrl:   user.avatarUrl || "",
                isVerified:  user.isVerified || false,
                isAdmin:     user.isAdmin || false,
                roles:       (user.roles || []).filter(Boolean).map((r) => ({
                    id:    r._id?.toString() ?? "",
                    name:  r.name  ?? "",
                    badge: r.badge ?? "",
                    color: r.color ?? "",
                })),
                needsSetup:  false,
            };
        }

        const isSecure = request.url.startsWith("https") || process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
        const response = NextResponse.json({ ok: true, needsSetup, userId: user._id, user: userData });
        response.cookies.set(COOKIE, token, {
            httpOnly: true,
            secure: isSecure,
            sameSite: isSecure ? "none" : "lax",
            maxAge: MAX_AGE,
            path: "/",
        });
        return response;
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Verification failed" }, { status: 500 });
    }
}
