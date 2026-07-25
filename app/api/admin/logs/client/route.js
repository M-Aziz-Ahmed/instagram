import { NextResponse } from "next/server";

export async function POST(request) {
    try {
        const body = await request.json();
        
        if (!Array.isArray(body)) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const logs = body.map(entry => ({
            category: "frontend",
            level: entry.level || "info",
            action: entry.action || "console_output",
            message: entry.msg || entry.message || "",
            path: entry.path || "",
        }));

        console.log("[Client Logs]", JSON.stringify(logs, null, 2));

        return NextResponse.json({ ok: true, received: logs.length });
    } catch (err) {
        console.error("[Client Logs] Error:", err);
        return NextResponse.json({ error: "Failed to process logs" }, { status: 500 });
    }
}