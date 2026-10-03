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

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

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

// ─── On-disk clip cache ──────────────────────────────────────────────────────
//
// Google is the only source of audio here, and the round-trip costs real time:
// on Vercel it is a short hop from the edge, but the desktop build serves this
// route from the user's own machine, so every uncached word waits on a Google
// request over their network - seconds, on the same connections this repo already
// works around (see utils/dnsBypass.js). The response is fully determined by
// (lang, text) and a language course repeats the same vocabulary constantly, so
// caching turns every repeat into a local read.
//
// The cache lives in the OS temp dir rather than next to the app: an installed
// bundle can sit in a read-only location, and Vercel's filesystem is immutable
// outside /tmp anyway.

const CACHE_DIR = path.join(os.tmpdir(), "anontweet-tts-cache");
const CACHE_MAX_TOTAL_BYTES = 192 * 1024 * 1024;
const CACHE_MAX_ENTRY_BYTES = 4 * 1024 * 1024;
const CACHE_SWEEP_TARGET = 0.8; // evict down to this fraction of the cap

let cacheReady;
let cacheBytes = 0;
const memCache = new Map();
const MEM_MAX = 256;

async function ensureCacheDir() {
    if (!cacheReady) {
        cacheReady = fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => {
            cacheReady = null;
        });
    }
    await cacheReady;
}

// Whitespace and case vary between the same phrase spelled by different lesson
// steps, so normalise before hashing to raise the hit rate.
function cacheKey(lang, text) {
    const norm = `${lang.toLowerCase()}|${text.replace(/\s+/g, " ").trim().toLowerCase()}`;
    return createHash("sha256").update(norm).digest("hex");
}

async function readCache(key) {
    const hit = memCache.get(key);
    if (hit) return hit;
    try {
        const data = await fs.readFile(path.join(CACHE_DIR, key));
        memCache.set(key, data);
        if (memCache.size > MEM_MAX) memCache.delete(memCache.keys().next().value);
        return data;
    } catch {
        return null;
    }
}

// Oldest-first eviction by mtime. Runs only once the cap is exceeded, so the
// steady-state cost of a cache write is one unlink-free file create.
async function sweepCache() {
    let entries;
    try {
        entries = await fs.readdir(CACHE_DIR);
    } catch {
        return;
    }
    const sized = await Promise.all(
        entries.map(async (name) => {
            try {
                const st = await fs.stat(path.join(CACHE_DIR, name));
                return { name, size: st.size, mtime: st.mtimeMs };
            } catch {
                return null;
            }
        })
    );
    const files = sized.filter(Boolean).sort((a, b) => a.mtime - b.mtime);
    let total = files.reduce((sum, f) => sum + f.size, 0);
    const target = CACHE_MAX_TOTAL_BYTES * CACHE_SWEEP_TARGET;
    for (const f of files) {
        if (total <= target) break;
        try {
            await fs.unlink(path.join(CACHE_DIR, f.name));
            total -= f.size;
        } catch {
            /* another process may have swept it already */
        }
    }
    cacheBytes = total;
}

// Deliberately not awaited by the request path: a slow disk must not delay audio.
function writeCache(key, bytes) {
    if (bytes.length > CACHE_MAX_ENTRY_BYTES) return;
    memCache.set(key, bytes);
    if (memCache.size > MEM_MAX) memCache.delete(memCache.keys().next().value);
    cacheBytes += bytes.length;
    if (cacheBytes > CACHE_MAX_TOTAL_BYTES) {
        sweepCache().catch(() => {});
    }
    ensureCacheDir()
        .then(() => fs.writeFile(path.join(CACHE_DIR, key), bytes))
        .catch(() => {});
}

export async function GET(request) {
    const url = new URL(request.url);
    const text = (url.searchParams.get("text") || "").trim();
    const lang = (url.searchParams.get("lang") || "en").trim();

    if (!text) return Response.json({ error: "missing text" }, { status: 400 });
    if (text.length > MAX_TEXT) return Response.json({ error: "text too long" }, { status: 400 });
    if (!LANG_RE.test(lang)) return Response.json({ error: "bad lang" }, { status: 400 });

    const key = cacheKey(lang, text);

    // Cache first, rate limit second. A warm clip costs no Google bandwidth and no
    // upstream work, so charging it against the per-IP budget would let a lesson's
    // warm-up throttle the learner's own (already warm) clicks.
    const cached = await readCache(key);
    if (cached) {
        return new Response(cached, {
            status: 200,
            headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": String(cached.length),
                "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
                "X-TTS-Cache": "hit",
            },
        });
    }

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

        // Buffered rather than streamed so it can be cached. Clips are small.
        const bytes = Buffer.from(await upstream.arrayBuffer());
        writeCache(key, bytes);

        const headers = {
            "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
            "Content-Length": String(bytes.length),
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "X-TTS-Cache": "miss",
        };

        return new Response(bytes, { status: 200, headers });
    } catch (err) {
        return Response.json({ error: "tts failed" }, { status: 502 });
    } finally {
        clearTimeout(timer);
    }
}