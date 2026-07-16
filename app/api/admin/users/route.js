import connectDB from "@/utils/db";
import User from "@/models/user";
import { getSession } from "@/utils/session";

async function requireAdmin() {
    const session = await getSession();
    if (!session?.userId) return null;
    await connectDB();
    const user = await User.findById(session.userId).lean();
    return user?.isAdmin ? user : null;
}

// GET /api/admin/users  — list all users
export async function GET() {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

    const users = await User.find({}).populate("roles").sort({ createdAt: -1 }).lean();
    return Response.json(users.map((u) => ({
        id:         u._id.toString(),
        username:   u.username,
        email:      u.email,
        isVerified: u.isVerified || false,
        isAdmin:    u.isAdmin || false,
        liveStreamAllowed: u.liveStreamAllowed || false,
        avatarColor: u.avatarColor,
        avatarUrl:  u.avatarUrl || "",
        roles:      (u.roles || []).map((r) => ({ id: r._id.toString(), name: r.name, badge: r.badge, color: r.color })),
    })));
}

// PATCH /api/admin/users  — update a user (verify, assign roles, make admin)
export async function PATCH(request) {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

    const { userId, isVerified, isAdmin: makeAdmin, liveStreamAllowed, addRole, removeRole } = await request.json();
    if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

    const update = {};
    if (isVerified !== undefined) update.isVerified = isVerified;
    if (makeAdmin !== undefined)  update.isAdmin    = makeAdmin;
    if (liveStreamAllowed !== undefined) update.liveStreamAllowed = liveStreamAllowed;

    const user = await User.findById(userId);
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    if (addRole)    user.roles.addToSet(addRole);
    if (removeRole) user.roles.pull(removeRole);
    Object.assign(user, update);
    await user.save();
    await user.populate("roles");

    return Response.json({ ok: true, user: {
        id: user._id.toString(), username: user.username,
        isVerified: user.isVerified, isAdmin: user.isAdmin,
        roles: user.roles.map((r) => ({ id: r._id.toString(), name: r.name, badge: r.badge, color: r.color })),
    }});
}
