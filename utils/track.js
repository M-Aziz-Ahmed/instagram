"use client";

// ─────────────────────────────────────────────────────────────
// Lightweight analytics beacon. The client reports only what it legitimately
// knows (page, referrer, device shape, its own session id) to /api/track.
// Everything is fire-and-forget: a failure to send must never disturb the user.
//
// Geo is intentionally NOT resolved here. It used to call ipinfo.io from the
// visitor's browser and post the result back, which exposed every user's IP to
// a third party (GDPR) and let a hostile client dictate its own location. The
// server now derives it from the connection IP — see live-server/lib/geo.js.
// ─────────────────────────────────────────────────────────────

const SEND_THROTTLE_MS = 4000;

let lastSendAt = 0;

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

// Exported so utils/postAnalytics.js reports the same device shape on per-post
// events. Two copies of these regexes would drift, and a drift shows up as two
// different device splits for the same visitor.
export { parseDevice };

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

    const body = JSON.stringify({
        type: event.type || "page_view",
        path: event.path || (typeof window !== "undefined" ? window.location.pathname + window.location.search : ""),
        referrer: typeof document !== "undefined" ? document.referrer || "" : "",
        sessionId: sessionId(),
        device: deviceInfo,
    });

    // No need to await a geo round-trip any more, so the beacon goes out
    // immediately rather than waiting on a network call.
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
}

// Public API used by the dashboard/app-level components.
export function trackEvent(type, extra = {}) {
    send({ type, ...extra });
}

export function trackPage() {
    send({ type: "page_view" });
}

// ─────────────────────────────────────────────────────────────
// Presence: the write behind the admin's "last known location".
//
// Separate from the beacon above, and called only when the app opens. Three
// reasons it cannot just be another analytics event:
//
//   * it needs the EXACT address, while /api/track deliberately resolves a /24
//     network because a population counter only needs "roughly where";
//   * it is authenticated, so a location can never be recorded against an
//     account the caller is not signed in as;
//   * it is throttled hard (the route refuses to re-record within 30 minutes and
//     a rate limiter caps the rest), so it must fire on app open rather than on
//     every navigation — this is what "last known location" means anyway.
//
// Nothing is read back to the browser. The response is deliberately not used for
// anything, and a failure here is invisible to the user by design: recording
// where someone is must never be the reason something breaks.
// ─────────────────────────────────────────────────────────────

const PRESENCE_STORAGE_KEY = "at_presence_at";
// Slightly under the server's 30-minute gate, so a client that drifts a little
// still gets recorded rather than being permanently throttled.
const PRESENCE_MIN_INTERVAL_MS = 25 * 60 * 1000;

export function trackPresence() {
    if (typeof window === "undefined") return;
    if (window.navigator?.onLine === false) return;

    // Only signed-in callers: the route 401s otherwise, and an unauthenticated
    // attempt would just be noise in the logs.
    try {
        if (!document.cookie.includes("af_session=")) return;
    } catch { return; }

    const now = Date.now();
    try {
        const last = Number(window.localStorage.getItem(PRESENCE_STORAGE_KEY) || 0);
        if (now - last < PRESENCE_MIN_INTERVAL_MS) return;
        window.localStorage.setItem(PRESENCE_STORAGE_KEY, String(now));
    } catch { /* private mode: the server-side gate still applies */ }

    try {
        if (navigator.sendBeacon) {
            navigator.sendBeacon("/api/presence", new Blob(["{}"], { type: "application/json" }));
            return;
        }
        fetch("/api/presence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            keepalive: true,
        }).catch(() => {});
    } catch {}
}
