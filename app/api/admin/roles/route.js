import connectDB from "@/utils/db";
import User from "@/models/user";
import Role from "@/models/role";
import { getSession } from "@/utils/session";

async function requireAdmin() {
    const session = await getSession();
    if (!session?.userId) return null;
    await connectDB();
    const user = await User.findById(session.userId).lean();
    return user?.isAdmin ? user : null;
}

export async function GET() {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });
    const roles = await Role.find({}).sort({ createdAt: -1 }).lean();
    return Response.json(roles.map((r) => ({ id: r._id.toString(), name: r.name, badge: r.badge, color: r.color })));
}

export async function POST(request) {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });
    const { name, badge, color } = await request.json();
    if (!name?.trim()) return Response.json({ error: "Name required" }, { status: 400 });
    const role = await Role.create({ name: name.trim(), badge: badge || "⭐", color: color || "#6b7280" });
    return Response.json({ id: role._id.toString(), name: role.name, badge: role.badge, color: role.color }, { status: 201 });
}

export async function DELETE(request) {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await request.json();
    await Role.findByIdAndDelete(id);
    // Remove from all users
    await User.updateMany({ roles: id }, { $pull: { roles: id } });
    return Response.json({ ok: true });
}
