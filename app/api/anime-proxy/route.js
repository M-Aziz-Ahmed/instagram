import { NextResponse } from "next/server";

const ALLOWED_HOSTS = [
    "hianime.to",
    "www.hianime.to",
    "gogoanimehd.to",
    "www.gogoanimehd.to",
    "api.gogoanimehd.to",
    "ajax.gogoanimehd.to",
    "megacloud.tv",
    "www.megacloud.tv",
    "embtaku.pro",
    "embtaku.com",
    "www.embtaku.pro",
    "www.embtaku.com",
    "embed.embtaku.pro",
    "embed.embtaku.com",
    "mega.nz",
    "streamtape.com",
    "streamtape.net",
    "streamta.pe",
    "sendvid.com",
    "qq.com",
    "v.cdnz.space",
    "vid.cdnz.space",
    "cdnz.space",
    "vstreamcdn.com",
    "cdn.radeon.top",
    "cp.radeon.top",
    "s4.gayu-server.com",
    "yuki.gayu-server.com",
    "server.gayu-server.com",
    "fj-cdn.com",
    "f4-cdn.com",
    "cdn.jsdelivr.net",
];

const proxyOf = (url) => `/api/anime-proxy?url=${encodeURIComponent(url)}`;

function rewriteManifest(body, baseUrl) {
    if (!/\.(m3u8|m3u)$/.test(baseUrl)) return body;
    try {
        const base = new URL(baseUrl);
        return body
            .split("\n")
            .map((line) => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) return line;
                try {
                    const abs = new URL(trimmed, base);
                    if (ALLOWED_HOSTS.includes(abs.hostname) || abs.hostname.endsWith(".megacloud.tv") || abs.hostname.endsWith(".cdnz.space") || abs.hostname.endsWith(".gayu-server.com") || abs.hostname.endsWith(".radeon.top")) {
                        return proxyOf(abs.href);
                    }
                } catch {}
                return line;
            })
            .join("\n");
    } catch {
        return body;
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "86400",
        },
    });
}

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
        const isHlsManifest = contentType.includes("mpegurl") || /\.(m3u8|m3u)(\?.*)?$/.test(parsed.pathname);

        if (isHlsManifest) {
            const body = await res.text();
            const rewritten = rewriteManifest(body, targetUrl);
            return new NextResponse(rewritten, {
                status: res.status,
                headers: {
                    "Content-Type": contentType,
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": isAjax ? "no-cache" : "public, max-age=300",
                },
            });
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        return new NextResponse(new Uint8Array(buffer).buffer, {
            status: res.status,
            headers: {
                "Content-Type": contentType,
                "Content-Length": String(buffer.length),
                "Access-Control-Allow-Origin": "*",
                "Accept-Ranges": "bytes",
                "Cache-Control": isAjax ? "no-cache" : "public, max-age=300",
            },
        });
    } catch (err) {
        return NextResponse.json({ error: "Proxy fetch failed", detail: err.message }, { status: 502 });
    }
}