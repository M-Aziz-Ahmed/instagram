import { NextResponse } from "next/server";

const ALLOWED_HOSTS = [
    "hianime.to",
    "hianime.sx",
    "hianime.nz",
    "aniwatch.to",
    "www3.hianime.to",
];

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");
    const isAjax = searchParams.get("ajax") === "1";

    if (!targetUrl) {
        return NextResponse.json({ error: "Missing ?url= param" }, { status: 400 });
    }

    let parsed;
    try {
        parsed = new URL(targetUrl);
    } catch {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
        return NextResponse.json({ error: "Host not allowed: " + parsed.hostname }, { status: 403 });
    }

    try {
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://hianime.to/",
        };
        if (isAjax) {
            headers["X-Requested-With"] = "XMLHttpRequest";
            headers["Accept"] = "application/json";
        } else {
            headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
        }

        const res = await fetch(targetUrl, { headers, redirect: "follow" });
        const contentType = res.headers.get("content-type") || (isAjax ? "application/json" : "text/html");
        const body = await res.text();

        return new NextResponse(body, {
            status: res.status,
            headers: {
                "Content-Type": contentType,
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": isAjax ? "no-cache" : "public, max-age=300",
            },
        });
    } catch (err) {
        return NextResponse.json({ error: "Proxy fetch failed", detail: err.message }, { status: 502 });
    }
}
