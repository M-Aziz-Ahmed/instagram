import { NextResponse } from "next/server";
import connectDB from "@/utils/db";
import PushSubscription from "@/models/pushSubscription";
import User from "@/models/user";
import { getSession } from "@/utils/session";

export async function POST(req) {
    try {
        const session = await getSession();
        if (!session?.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { subscription, userAgent } = await req.json();
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
        }

        await connectDB();
        const user = await User.findById(session.userId).select("username").lean();
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        await PushSubscription.findOneAndUpdate(
            { endpoint: subscription.endpoint },
            {
                userId: session.userId,
                username: user.username,
                endpoint: subscription.endpoint,
                keys: subscription.keys,
                userAgent: userAgent || "",
            },
            { upsert: true, returnDocument: 'after' }
        );

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("Push subscribe error:", err);
        return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
    }
}
