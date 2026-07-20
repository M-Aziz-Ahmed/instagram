import { NextResponse } from "next/server";

const LIVE_SERVER_URL = (
    process.env.NEXT_PUBLIC_LIVE_SERVER_URL || "http://localhost:3001"
).replace(/\/$/, "");

// Proxy every /api/* request to the live-server, which owns the database
// connection (localhost MongoDB). This keeps Vercel away from the DB entirely.
export const dynamic = "force-dynamic";

async function handler(request, { params }) {
    const { path } = await params;
    const pathStr = Array.isArray(path) ? path.join("/") : path;
    const target = `${LIVE_SERVER_URL}/api/${pathStr}${request.nextUrl.search}`;

    // Forward relevant headers, dropping host (the live-server sets its own).
    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
        if (key.toLowerCase() === "host") continue;
        headers.set(key, value);
    }

    let body;
    if (request.method !== "GET" && request.method !== "HEAD") {
        const buf = await request.arrayBuffer();
        if (buf.byteLength > 0) body = buf;
    }

    try {
        const upstream = await fetch(target, {
            method:  request.method,
            headers,
            body,
            redirect: "manual",
            cache:    "no-store",
        });

        // Build the response, forwarding status, headers (incl. set-cookie).
        const respHeaders = new Headers();
        for (const [key, value] of upstream.headers.entries()) {
            const lower = key.toLowerCase();
            if (lower === "transfer-encoding") continue;
            if (lower === "connection") continue;
            // Append so multiple Set-Cookie headers are preserved.
            if (respHeaders.has(key)) respHeaders.append(key, value);
            else respHeaders.set(key, value);
        }

        const respBody = upstream.body;
        return new Response(respBody, {
            status:  upstream.status,
            statusText: upstream.statusText,
            headers: respHeaders,
        });
    } catch (error) {
        console.error("API proxy error:", error);
        return NextResponse.json(
            { error: "Live server unreachable", detail: String(error?.message || error) },
            { status: 502 }
        );
    }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
