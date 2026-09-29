"use client";

// ─────────────────────────────────────────────────────────────
// Per-post analytics: impressions, clicks and reach for a creator's own posts.
//
// Separate from utils/track.js on purpose. That beacon has a 4s global throttle
// because page views are naturally sparse; a feed renders a dozen posts at once,
// so throttling there would throw away most impressions. This path is throttled
// per post instead, and de-duplicated per browser session so scrolling a post
// past and back doesn't inflate the numbers.
//
// Fire-and-forget throughout: reporting must never delay or break rendering.
// ─────────────────────────────────────────────────────────────

import { parseDevice } from "./track";

const ENDPOINT = "/api/analytics/post-event";
const STORE_KEY = "at_pse";
const DEDUPE_TTL_MS = 6 * 60 * 60 * 1000; // half a day is plenty for "did they see it"
const MAX_TRACKED_POSTS = 500;

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

// One sessionStorage entry holding a map of "postId:event" -> first seen time.
// Kept as a single key so pruning can't leave hundreds of stale keys behind.
function seenKeys() {
    try {
        const raw = window.sessionStorage.getItem(STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch { return {}; }
}

function alreadySeen(key) {
    const map = seenKeys();
    const at = map[key];
    if (typeof at === "number" && Date.now() - at < DEDUPE_TTL_MS) return true;

    map[key] = Date.now();

    // Prune expired keys, then hard-cap so a long session can't grow forever.
    const cutoff = Date.now() - DEDUPE_TTL_MS;
    for (const k of Object.keys(map)) {
        if (map[k] < cutoff) delete map[k];
    }
    const keys = Object.keys(map);
    if (keys.length > MAX_TRACKED_POSTS) {
        for (const k of keys.slice(0, keys.length - MAX_TRACKED_POSTS)) delete map[k];
    }

    try { window.sessionStorage.setItem(STORE_KEY, JSON.stringify(map)); } catch {}
    return false;
}

function postIdOf(postId) {
    if (!postId) return "";
    const id = String(postId);
    // Only ObjectId-shaped values are accepted server-side; skip the network
    // call entirely rather than letting the server reject the write.
    return /^[a-f\d]{24}$/i.test(id) ? id : "";
}

// Parsed once per page load. Shared with utils/track.js so the beacon and the
// per-post events report an identical device shape for the same visitor — two
// copies of these regexes would drift, and a drift surfaces as two different
// device splits for one person.
let deviceLoaded = false;
let deviceInfo = null;

function device() {
    if (!deviceLoaded) {
        deviceInfo = parseDevice();
        deviceLoaded = true;
    }
    return deviceInfo;
}

function send(postId, event, meta) {
    const id = postIdOf(postId);
    if (!id) return;
    if (typeof window === "undefined") return;
    if (alreadySeen(`${id}:${event}`)) return;

    const body = JSON.stringify({
        postId: id,
        event,
        sessionId: sessionId(),
        meta: meta || "",
        device: device(),
    });

    try {
        if (navigator.sendBeacon) {
            navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
        } else {
            fetch(ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
                keepalive: true,
            }).catch(() => {});
        }
    } catch { /* analytics must never surface an error */ }
}

/** The post was rendered for a viewer. Once per post per session. */
export function trackImpression(postId) {
    send(postId, "impression");
}

/** The viewer opened the post itself. */
export function trackPostClick(postId) {
    send(postId, "click");
}

/** The viewer tapped through to the author's profile from the post. */
export function trackProfileClick(postId) {
    send(postId, "profile_click");
}

/** The viewer opened an outbound link in the post. */
export function trackLinkClick(postId, host) {
    send(postId, "link_click", host);
}

/** The viewer tapped a hashtag in the post. */
export function trackHashtagClick(postId, tag) {
    send(postId, "hashtag_click", tag);
}

/** The viewer shared or reposted the post. */
export function trackShare(postId) {
    send(postId, "share");
}
