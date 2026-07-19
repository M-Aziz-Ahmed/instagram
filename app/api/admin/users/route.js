import connectDB from "@/utils/db";
import User from "@/models/user";
import { getSession } from "@/utils/session";
import bcrypt from "bcryptjs";

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
        hasPin:     !!u.pin,
        isVerified: u.isVerified || false,
        isAdmin:    u.isAdmin || false,
        liveStreamAllowed: u.liveStreamAllowed || false,
        voiceChatBanned: u.voiceChatBanned || false,
        voiceChatBannedUntil: u.voiceChatBannedUntil || null,
        voiceChatBannedReason: u.voiceChatBannedReason || "",
        avatarColor: u.avatarColor,
        avatarUrl:  u.avatarUrl || "",
        roles:      (u.roles || []).map((r) => ({ id: r._id.toString(), name: r.name, badge: r.badge, color: r.color })),
    })));
}

// POST /api/admin/users — create a new user with email + PIN
export async function POST(request) {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

    const { email, pin, username } = await request.json();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return Response.json({ error: "Valid email required" }, { status: 400 });
    }
    if (!pin || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
        return Response.json({ error: "PIN must be 4-8 digits" }, { status: 400 });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
        return Response.json({ error: "Email already registered" }, { status: 409 });
    }

    const hashedPin = await bcrypt.hash(pin, 10);
    const user = await User.create({
        email: email.toLowerCase(),
        username: username?.trim() || "",
        pin: hashedPin,
    });

    return Response.json({ ok: true, user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        hasPin: true,
    }});
}

// PATCH /api/admin/users  — update a user (verify, assign roles, make admin)
export async function PATCH(request) {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

    const { userId, isVerified, isAdmin: makeAdmin, liveStreamAllowed, voiceChatBanned, voiceChatBannedUntil, voiceChatBannedReason, addRole, removeRole } = await request.json();
    if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

    const update = {};
    if (isVerified !== undefined) update.isVerified = isVerified;
    if (makeAdmin !== undefined)  update.isAdmin    = makeAdmin;
    if (liveStreamAllowed !== undefined) update.liveStreamAllowed = liveStreamAllowed;
    if (voiceChatBanned !== undefined) update.voiceChatBanned = voiceChatBanned;
    if (voiceChatBannedUntil !== undefined) update.voiceChatBannedUntil = voiceChatBannedUntil;
    if (voiceChatBannedReason !== undefined) update.voiceChatBannedReason = voiceChatBannedReason;

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
