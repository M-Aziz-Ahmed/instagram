import connectDB from "@/utils/db";
import Ad from "@/models/ad";
import { getSession } from "@/utils/session";
import User from "@/models/user";

async function requireAdmin(request) {
    const session = await getSession();
    if (!session?.userId) return null;
    const user = await User.findById(session.userId).select("isAdmin").lean();
    if (!user?.isAdmin) return null;
    return session;
}

export async function GET(request) {
    try {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

        await connectDB();
        const ads = await Ad.find({}).sort({ createdAt: -1 }).lean();
        return Response.json(ads);
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const { title, description, imageUrl, linkUrl, adType, adsterraCode, adsenseSlot, ctaText, startDate, endDate, isActive } = body;

        if (!title?.trim()) return Response.json({ error: "Title required" }, { status: 400 });

        await connectDB();
        const ad = await Ad.create({
            title: title.trim().slice(0, 100),
            description: (description || "").trim().slice(0, 300),
            imageUrl: imageUrl || "",
            linkUrl: linkUrl || "",
            adType: adType || "custom",
            adsterraCode: adsterraCode || "",
            adsenseSlot: adsenseSlot || "",
            ctaText: ctaText || "Learn More",
            startDate: startDate || null,
            endDate: endDate || null,
            isActive: isActive !== false,
            createdBy: "admin",
        });

        return Response.json(ad, { status: 201 });
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Failed to create ad" }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const { id, ...updates } = body;
        if (!id) return Response.json({ error: "id required" }, { status: 400 });

        await connectDB();
        const ad = await Ad.findByIdAndUpdate(id, { ...updates, updatedAt: new Date() }, { new: true }).lean();
        if (!ad) return Response.json({ error: "Ad not found" }, { status: 404 });
        return Response.json(ad);
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        if (!id) return Response.json({ error: "id required" }, { status: 400 });

        await connectDB();
        await Ad.findByIdAndDelete(id);
        return Response.json({ ok: true });
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}
