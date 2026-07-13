import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/session";

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("af_session")?.value ?? null;
        if (!token) return NextResponse.json({ ok: false, error: "no token" });
        try {
            const payload = await verifyToken(token);
            return NextResponse.json({ ok: true, payload });
        } catch (err) {
            return NextResponse.json({ ok: false, error: String(err?.message ?? err) });
        }
    } catch (err) {
        console.error(err);
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
}
