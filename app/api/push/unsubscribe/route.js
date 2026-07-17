import { NextResponse } from "next/server";
import connectDB from "@/utils/db";
import PushSubscription from "@/models/pushSubscription";
import { getSession } from "@/utils/session";

export async function POST(req) {
    try {
        const session = await getSession();
        if (!session?.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { endpoint } = await req.json();

        await connectDB();

        if (endpoint) {
            await PushSubscription.deleteOne({ endpoint });
        } else {
            await PushSubscription.deleteMany({ userId: session.userId });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("Push unsubscribe error:", err);
        return NextResponse.json({ error: "Failed to remove subscription" }, { status: 500 });
    }
}
