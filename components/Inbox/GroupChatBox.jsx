"use client";

/**
 * Group chat.
 *
 * ── What this file owns ───────────────────────────────────────────────────
 * The whole group surface: the thread, every message type, and a composer with
 * the capabilities the DM composer has (multi-file attachments, video,
 * location, poll, code, GIF, mentions, hashtags, drafts, an Enter/newline
 * toggle).
 *
 * There is NO shared composer component. `Input.jsx` is the DM composer and
 * was rebuilt in full; the patterns below are ported from it deliberately so
 * the two surfaces behave the same way, but the two files share no code and
 * could not be merged without a new shared component.
 *
 * ── Hard requirements this file must not break ────────────────────────────
 *   • the 8s poll and the `loadingMoreRef` single-flight guard
 *   • height-delta scroll restoration when a history page is prepended
 *   • the `[@media(hover:hover)]` gate on the destructive Edit/Delete
 *     controls — see the comment on them
 *   • `safe-top` / `safe-bottom` on the column, the scroll-FAB offset, the
 *     44px tap targets and `min-w-0` on the composer
 *
 * ── Server gaps that shape what you see here ──────────────────────────────
 * These are NOT client bugs. Each is called out where it is rendered and none
 * of them is faked:
 *
 *   • NO group recall route. The DM has `DELETE /api/messages/:id` with a 60s
 *     window; groups only have the PATCH `delete` action, which is
 *     sender-only and SOFT, with no time limit at all. The Recall button
 *     calls that action and its confirm says plainly that no window exists.
 *   • NO group vote endpoint. A group poll can be created and stored; there
 *     is nothing to POST a vote to. The poll card is read-only and says so.
 *   • NO group pin route. `pinned` is declared on GroupMessage but the PATCH
 *     dispatcher answers `400 Invalid request` for `pin`, so the control is
 *     rendered, is NOT optimistic, and latches itself off on the first
 *     refusal with the server's own words attached.
 *   • NO group socket. 8s polling is all the delivery there is.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/context/ToastContext";
import { useCall } from "@/context/CallContext";
import RichText from "@/components/Feed/RichText";
import UserBadges from "@/components/shared/UserBadges";
import AudioPlayer from "@/components/shared/AudioPlayer";
import ImageLightbox from "@/components/shared/ImageLightbox";
import EmojiPicker from "@/components/shared/EmojiPicker";
import GifPicker from "@/components/shared/GifPicker";
import LinkPreviewCard from "@/components/shared/LinkPreviewCard";
import VoiceRecorder from "@/components/shared/VoiceRecorder";
import GroupSettings from "./GroupSettings";
import { timeAgo } from "@/utils/timeAgo";
import { translateItem } from "@/utils/translateApi";
import { languageName } from "@/utils/languages";

/* ── Limits ─────────────────────────────────────────────────────────────────
 * MAX_TEXT is the group cap. It is what the composer's `maxLength` already
 * enforced and what `PATCH {action:"edit"}` rejects above
 * (live-server/routes/groups.js:623), so it is the largest message the group
 * surface accepts anywhere.
 *
 * MAX_QUEUE is 10 because the group send route does
 * `attachments.filter(...).slice(0, 10)` (groups.js:443) — a larger queue
 * would silently drop the tail, so the client refuses it up front instead. */
const MAX_TEXT = 1000;
const MAX_QUEUE = 10;
const COUNTER_AT = Math.floor(MAX_TEXT * 0.8);
const MAX_COMPOSER_PX = 160;                 // ~6 lines, then internal scroll
const DRAFT_DEBOUNCE_MS = 1200;
const UPLOAD_TIMEOUT_MS = 180000;
const FENCE = "```";
const FENCE_OVERHEAD = FENCE.length * 2 + 2;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 6;
const MAX_POLL_QUESTION = 200;
const MAX_POLL_OPTION = 100;
const ENTER_MODE_KEY = "group-enter-mode";    // "send" | "newline"
const ENTER_HINT_KEY = "group-enter-hint-seen";
// One session slot for the last announcement the reader dismissed. Storing the
// KEY rather than a boolean is what lets a brand new announcement reappear
// without a props-to-state reset effect.
const ANNOUNCE_HIDDEN_KEY = "group_announce_dismissed";

const URL_RE = /https?:\/\/[^\s<>"'\u2026]+/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)$/;
const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|avi|mkv)$/;
const KIND_LABEL = { image: "Photo", video: "Video", file: "File" };

/* ── API helper ────────────────────────────────────────────────────────────
 * `error` AND `detail` are surfaced verbatim. A bare "Failed" hides the only
 * useful text several group routes return: `POST /join` and the draft route
 * both answer `{ error: "Failed", detail: err.message }`, and `detail` is the
 * actual reason. */
async function callApi(path, options) {
    let res;
    try {
        res = await fetch(path, { credentials: "include", ...options });
    } catch {
        const err = new Error("Network error \u2014 the request did not reach the server");
        err.status = 0;
        throw err;
    }
    let data = {};
    try {
        data = await res.json();
    } catch {
        // Non-JSON body (proxy error page, HTML 502). The status is all there is.
    }
    if (!res.ok) {
        const err = new Error(data.error || `Request failed with HTTP ${res.status}`);
        err.payload = data;
        err.status = res.status;
        throw err;
    }
    return data;
}

function errText(e) {
    const msg = e?.payload?.error || e?.message || "Request failed";
    const detail = e?.payload?.detail;
    return detail && !String(msg).includes(detail) ? `${msg} \u2014 ${detail}` : msg;
}

function extractFirstUrl(str) {
    const m = (str || "").match(URL_RE);
    if (!m) return null;
    return m[0].replace(/[),.;:!?]+$/, "") || null;
}

let uidCounter = 0;
const uid = () => `att_${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    const mb = n / (1024 * 1024);
    return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function classifyFile(file) {
    const type = String(file?.type || "");
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    return "file";
}

function kindFromMime(mime, url) {
    const m = String(mime || "").toLowerCase();
    if (m.startsWith("image/")) return "image";
    if (m.startsWith("video/")) return "video";
    const u = String(url || "").toLowerCase().split("?")[0];
    if (IMAGE_EXT_RE.test(u)) return "image";
    if (VIDEO_EXT_RE.test(u)) return "video";
    return "file";
}

function limitFor(kind) {
    if (kind === "image") return MAX_IMAGE_BYTES;
    if (kind === "video") return MAX_VIDEO_BYTES;
    return MAX_FILE_BYTES;
}

function defaultNameFor(kind) {
    if (kind === "image") return "Photo";
    if (kind === "video") return "Video";
    return "File";
}

/**
 * A Giphy URL is stored as `imageUrl`, not as a video, so an `<img>` is the
 * only thing that animates it. `Chat.jsx:17` has the same helper; the DM
 * bubble is the one that actually used to use it, and this file now does too.
 */
function isGifUrl(url) {
    if (!url) return false;
    const lower = String(url).toLowerCase();
    return lower.includes(".gif") || lower.includes("giphy.com") || lower.includes("gifformat");
}

function resourceTypeFor(kind) {
    if (kind === "image") return "image";
    if (kind === "video") return "video";
    return "raw";
}

function describeCloudinaryError(xhr) {
    let detail = "";
    try {
        const body = JSON.parse(xhr.responseText);
        if (body?.error?.message) detail = body.error.message;
    } catch {
        // Cloudinary can answer with HTML from a gateway; nothing to extract.
    }
    const status = xhr.status ? ` (HTTP ${xhr.status})` : "";
    return `Upload failed${status}${detail ? `: ${detail}` : ""}`;
}

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

function uploadToCloudinary(file, { resourceType = "image", onProgress, onXhr } = {}) {
    return new Promise((resolve, reject) => {
        if (!CLOUD_NAME || !UPLOAD_PRESET) {
            reject(new Error("Uploads are not configured on this deployment"));
            return;
        }
        const fd = new FormData();
        fd.append("file", file, file.name || "upload");
        fd.append("upload_preset", UPLOAD_PRESET);
        fd.append("folder", "anon-feed");
        fd.append("resource_type", resourceType);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`);
        xhr.timeout = UPLOAD_TIMEOUT_MS;
        xhr.onload = () => {
            onXhr?.(null);
            if (xhr.status !== 200) { reject(new Error(describeCloudinaryError(xhr))); return; }
            try {
                const url = JSON.parse(xhr.responseText)?.secure_url;
                if (url) resolve(url);
                else reject(new Error("Upload finished but returned no URL"));
            } catch {
                reject(new Error("Upload returned a response that could not be read"));
            }
        };
        xhr.onerror   = () => { onXhr?.(null); reject(new Error("Upload failed: network error")); };
        xhr.ontimeout = () => { onXhr?.(null); reject(new Error("Upload timed out")); };
        xhr.onabort   = () => { onXhr?.(null); reject(new Error("Upload cancelled")); };
        if (xhr.upload && onProgress) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
            };
        }
        onXhr?.(xhr);
        xhr.send(fd);
    });
}

const fence = (s) => `${FENCE}\n${s}\n${FENCE}`;

function unfence(s) {
    const str = String(s || "");
    if (!str.startsWith(`${FENCE}\n`)) return null;
    if (!str.endsWith(`\n${FENCE}`)) return null;
    return str.slice(FENCE.length + 1, str.length - FENCE.length - 1);
}

/** Mirrors the `kind` enum on models/groupMessage.js:41. */
function resolveKind({ codeMode, location, poll, hasVideo, hasImage, audioUrl, attachmentCount }) {
    if (codeMode) return "code";
    if (location) return "location";
    if (poll) return "poll";
    if (hasVideo) return "video";
    if (attachmentCount > 0) return "file";
    if (hasImage) return "image";
    if (audioUrl) return "audio";
    return "text";
}

/**
 * What to RENDER, when `kind` cannot be trusted.
 *
 * `kind` is only written by the current send route; every group message stored
 * before it existed has `kind: "text"` (the schema default) no matter what it
 * actually contains, so reading `msg.kind` alone hides a video, a poll or a
 * location in older history. The order below is the same one the server uses
 * to decide `kind` in the first place (groups.js:464), so the two agree.
 */
function inferKind(msg) {
    if (msg?.kind && msg.kind !== "text") return msg.kind;
    if (Array.isArray(msg?.attachments) && msg.attachments.length) return "file";
    if (msg?.videoUrl) return "video";
    if (msg?.poll?.question) return "poll";
    if (msg?.location && Number.isFinite(Number(msg.location.lat)) && Number.isFinite(Number(msg.location.lng))) return "location";
    if (msg?.imageUrl) return "image";
    if (msg?.audioUrl) return "audio";
    return "text";
}

/* ── Date dividers ───────────────────────────────────────────────────────── */
function dayKey(ts) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(ts) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    const today = new Date();
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (d.getFullYear() === today.getFullYear()) {
        return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

const REACTIONS = [
    { type: "like", emoji: "👍" },
    { type: "love", emoji: "❤️" },
    { type: "laugh", emoji: "😂" },
    { type: "fire", emoji: "🔥" },
    { type: "sad", emoji: "😢" },
    { type: "angry", emoji: "😠" },
];

/* ── Local artwork / panel chrome ─────────────────────────────────────────── */
function KindIcon({ kind, className = "w-4 h-4" }) {
    if (kind === "video") {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
        );
    }
    if (kind === "file") {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.63c0-1.14-.45-2.23-1.24-3.04l-4.5-4.5A2.12 2.12 0 0 0 12.22 3H6.75A2.25 2.25 0 0 0 4.5 5.25v13.5A2.25 2.25 0 0 0 6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 3v4.5a1.5 1.5 0 0 0 1.5 1.5h4.5" />
            </svg>
        );
    }
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
    );
}

const XIcon = ({ className = "w-3.5 h-3.5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
);

const TRAY_ITEMS = [
    { id: "image", label: "Photos", glyph: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z" />
        </svg>
    ) },
    { id: "file", label: "Files", glyph: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.63c0-1.14-.45-2.23-1.24-3.04l-4.5-4.5A2.12 2.12 0 0 0 12.22 3H6.75A2.25 2.25 0 0 0 4.5 5.25v13.5A2.25 2.25 0 0 0 6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 3v4.5a1.5 1.5 0 0 0 1.5 1.5h4.5" />
        </svg>
    ) },
    { id: "gif", label: "GIF", glyph: <span className="text-[11px] font-bold">GIF</span> },
    { id: "location", label: "Location", glyph: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
        </svg>
    ) },
    { id: "poll", label: "Poll", glyph: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h10.5m-10.5 5.25h16.5" />
        </svg>
    ) },
    { id: "code", label: "Code block", glyph: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m17.25 6.75 4.5 5.25-4.5 5.25M6.75 6.75 2.25 12l4.5 5.25M14.25 3.75l-4.5 16.5" />
        </svg>
    ) },
    { id: "emoji", label: "Emoji", glyph: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" strokeLinecap="round" />
            <line x1="15" y1="9" x2="15.01" y2="9" strokeLinecap="round" />
        </svg>
    ) },
];

const PANEL_CHROME = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl";
const panelButton = "w-full min-h-[44px] rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors touch-manipulation";
const panelGhostButton = "w-full min-h-[44px] rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm font-medium transition-colors touch-manipulation";
const panelInput = "w-full bg-gray-100 dark:bg-gray-800 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 rounded-xl px-3 py-2 outline-none";

/** Rough pointer check, matching EmojiPicker / GifPicker. */
function isTouchFirst() {
    if (typeof window === "undefined") return false;
    return !window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
}

async function copyText(value) {
    if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
    }
    // A non-secure context has no async clipboard and execCommand is the only
    // path left. Positioned rather than `display:none`, which cannot select.
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Message bubble
 * ══════════════════════════════════════════════════════════════════════════ */
