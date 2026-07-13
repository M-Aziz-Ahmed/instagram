import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeJwt } from "jose";

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("af_session")?.value ?? null;
        if (!token) return NextResponse.json({ ok: true, token: null, decoded: null });
        let decoded = null;
        try {
            decoded = decodeJwt(token);
        } catch (err) {
            decoded = { error: String(err) };
        }
        return NextResponse.json({ ok: true, token, decoded });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
}
