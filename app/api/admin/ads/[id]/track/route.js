import connectDB from "@/utils/db";
import Ad from "@/models/ad";

export async function POST(request, { params }) {
    try {
        const { id } = await params;
        const { action } = await request.json(); // "impression" or "click"

        await connectDB();
        const update = {};
        if (action === "impression") update.$inc = { impressions: 1 };
        else if (action === "click") update.$inc = { clicks: 1 };
        else return Response.json({ error: "Invalid action" }, { status: 400 });

        await Ad.findByIdAndUpdate(id, update);
        return Response.json({ ok: true });
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}
