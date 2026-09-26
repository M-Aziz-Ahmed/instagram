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
