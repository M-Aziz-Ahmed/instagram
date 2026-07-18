import connectDB from "@/utils/db";
import Ad from "@/models/ad";

export async function GET(request) {
    try {
        await connectDB();
        const { searchParams } = new URL(request.url);
        const now = new Date();

        // Public endpoint: returns active, non-expired ads
        const ads = await Ad.find({
            isActive: true,
            $and: [
                { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
                { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
            ],
        }).sort({ position: 1, createdAt: -1 }).lean();

        return Response.json(ads);
    } catch (err) {
        console.error("Ads GET error:", err);
        return Response.json({ error: "Failed to fetch ads" }, { status: 500 });
    }
}
