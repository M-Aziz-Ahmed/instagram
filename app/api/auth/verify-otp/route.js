import { NextResponse } from "next/server";
import connectDB from "@/utils/db";
import OTP from "@/models/otp";
import User from "@/models/user";
import { signToken } from "@/utils/session";

const COOKIE = "af_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export async function POST(request) {
    try {
        const { email, code } = await request.json();
        if (!email || !code) {
            return NextResponse.json({ error: "Email and code required" }, { status: 400 });
        }

        await connectDB();

        const otp = await OTP.findOne({
            email:     email.toLowerCase(),
            code,
            used:      false,
            expiresAt: { $gt: new Date() },
        });

        if (!otp) {
            return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
        }

        // Mark used
        otp.used = true;
        await otp.save();

        // Find or create user
        let user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            const isAdmin = email.toLowerCase() === (process.env.ADMIN_EMAIL || "").toLowerCase();
            user = await User.create({ email: email.toLowerCase(), isAdmin });
        } else if (!user.isAdmin && email.toLowerCase() === (process.env.ADMIN_EMAIL || "").toLowerCase()) {
            user.isAdmin = true;
            await user.save();
        }

        const token = await signToken({ userId: user._id.toString() });
        const needsSetup = !user.username;

        const response = NextResponse.json({ ok: true, needsSetup, userId: user._id });
        response.cookies.set(COOKIE, token, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge:   MAX_AGE,
            path:     "/",
        });
        return response;
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Verification failed" }, { status: 500 });
    }
}
