import connectDB from "@/utils/db";
import OTP from "@/models/otp";
import User from "@/models/user";
import { setSessionCookie } from "@/utils/session";

export async function POST(request) {
    try {
        const { email, code } = await request.json();
        if (!email || !code) {
            return Response.json({ error: "Email and code required" }, { status: 400 });
        }

        await connectDB();

        const otp = await OTP.findOne({
            email:     email.toLowerCase(),
            code,
            used:      false,
            expiresAt: { $gt: new Date() },
        });

        if (!otp) {
            return Response.json({ error: "Invalid or expired code" }, { status: 401 });
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

        await setSessionCookie(user._id.toString());

        // Tell client whether they need to complete setup
        const needsSetup = !user.username;
        return Response.json({ ok: true, needsSetup, userId: user._id });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Verification failed" }, { status: 500 });
    }
}
