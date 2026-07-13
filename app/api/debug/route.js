import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request) {
    try {
        const raw = request.headers.get("cookie") || null;
        const cookieStore = await cookies();
        const af = cookieStore.get("af_session")?.value ?? null;
        return NextResponse.json({ ok: true, rawCookieHeader: raw, af_session: af });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
}
