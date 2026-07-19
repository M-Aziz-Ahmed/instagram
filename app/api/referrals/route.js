import connectDB from "@/utils/db";
import User from "@/models/user";
import Invite from "@/models/invite";
import { getSession } from "@/utils/session";

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.userId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
        }

        await connectDB();
        const user = await User.findById(session.userId).select("username inviteCount referredBy").lean();
        if (!user?.username) {
            return Response.json({ error: "Complete setup first" }, { status: 400 });
        }

        const referredUsers = await User.find({ referredBy: user.username })
            .select("username avatarUrl createdAt")
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        const totalInvites = await Invite.countDocuments({ createdBy: user.username, active: false, useCount: { $gt: 0 } });
        const activeInvites = await Invite.countDocuments({ createdBy: user.username, active: true });

        return Response.json({
            totalInvited: user.inviteCount || 0,
            referredUsers: referredUsers.map((u) => ({
                username: u.username,
                avatarUrl: u.avatarUrl || "",
                joinedAt: u.createdAt,
            })),
            stats: {
                totalCodesCreated: totalInvites + activeInvites,
                activeCodes: activeInvites,
                usedCodes: totalInvites,
            },
            referredBy: user.referredBy || null,
        });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch referral stats" }, { status: 500 });
    }
}