function GroupMessageBubble({
    msg, user, members, isLast, onReact, onDelete, onRecall, onReply, onHashtag,
    onTranslate, onStar, onPin, pinState, onEdit, translations, translatingId,
    translateTargetName, editing, editText, setEditText, onSaveEdit, onCancelEdit,
}) {
    const [showReactions, setShowReactions] = useState(false);
    const [showReaders, setShowReaders] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [lightbox, setLightbox] = useState(false);
    const isOwn = msg.sender === user?.username;
    const author = msg._author || null;
    const kind = inferKind(msg);
    // Group message pinning is not implemented server-side; `pinState` carries
    // the refusal once it has happened. See the file header.
    const pinBroken = pinState === "unavailable";

    const totalReactions = useMemo(() => {
        if (!msg.reactions) return 0;
        return Object.values(msg.reactions).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
    }, [msg.reactions]);

    const myReaction = useMemo(() => {
        if (!user || !msg.reactions) return null;
        for (const [type, voters] of Object.entries(msg.reactions)) {
            if (Array.isArray(voters) && voters.includes(user.username)) return type;
        }
        return null;
    }, [user, msg.reactions]);

    // The sender is not "a reader of their own message": the server's
    // `action:"read"` update excludes them anyway, but old rows may not.
    const readBy = useMemo(
        () => (Array.isArray(msg.readBy) ? msg.readBy.filter((n) => n && n !== msg.sender) : []),
        [msg.readBy, msg.sender]
    );

    /**
     * Recall. There is NO group recall route and NO time limit: the only
     * destructive action is `PATCH {action:"delete"}`, which the server gates
     * on `msg.sender === username` (groups.js:638) and applies as a soft
     * delete. The DM's 60s window is therefore deliberately NOT reproduced —
     * showing one would be a claim about behaviour the server does not have.
     */
    const canRecall = isOwn && !msg.deleted && !!msg._id;

    const codeBody = kind === "code" ? (unfence(msg.text) ?? msg.text) : "";

    const avatarOf = (name) => {
        const m = (members || []).find((x) => (x.username || x) === name);
        return m?._profile?.avatarUrl || m?.avatarUrl || "";
    };

    return (
        <div className={`flex gap-2 px-4 py-1 group ${isOwn ? "flex-row-reverse" : ""}`}>
            {!isOwn && (
                <div
                    className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold select-none overflow-hidden"
                    style={{ backgroundColor: msg.color || "#3b82f6" }}
                >
                    {author?.avatarUrl ? (
                        <img src={author.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                        msg.sender?.[0]?.toUpperCase()
                    )}
                </div>
            )}
            <div className={`max-w-[75%] min-w-0 ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                {!isOwn && (
                    <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{msg.sender}</span>
                        <UserBadges isPro={author?.isPro} isVerified={author?.isVerified} isAdmin={author?.isAdmin} roles={author?.roles || []} size="sm" />
                    </div>
                )}
                {msg.replyTo?.messageId && (
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 mb-1 max-w-full truncate">
                        Replying to {msg.replyTo.sender}: {msg.replyTo.text}
                    </div>
                )}
                {msg.pinned && (
                    <div className="flex items-center gap-1 mb-1 text-[10px] font-semibold text-blue-500 dark:text-blue-400 min-w-0">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 shrink-0">
                            <path d="M14.53 3.5 21 10l-3.1 3.1-1.2-1.2-3.2 3.2 2.6 2.6-1.4 1.4-2.6-2.6-3.5 3.5v-2.3l-4.4-4.4 1.4-1.4 2.6 2.6 3.2-3.2-1.2-1.2L10.5 3.5h4.03Z" />
                        </svg>
                        <span className="truncate">Pinned in this group</span>
                    </div>
                )}
                <div
                    className={`rounded-2xl px-3 py-2 inline-block max-w-full ${
                        isOwn
                            ? "bg-blue-500 text-white rounded-br-md"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md"
                    }`}
                >
                    {msg.deleted ? (
                        // Groups used to hard-delete the row, so a removed message
                        // simply vanished. Soft delete keeps a tombstone, matching
                        // DMs and telling everyone it was removed rather than lost.
                        <p className={`text-sm italic ${isOwn ? "text-white/60" : "text-gray-400 dark:text-gray-500"}`}>
                            This message was deleted
                        </p>
                    ) : (
                        <>
                            {/* Code block. Nothing in this app highlights source,
                                so this is a plain monospace block. */}
                            {kind === "code" && codeBody ? (
                                <div className="min-w-[220px] max-w-full">
                                    <p className={`text-[10px] font-semibold mb-1 ${isOwn ? "text-white/70" : "text-gray-400 dark:text-gray-500"}`}>Code</p>
                                    <pre className={`text-[11px] font-mono whitespace-pre-wrap break-words rounded-lg p-2 max-h-64 overflow-y-auto ${isOwn ? "bg-black/20 text-white" : "bg-gray-900 text-gray-100"}`}><code>{codeBody}</code></pre>
                                </div>
                            ) : (
                                <>
                                    {msg.text && (
                                        editing ? (
                                            // Group messages had no edit path at all. Enter
                                            // saves, Escape cancels, matching the DM.
                                            <div className="flex flex-col gap-1 min-w-[200px]">
                                                <textarea
                                                    value={editText}
                                                    autoFocus
                                                    rows={2}
                                                    maxLength={MAX_TEXT}
                                                    onChange={(e) => setEditText(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSaveEdit(); }
                                                        if (e.key === "Escape") onCancelEdit();
                                                    }}
                                                    className="text-base sm:text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 outline-none focus:border-blue-400 text-gray-900 dark:text-gray-100 resize-none"
                                                />
                                                <div className="flex gap-2 text-[11px] font-semibold">
                                                    <button onClick={onSaveEdit} className="text-blue-500 hover:underline">Save</button>
                                                    <button onClick={onCancelEdit} className="text-gray-400 hover:underline">Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                                <RichText text={msg.text} onHashtag={onHashtag} />
                                            </p>
                                        )
                                    )}
                                    {translations?.[msg._id] && (
                                        <p className={`mt-1 text-xs italic break-words ${isOwn ? "text-white/70" : "text-gray-500 dark:text-gray-400"}`}>
                                            {translations[msg._id]}
                                        </p>
                                    )}

                                    {/* Poll. Read-only, and labelled as such: a
                                        group poll can be created and stored, but
                                        there is no group vote route, so there is
                                        nowhere to POST a vote to. Tallying what
                                        the server holds is honest; tappable
                                        options that discard the vote would not
                                        be. */}
                                    {kind === "poll" && msg.poll?.question && (
                                        <div className="mt-1 min-w-[200px] max-w-full">
                                            <p className="text-sm font-semibold break-words">{msg.poll.question}</p>
                                            <ul className="mt-1.5 space-y-1">
                                                {(msg.poll.options || []).map((o, i) => (
                                                    <li key={i} className={`text-xs px-2 py-1.5 rounded-lg ${isOwn ? "bg-white/15" : "bg-gray-200 dark:bg-gray-700"}`}>
                                                        <span className="break-words">{o.text}</span>
                                                        <span className={`ml-1.5 tabular-nums ${isOwn ? "text-white/70" : "text-gray-500 dark:text-gray-400"}`}>
                                                            {Array.isArray(o.votes) ? o.votes.length : 0}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <p className={`mt-1 text-[10px] ${isOwn ? "text-white/60" : "text-gray-400 dark:text-gray-500"}`}>
                                                {"Results only \u2014 there is no group vote endpoint yet."}
                                            </p>
                                        </div>
                                    )}

                                    {/* Location card. */}
                                    {kind === "location" && msg.location && Number.isFinite(Number(msg.location.lat)) && Number.isFinite(Number(msg.location.lng)) && (
                                        <a
                                            href={`https://www.openstreetmap.org/?mlat=${Number(msg.location.lat)}&mlon=${Number(msg.location.lng)}#map=16/${Number(msg.location.lat)}/${Number(msg.location.lng)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`mt-1 flex items-center gap-2 px-2 py-2 rounded-lg max-w-full ${isOwn ? "bg-white/15" : "bg-gray-200 dark:bg-gray-700"}`}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 shrink-0">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                                            </svg>
                                            <span className="min-w-0">
                                                <span className="block text-xs font-medium truncate">
                                                    {msg.location.label || `${msg.location.lat}, ${msg.location.lng}`}
                                                </span>
                                                <span className={`block text-[10px] ${isOwn ? "text-white/70" : "text-gray-500 dark:text-gray-400"}`}>Open in maps</span>
                                            </span>
                                        </a>
                                    )}

                                    {/* Attachments. `imageUrl` / `videoUrl` are the
                                        first entry of the same manifest, so the
                                        list skips whichever one already
                                        rendered outside the bubble. */}
                                    {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                                        <div className="mt-1 space-y-1 min-w-[200px] max-w-full">
                                            {msg.attachments.map((a, i) => {
                                                if (!a?.url) return null;
                                                if (a.url === msg.imageUrl || a.url === msg.videoUrl) return null;
                                                const meta = [formatBytes(a.size), a.mimeType].filter(Boolean).join(" \u00b7 ");
                                                return (
                                                    <a
                                                        key={`${a.url}-${i}`}
                                                        href={a.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={`flex items-center gap-2 px-2 py-2 rounded-lg min-w-0 ${isOwn ? "bg-white/15" : "bg-gray-200 dark:bg-gray-700"}`}
                                                    >
                                                        <span className="shrink-0"><KindIcon kind={kindFromMime(a.mimeType, a.url)} className="w-4 h-4" /></span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block text-xs font-medium truncate">{a.name || "Attachment"}</span>
                                                            <span className={`block text-[10px] truncate ${isOwn ? "text-white/70" : "text-gray-500 dark:text-gray-400"}`}>
                                                                {meta || "Tap to open"}
                                                            </span>
                                                        </span>
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                    {!msg.deleted && msg.audioUrl && !msg.text && !msg.imageUrl && !msg.videoUrl && (
                        <div className="max-w-[250px]">
                            <AudioPlayer src={msg.audioUrl} isMine={isOwn} />
                        </div>
                    )}
                    {!msg.deleted && msg.linkPreview && (
                        <div className={`mt-1.5 ${msg.text ? "border-t pt-1.5" : ""} ${isOwn ? "border-white/20" : "border-gray-200 dark:border-gray-700"}`}>
                            <LinkPreviewCard preview={msg.linkPreview} small />
                        </div>
                    )}
                </div>

                {/* Image. Outside the bubble, as before. `isGifUrl` is the
                    detection Chat.jsx already uses — a Giphy URL is stored as
                    `imageUrl`, and an `<img>` is the only thing that animates
                    it, so the picker output is not a still frame here. */}
                {!msg.deleted && msg.imageUrl && (
                    <div className="mt-1 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 max-w-[80vw] sm:max-w-xs cursor-pointer" onClick={() => setLightbox(true)}>
                        {/* `h-auto` keeps the intrinsic ratio, but a tall portrait
                            * (a screenshot) then renders at full height and swamps
                            * the thread. Clamp the height and letterbox instead. */}
                        <img
                            src={msg.imageUrl}
                            alt={isGifUrl(msg.imageUrl) ? "GIF" : ""}
                            className="w-full max-h-[420px] object-contain block"
                            loading="lazy"
                        />
                    </div>
                )}

                {/* Video. `playsInline` keeps iOS from taking over the screen and
                    `preload="metadata"` stops a group thread from pulling every
                    video in history at once. */}
                {!msg.deleted && msg.videoUrl && (
                    <div className="mt-1 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 max-w-[80vw] sm:max-w-xs bg-black">
                        <video src={msg.videoUrl} controls playsInline preload="metadata" className="w-full max-h-[420px] object-contain block" />
                    </div>
                )}

                {/* Read receipts. `readBy` is maintained by the
                    `PATCH {action:"read"}` route, which every member fires for
                    the whole thread. The newest message also names who has
                    actually seen it, which is the only place the list is worth
                    reading out loud. */}
                {!msg.deleted && readBy.length > 0 && (
                    <div className={`flex items-center gap-1.5 mt-0.5 min-w-0 ${isOwn ? "flex-row-reverse" : ""}`}>
                        <button
                            onClick={() => setShowReaders((v) => !v)}
                            aria-expanded={showReaders}
                            aria-label={`Seen by ${readBy.length}`}
                            title="Seen by"
                            className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors shrink-0"
                        >
                            Seen by {readBy.length}
                        </button>
                        {isLast && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate min-w-0">
                                {readBy.slice(0, 4).join(", ")}{readBy.length > 4 ? ` +${readBy.length - 4}` : ""}
                            </span>
                        )}
                        {showReaders && (
                            <div className="mt-1 w-full max-w-[240px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 shadow-lg">
                                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-0.5">Seen by</p>
                                <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                                    {readBy.map((name) => (
                                        <li key={name} className="flex items-center gap-1.5 min-w-0">
                                            {/* Background-image rather than <img>:
                                                an arbitrary user-supplied URL, and a
                                                16px avatar does not need the
                                                next/image pipeline. */}
                                            <span
                                                aria-hidden="true"
                                                className="w-4 h-4 rounded-full overflow-hidden shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[8px] font-bold text-gray-500 bg-cover bg-center"
                                                style={avatarOf(name) ? { backgroundImage: `url("${encodeURI(avatarOf(name))}")` } : undefined}
                                            >
                                                {avatarOf(name) ? "" : name?.[0]?.toUpperCase()}
                                            </span>
                                            <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">{name}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <div className={`flex items-center gap-2 mt-0.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                    <span className="text-gray-300 dark:text-gray-600 text-[10px] shrink-0">{timeAgo(msg.timeStamp)}</span>
                    <div className="relative">
                        <button onClick={() => setShowReactions(!showReactions)} className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full" aria-label="React to message">
                            {myReaction ? REACTIONS.find(r => r.type === myReaction)?.emoji || "😊" : "😊"}
                        </button>
                        {showReactions && (
                            <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-900 rounded-full shadow-xl border border-gray-200 dark:border-gray-700 px-1.5 py-1 flex gap-0.5 z-10">
                                {REACTIONS.map(r => (
                                    <button key={r.type} onClick={() => { onReact(msg._id, r.type); setShowReactions(false); }}
                                        aria-label={`React ${r.type}`}
                                        className={`text-base p-1 min-h-[40px] min-w-[40px] flex items-center justify-center hover:scale-125 transition-transform rounded-full ${myReaction === r.type ? "bg-blue-100 dark:bg-blue-900/30" : ""}`}>
                                        {r.emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {totalReactions > 0 && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{totalReactions}</span>
                    )}
                    <button onClick={() => onReply(msg)} className="text-[11px] text-gray-400 hover:text-blue-500 font-medium">Reply</button>
                    {/* Translate and star, matching the DM affordance. Group chat
                        had neither, which made a multilingual group unusable. */}
                    {msg.text && (
                        <button
                            onClick={() => onTranslate(msg._id, msg.text)}
                            className={`text-[11px] transition-colors ${
                                translations[msg._id]
                                    ? "text-blue-500"
                                    : "text-gray-400 hover:text-blue-500"
                            }`}
                            title={translations[msg._id] ? "Hide translation" : `Translate to ${translateTargetName}`}
                        >
                            {translatingId === msg._id ? "…" : translations[msg._id] ? "Hide" : "Translate"}
                        </button>
                    )}
                    <button
                        onClick={() => onStar(msg)}
                        className={`p-1 text-[11px] transition-colors ${
                            msg.starredBy?.includes(user?.username)
                                ? "text-yellow-500"
                                : "text-gray-400 hover:text-yellow-500"
                        }`}
                        aria-label={msg.starredBy?.includes(user?.username) ? "Unstar message" : "Star message"}
                        title={msg.starredBy?.includes(user?.username) ? "Unstar" : "Star"}
                    >
                        ★
                    </button>
                    {/* Pin. The control is real, but the group message PATCH
                        dispatcher has no `pin` action, so the server answers
                        400. NOT optimistic: the refusal is surfaced and the
                        control disables itself with the reason attached rather
                        than drawing a pin that was never stored. */}
                    <button
                        onClick={() => { if (!pinBroken) onPin(msg); }}
                        disabled={pinBroken || !msg._id}
                        aria-label={msg.pinned ? "Unpin message" : "Pin message"}
                        title={pinBroken
                            ? "Group message pinning is not implemented server-side"
                            : (msg.pinned ? "Unpin" : "Pin to the top of this group")}
                        className={`p-1 text-[11px] transition-colors disabled:opacity-40 ${
                            pinBroken
                                ? "text-gray-300 dark:text-gray-600"
                                : msg.pinned
                                    ? "text-blue-500"
                                    : "text-gray-400 hover:text-blue-500"
                        }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={msg.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.53 3.5 21 10l-3.1 3.1-1.2-1.2-3.2 3.2 2.6 2.6-1.4 1.4-2.6-2.6-3.5 3.5v-2.3l-4.4-4.4 1.4-1.4 2.6 2.6 3.2-3.2-1.2-1.2L10.5 3.5h4.03Z" />
                        </svg>
                    </button>
                    {msg.editedAt && (
                        <span className="text-[10px] text-gray-300 dark:text-gray-600 italic">(edited)</span>
                    )}
                    {canRecall && (
                        <>
                            <button
                                onClick={() => onRecall(msg)}
                                className="text-[11px] text-gray-400 hover:text-red-500 font-medium px-1.5 min-h-[32px]"
                                title={"Recall for everyone. A group recall has no time limit \u2014 the confirmation says so."}
                            >
                                Recall
                            </button>
                            {/* A touch-reachable overflow, because the hover-gated
                                Edit/Delete below are invisible until hover on a
                                fine pointer. */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowMenu((v) => !v)}
                                    aria-label="More message actions"
                                    aria-expanded={showMenu}
                                    className="p-1 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 min-h-[32px] min-w-[32px] flex items-center justify-center"
                                >
                                    …
                                </button>
                                {showMenu && (
                                    <div className="absolute bottom-full right-0 mb-1 z-20 w-44 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
                                        <button
                                            onClick={() => { setShowMenu(false); onEdit(msg); }}
                                            className="w-full text-left px-3 min-h-[40px] text-[11px] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => { setShowMenu(false); onDelete(msg._id); }}
                                            className="w-full text-left px-3 min-h-[40px] text-[11px] text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    {isOwn && (
                        <>
                            {/* These were `opacity-0 group-hover:opacity-100`, which
                                hides them WITHOUT removing them from hit-testing.
                                There is no hover on touch, so on a phone they were
                                permanently invisible yet still tappable — a stray tap
                                near a message row silently deleted it. Gate the
                                reveal on a real hover-capable pointer so a touch
                                device always shows them. */}
                            <button
                                onClick={() => onEdit(msg)}
                                className="text-[11px] text-gray-400 hover:text-blue-500 font-medium px-1.5 min-h-[32px] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity"
                            >
                                Edit
                            </button>
                            <button
                                onClick={() => onDelete(msg._id)}
                                className="text-[11px] text-gray-400 hover:text-red-500 font-medium px-1.5 min-h-[32px] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity"
                            >
                                Delete
                            </button>
                        </>
                    )}
                </div>
            </div>
            {lightbox && msg.imageUrl && (
                <ImageLightbox src={msg.imageUrl} alt="" onClose={() => setLightbox(false)} />
            )}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Pinned strip
 * ══════════════════════════════════════════════════════════════════════════ */
function PinnedStrip({ pinned, members, onOpen }) {
    const [open, setOpen] = useState(false);
    if (!pinned.length) return null;
    return (
        <div className="px-4 pt-2 shrink-0">
            <button
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 min-h-[44px]"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-blue-500 shrink-0">
                    <path d="M14.53 3.5 21 10l-3.1 3.1-1.2-1.2-3.2 3.2 2.6 2.6-1.4 1.4-2.6-2.6-3.5 3.5v-2.3l-4.4-4.4 1.4-1.4 2.6 2.6 3.2-3.2-1.2-1.2L10.5 3.5h4.03Z" />
                </svg>
                <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                        {pinned.length} pinned {pinned.length === 1 ? "message" : "messages"}
                    </span>
                    <span className="block text-[11px] text-blue-600 dark:text-blue-400 truncate">
                        {pinned[0].sender}: {pinned[0].text || inferKind(pinned[0])}
                    </span>
                </span>
                <span className="text-[10px] text-blue-500 shrink-0">{open ? "Hide" : "Show"}</span>
            </button>
            {open && (
                <div className="mt-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800 max-h-48 overflow-y-auto">
                    {pinned.map((m) => (
                        <button
                            key={m._id}
                            onClick={() => { setOpen(false); onOpen(m); }}
                            className="w-full text-left px-3 py-2 min-h-[44px] hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 truncate">
                                {m.sender} · {timeAgo(m.timeStamp)}
                            </p>
                            <p className="text-xs text-gray-900 dark:text-gray-100 truncate">
                                {m.text || `[${inferKind(m)}]`}
                            </p>
                        </button>
                    ))}
                    <p className="px-3 py-2 text-[10px] text-gray-400 dark:text-gray-500">
                        Visible to all {members?.length || 0} members.
                    </p>
                </div>
            )}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Announcement banner
 * ══════════════════════════════════════════════════════════════════════════ */
function AnnouncementBanner({ announcement, onDismiss, onEdit }) {
    if (!announcement?.text) return null;
    return (
        <div className="px-4 pt-2 shrink-0">
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-amber-500 shrink-0 mt-0.5">
                    <path d="M3 10.5v3a.75.75 0 0 0 .75.75H5.2l.6 3.6a2.25 2.25 0 0 0 2.2 1.9h7.9a2.25 2.25 0 0 0 2.2-1.9l.6-3.6h1.4a.75.75 0 0 0 .75-.75v-3a.75.75 0 0 0-.75-.75H3.75A.75.75 0 0 0 3 10.5Zm18-1.5-1.4-1.4a.75.75 0 0 0-1.06 0l-3.04 3.04-1.4-1.4a.75.75 0 1 0-1.06 1.06l1.7 1.7a.75.75 0 0 0 1.06 0l3.24-3.24ZM3 3.75a.75.75 0 0 0 0 1.5h18a.75.75 0 0 0 0-1.5H3Z" />
                </svg>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">Group announcement</p>
                    <p className="text-xs text-amber-900 dark:text-amber-100 break-words whitespace-pre-wrap mt-0.5">{announcement.text}</p>
                    {announcement.setBy && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                            Set by {announcement.setBy}
                            {announcement.setAt ? ` · ${timeAgo(announcement.setAt)}` : ""}
                        </p>
                    )}
                </div>
                {onEdit && (
                    <button
                        onClick={onEdit}
                        aria-label="Edit announcement"
                        className="shrink-0 w-10 h-10 -m-1 flex items-center justify-center text-amber-600 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-100 rounded-lg transition-colors touch-manipulation"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 0 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                        </svg>
                    </button>
                )}
                <button
                    onClick={onDismiss}
                    aria-label="Dismiss announcement for this session"
                    className="shrink-0 w-10 h-10 -m-1 flex items-center justify-center text-amber-600 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-100 rounded-lg transition-colors touch-manipulation"
                >
                    <XIcon />
                </button>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Group chat
 * ══════════════════════════════════════════════════════════════════════════ */
export default function GroupChatBox({ groupId, user, onBack, group, onLeave }) {
    const { showToast } = useToast();
    const { startGroupCall } = useCall();
    const router = useRouter();

    // ── Thread ────────────────────────────────────────────────────────────
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [scrollAtBottom, setScrollAtBottom] = useState(true);
    // The newest message the reader has actually seen. Persisted so a reload
    // still knows where they left off, and checked against the loaded page so a
    // missing anchor simply produces no divider.
    const [readAnchorId, setReadAnchorId] = useState(null);
    const readAnchorRef = useRef(null);
    const readAnchorLoadedRef = useRef(false);
    const scrollAtBottomRef = useRef(true);
    const [pinState, setPinState] = useState("unknown"); // unknown | ok | unavailable

    // ── Composer ──────────────────────────────────────────────────────────
    const [sending, setSending] = useState(false);
    const [text, setText] = useState("");
    const [queue, setQueue] = useState([]);           // uploaded + uploading
    const [audioUrl, setAudioUrl] = useState("");
    const [replyTo, setReplyTo] = useState(null);
    const [linkPreview, setLinkPreview] = useState(null);
    const [codeMode, setCodeMode] = useState(false);
    const [location, setLocation] = useState(null);
    const [poll, setPoll] = useState(null);
    const [showTray, setShowTray] = useState(null);    // one tray, one popover
    const [locationMode, setLocationMode] = useState("idle"); // idle | locating | manual
    const [locationErr, setLocationErr] = useState("");
    const [manualLoc, setManualLoc] = useState({ lat: "", lng: "", label: "" });
    const [pollDraft, setPollDraft] = useState({ question: "", options: ["", ""] });
    const [pollErr, setPollErr] = useState("");

    // ── Autocomplete ──────────────────────────────────────────────────────
    const [mentionQuery, setMentionQuery] = useState(null);
    const [mentionMode, setMentionMode] = useState(null); // "user" | "hashtag"
    const [mentionResults, setMentionResults] = useState([]);
    const [hashtagResults, setHashtagResults] = useState([]);
    const [mentionHighlight, setMentionHighlight] = useState(0);
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);

    // ── Chrome ────────────────────────────────────────────────────────────
    const [enterSends, setEnterSends] = useState(true);
    const [hintSeen, setHintSeen] = useState(true);
    const [draftStatus, setDraftStatus] = useState("idle"); // idle|saving|saved|error|restored
    const [composerBlock, setComposerBlock] = useState(null); // { status, message }
    const [slowHoldUntil, setSlowHoldUntil] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const [showSettings, setShowSettings] = useState(false);
    const [showHeaderMenu, setShowHeaderMenu] = useState(false);
    const [announceDraft, setAnnounceDraft] = useState(null);
    const [generatedInviteCode, setGeneratedInviteCode] = useState("");
    const [inviteBusy, setInviteBusy] = useState(false);
    const [muteBusy, setMuteBusy] = useState(false);

    // ── Per-message features ──────────────────────────────────────────────
    const [translations, setTranslations] = useState({});
    const [translatingId, setTranslatingId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editText, setEditText] = useState("");
    const translateTarget = user?.language || "en";
    const translateTargetName = languageName(translateTarget);

    // ── Refs ──────────────────────────────────────────────────────────────
    const imageInputRef = useRef(null);
    const anyInputRef = useRef(null);
    const inputRef = useRef(null);
    const linkUrlRef = useRef(null);
    const listRef = useRef(null);
    const pollingRef = useRef(null);
    const loadingMoreRef = useRef(false);
    const draftTimerRef = useRef(null);
    const draftRestoredRef = useRef(false);
    const hadDraftRef = useRef(false);
    const queueLenRef = useRef(0);
    const xhrRef = useRef({});
    const localUrlsRef = useRef(new Set());
    const removedRef = useRef(new Set());
    const pollQuestionRef = useRef(null);
    const manualLatRef = useRef(null);

    // ── Group facts. Older group documents have NONE of the newer fields, so
    //    every one of these is defaulted rather than trusted. ─────────────
    const members = group?.members || [];
    const myMember = members.find((m) => (m.username || m) === user?.username) || null;
    const isAdmin = myMember?.role === "admin";
    const maxMembers = Number(group?.maxMembers) || 0;
    const memberCount = members.length;
    const slowModeSeconds = Math.max(0, Number(group?.slowModeSeconds) || 0);
    const muted = !!group?.mutedBy?.includes(user?.username);

    /**
     * `whoCanSend: "admin"` is enforced server-side with a 403
     * (groups.js:410). The composer was never disabled for it, so a member
     * could compose a whole message and only discover at send time that this
     * group is read-only for them. Derived, not fetched.
     */
    const readOnlyForMe = (group?.permissions?.whoCanSend || "all") === "admin" && !isAdmin;

    // The draft scope convention: `group:<id>`, same endpoint the DM uses.
    const draftUrl = useMemo(
        () => (groupId ? `/api/messaging/drafts/${encodeURIComponent(`group:${groupId}`)}` : ""),
        [groupId]
    );

    // ── Derived composer state ───────────────────────────────────────────
    const readyQueue = useMemo(() => queue.filter((i) => i.status === "ready" && i.url), [queue]);
    const firstImage = useMemo(() => readyQueue.find((i) => i.kind === "image") || null, [readyQueue]);
    const firstVideo = useMemo(() => readyQueue.find((i) => i.kind === "video") || null, [readyQueue]);
    const uploadingCount = useMemo(() => queue.filter((i) => i.status === "uploading").length, [queue]);
    const textLimit = codeMode ? Math.max(0, MAX_TEXT - FENCE_OVERHEAD) : MAX_TEXT;
    const hasContent = !!(text.trim() || audioUrl || readyQueue.length || location || poll);

    // ── Slow mode countdown, derived rather than stored ──────────────────
    // Two sources of truth for "when may I next send":
    //   * the sender's OWN last message plus `slowModeSeconds`, so the wait
    //     starts the moment the wait does instead of after a rejected send;
    //   * `slowHoldUntil`, set only by a 429, because only the server knows
    //     the real elapsed time.
    // Admins are exempt server-side (groups.js:418), so an admin must not be
    // shown a wait that does not exist.
    const username = user?.username;
    const ownLastSentAt = useMemo(() => {
        if (!username || slowModeSeconds <= 0) return 0;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].sender === username && messages[i].timeStamp) {
                const t = new Date(messages[i].timeStamp).getTime();
                if (Number.isFinite(t)) return t;
            }
        }
        return 0;
    }, [messages, username, slowModeSeconds]);

    const waitUntil = (slowModeSeconds > 0 && !isAdmin)
        ? Math.max(slowHoldUntil, ownLastSentAt ? ownLastSentAt + slowModeSeconds * 1000 : 0)
        : 0;
    const inCooldown = waitUntil > now;
    // Only mounts while a wait is live, so an idle group never ticks.
    useEffect(() => {
        if (!inCooldown) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [inCooldown]);
    const cooldownLeft = inCooldown ? Math.ceil((waitUntil - now) / 1000) : 0;

    const composerEnabled = !!user && !!groupId && !readOnlyForMe && !inCooldown;
    const canSend = hasContent && !sending && uploadingCount === 0 && composerEnabled;
    const showCounter = text.length >= COUNTER_AT;
    const showHint = !hintSeen && composerEnabled;
    const trayVisible = !!showTray && !showMentionDropdown;
    const barePanel = showTray === "gif" || showTray === "emoji";

    const pinnedMessages = useMemo(() => messages.filter((m) => m.pinned), [messages]);

    /**
     * Index of the first message that arrived after the user last read to the
     * bottom. A group is 8s polling with no socket, so without an anchor there
     * is no way to tell "already read" from "arrived while you were away".
     */
    const dividerIndex = useMemo(() => {
        if (!readAnchorId) return -1;
        const idx = messages.findIndex((m) => m._id === readAnchorId);
        // The anchor can be gone: never in this page, or removed since.
        if (idx === -1) return -1;
        return idx === messages.length - 1 ? -1 : idx + 1;
    }, [messages, readAnchorId]);

    // Every field here is optional on older group documents, so the key is only
    // built from a `setAt` that is actually a usable date.
    const announcementSetAt = group?.announcement?.setAt;
    const announcementKey = useMemo(() => {
        if (!announcementSetAt) return "";
        const t = new Date(announcementSetAt).getTime();
        return Number.isFinite(t) ? `announce:${new Date(t).toISOString()}` : "";
    }, [announcementSetAt]);

    // A locally generated code wins until the server's own arrives, so an
    // existing `group.inviteCode` is rendered as-is and a rotated one shows up
    // without a props-to-state sync effect.
    const inviteCode = generatedInviteCode || group?.inviteCode || "";

    // Dismissal is stored as the KEY that was dismissed rather than a boolean,
    // so a new announcement (new `setAt`, new key) reappears on its own with no
    // reset effect. Read once, lazily: sessionStorage does not exist during SSR
    // and a fresh key can never have been dismissed.
    const [dismissedKey, setDismissedKey] = useState(() => {
        try { return sessionStorage.getItem(ANNOUNCE_HIDDEN_KEY) || ""; } catch { return ""; }
    });
    const announcementDismissed = !!announcementKey && dismissedKey === announcementKey;
    const dismissAnnouncement = useCallback(() => {
        if (!announcementKey) return;
        setDismissedKey(announcementKey);
        try { sessionStorage.setItem(ANNOUNCE_HIDDEN_KEY, announcementKey); } catch { /* private mode */ }
    }, [announcementKey]);

    useEffect(() => { queueLenRef.current = queue.length; }, [queue]);

    /* ── Read anchor (the new-message divider) ──────────────────────────── */
    // Advanced only when the thread is actually at the bottom, which is what
    // makes it a read position rather than a load position. Called from the
    // scroll handler, from a successful send and from a poll that landed while
    // the reader was already at the bottom — never from an effect body, so
    // there is no props-to-state cascade.
    const markRead = useCallback((messageId) => {
        if (!messageId || readAnchorRef.current === messageId) return;
        readAnchorRef.current = messageId;
        setReadAnchorId(messageId);
        try { localStorage.setItem(`group_read:${groupId}`, messageId); } catch { /* private mode */ }
    }, [groupId]);

    /* ── Thread fetching (8s poll) ──────────────────────────────────────── */
    const fetchMessages = useCallback(async (before = null) => {
        // One page load at a time. Every scroll event in the top band used to
        // fire its own request, so scrolling up through history could queue
        // dozens of overlapping fetches, each of which then prepended a page and
        // moved the list further.
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        if (before) setLoadingMore(true);
        try {
            const params = new URLSearchParams({ limit: "20" });
            if (before) params.set("before", before);
            const res = await fetch(`/api/groups/${groupId}/messages?${params}`);
            if (!res.ok) {
                // Used to `return` before setLoading(false), so any 403/500 left
                // the group chat spinning forever.
                setError("Could not load messages");
                return;
            }
            const data = await res.json();
            // Hydrate the persisted read position once, after the first await so
            // this is never a synchronous setState in the mount effect.
            if (!readAnchorLoadedRef.current) {
                readAnchorLoadedRef.current = true;
                try {
                    const stored = localStorage.getItem(`group_read:${groupId}`);
                    if (stored) { readAnchorRef.current = stored; setReadAnchorId(stored); }
                } catch { /* private mode */ }
            }
            setMessages(prev => {
                const existing = new Set(prev.map(m => m._id));
                // Merge in every case.
                //
                // The non-paginated branch used to `return data.messages`,
                // replacing the list with the newest page. So: scroll up to read
                // history, wait at most 8 seconds for the poll, and everything
                // except the newest 20 messages disappeared. The DM view merges
                // correctly; this now matches.
                const fresh = (data.messages || []).filter(m => !existing.has(m._id));
                return fresh.length ? [...fresh, ...prev] : prev;
            });
            if (before) setHasMore(data.hasMore);
            // A poll that lands while the reader is already at the bottom is
            // read on arrival, so the divider does not appear behind their eyes.
            // `before` is a history load: never mark that as reading.
            if (!before && scrollAtBottomRef.current) {
                const list = data.messages || [];
                markRead(list[list.length - 1]?._id);
            }
        } catch {
            setError("Network error");
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
            setLoading(false);
        }
    }, [groupId, markRead]);

    useEffect(() => {
        fetchMessages(); // eslint-disable-line react-hooks/set-state-in-effect
        return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }, [fetchMessages]);

    useEffect(() => {
        pollingRef.current = setInterval(() => fetchMessages(), 8000);
        return () => clearInterval(pollingRef.current);
    }, [fetchMessages]);

    useEffect(() => {
        if (!user || !groupId) return;
        fetch(`/api/groups/${groupId}/messages`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            // No `readBy` in the body: the server now derives the actor from the
            // session and ignores a client-supplied one, which is what let an
            // unauthenticated caller mark any group read.
            body: JSON.stringify({ action: "read" }),
        }).catch(() => {});
    }, [groupId, user?.username, messages.length]);

    /* ── Link preview ───────────────────────────────────────────────────── */
    useEffect(() => {
        // Suppressed in code mode: a URL inside a fenced block is source, not a
        // thing to unfurl.
        const url = codeMode ? null : extractFirstUrl(text);
        const t = setTimeout(() => {
            if (!url) {
                setLinkPreview(null);
                linkUrlRef.current = null;
                return;
            }
            if (linkUrlRef.current === url) return;
            linkUrlRef.current = url;
            (async () => {
                try {
                    const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
                    if (!res.ok) return;
                    const data = await res.json();
                    if (data?.preview && linkUrlRef.current === url) {
                        setLinkPreview(data.preview);
                    }
                } catch { /* preview is best effort */ }
            })();
        }, 600);
        return () => clearTimeout(t);
    }, [text, codeMode]);

    /* ── Auto-grow ──────────────────────────────────────────────────────── */
    // Measured synchronously from onChange as well as from the effect: the
    // effect alone measures a node React has not re-rendered yet, so a
    // keystroke paints one frame at the old height.
    const resizeComposer = useCallback(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        const next = Math.min(el.scrollHeight, MAX_COMPOSER_PX);
        el.style.height = `${next}px`;
        el.style.overflowY = el.scrollHeight > MAX_COMPOSER_PX ? "auto" : "hidden";
    }, []);

    useEffect(() => { resizeComposer(); }, [text, codeMode, resizeComposer]);

    /* ── Mention / hashtag autocomplete ─────────────────────────────────── */
    useEffect(() => {
        if (mentionQuery === null) return;
        const controller = new AbortController();
        const t = setTimeout(async () => {
            try {
                if (mentionMode === "hashtag") {
                    const url = mentionQuery
                        ? `/api/hashtags/trending?limit=8&search=${encodeURIComponent(mentionQuery)}`
                        : `/api/hashtags/trending?limit=8`;
                    const res = await fetch(url, { signal: controller.signal });
                    if (res.ok) {
                        const data = await res.json();
                        const list = data.hashtags || data;
                        setHashtagResults(Array.isArray(list) ? list : []);
                    }
                } else {
                    const res = await fetch(`/api/search?q=${encodeURIComponent(mentionQuery)}`, {
                        signal: controller.signal,
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const list = Array.isArray(data.users) ? data.users : [];
                        // Members first. `GET /api/search` is a global search, so
                        // it will happily suggest people who cannot read this
                        // group; they stay listed, but behind the roster.
                        const inGroup = list.filter((u) => members.some((m) => (m.username || m) === u.username));
                        const outGroup = list.filter((u) => !inGroup.includes(u));
                        setMentionResults([...inGroup, ...outGroup].slice(0, 8));
                    }
                }
            } catch { /* silent — includes the AbortError of a superseded keystroke */ }
        }, 200);
        return () => { clearTimeout(t); controller.abort(); };
        // `members` is read only to order the results; re-running the lookup
        // because a member joined would be a request per roster change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mentionQuery, mentionMode]);

    // The highlight is CLAMPED during render rather than reset in an effect.
    // A reset effect is a second render for every keystroke that changes the
    // result set, and it still leaves the highlight pointing past the end for
    // the frame in between.
    const suggestionItems = mentionMode === "hashtag" ? hashtagResults : mentionResults;
    const mentionHighlightClamped = suggestionItems.length
        ? Math.min(mentionHighlight, suggestionItems.length - 1)
        : 0;

    /* ── Attachment queue ───────────────────────────────────────────────── */
    const patchItem = useCallback((id, changes) => {
        setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...changes } : q)));
    }, []);

    const startUpload = useCallback(async (item) => {
        let lastPct = -1;
        try {
            const url = await uploadToCloudinary(item.file, {
                resourceType: resourceTypeFor(item.kind),
                // Throttled: a raw upload event fires many times a second and
                // every one of them would re-render the whole composer.
                onProgress: (p) => { if (p - lastPct >= 5) { lastPct = p; patchItem(item.id, { progress: p }); } },
                onXhr: (xhr) => { if (xhr) xhrRef.current[item.id] = xhr; else delete xhrRef.current[item.id]; },
            });
            patchItem(item.id, { status: "ready", progress: 100, url });
        } catch (err) {
            // A cancelled upload is one the user asked to remove, so it is not
            // an error worth shouting about.
            if (removedRef.current.has(item.id)) return;
            patchItem(item.id, { status: "error", error: err?.message || "Upload failed" });
            showToast(`${item.name}: ${err?.message || "Upload failed"}`, "error");
        } finally {
            if (item.localUrl && localUrlsRef.current.has(item.localUrl)) {
                localUrlsRef.current.delete(item.localUrl);
                try { URL.revokeObjectURL(item.localUrl); } catch { /* already gone */ }
            }
        }
    }, [patchItem, showToast]);

    const addFiles = useCallback((fileList) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        const accepted = [];
        const rejected = [];
        for (const file of files) {
            if (queueLenRef.current + accepted.length >= MAX_QUEUE) {
                rejected.push(`only ${MAX_QUEUE} attachments per message`);
                break;
            }
            const kind = classifyFile(file);
            const limit = limitFor(kind);
            if (file.size > limit) {
                rejected.push(`${file.name || "file"} is over the ${formatBytes(limit)} ${KIND_LABEL[kind].toLowerCase()} limit`);
                continue;
            }
            let localUrl = "";
            try { localUrl = URL.createObjectURL(file); } catch { /* not available */ }
            if (localUrl) localUrlsRef.current.add(localUrl);
            accepted.push({
                id: uid(),
                kind,
                name: file.name || defaultNameFor(kind),
                size: file.size,
                mimeType: file.type || "",
                status: "uploading",
                progress: 0,
                url: "",
                error: "",
                file,
                localUrl,
            });
        }
        if (rejected.length) showToast(rejected.slice(0, 2).join(" · "), "error");
        if (!accepted.length) return;
        setQueue((prev) => [...prev, ...accepted]);
        for (const item of accepted) startUpload(item);
    }, [startUpload, showToast]);

    /** A file that already has a URL (the GIF picker, a restored draft). */
    const addRemote = useCallback((item) => {
        if (queueLenRef.current >= MAX_QUEUE) {
            showToast(`Only ${MAX_QUEUE} attachments per message`, "error");
            return;
        }
        setQueue((prev) => [...prev, {
            id: uid(),
            kind: item.kind,
            name: item.name || defaultNameFor(item.kind),
            size: item.size || 0,
            mimeType: item.mimeType || "",
            status: "ready",
            progress: 100,
            url: item.url,
            error: "",
        }]);
    }, [showToast]);

    const removeItem = useCallback((id) => {
        removedRef.current.add(id);
        const xhr = xhrRef.current[id];
        if (xhr) { try { xhr.abort(); } catch { /* already finished */ } delete xhrRef.current[id]; }
        setQueue((prev) => {
            const hit = prev.find((q) => q.id === id);
            if (hit?.localUrl && localUrlsRef.current.has(hit.localUrl)) {
                localUrlsRef.current.delete(hit.localUrl);
                try { URL.revokeObjectURL(hit.localUrl); } catch { /* already gone */ }
            }
            return prev.filter((q) => q.id !== id);
        });
    }, []);

    // Abort anything still in flight if the composer goes away mid-upload.
    useEffect(() => () => {
        for (const id of Object.keys(xhrRef.current)) {
            try { xhrRef.current[id].abort(); } catch { /* already finished */ }
        }
        xhrRef.current = {};
        for (const url of localUrlsRef.current) {
            try { URL.revokeObjectURL(url); } catch { /* already gone */ }
        }
        localUrlsRef.current.clear();
    }, []);

    const toAttachment = (item) => ({
        url: item.url,
        name: item.name || defaultNameFor(item.kind),
        mimeType: item.mimeType || `${item.kind}/*`,
        size: Number(item.size) || 0,
    });

    /* ── Drafts ─────────────────────────────────────────────────────────── */
    const draftPayload = useCallback(() => ({
        // A code block is persisted already fenced, so a restored draft can
        // detect it and come back in code mode.
        text: codeMode ? fence(text) : text,
        imageUrl: firstImage?.url || "",
        audioUrl,
        videoUrl: firstVideo?.url || "",
        // The COMPLETE manifest, including the item that also appears in the
        // `imageUrl` / `videoUrl` scalars. The scalars exist for the bubble and
        // the sender's own preview; the manifest is what makes the draft
        // lossless, so a multi-file message survives a reload instead of
        // collapsing to its first photo.
        attachments: readyQueue.map(toAttachment),
        location,
        poll,
        kind: resolveKind({ codeMode, location, poll, hasVideo: !!firstVideo, hasImage: !!firstImage, audioUrl, attachmentCount: readyQueue.length }),
    }), [codeMode, text, firstImage, audioUrl, firstVideo, readyQueue, location, poll]);

    const applyDraft = useCallback((d) => {
        if (!d) return;
        if (typeof d.text === "string" && d.text) {
            const raw = unfence(d.text);
            if (raw !== null) { setCodeMode(true); setText(raw.slice(0, MAX_TEXT)); }
            else setText(d.text.slice(0, MAX_TEXT));
        }
        setAudioUrl(d.audioUrl || "");
        // `location` and `poll` ARE declared on ChatDraft, so unlike the DM
        // composer this one can restore them.
        if (d.location && Number.isFinite(Number(d.location.lat)) && Number.isFinite(Number(d.location.lng))) {
            setLocation({ lat: Number(d.location.lat), lng: Number(d.location.lng), label: d.location.label || "" });
        }
        if (d.poll?.question && Array.isArray(d.poll.options) && d.poll.options.length >= 2) {
            setPoll({
                question: d.poll.question,
                options: d.poll.options.map((o) => ({ text: o?.text ?? o, votes: Array.isArray(o?.votes) ? o.votes : [] })),
                votes: Array.isArray(d.poll.votes) ? d.poll.votes : [],
            });
        }
        const items = Array.isArray(d.attachments) ? d.attachments.filter((a) => a && a.url) : [];
        if (items.length) {
            setQueue(items.map((a) => ({
                id: uid(),
                kind: kindFromMime(a.mimeType, a.url),
                name: a.name || "Attachment",
                size: Number(a.size) || 0,
                mimeType: a.mimeType || "",
                status: "ready",
                progress: 100,
                url: a.url,
                error: "",
            })));
        } else if (d.imageUrl || d.videoUrl) {
            setQueue([{
                id: uid(),
                kind: d.imageUrl ? "image" : "video",
                name: d.imageUrl ? "Photo" : "Video",
                size: 0,
                mimeType: "",
                status: "ready",
                progress: 100,
                url: d.imageUrl || d.videoUrl,
                error: "",
            }]);
        }
    }, []);

    useEffect(() => {
        if (!draftUrl) return;
        let cancelled = false;
        draftRestoredRef.current = false;
        hadDraftRef.current = false;
        (async () => {
            try {
                const res = await fetch(draftUrl, { credentials: "include" });
                if (cancelled) return;
                if (res.ok) {
                    const data = await res.json().catch(() => null);
                    if (cancelled) return;
                    const d = data?.draft;
                    const has = d && (d.text || d.audioUrl || d.imageUrl || d.videoUrl
                        || (d.attachments && d.attachments.length) || d.location || d.poll);
                    if (has) {
                        hadDraftRef.current = true;
                        applyDraft(d);
                        setDraftStatus("restored");
                    }
                }
            } catch { /* offline or no draft: composing still works */ }
            if (!cancelled) draftRestoredRef.current = true;
        })();
        return () => { cancelled = true; };
    }, [draftUrl, applyDraft]);

    useEffect(() => {
        if (!draftUrl || !draftRestoredRef.current) return;
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        draftTimerRef.current = setTimeout(() => {
            const payload = draftPayload();
            const empty = !payload.text.trim() && !payload.imageUrl && !payload.audioUrl
                && !payload.videoUrl && payload.attachments.length === 0 && !payload.location && !payload.poll;
            if (empty && !hadDraftRef.current) return;
            hadDraftRef.current = true;
            setDraftStatus("saving");
            (async () => {
                try {
                    const res = await fetch(draftUrl, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(payload),
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    setDraftStatus("saved");
                } catch {
                    setDraftStatus("error");
                }
            })();
        }, DRAFT_DEBOUNCE_MS);
        return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
    }, [draftPayload, draftUrl]);

    const clearDraft = useCallback(async () => {
        if (draftTimerRef.current) { clearTimeout(draftTimerRef.current); draftTimerRef.current = null; }
        hadDraftRef.current = false;
        setDraftStatus("idle");
        try {
            await fetch(draftUrl, { method: "DELETE", credentials: "include" });
        } catch { /* best effort: the stale draft is overwritten on next open */ }
    }, [draftUrl]);

    /* ── Persisted Enter mode ───────────────────────────────────────────── */
    useEffect(() => {
        // Read after mount, in a microtask: localStorage does not exist during
        // SSR, and a lazy initialiser would produce different server and client
        // markup on the very first paint.
        queueMicrotask(() => {
            try {
                const stored = localStorage.getItem(ENTER_MODE_KEY);
                if (stored === "send" || stored === "newline") setEnterSends(stored === "send");
                setHintSeen(localStorage.getItem(ENTER_HINT_KEY) === "1");
            } catch { /* private mode: keep the defaults */ }
        });
    }, []);

    const persistEnterMode = (sends) => {
        setEnterSends(sends);
        try { localStorage.setItem(ENTER_MODE_KEY, sends ? "send" : "newline"); } catch { /* private mode */ }
        setHintSeen(true);
        try { localStorage.setItem(ENTER_HINT_KEY, "1"); } catch { /* private mode */ }
    };

    const dismissHint = () => {
        setHintSeen(true);
        try { localStorage.setItem(ENTER_HINT_KEY, "1"); } catch { /* private mode */ }
    };

    /* ── Slow mode ──────────────────────────────────────────────────────── */
    // The countdown itself is derived above (`waitUntil` / `now`); nothing here
    // needs to seed it, which is why there is no cooldown effect: the wait is
    // computed from the sender's own last message every render.

    /* ── Per-message actions ────────────────────────────────────────────── */
    const handleTranslate = useCallback(async (id, value) => {
        setTranslations(prev => {
            if (prev[id]) {
                const next = { ...prev };
                delete next[id];
                return next;
            }
            return prev;
        });
        if (translations[id]) return;
        setTranslatingId(id);
        const translated = await translateItem(value, translateTarget);
        setTranslatingId(null);
        if (translated) setTranslations(prev => ({ ...prev, [id]: translated }));
    }, [translations, translateTarget]);

    const handleStar = useCallback(async (msg) => {
        const wasStarred = !!msg.starredBy?.includes(user?.username);
        const me = user?.username;
        setMessages(prev => prev.map(m => (
            m._id === msg._id
                ? {
                    ...m,
                    starredBy: wasStarred
                        ? m.starredBy.filter(u => u !== me)
                        : [...(m.starredBy || []), me],
                }
                : m
        )));
        try {
            const res = await fetch(`/api/groups/${groupId}/messages`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "star", messageId: msg._id }),
            });
            if (!res.ok) throw new Error("star failed");
        } catch {
            setMessages(prev => prev.map(m => (
                m._id === msg._id
                    ? {
                        ...m,
                        starredBy: wasStarred
                            ? [...new Set([...(m.starredBy || []), me])]
                            : m.starredBy.filter(u => u !== me),
                    }
                    : m
            )));
            showToast("Could not update star", "error");
        }
    }, [user?.username, groupId, showToast]);

    const beginEdit = useCallback((msg) => {
        setEditingId(msg._id);
        setEditText(msg.text || "");
    }, []);

    const saveEdit = useCallback(async (id) => {
        const next = editText.trim();
        if (!next) return;
        const original = messages.find(m => m._id === id)?.text;
        setEditingId(null);
        if (next === original) return;
        setMessages(prev => prev.map(m => (m._id === id ? { ...m, text: next, editedAt: new Date() } : m)));
        try {
            await callApi(`/api/groups/${groupId}/messages`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "edit", messageId: id, text: next }),
            });
        } catch (e) {
            setMessages(prev => prev.map(m => (m._id === id ? { ...m, text: original, editedAt: null } : m)));
            showToast(errText(e), "error");
        }
    }, [editText, messages, groupId, showToast]);

    const handleReact = useCallback(async (messageId, reactionType) => {
        try {
            const updated = await callApi(`/api/groups/${groupId}/messages`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "react", messageId, reactionType }),
            });
            setMessages(prev => prev.map(m => (m._id === messageId ? { ...m, reactions: updated.reactions } : m)));
        } catch (e) {
            // Was `catch {}` with no else, so a rejected reaction (not a
            // member, message gone) did nothing visible at all.
            showToast(errText(e), "error");
        }
    }, [groupId, showToast]);

    // Group message pinning is NOT implemented server-side: the PATCH
    // dispatcher (groups.js:549) handles read / react / star / edit / delete
    // and answers `400 Invalid request` for anything else, so `pin` cannot
    // work today. Not optimistic — the first refusal latches the control off
    // with the server's own words attached rather than leaving a button that
    // appears to work.
    const handlePin = useCallback(async (msg) => {
        try {
            await callApi(`/api/groups/${groupId}/messages`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: msg.pinned ? "unpin" : "pin", messageId: msg._id }),
            });
            setPinState("ok");
            setMessages(prev => prev.map(m => (m._id === msg._id ? { ...m, pinned: !m.pinned } : m)));
        } catch (e) {
            setPinState("unavailable");
            showToast(
                `${errText(e)} \u2014 group message pinning is not implemented server-side, so nothing was pinned.`,
                "error"
            );
        }
    }, [groupId, showToast]);

    const deleteMessage = useCallback(async (messageId, confirmText, successText) => {
        if (!confirm(confirmText)) return;
        try {
            await callApi(`/api/groups/${groupId}/messages`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "delete", messageId }),
            });
            // Soft delete server-side, so the row stays as a tombstone rather
            // than vanishing. Matches the DM bubble.
            setMessages(prev => prev.map(m => (
                m._id === messageId
                    ? { ...m, deleted: true, text: "", imageUrl: "", audioUrl: "" }
                    : m
            )));
            showToast(successText, "success");
        } catch (e) {
            showToast(errText(e), "error");
        }
    }, [groupId, showToast]);

    const handleDelete = useCallback((messageId) => deleteMessage(
        messageId,
        "Delete this message? Everyone in the group will see it replaced with a \u201Cmessage was deleted\u201D placeholder.",
        "Message deleted"
    ), [deleteMessage]);

    // The confirm is explicit about the missing window. A DM recall has 60s; a
    // group one has none, and a countdown that does not exist would be a lie.
    // The action is also sender-only (groups.js:638) and SOFT, so the text goes
    // for everyone and a tombstone replaces it.
    const handleRecall = useCallback((msg) => deleteMessage(
        msg._id,
        "Recall this message for everyone?\n\nThere is NO time limit on a group recall \u2014 the server accepts it from you at any age, and the text is replaced with a \u201Cmessage was deleted\u201D placeholder for every member.",
        "Message recalled"
    ), [deleteMessage]);

    /* ── Group-level actions ────────────────────────────────────────────── */
    const patchGroup = useCallback(async (body) => {
        const updated = await callApi(`/api/groups/${groupId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        // The parent owns the group object; `groupUpdated` is the event it
        // already listens for.
        if (updated?._id) {
            window.dispatchEvent(new CustomEvent("groupUpdated", { detail: updated }));
        }
        return updated;
    }, [groupId]);

    // Mute. `toggleMute` had no client caller and no client reader at all: the
    // server pushed a username into `mutedBy` and nothing ever displayed it or
    // flipped it. Both halves now exist. The unread badge itself is rendered by
    // the inbox list, which is not this file, so a window event is emitted as
    // the integration point rather than leaving the flag inert.
    const handleMute = useCallback(async () => {
        if (muteBusy) return;
        setMuteBusy(true);
        try {
            await patchGroup({ action: "toggleMute" });
            window.dispatchEvent(new CustomEvent("groupMuteChanged", {
                detail: { groupId, username, muted: !muted },
            }));
            showToast(muted ? "Group unmuted" : "Group muted", "success");
        } catch (e) {
            showToast(errText(e), "error");
        } finally {
            setMuteBusy(false);
        }
    }, [muteBusy, muted, patchGroup, groupId, username, showToast]);

    const handleSaveAnnouncement = useCallback(async (value) => {
        try {
            await patchGroup({ action: "announcement", text: value });
            setAnnounceDraft(null);
            // A fresh announcement gets a fresh `setAt`, so a fresh dismissal
            // key; clearing the old one is what makes it appear immediately
            // rather than staying hidden until the next reload.
            setDismissedKey("");
            try { sessionStorage.removeItem(ANNOUNCE_HIDDEN_KEY); } catch { /* private mode */ }
            showToast(value.trim() ? "Announcement set" : "Announcement cleared", "success");
        } catch (e) {
            showToast(errText(e), "error");
        }
    }, [patchGroup, showToast]);

    const inviteLink = useMemo(() => {
        if (!inviteCode || typeof window === "undefined") return "";
        return `${window.location.origin}/inbox?group=${groupId}&invite=${inviteCode}`;
    }, [inviteCode, groupId]);

    // Never regenerated on render: only when a link is actually asked for and
    // none exists, so opening the sheet cannot invalidate a link that was
    // already shared. An existing `group.inviteCode` is used as-is.
    const handleInvite = useCallback(async () => {
        if (inviteCode && inviteLink) {
            const ok = await copyText(inviteLink);
            showToast(ok ? "Invite link copied" : "Could not copy \u2014 the link is in group settings", ok ? "success" : "error");
            setShowHeaderMenu(false);
            return;
        }
        if (!isAdmin) {
            showToast("Only admins can generate an invite link for this group", "error");
            return;
        }
        setInviteBusy(true);
        try {
            const updated = await patchGroup({ action: "regenerateInvite" });
            if (updated?.inviteCode) setGeneratedInviteCode(updated.inviteCode);
            setShowSettings(true);
        } catch (e) {
            showToast(errText(e), "error");
        } finally {
            setInviteBusy(false);
        }
    }, [inviteCode, inviteLink, isAdmin, patchGroup, showToast]);

    const handleLeave = useCallback(async () => {
        setShowHeaderMenu(false);
        const lastOne = memberCount <= 1;
        const ok = confirm(lastOne
            ? "Leave this group?\n\nYou are the last member, so the group AND every message in it will be deleted for everyone. This cannot be undone."
            : "Leave this group?\n\nYou will stop receiving its messages. If you are the only admin, the server promotes the next member automatically so the group still has someone who can manage it."
        );
        if (!ok) return;
        try {
            await patchGroup({ action: "leave" });
            showToast("Left group", "success");
            onLeave?.();
        } catch (e) {
            showToast(errText(e), "error");
        }
    }, [memberCount, patchGroup, showToast, onLeave]);

    const handleGroupCall = () => {
        const others = members.map((m) => (m.username || m)).filter((n) => n !== user?.username);
        if (others.length === 0) {
            showToast("No other members to call", "error");
            return;
        }
        startGroupCall(others, "audio");
    };

    /* ── Send ───────────────────────────────────────────────────────────── */
    const clearComposer = () => {
        setText("");
        setAudioUrl("");
        setQueue([]);
        setLocation(null);
        setPoll(null);
        setCodeMode(false);
        setLinkPreview(null);
        linkUrlRef.current = null;
        setReplyTo(null);
    };

    const handleSend = async () => {
        if (!canSend) return;
        setSending(true);
        setComposerBlock(null);

        const rawText = text;
        const rawAudio = audioUrl;
        const rawQueue = readyQueue;
        const rawLocation = location;
        const rawPoll = poll;
        const rawCode = codeMode;
        const rawLink = linkPreview;
        const rawReply = replyTo;

        // `sender` and `color` are deliberately absent: the route derives both
        // from the session (groups.js:399) and ignores anything sent here.
        const payload = {
            text: rawCode ? fence(rawText) : rawText.trim(),
            imageUrl: rawQueue.find((i) => i.kind === "image")?.url || "",
            audioUrl: rawAudio,
            videoUrl: rawQueue.find((i) => i.kind === "video")?.url || "",
            attachments: rawQueue.map(toAttachment),
            replyTo: rawReply ? { sender: rawReply.sender, text: rawReply.text, messageId: rawReply._id } : { sender: null, text: "", messageId: null },
            linkPreview: rawLink,
            kind: resolveKind({
                codeMode: rawCode,
                location: rawLocation,
                poll: rawPoll,
                hasVideo: !!rawQueue.find((i) => i.kind === "video"),
                hasImage: !!rawQueue.find((i) => i.kind === "image"),
                audioUrl: rawAudio,
                attachmentCount: rawQueue.length,
            }),
        };
        if (rawLocation) payload.location = rawLocation;
        if (rawPoll) payload.poll = rawPoll;

        clearComposer();

        try {
            const msg = await callApi(`/api/groups/${groupId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (msg?._id) setMessages(prev => [...prev, msg]);
            scrollAtBottomRef.current = true;
            setScrollAtBottom(true);
            markRead(msg?._id);
            await clearDraft();
        } catch (e) {
            // Give the composer back exactly what was typed. The old failure
            // path dropped the text, the attachment and the link preview
            // silently, so a 403 or a network blip lost the message.
            setText(rawText);
            setAudioUrl(rawAudio);
            setQueue(rawQueue);
            setLocation(rawLocation);
            setPoll(rawPoll);
            setCodeMode(rawCode);
            setLinkPreview(rawLink);
            linkUrlRef.current = null;
            setReplyTo(rawReply);
            hadDraftRef.current = true;

            // 403 and 429 are different problems with different recoveries, so
            // they are never collapsed into one generic error row.
            if (e.status === 429) {
                // `retryAfterSeconds` is the server's own arithmetic, so the hold
                // is anchored to it rather than re-derived from a local guess.
                const retry = Number(e.payload?.retryAfterSeconds);
                const secs = Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : (slowModeSeconds || 1);
                setSlowHoldUntil(Date.now() + secs * 1000);
                setComposerBlock({ status: 429, message: errText(e) });
            } else {
                setComposerBlock({ status: e.status || 0, message: errText(e) });
            }
            showToast(errText(e), "error");
        } finally { setSending(false); }
    };

    /* ── Keyboard / caret ───────────────────────────────────────────────── */
    const insertAtCaret = (snippet) => {
        const el = inputRef.current;
        const start = el?.selectionStart ?? text.length;
        const end = el?.selectionEnd ?? start;
        const next = (text.slice(0, start) + snippet + text.slice(end)).slice(0, textLimit);
        setText(next);
        const pos = Math.min(next.length, start + snippet.length);
        requestAnimationFrame(() => {
            if (!el) return;
            el.focus();
            el.setSelectionRange(pos, pos);
            resizeComposer();
        });
    };

    const insertMention = (username) => {
        const el = inputRef.current;
        const pos = el?.selectionStart ?? text.length;
        const before = text.slice(0, pos);
        const atIdx = before.lastIndexOf("@");
        if (atIdx === -1) return;
        const newText = (before.slice(0, atIdx) + `@${username} ` + text.slice(pos)).slice(0, textLimit);
        setShowMentionDropdown(false);
        setMentionQuery(null);
        setMentionMode(null);
        setText(newText);
        const newPos = Math.min(newText.length, atIdx + username.length + 2);
        requestAnimationFrame(() => {
            if (!el) return;
            el.focus();
            el.setSelectionRange(newPos, newPos);
            resizeComposer();
        });
    };

    const insertHashtag = (tag) => {
        // Coerce once, and refuse to touch the input if nothing usable came
        // through: `tag.replace` on a non-string throws on the keypress, and
        // `#${rawObject}` would paste a literal "[object Object]".
        const raw = typeof tag === "string" ? tag : tag?.tag;
        if (typeof raw !== "string") return;
        const cleanTag = raw.replace(/^#/, "").trim();
        if (!cleanTag) return;
        const el = inputRef.current;
        const pos = el?.selectionStart ?? text.length;
        const before = text.slice(0, pos);
        const hashIdx = before.lastIndexOf("#");
        if (hashIdx === -1) return;
        const newText = (before.slice(0, hashIdx) + `#${cleanTag} ` + text.slice(pos)).slice(0, textLimit);
        setShowMentionDropdown(false);
        setMentionQuery(null);
        setMentionMode(null);
        setText(newText);
        const newPos = Math.min(newText.length, hashIdx + cleanTag.length + 2);
        requestAnimationFrame(() => {
            if (!el) return;
            el.focus();
            el.setSelectionRange(newPos, newPos);
            resizeComposer();
        });
    };

    const handleTextChange = (value) => {
        setText(value);
        const pos = inputRef.current?.selectionStart ?? value.length;
        const before = value.slice(0, pos);
        const hashtagMatch = before.match(/#([a-zA-Z0-9_]*)$/);
        const userMatch = before.match(/@([a-zA-Z0-9_]*)$/);
        if (hashtagMatch && (!userMatch || hashtagMatch.index > userMatch.index)) {
            setMentionQuery(hashtagMatch[1]);
            setMentionMode("hashtag");
            setShowMentionDropdown(true);
        } else if (userMatch) {
            setMentionQuery(userMatch[1]);
            setMentionMode("user");
            setShowMentionDropdown(true);
        } else {
            setShowMentionDropdown(false);
            setMentionQuery(null);
            setMentionMode(null);
        }
    };

    const handleKeyDown = (e) => {
        const items = suggestionItems;
        if (showMentionDropdown && items.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionHighlight((h) => (h + 1) % items.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionHighlight((h) => (h - 1 + items.length) % items.length);
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                if (mentionMode === "hashtag") insertHashtag(items[mentionHighlightClamped]?.tag ?? items[mentionHighlightClamped]);
                else if (items[mentionHighlightClamped]?.username) insertMention(items[mentionHighlightClamped].username);
                return;
            }
            if (e.key === "Escape") {
                setShowMentionDropdown(false);
                return;
            }
        }

        if (e.key !== "Enter") return;
        // Mid-composition Enter is the IME's business, not ours. Sending on it
        // would fire a half-finished candidate (or commit the candidate and
        // then send) for every CJK keyboard.
        if (e.nativeEvent?.isComposing || e.keyCode === 229) return;

        const send = e.metaKey || e.ctrlKey ? true : (e.shiftKey ? false : enterSends);
        if (!send) return;   // let the textarea insert the newline
        e.preventDefault();
        handleSend();
    };

    /* ── Tray tools ─────────────────────────────────────────────────────── */
    const requestLocation = () => {
        setLocationErr("");
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            setLocationMode("manual");
            return;
        }
        setLocationMode("locating");
        // MUST run inside the tap handler. A geolocation call made on mount (or
        // in an effect) is not user-initiated, so the browser denies it without
        // a prompt and the failure is silent.
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = Number(pos.coords.latitude.toFixed(6));
                const lng = Number(pos.coords.longitude.toFixed(6));
                setLocation({ lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
                setLocationMode("idle");
                setShowTray(null);
            },
            (err) => {
                setLocationMode("manual");
                setLocationErr(
                    err?.code === 1
                        ? "Location permission denied \u2014 enter the coordinates below"
                        : err?.code === 3
                            ? "Timed out looking for your location \u2014 enter the coordinates below"
                            : "Could not read your location \u2014 enter the coordinates below"
                );
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
    };

    const applyManualLocation = () => {
        const lat = Number(String(manualLoc.lat).trim());
        const lng = Number(String(manualLoc.lng).trim());
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            setLocationErr("Latitude must be -90 to 90 and longitude -180 to 180");
            return;
        }
        setLocation({
            lat: Number(lat.toFixed(6)),
            lng: Number(lng.toFixed(6)),
            label: manualLoc.label.trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        });
        setLocationErr("");
        setShowTray(null);
    };

    const createPoll = () => {
        const question = pollDraft.question.trim().slice(0, MAX_POLL_QUESTION);
        const options = pollDraft.options.map((o) => o.trim().slice(0, MAX_POLL_OPTION)).filter(Boolean);
        if (!question) { setPollErr("Give the poll a question"); return; }
        // The server answers 400 "A poll needs at least 2 options"; the same
        // rule is refused locally so the user is not made to send first.
        if (options.length < MIN_POLL_OPTIONS) { setPollErr(`A poll needs at least ${MIN_POLL_OPTIONS} options`); return; }
        setPoll({ question, options: options.map((t) => ({ text: t, votes: [] })), votes: [] });
        setPollDraft({ question: "", options: ["", ""] });
        setPollErr("");
        setShowTray(null);
    };

    // Only a fine pointer gets the keyboard. On touch, focusing a field inside
    // an `absolute bottom-full` popover raises the software keyboard, which
    // shrinks the visual viewport the popover is anchored to and cuts its first
    // row off.
    useEffect(() => {
        if (isTouchFirst()) return;
        if (showTray === "poll") pollQuestionRef.current?.focus();
        if (showTray === "location" && locationMode === "manual") manualLatRef.current?.focus();
    }, [showTray, locationMode]);

    // Escape closes the tray and the header menu.
    useEffect(() => {
        if (!showTray && !showHeaderMenu && announceDraft === null) return;
        const onKey = (e) => {
            if (e.key !== "Escape") return;
            setShowTray(null);
            setShowHeaderMenu(false);
            setAnnounceDraft(null);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [showTray, showHeaderMenu, announceDraft]);

    /* ── Scroll ─────────────────────────────────────────────────────────── */
    const handleScroll = () => {
        const el = listRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        scrollAtBottomRef.current = atBottom;
        setScrollAtBottom(atBottom);
        // Reaching the bottom IS reading. Doing it here rather than in an
        // effect means the divider never flashes behind the reader's eyes when
        // a poll lands while they are already looking at it.
        if (atBottom) markRead(messages[messages.length - 1]?._id);
        if (el.scrollTop < 120 && hasMore && messages.length > 0) {
            // Height-delta restoration. The page is PREPENDED, so everything
            // above the viewport grows: without adding the delta back to
            // scrollTop, reading history yanks the reader away from whatever
            // they were looking at.
            const prevTop = el.scrollTop;
            const prevHeight = el.scrollHeight;
            fetchMessages(messages[0].timeStamp).then(() => {
                requestAnimationFrame(() => {
                    if (!el) return;
                    el.scrollTop = el.scrollHeight - prevHeight + prevTop;
                });
            });
        }
    };

    const scrollToBottom = () => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    };

    useEffect(() => {
        if (scrollAtBottom) scrollToBottom();
    }, [messages, scrollAtBottom]);

    const jumpToMessage = useCallback((msg) => {
        const el = listRef.current;
        if (!el || !msg?._id) return;
        const node = el.querySelector(`[data-msg-id="${msg._id}"]`);
        if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
        // Say so rather than silently scrolling to the bottom as if it had
        // been found: the pinned message may be outside the loaded page.
        else showToast("That pinned message is older than the messages loaded here", "info");
    }, [showToast]);

    /* ── Render ─────────────────────────────────────────────────────────── */
    const slowModeLabel = slowModeSeconds > 0
        ? (isAdmin ? "slow mode (admins exempt)" : `slow mode ${slowModeSeconds}s`)
        : null;

    return (
        // `relative` matters: the scroll-to-bottom button below is absolutely
        // positioned, and without a positioned ancestor here it anchored to
        // whatever further ancestor happened to be relative — so it floated
        // somewhere unrelated to the chat pane.
        //
        // `safe-top` / `safe-bottom` live here, on the column, for the same
        // reason as in ChatBox: they are unlayered rules in globals.css and so
        // would DELETE a same-side `py-*` on the header or composer wherever the
        // inset is 0 (i.e. on every desktop). On the column they just displace
        // the whole pane out from under the status bar and the home indicator.
        <div className="flex flex-col h-full relative safe-top safe-bottom">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
                <button onClick={onBack} className="p-2.5 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors" aria-label="Back">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-gray-600 dark:text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        {group?.avatarUrl && (
                            <img src={group.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        )}
                        <h2 className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{group?.name || "Group"}</h2>
                        {muted && (
                            <span className="shrink-0 text-gray-400 dark:text-gray-500" title="Muted" aria-label="Muted">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0-2.25 2.25M19.5 12l-2.25-2.25M19.5 12l-2.25 2.25m-6-4.5-1.5 1.5 1.5 1.5m-1.5-1.5L8.25 9.75 6.75 11.25 5.25 9.75 8.25 8.25 11.25 9.75l-1.5 1.5m0 0L8.25 12.75 6.75 14.25 5.25 12.75m3-3 6 6" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21.75v-2.25a6.75 6.75 0 0 0-6.75-6.75H3m15.75 0V9.75A4.5 4.5 0 0 0 14.25 5.25H8.25" />
                                </svg>
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                        {/* "12 / 20 members" whenever a cap is set. */}
                        {maxMembers > 0 ? `${memberCount} / ${maxMembers} members` : `${memberCount} members`}
                        {slowModeLabel ? ` · ${slowModeLabel}` : ""}
                        {readOnlyForMe ? " · read-only" : ""}
                    </p>
                </div>
                <button
                    onClick={handleGroupCall}
                    className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-blue-500 shrink-0"
                    // This drew a video-camera glyph and labelled itself "Group
                    // call", but handleGroupCall starts an *audio* call and groups
                    // have no video option. Both the icon and the label promised
                    // something that does not exist.
                    aria-label="Start group audio call"
                    title="Start group audio call"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                    </svg>
                </button>
                <div className="relative shrink-0">
                    <button
                        onClick={() => setShowHeaderMenu((v) => !v)}
                        aria-label="Group options"
                        aria-expanded={showHeaderMenu}
                        className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
                        </svg>
                    </button>
                    {showHeaderMenu && (
                        <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl overflow-hidden">
                            <button
                                onClick={() => { setShowHeaderMenu(false); setShowSettings(true); }}
                                className="w-full text-left px-3 min-h-[44px] text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                Group settings
                            </button>
                            <button
                                onClick={handleMute}
                                disabled={muteBusy}
                                className="w-full text-left px-3 min-h-[44px] text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                            >
                                {muted ? "Unmute group" : "Mute group"}
                            </button>
                            <button
                                onClick={handleInvite}
                                disabled={inviteBusy}
                                className="w-full text-left px-3 min-h-[44px] text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                            >
                                {inviteCode ? "Copy invite link" : "Create invite link"}
                            </button>
                            <button
                                onClick={handleLeave}
                                className="w-full text-left px-3 min-h-[44px] text-xs text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                Leave group
                            </button>
                        </div>
                    )}
                </div>
                <button onClick={() => setShowSettings(true)} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500 shrink-0" aria-label="Group settings">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                </button>
            </div>

            <AnnouncementBanner
                announcement={announcementDismissed ? null : group?.announcement}
                onEdit={isAdmin ? () => setAnnounceDraft(group?.announcement?.text || "") : null}
                onDismiss={dismissAnnouncement}
            />

            {/* Announcement editor. Admin-only, matching the server's 403. */}
            {announceDraft !== null && (
                <div className="px-4 pt-2 shrink-0">
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">Group announcement</p>
                        <textarea
                            value={announceDraft}
                            onChange={(e) => setAnnounceDraft(e.target.value.slice(0, 500))}
                            rows={2}
                            maxLength={500}
                            placeholder="Anything every member should see at the top of this group"
                            aria-label="Group announcement"
                            className="w-full bg-gray-100 dark:bg-gray-800 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 rounded-xl px-3 py-2 outline-none resize-none"
                        />
                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => handleSaveAnnouncement(announceDraft)} className={panelButton}>Save</button>
                            <button onClick={() => handleSaveAnnouncement("")} className={panelGhostButton}>Clear</button>
                            <button onClick={() => setAnnounceDraft(null)} className={panelGhostButton}>Cancel</button>
                        </div>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">500 characters max. Visible to every member.</p>
                    </div>
                </div>
            )}

            <PinnedStrip pinned={pinnedMessages} members={members} onOpen={jumpToMessage} />

            {/* Messages */}
            <div ref={listRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto py-2 space-y-1">
                {loading && messages.length === 0 && (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                )}
                {/* A failed load used to leave the spinner running forever with
                    no way to tell that anything had gone wrong. */}
                {error && messages.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
                        <p className="text-sm text-red-500">{error}</p>
                        <button
                            onClick={() => { setError(""); fetchMessages(); }}
                            className="text-xs font-medium text-blue-500 hover:underline min-h-[40px] px-2"
                        >
                            Try again
                        </button>
                    </div>
                )}
                {loadingMore && (
                    <div className="flex items-center justify-center py-3">
                        <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                )}
                {messages.map((msg, i) => {
                    const prev = messages[i - 1];
                    const key = dayKey(msg.timeStamp);
                    const showDayDivider = !!key && key !== dayKey(prev?.timeStamp);
                    return (
                        <div key={msg._id || i} data-msg-id={msg._id}>
                            {showDayDivider && (
                                <div className="flex justify-center my-3">
                                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-1 rounded-full">
                                        {dayLabel(msg.timeStamp)}
                                    </span>
                                </div>
                            )}
                            {i === dividerIndex && (
                                <div className="flex items-center gap-3 my-3">
                                    <span className="h-px flex-1 bg-blue-300 dark:bg-blue-500/40" />
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400">
                                        New messages
                                    </span>
                                    <span className="h-px flex-1 bg-blue-300 dark:bg-blue-500/40" />
                                </div>
                            )}
                            <GroupMessageBubble
                                msg={msg}
                                user={user}
                                members={members}
                                isLast={i === messages.length - 1}
                                onReact={handleReact}
                                onDelete={handleDelete}
                                onRecall={handleRecall}
                                onReply={setReplyTo}
                                onHashtag={(tag) => router.push(`/?tag=${encodeURIComponent(tag)}`)}
                                onTranslate={handleTranslate}
                                onStar={handleStar}
                                onPin={handlePin}
                                pinState={pinState}
                                onEdit={beginEdit}
                                translations={translations}
                                translatingId={translatingId}
                                translateTargetName={translateTargetName}
                                editing={editingId === msg._id}
                                editText={editText}
                                setEditText={setEditText}
                                onSaveEdit={() => saveEdit(msg._id)}
                                onCancelEdit={() => setEditingId(null)}
                            />
                        </div>
                    );
                })}
            </div>

            {!scrollAtBottom && (
                /* `bottom-24` is a flat 96px, but the fixed bottom nav measures
                 * `h-16` + `safe-bottom` (64px + up to 34px). With a 32px inset
                 * or more the 32px button slid under the nav and half of it was
                 * unclickable. */
                <button
                    onClick={scrollToBottom}
                    aria-label="Scroll to bottom"
                    className="absolute bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-3 bg-gray-800 text-white rounded-full w-11 h-11 flex items-center justify-center shadow-lg z-10 hover:bg-gray-700 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                </button>
            )}

            {/* Composer state banners. A 403 and a 429 are different problems
                with different recoveries, so they never collapse into one row. */}
            {readOnlyForMe && (
                <div className="px-3 pt-3">
                    <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-gray-400 shrink-0 mt-0.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                        </svg>
                        <p className="flex-1 min-w-0 text-xs text-gray-600 dark:text-gray-300">
                            This group is set to <b>admins only</b>, so you can read it but not post. The server would reject
                            a message from you with a 403, so the composer is off rather than letting you type into a dead end.
                        </p>
                    </div>
                </div>
            )}
            {!readOnlyForMe && inCooldown && (
                <div className="px-3 pt-3">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <p className="flex-1 min-w-0 text-xs text-amber-800 dark:text-amber-200">
                            Slow mode: you can send again in <b className="tabular-nums">{cooldownLeft}s</b>. It re-enables itself.
                        </p>
                    </div>
                </div>
            )}
            {composerBlock && !readOnlyForMe && (
                <div className="px-3 pt-3">
                    <div className={`flex items-start gap-2 px-3 py-2 rounded-xl border ${
                        composerBlock.status === 429
                            ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                            : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                    }`}>
                        <div className="flex-1 min-w-0">
                            <p className={`text-[10px] font-bold uppercase tracking-wide ${
                                composerBlock.status === 429 ? "text-amber-700 dark:text-amber-300" : "text-red-600 dark:text-red-400"
                            }`}>
                                {composerBlock.status === 429 ? "Slow mode (429)" : composerBlock.status === 403 ? "Not allowed (403)" : "Could not send"}
                            </p>
                            <p className={`text-xs break-words mt-0.5 ${
                                composerBlock.status === 429 ? "text-amber-800 dark:text-amber-200" : "text-red-700 dark:text-red-300"
                            }`}>
                                {composerBlock.message}
                            </p>
                        </div>
                        <button
                            onClick={() => setComposerBlock(null)}
                            aria-label="Dismiss"
                            className="shrink-0 w-10 h-10 -m-1 flex items-center justify-center text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded-lg transition-colors touch-manipulation"
                        >
                            <XIcon />
                        </button>
                    </div>
                </div>
            )}

            {/* Composer */}
            <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-3 shrink-0">
                {/* Unified attachment tray. The single image preview that used
                    to live here became this row: every attachment is a chip with
                    its own progress, error and remove button, so "remove the
                    second file" is possible at all. */}
                {queue.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                        {queue.map((item) => (
                            <div
                                key={item.id}
                                className="relative flex items-center gap-2 pl-1.5 py-1 pr-1 min-h-[44px] bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 max-w-full sm:max-w-[220px]"
                            >
                                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                                    {(() => {
                                        const src = item.localUrl || (item.kind === "image" && item.url ? item.url : "");
                                        if (!src) return <KindIcon kind={item.kind} />;
                                        // Background-image rather than <img>: an
                                        // arbitrary user-supplied URL, and the
                                        // next/image pipeline is neither needed
                                        // nor configured for a chat thumbnail.
                                        return (
                                            <span
                                                aria-hidden="true"
                                                className="w-full h-full block bg-cover bg-center"
                                                style={{ backgroundImage: `url("${encodeURI(src)}")` }}
                                            />
                                        );
                                    })()}
                                </div>
                                <div className="min-w-0 flex flex-col">
                                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{item.name}</span>
                                    <span
                                        className={`text-[10px] truncate ${
                                            item.status === "error"
                                                ? "text-red-500 dark:text-red-400"
                                                : "text-gray-500 dark:text-gray-400"
                                        }`}
                                        title={item.error || undefined}
                                    >
                                        {item.status === "uploading" && `Uploading … ${item.progress}%`}
                                        {item.status === "error" && (item.error || "Upload failed")}
                                        {item.status === "ready" && `${item.size ? `${formatBytes(item.size)} · ` : ""}${KIND_LABEL[item.kind]}`}
                                    </span>
                                </div>
                                {item.status === "uploading" && (
                                    <div className="absolute left-1.5 right-11 bottom-1 h-0.5 bg-gray-300 dark:bg-gray-600 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.max(3, item.progress)}%` }} />
                                    </div>
                                )}
                                <button
                                    onClick={() => removeItem(item.id)}
                                    aria-label={`Remove ${item.name}`}
                                    className="shrink-0 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg transition-colors touch-manipulation"
                                >
                                    <XIcon />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Voice note. Shown whenever `audioUrl` is set — NOT gated on
                    there being an image, or a recorded voice note had no way to
                    be cleared once a photo was attached. */}
                {audioUrl && (
                    <div className="relative inline-flex self-start max-w-full mb-2">
                        <div className="pl-4 pr-11 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-2 min-w-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-blue-500 shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                            </svg>
                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">Voice message</span>
                        </div>
                        <button
                            onClick={() => setAudioUrl("")}
                            className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center"
                            aria-label="Remove audio"
                        >
                            <span className="bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-700 transition-colors shadow">&#x2715;</span>
                        </button>
                    </div>
                )}

                {location && (
                    <div className="relative inline-flex self-start max-w-full mb-2">
                        <div className="pl-4 pr-11 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-2 min-w-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                            </svg>
                            <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                                {location.label || `${location.lat}, ${location.lng}`}
                            </span>
                        </div>
                        <button
                            onClick={() => setLocation(null)}
                            className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center"
                            aria-label="Remove location"
                        >
                            <span className="bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-700 transition-colors shadow">&#x2715;</span>
                        </button>
                    </div>
                )}

                {/* Poll preview. Read-only, because voting is the recipient's
                    screen and the composer only has to show what is about to go
                    out. */}
                {poll && (
                    <div className="relative inline-flex self-start max-w-full mb-2">
                        <div className="pl-4 pr-11 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-start gap-2 min-w-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-purple-500 shrink-0 mt-0.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h10.5m-10.5 5.25h16.5" />
                            </svg>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{poll.question}</p>
                                <ul className="mt-0.5 space-y-0.5">
                                    {poll.options.map((o, i) => (
                                        <li key={i} className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{o.text}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                        <button
                            onClick={() => setPoll(null)}
                            className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center"
                            aria-label="Remove poll"
                        >
                            <span className="bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-700 transition-colors shadow">&#x2715;</span>
                        </button>
                    </div>
                )}

                {codeMode && (
                    <div className="inline-flex self-start items-center gap-2 pl-3 pr-1 py-1 mb-2 min-h-[40px] bg-gray-900 text-gray-100 rounded-xl border border-gray-700">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m17.25 6.75 4.5 5.25-4.5 5.25M6.75 6.75 2.25 12l4.5 5.25M14.25 3.75l-4.5 16.5" />
                        </svg>
                        <span className="text-xs font-medium">Code block</span>
                        <button
                            onClick={() => setCodeMode(false)}
                            aria-label="Turn off code block"
                            className="w-10 h-10 -my-1 flex items-center justify-center text-gray-400 hover:text-gray-100 transition-colors rounded-lg touch-manipulation"
                        >
                            <XIcon />
                        </button>
                    </div>
                )}

                {replyTo && (
                    <div className="flex items-center justify-between mb-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl border-l-4 border-blue-500">
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-blue-500 dark:text-blue-400 font-semibold">Replying to {replyTo.sender}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{replyTo.text}</p>
                        </div>
                        <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ml-1 p-1 min-h-[40px] min-w-[40px] shrink-0 flex items-center justify-center rounded-full">&#x2715;</button>
                    </div>
                )}

                {linkPreview && (
                    <div className="relative self-start w-full max-w-xs sm:max-w-sm mb-2">
                        <LinkPreviewCard preview={linkPreview} small />
                        <button
                            onClick={() => { setLinkPreview(null); linkUrlRef.current = null; }}
                            className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center"
                            aria-label="Remove link preview"
                        >
                            <span className="bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-700 transition-colors shadow">&#x2715;</span>
                        </button>
                    </div>
                )}

                {/* Code preview. The wire format is a fenced block; this is what
                    is about to be sent, shown unfenced. */}
                {text && codeMode && (
                    <div className="self-start w-full px-3 py-2 mb-2 rounded-xl bg-gray-900 border border-gray-700 text-gray-100 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                        <pre className="font-mono text-xs m-0"><code>{text}</code></pre>
                    </div>
                )}

                {showHint && (
                    <div className="flex items-center gap-2 pl-1 mb-1">
                        <p className="flex-1 min-w-0 text-[11px] text-gray-500 dark:text-gray-400">
                            {enterSends ? "Enter sends · Shift+Enter adds a new line" : "Enter adds a new line · Ctrl/⌘+Enter sends"}
                        </p>
                        <button
                            onClick={dismissHint}
                            aria-label="Dismiss keyboard hint"
                            className="shrink-0 w-10 h-10 -my-1 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors touch-manipulation"
                        >
                            <XIcon />
                        </button>
                    </div>
                )}

                {/* Input row. `min-w-0` on the composer so a long draft cannot
                    push the send button off the row. */}
                <div className="relative flex items-end gap-1.5 sm:gap-2 w-full max-w-full">
                    <button
                        onClick={() => setShowTray(showTray ? null : "image")}
                        disabled={!composerEnabled}
                        aria-label="Message options"
                        aria-expanded={trayVisible}
                        title="Message options"
                        className={`shrink-0 w-11 h-11 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 touch-manipulation ${showTray ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                    </button>

                    <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                    <input ref={anyInputRef} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

                    <div className="flex-1 min-w-0 flex items-end bg-gray-100 dark:bg-gray-800 rounded-2xl px-3 sm:px-4 py-1.5 focus-within:ring-1 focus-within:ring-gray-300 dark:focus-within:ring-gray-600 transition-shadow relative">
                        <textarea
                            ref={inputRef}
                            rows={1}
                            value={text}
                            onChange={(e) => { handleTextChange(e.target.value); resizeComposer(); }}
                            onKeyDown={handleKeyDown}
                            placeholder={readOnlyForMe ? "You can\u2019t post in this group" : inCooldown ? "Slow mode\u2026" : "Message\u2026"}
                            disabled={!composerEnabled}
                            maxLength={textLimit}
                            aria-label="Group message"
                            // `resize-none` because the height comes from script;
                            // leaving the native handle on would let a drag fight
                            // the auto-grow on every keystroke.
                            // 16px on touch: below that iOS zooms the page on
                            // focus and app/layout.js's viewport meta leaves no
                            // way to zoom back out.
                            className="flex-1 min-w-0 bg-transparent text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none disabled:cursor-not-allowed resize-none leading-6 py-1.5 sm:py-2"
                        />

                        {showMentionDropdown && mentionMode === "user" && mentionResults.length > 0 && (
                            <div className="absolute bottom-full mb-2 left-0 right-0 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto z-40">
                                {mentionResults.map((u, i) => {
                                    const inGroup = members.some((m) => (m.username || m) === u.username);
                                    return (
                                        <button
                                            key={u._id || u.username}
                                            type="button"
                                            // `onPointerDown`, not `onMouseDown`: on touch the
                                            // mouse event is synthesised AFTER
                                            // `touchend`, so a scroll that started on a
                                            // row both scrolled the list and inserted
                                            // the mention. Pointer events cover
                                            // mouse, touch and pen in one path, and
                                            // firing before the gesture resolves is
                                            // what lets `preventDefault()` stop the
                                            // input losing focus.
                                            onPointerDown={(e) => { e.preventDefault(); insertMention(u.username); }}
                                            className={`w-full flex items-center gap-2.5 px-3 py-2 min-h-[44px] text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors touch-manipulation ${i === mentionHighlightClamped ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                                        >
                                            {/* Background-image rather than <img>:
                                                a 24px avatar of an arbitrary
                                                user-supplied URL. */}
                                            <div
                                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-cover bg-center"
                                                style={{
                                                    backgroundColor: u.avatarColor,
                                                    ...(u.avatarUrl ? { backgroundImage: `url("${encodeURI(u.avatarUrl)}")` } : {}),
                                                }}
                                            >
                                                {u.avatarUrl ? "" : u.username?.[0]?.toUpperCase()}
                                            </div>
                                            <span className="font-medium text-gray-900 dark:text-gray-100 truncate min-w-0">{u.username}</span>
                                            {inGroup && <span className="ml-auto shrink-0 text-[10px] text-blue-500 dark:text-blue-400">in group</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {showMentionDropdown && mentionMode === "hashtag" && hashtagResults.length > 0 && (
                            <div className="absolute bottom-full mb-2 left-0 right-0 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto z-40">
                                {hashtagResults.map((tag, i) => {
                                    const tagName = typeof tag === "string" ? tag : tag?.tag || "";
                                    const tagCount = typeof tag === "object" ? tag?.count : null;
                                    return (
                                        <button
                                            key={tagName}
                                            type="button"
                                            // `onPointerDown` — see the mention row above.
                                            onPointerDown={(e) => { e.preventDefault(); insertHashtag(tagName); }}
                                            className={`w-full flex items-center gap-2.5 px-3 py-2 min-h-[44px] text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors touch-manipulation ${i === mentionHighlightClamped ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                                        >
                                            <span className="text-blue-500 font-medium text-xs">#</span>
                                            <span className="font-medium text-gray-900 dark:text-gray-100 truncate min-w-0">{tagName}</span>
                                            {tagCount != null && <span className="ml-auto text-[10px] text-gray-400 shrink-0">{tagCount.toLocaleString()}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {hasContent ? (
                        <button
                            onClick={handleSend}
                            disabled={!canSend}
                            aria-label="Send"
                            className="shrink-0 w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-blue-500 hover:bg-blue-600 dark:hover:bg-blue-400 flex items-center justify-center text-white transition-colors disabled:opacity-50 touch-manipulation"
                        >
                            {sending || uploadingCount > 0 ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                    <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                                </svg>
                            )}
                        </button>
                    ) : (
                        <VoiceRecorder onRecorded={(url) => setAudioUrl(url)} maxDuration={60} />
                    )}

                    {/* The one popover: one container, one rail, one panel. */}
                    {trayVisible && (
                        <div
                            className={`absolute bottom-full left-0 mb-2 z-50 flex items-stretch overflow-hidden w-[min(360px,calc(100vw-2rem))] max-h-[min(62dvh,400px)] ${
                                barePanel ? "" : `${PANEL_CHROME} rounded-2xl`
                            }`}
                        >
                            <div className="shrink-0 w-12 flex flex-col items-center gap-0.5 p-1 border-r border-gray-100 dark:border-gray-800">
                                {TRAY_ITEMS.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => { setShowTray(item.id); if (item.id !== "poll") setPollErr(""); }}
                                        aria-label={item.label}
                                        title={item.label}
                                        aria-pressed={showTray === item.id}
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors touch-manipulation ${
                                            showTray === item.id
                                                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-500"
                                                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        }`}
                                    >
                                        {item.glyph}
                                    </button>
                                ))}
                            </div>

                            <div className={`flex-1 min-w-0 overflow-y-auto ${barePanel ? "" : "p-3"}`}>
                                {showTray === "image" && (
                                    <div className="space-y-3">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Photos</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Up to {MAX_QUEUE} attachments per message, {formatBytes(MAX_IMAGE_BYTES)} per photo. The first one rides
                                            along in the message body; the rest are listed as attachments.
                                        </p>
                                        <button onClick={() => imageInputRef.current?.click()} className={panelButton}>
                                            Choose photos
                                        </button>
                                    </div>
                                )}

                                {showTray === "file" && (
                                    <div className="space-y-3">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Files</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Anything that is not a photo. {formatBytes(MAX_FILE_BYTES)} per document, {formatBytes(MAX_VIDEO_BYTES)} per
                                            video. Sent as a named attachment with its size.
                                        </p>
                                        <button onClick={() => anyInputRef.current?.click()} className={panelButton}>
                                            Choose files
                                        </button>
                                    </div>
                                )}

                                {showTray === "gif" && (
                                    <GifPicker
                                        onSelect={(url) => {
                                            // A Giphy URL is stored as `imageUrl`, so
                                            // it is added to the queue as an image.
                                            addRemote({ kind: "image", url, name: "GIF", mimeType: "image/gif" });
                                            setShowTray(null);
                                        }}
                                        onClose={() => setShowTray(null)}
                                        className="shadow-none"
                                    />
                                )}

                                {showTray === "emoji" && (
                                    <EmojiPicker
                                        onEmojiSelect={(emoji) => { insertAtCaret(emoji); setShowTray(null); }}
                                        onClose={() => setShowTray(null)}
                                        className="shadow-none"
                                    />
                                )}

                                {showTray === "location" && (
                                    <div className="space-y-3">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Location</p>
                                        {locationMode !== "manual" ? (
                                            <>
                                                <button onClick={requestLocation} disabled={locationMode === "locating"} className={panelButton}>
                                                    {locationMode === "locating" ? "Finding you…" : "Use my current location"}
                                                </button>
                                                {typeof navigator !== "undefined" && !navigator.geolocation && (
                                                    <p className="text-xs text-amber-600 dark:text-amber-400">
                                                        This browser has no geolocation, so enter a point instead.
                                                    </p>
                                                )}
                                                <button onClick={() => setLocationMode("manual")} className={panelGhostButton}>
                                                    Enter a point instead
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <input
                                                        ref={manualLatRef}
                                                        value={manualLoc.lat}
                                                        onChange={(e) => setManualLoc((p) => ({ ...p, lat: e.target.value }))}
                                                        placeholder="Latitude"
                                                        inputMode="decimal"
                                                        aria-label="Latitude"
                                                        className={panelInput}
                                                    />
                                                    <input
                                                        value={manualLoc.lng}
                                                        onChange={(e) => setManualLoc((p) => ({ ...p, lng: e.target.value }))}
                                                        placeholder="Longitude"
                                                        inputMode="decimal"
                                                        aria-label="Longitude"
                                                        className={panelInput}
                                                    />
                                                </div>
                                                <input
                                                    value={manualLoc.label}
                                                    onChange={(e) => setManualLoc((p) => ({ ...p, label: e.target.value }))}
                                                    placeholder="Label (optional)"
                                                    aria-label="Location label"
                                                    className={panelInput}
                                                />
                                                <button onClick={applyManualLocation} className={panelButton}>Use this point</button>
                                                <button onClick={() => { setLocationMode("idle"); setLocationErr(""); }} className={panelGhostButton}>
                                                    Back
                                                </button>
                                            </>
                                        )}
                                        {locationErr && <p className="text-xs text-red-500 dark:text-red-400">{locationErr}</p>}
                                    </div>
                                )}

                                {showTray === "poll" && (
                                    <div className="space-y-2">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Poll</p>
                                        <input
                                            ref={pollQuestionRef}
                                            value={pollDraft.question}
                                            onChange={(e) => setPollDraft((p) => ({ ...p, question: e.target.value.slice(0, MAX_POLL_QUESTION) }))}
                                            placeholder="Ask a question"
                                            maxLength={MAX_POLL_QUESTION}
                                            aria-label="Poll question"
                                            className={panelInput}
                                        />
                                        {pollDraft.options.map((option, i) => (
                                            <div key={i} className="flex items-center gap-1">
                                                <input
                                                    value={option}
                                                    onChange={(e) => setPollDraft((p) => {
                                                        const options = p.options.slice();
                                                        options[i] = e.target.value.slice(0, MAX_POLL_OPTION);
                                                        return { ...p, options };
                                                    })}
                                                    placeholder={`Option ${i + 1}`}
                                                    maxLength={MAX_POLL_OPTION}
                                                    aria-label={`Poll option ${i + 1}`}
                                                    className={panelInput}
                                                />
                                                <button
                                                    onClick={() => setPollDraft((p) => (p.options.length <= MIN_POLL_OPTIONS ? p : { ...p, options: p.options.filter((_, x) => x !== i) }))}
                                                    disabled={pollDraft.options.length <= MIN_POLL_OPTIONS}
                                                    aria-label={`Remove option ${i + 1}`}
                                                    className="shrink-0 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 rounded-lg transition-colors touch-manipulation"
                                                >
                                                    <XIcon />
                                                </button>
                                            </div>
                                        ))}
                                        {pollDraft.options.length < MAX_POLL_OPTIONS && (
                                            <button
                                                onClick={() => setPollDraft((p) => ({ ...p, options: [...p.options, ""] }))}
                                                className="text-xs font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 min-h-[40px] px-1"
                                            >
                                                + Add option
                                            </button>
                                        )}
                                        {pollErr && <p className="text-xs text-red-500 dark:text-red-400">{pollErr}</p>}
                                        <button onClick={createPoll} className={panelButton}>Create poll</button>
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                            Group polls can be sent but not voted on — there is no group vote endpoint yet.
                                        </p>
                                    </div>
                                )}

                                {showTray === "code" && (
                                    <div className="space-y-3">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Code block</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Wraps what you type in a fenced block and sends it as <span className="font-mono">kind: &quot;code&quot;</span>.
                                            No highlighting — nothing in this app can render it yet.
                                        </p>
                                        <button onClick={() => { setCodeMode((v) => !v); setShowTray(null); }} className={panelButton}>
                                            {codeMode ? "Turn off code block" : "Turn on code block"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer: draft state, character counter, Enter-mode toggle */}
                <div className="flex items-center justify-between gap-2 mt-1 min-h-[40px]">
                    <p className={`flex-1 min-w-0 truncate text-[11px] ${
                        draftStatus === "error" ? "text-red-500 dark:text-red-400" : "text-gray-400 dark:text-gray-500"
                    }`}>
                        {draftStatus === "restored" && "Draft restored"}
                        {draftStatus === "saving" && "Saving draft…"}
                        {draftStatus === "saved" && "Draft saved"}
                        {draftStatus === "error" && "Draft not saved — it will not survive a reload"}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {showCounter && (
                            <span
                                className={`text-[11px] tabular-nums ${
                                    text.length >= textLimit
                                        ? "text-red-500 dark:text-red-400 font-semibold"
                                        : "text-gray-400 dark:text-gray-500"
                                }`}
                            >
                                {text.length}/{textLimit}
                            </span>
                        )}
                        <button
                            onClick={() => persistEnterMode(!enterSends)}
                            aria-label={enterSends ? "Enter sends. Switch to Enter adds a line" : "Enter adds a line. Switch to Enter sends"}
                            title={enterSends ? "Enter sends · click for Enter = new line" : "Enter = new line · click for Enter sends"}
                            aria-pressed={!enterSends}
                            className={`h-10 min-w-[44px] px-1.5 rounded-lg flex items-center justify-center gap-0.5 transition-colors touch-manipulation ${
                                enterSends
                                    ? "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                                    : "text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10 5 14l4 4M5 14h9a5 5 0 0 0 5-5V6" />
                            </svg>
                            {!enterSends && <span className="text-[11px] font-bold leading-none">⇧</span>}
                        </button>
                    </div>
                </div>
            </div>

            {showSettings && (
                <GroupSettings
                    group={group}
                    user={user}
                    onClose={() => setShowSettings(false)}
                    onGroupUpdated={(updated) => {
                        // Refresh group data by re-fetching
                        fetch(`/api/groups/${groupId}`).then(r => r.json()).then(data => {
                            if (data._id) {
                                // Trigger parent to update group
                                window.dispatchEvent(new CustomEvent("groupUpdated", { detail: data }));
                            }
                        }).catch(() => {});
                    }}
                    onLeave={onLeave || onBack}
                />
            )}
        </div>
    );
}


