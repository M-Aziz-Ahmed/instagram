import connectDB from "@/utils/db";
import Invite from "@/models/invite";

export async function POST(request) {
    try {
        const { code } = await request.json();
        if (!code?.trim()) {
            return Response.json({ error: "Invite code required" }, { status: 400 });
        }

        await connectDB();
        const invite = await Invite.findOne({ code: code.trim().toUpperCase() });

        if (!invite) {
            return Response.json({ error: "Invalid invite code" }, { status: 404 });
        }

        if (!invite.active) {
            return Response.json({ error: "This invite code has been revoked" }, { status: 410 });
        }

        if (invite.expiresAt && invite.expiresAt < new Date()) {
            return Response.json({ error: "This invite code has expired" }, { status: 410 });
        }

        if (invite.useCount >= invite.maxUses) {
            return Response.json({ error: "This invite code has already been used" }, { status: 410 });
        }

        return Response.json({
            valid: true,
            code: invite.code,
            createdBy: invite.createdBy,
        });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to validate invite" }, { status: 500 });
    }
}
