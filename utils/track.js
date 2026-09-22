"use client";

// ─────────────────────────────────────────────────────────────
// Lightweight analytics beacon. The client resolves its own device
// fingerprint and rough geo (once, cached in localStorage) and reports
// page views to /api/track. Everything is fire-and-forget: a failure to
// send must never disturb the user.
// ─────────────────────────────────────────────────────────────

const GEO_CACHE_KEY = "at_geo_v1";
const GEO_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SEND_THROTTLE_MS = 4000;

let lastSendAt = 0;
let geoPromise = null;

function randomId() {
    try {
        if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
        return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    } catch { return "id-" + Date.now(); }
}

function sessionId() {
    let id = "";
    try { id = window.sessionStorage.getItem("at_sid") || ""; } catch {}
    if (!id) {
        id = randomId();
        try { window.sessionStorage.setItem("at_sid", id); } catch {}
    }
    return id;
}

function parseDevice() {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const low = ua.toLowerCase();
    let type = "desktop";
    if (/mobi|android|iphone|ipod/i.test(low)) type = "mobile";
    else if (/ipad|tablet/i.test(low)) type = "tablet";
    if (/bot|spider|crawl|slurp|headless/i.test(low)) type = "bot";

    let os = "Unknown";
    if (/windows/i.test(low)) os = "Windows";
    else if (/android/i.test(low)) os = "Android";
    else if (/iphone|ipad|ios/i.test(low)) os = "iOS";
    else if (/mac os x|macintosh/i.test(low)) os = "macOS";
    else if (/linux/i.test(low)) os = "Linux";

    let browser = "Unknown";
    if (/edg\//.test(low)) browser = "Edge";
    else if (/opr\/|opera/.test(low)) browser = "Opera";
    else if (/chrome|crios/i.test(low)) browser = "Chrome";
    else if (/safari/.test(low)) browser = "Safari";
    else if (/firefox|fxios/i.test(low)) browser = "Firefox";

    return { type, os, browser };
}

// One geo lookup per session, cached for a week. Sources in order:
// ipinfo.io (free JSON, no key) — falls back silently to nothing.
function getGeo() {
    if (typeof window === "undefined") return Promise.resolve(null);
    try {
        const cached = JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || "null");
        if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < GEO_TTL_MS) {
            return Promise.resolve(cached.value);
        }
    } catch {}

    if (!geoPromise) {
        geoPromise = fetch("https://ipinfo.io/json", { signal: AbortSignal.timeout(6000) })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (!d || !d.country) return null;
                const [lat, lon] = String(d.loc || ",").split(",").map(Number);
                const geo = {
                    country: d.country_name || d.country,
                    countryCode: d.country || "",
                    region: d.region || "",
                    city: d.city || "",
                    lat: Number.isFinite(lat) ? lat : null,
                    lon: Number.isFinite(lon) ? lon : null,
                    tz: d.timezone || "",
                };
                try {
                    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), value: geo }));
                } catch {}
                return geo;
            })
            .catch(() => null)
            .finally(() => { geoPromise = null; });
    }
    return geoPromise;
}

let deviceLoaded = false;
let deviceInfo = { type: "", os: "", browser: "" };

function send(event) {
    const now = Date.now();
    if (now - lastSendAt < SEND_THROTTLE_MS) return;
    lastSendAt = now;

    if (!deviceLoaded) {
        deviceInfo = parseDevice();
        deviceLoaded = true;
    }

    const payload = {
        type: event.type || "page_view",
        path: event.path || (typeof window !== "undefined" ? window.location.pathname + window.location.search : ""),
        referrer: typeof document !== "undefined" ? document.referrer || "" : "",
        sessionId: sessionId(),
        device: deviceInfo,
    };

    getGeo().then((loc) => {
        const body = JSON.stringify({ ...payload, location: loc || {} });
        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
            } else {
                fetch("/api/track", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body,
                    keepalive: true,
                });
            }
        } catch {}
    });
}

// Public API used by the dashboard/app-level components.
export function trackEvent(type, extra = {}) {
    send({ type, ...extra });
}

export function trackPage() {
    send({ type: "page_view" });
}

export { getGeo };