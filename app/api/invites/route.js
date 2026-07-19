import connectDB from "@/utils/db";
import Invite from "@/models/invite";
import User from "@/models/user";
import { getSession } from "@/utils/session";

function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.userId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
        }

        await connectDB();
        const user = await User.findById(session.userId).select("username inviteCode inviteCount").lean();
        if (!user?.username) {
            return Response.json({ error: "Complete setup first" }, { status: 400 });
        }

        const invites = await Invite.find({ createdBy: user.username, active: true })
            .sort({ createdAt: -1 })
            .lean();

        return Response.json({
            invites: invites.map((inv) => ({
                code: inv.code,
                useCount: inv.useCount,
                maxUses: inv.maxUses,
                expiresAt: inv.expiresAt,
                createdAt: inv.createdAt,
            })),
            totalInvites: user.inviteCount || 0,
            personalCode: user.inviteCode,
        });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch invites" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const session = await getSession();
        if (!session?.userId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
        }

        const { maxUses = 1, expiresInDays } = await request.json();

        await connectDB();
        const user = await User.findById(session.userId).select("username inviteCode").lean();
        if (!user?.username) {
            return Response.json({ error: "Complete setup first" }, { status: 400 });
        }

        let code = generateCode();
        let attempts = 0;
        while (attempts < 10) {
            const existing = await Invite.findOne({ code });
            if (!existing) break;
            code = generateCode();
            attempts++;
        }

        const expiresAt = expiresInDays
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
            : null;

        const invite = await Invite.create({
            code,
            createdBy: user.username,
            maxUses: Math.min(Math.max(1, maxUses), 100),
            expiresAt,
        });

        return Response.json({
            code: invite.code,
            maxUses: invite.maxUses,
            expiresAt: invite.expiresAt,
            createdAt: invite.createdAt,
        }, { status: 201 });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to create invite" }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const session = await getSession();
        if (!session?.userId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
        }

        const { code } = await request.json();
        if (!code) {
            return Response.json({ error: "Code required" }, { status: 400 });
        }

        await connectDB();
        const user = await User.findById(session.userId).select("username").lean();

        const invite = await Invite.findOne({ code: code.toUpperCase(), createdBy: user?.username });
        if (!invite) {
            return Response.json({ error: "Invite not found" }, { status: 404 });
        }

        invite.active = false;
        await invite.save();

        return Response.json({ ok: true });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to revoke invite" }, { status: 500 });
    }
}
