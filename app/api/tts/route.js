// Same-origin text-to-speech relay.
//
// The language courses need pronunciation on every surface: desktop Chrome,
// the Tauri desktop app (WebView2), Capacitor mobile apps (WKWebView /
// Android WebView) and mobile browsers. WebViews expose no usable Web Speech
// API, and the old client-side fallback streamed straight from Google's
// undocumented `translate_tts` endpoint — which WebViews, mobile browsers and
// some networks refuse. Serving the audio from our own origin fixes that: the
// client just plays `/api/tts?...` like any same-origin asset.
//
// The relay keeps the same upstream parameters the old client used
// (`client=tw-ob`), fetched server-side with a real browser User-Agent and a
// Google referer so no webview/cookie/UA policy ever gets in the way.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UPSTREAM = "https://translate.google.com/translate_tts";
const BROWSER_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const LANG_RE = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;
const MAX_TEXT = 300;

// This endpoint is deliberately unauthenticated (see proxy.js PUBLIC_PATHS) so
// lessons can speak before sign-in, which also makes it an open relay to Google.
// MAX_TEXT bounds a single request; this bounds how fast one client can burn
// through them.
const RATE_LIMIT_MAX = 30;        // requests...
const RATE_LIMIT_WINDOW_MS = 60000; // ...per minute
const rateBuckets = new Map();

function clientKey(request) {
    const fwd = request.headers.get("x-forwarded-for") || "";
    const ip = fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
    return ip;
}

function rateLimited(request) {
    const key = clientKey(request);
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.start >= RATE_LIMIT_WINDOW_MS) {
        rateBuckets.set(key, { start: now, count: 1 });
        return false;
    }
    bucket.count++;
    return bucket.count > RATE_LIMIT_MAX;
}

// Keep the bucket map from growing without bound on a long-lived instance.
function sweepBuckets(now) {
    if (rateBuckets.size < 5000) return;
    for (const [key, bucket] of rateBuckets) {
        if (now - bucket.start >= RATE_LIMIT_WINDOW_MS) rateBuckets.delete(key);
    }
}

export async function GET(request) {
    const url = new URL(request.url);
    const text = (url.searchParams.get("text") || "").trim();
    const lang = (url.searchParams.get("lang") || "en").trim();

    if (!text) return Response.json({ error: "missing text" }, { status: 400 });
    if (text.length > MAX_TEXT) return Response.json({ error: "text too long" }, { status: 400 });
    if (!LANG_RE.test(lang)) return Response.json({ error: "bad lang" }, { status: 400 });

    if (rateLimited(request)) {
        sweepBuckets(Date.now());
        return Response.json(
            { error: "Too many speech requests" },
            { status: 429, headers: { "Retry-After": String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)) } }
        );
    }

    const upstreamUrl = `${UPSTREAM}?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15000);

    try {
        const upstream = await fetch(upstreamUrl, {
            headers: {
                "User-Agent": BROWSER_UA,
                Referer: "https://translate.google.com/",
                Accept: "audio/mpeg,audio/*;q=0.9",
            },
            redirect: "follow",
            cache: "no-store",
            signal: ac.signal,
        });

        if (!upstream.ok || !upstream.body) {
            return Response.json({ error: `upstream ${upstream.status}` }, { status: 502 });
        }

        const headers = {
            "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        };
        const contentLength = upstream.headers.get("content-length");
        if (contentLength) headers["Content-Length"] = contentLength;

        return new Response(upstream.body, { status: 200, headers });
    } catch (err) {
        return Response.json({ error: "tts failed" }, { status: 502 });
    } finally {
        clearTimeout(timer);
    }
}