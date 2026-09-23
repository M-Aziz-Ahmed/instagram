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

export async function GET(request) {
    const url = new URL(request.url);
    const text = (url.searchParams.get("text") || "").trim();
    const lang = (url.searchParams.get("lang") || "en").trim();

    if (!text) return Response.json({ error: "missing text" }, { status: 400 });
    if (text.length > MAX_TEXT) return Response.json({ error: "text too long" }, { status: 400 });
    if (!LANG_RE.test(lang)) return Response.json({ error: "bad lang" }, { status: 400 });

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