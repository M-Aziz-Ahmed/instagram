import { NextResponse } from "next/server";
import connectDB from "@/utils/db";
import OTP from "@/models/otp";
import User from "@/models/user";
import Role from "@/models/role";
import Invite from "@/models/invite";
import { signToken } from "@/utils/session";

const COOKIE = "af_session";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function POST(request) {
    try {
        const { email, code, inviteCode } = await request.json();
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
        const isNewUser = !user;
        if (!user) {
            const isAdmin = email.toLowerCase() === (process.env.ADMIN_EMAIL || "").toLowerCase();
            user = await User.create({ email: email.toLowerCase(), isAdmin });
        } else if (!user.isAdmin && email.toLowerCase() === (process.env.ADMIN_EMAIL || "").toLowerCase()) {
            user.isAdmin = true;
            await user.save();
        }

        // Handle invite code for new users
        let inviteValid = false;
        let inviterUsername = null;
        if (isNewUser && inviteCode?.trim()) {
            const invite = await Invite.findOne({ code: inviteCode.trim().toUpperCase() });
            if (invite && invite.active && invite.useCount < invite.maxUses
                && (!invite.expiresAt || invite.expiresAt > new Date())) {
                user.referredBy = invite.createdBy;
                inviterUsername = invite.createdBy;
                await user.save();

                invite.useCount += 1;
                if (invite.useCount >= invite.maxUses) {
                    invite.active = false;
                }
                await invite.save();

                // Increment inviter's invite count
                await User.findOneAndUpdate(
                    { username: invite.createdBy },
                    { $inc: { inviteCount: 1 } }
                );
                inviteValid = true;
            }
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
        const secure = isSecure;
        const sameSite = secure ? "none" : "lax";
        const response = NextResponse.json({
            ok: true,
            needsSetup,
            userId: user._id,
            user: userData,
            ...(inviteValid && { invitedBy: inviterUsername }),
        });
        response.cookies.set(COOKIE, token, {
            httpOnly: true,
            secure,
            sameSite,
            maxAge:   MAX_AGE,
            path:     "/",
        });
        return response;
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Verification failed" }, { status: 500 });
    }
}
