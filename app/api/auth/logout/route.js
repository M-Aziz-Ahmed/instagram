import { clearSession } from "@/utils/session";

export async function POST() {
    await clearSession();
    return Response.json({ ok: true });
}
