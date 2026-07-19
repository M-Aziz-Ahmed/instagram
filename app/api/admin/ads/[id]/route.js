import connectDB from "@/utils/db";
import Ad from "@/models/ad";
import { getSession } from "@/utils/session";
import User from "@/models/user";

async function requireAdmin() {
    const session = await getSession();
    if (!session?.userId) return null;
    const user = await User.findById(session.userId).select("isAdmin").lean();
    if (!user?.isAdmin) return null;
    return session;
}

export async function PATCH(request, { params }) {
    try {
        const session = await requireAdmin();
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const body = await request.json();
        const { title, description, imageUrl, linkUrl, adType, adsterraCode, adsenseSlot, ctaText, startDate, endDate, isActive } = body;

        await connectDB();
        const ad = await Ad.findByIdAndUpdate(id, {
            ...(title !== undefined && { title: title.trim().slice(0, 100) }),
            ...(description !== undefined && { description: description.trim().slice(0, 300) }),
            ...(imageUrl !== undefined && { imageUrl }),
            ...(linkUrl !== undefined && { linkUrl }),
            ...(adType !== undefined && { adType }),
            ...(adsterraCode !== undefined && { adsterraCode }),
            ...(adsenseSlot !== undefined && { adsenseSlot }),
            ...(ctaText !== undefined && { ctaText }),
            ...(startDate !== undefined && { startDate: startDate || null }),
            ...(endDate !== undefined && { endDate: endDate || null }),
            ...(isActive !== undefined && { isActive }),
            updatedAt: new Date(),
        }, { returnDocument: 'after' }).lean();

        if (!ad) return Response.json({ error: "Ad not found" }, { status: 404 });
        return Response.json(ad);
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const session = await requireAdmin();
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        await connectDB();
        await Ad.findByIdAndDelete(id);
        return Response.json({ ok: true });
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}
