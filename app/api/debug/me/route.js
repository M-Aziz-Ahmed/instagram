import { NextResponse } from "next/server";
import connectDB from "@/utils/db";
import User from "@/models/user";
import { getSession } from "@/utils/session";

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.userId) {
            return NextResponse.json({ ok: false, reason: "no session", session });
        }

        await connectDB();
        const user = await User.findById(session.userId).lean();
        if (!user) {
            return NextResponse.json({ ok: false, reason: "user not found", session, user: null });
        }
        return NextResponse.json({ ok: true, session, user });
    } catch (err) {
        console.error("/api/debug/me error:", err);
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
}
