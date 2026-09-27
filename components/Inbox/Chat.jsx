"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";
import ImageLightbox from "@/components/shared/ImageLightbox";
import UserBadges from "@/components/shared/UserBadges";
import AudioPlayer from "@/components/shared/AudioPlayer";
import RichText from "@/components/Feed/RichText";
import LinkPreviewCard from "@/components/shared/LinkPreviewCard";
import ForwardModal from "./ForwardModal";

const RECALL_WINDOW_MS = 60 * 1000;

function isGifUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes(".gif") || lower.includes("giphy.com") || lower.includes("gifformat");
}

const MSG_REACTIONS = [
    { type: "like", emoji: "👍" },
    { type: "love", emoji: "❤️" },
    { type: "laugh", emoji: "😂" },
    { type: "fire", emoji: "🔥" },
    { type: "sad", emoji: "😢" },
    { type: "angry", emoji: "😠" },
];

const lastReadKey = (user1, user2) => `chat_read:${[user1, user2].sort().join(":")}`;

function getLastReadId(user1, user2) {
    try { return localStorage.getItem(lastReadKey(user1, user2)); } catch { return null; }
}

function setLastReadId(user1, user2, msgId) {
    try { localStorage.setItem(lastReadKey(user1, user2), msgId); } catch {}
}

function Avatar({ sender, color }) {
    return (
        <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold select-none shrink-0"
            style={{ backgroundColor: color }}
        >
            {sender[0].toUpperCase()}
        </div>
    );
}

function TickIcon({ status }) {
    if (status === "sending") {
        return (
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="50" strokeDashoffset="10" />
            </svg>
        );
    }

    if (status === "sent") {
        return (
            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.354 4.354a.5.5 0 0 0-.708-.708L6 9.293 3.854 7.146a.5.5 0 1 0-.708.708l2.5 2.5a.5.5 0 0 0 .708 0l6-6z" />
            </svg>
        );
    }

    if (status === "delivered") {
        return (
            <svg className="w-[18px] h-[18px] text-gray-600 dark:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {/* First checkmark */}
                <path d="M20 6L9 17l-5-5" />
                {/* Second checkmark slightly offset */}
                <path d="M23 6L12 17" />
            </svg>
        );
    }

    if (status === "read") {
        return (
            <svg className="w-[18px] h-[18px] text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {/* First checkmark */}
                <path d="M20 6L9 17l-5-5" />
                {/* Second checkmark slightly offset */}
                <path d="M23 6L12 17" />
            </svg>
        );
    }

    return null;
}

function getMessageStatus(msg) {
    if (msg._sending) return "sending";
    if (msg.isRead) return "read";
    if (msg.delivered) return "delivered";
    return "sent";
}

/* ──────────────────────────────────────────────────────────────────────────
   API

   Every messaging route answers `{ error, detail }` on failure (and
   `/messages/bulk` adds `note` plus the matched/modified/skipped counts), so
   collapsing those into one generic string is exactly what used to make a 403
   look like a 500 and an expired-window rejection look like a network blip.
   Both are surfaced verbatim, `error` first and `detail` after it in
   parentheses, in `errText`.
   ────────────────────────────────────────────────────────────────────────── */

async function callApi(path, options) {
    const res = await fetch(path, options);
    let data = {};
    try {
        data = await res.json();
    } catch {
        // Non-JSON body (proxy error page, HTML 502). The status is all we have.
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
    const base = e?.payload?.error || e?.message || "Request failed";
    const detail = e?.payload?.detail;
    return detail ? `${base} — ${detail}` : base;
}

const jsonBody = (body) => ({
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
});

const postBody = (body) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
});

/* ──────────────────────────────────────────────────────────────────────────
   Message type inference

   `kind` is derived server-side (live-server/routes/messages.js:411-419):
   `code | contact | poll | location` when the client sent one explicitly,
   otherwise inferred from whichever field is set. It is NOT safe to trust
   blindly in the other direction either — Mongoose applies the schema's
   `"text"` default on every read, so a document written before `kind` existed
   comes back as `kind: "text"` while still carrying an `imageUrl`.

   So: the four card types are taken from `kind` only where `kind` is the sole
   evidence (a fenced body), and everything else is read off the fields. The
   order below is the server's own.
   ────────────────────────────────────────────────────────────────────────── */

const KINDS = new Set(["text", "image", "video", "audio", "file", "location", "poll", "contact", "code"]);

const hasCoords = (loc) =>
    !!loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng));

const sameUrl = (a, b) => !!a && !!b && String(a) === String(b);

/**
 * Attachments that are not already shown by a dedicated block. The composer's
 * `attachments` manifest deliberately includes the item that also became
 * `imageUrl` / `videoUrl` / `audioUrl` (Input.jsx file header), so rendering it
 * raw would print the photo twice.
 */
function extraAttachments(msg) {
    const list = Array.isArray(msg?.attachments) ? msg.attachments : [];
    return list.filter((a) => a && a.url && !sameUrl(a.url, msg?.imageUrl)
        && !sameUrl(a.url, msg?.videoUrl) && !sameUrl(a.url, msg?.audioUrl));
}

function inferKind(msg) {
    const explicit = KINDS.has(String(msg?.kind || "").toLowerCase())
        ? String(msg.kind).toLowerCase()
        : "";
    if (msg?.contact?.username) return "contact";
    if (msg?.poll?.question) return "poll";
    if (hasCoords(msg?.location)) return "location";
    if (explicit === "code") return "code";
    if (msg?.videoUrl) return "video";
    if (extraAttachments(msg).length) return "file";
    if (msg?.imageUrl) return "image";
    if (msg?.audioUrl) return "audio";
    return "text";
}

const KIND_LABEL = {
    text: "Text", image: "Photo", video: "Video", audio: "Voice message",
    file: "File", location: "Location", poll: "Poll", contact: "Contact", code: "Code",
};

/* ──────────────────────────────────────────────────────────────────────────
   Small formatters
   ────────────────────────────────────────────────────────────────────────── */

function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    const mb = n / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
}

function fileNameFromUrl(url, fallback) {
    try {
        const path = new URL(String(url)).pathname;
        const last = decodeURIComponent(path.split("/").filter(Boolean).pop() || "");
        return last || fallback;
    } catch {
        return fallback;
    }
}

/** OpenStreetMap needs no key and no account, which is why it is the link target. */
const osmUrl = (lat, lng) =>
    `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

const FENCE = "```";

/** The composer persists a code block already fenced, so the wire text carries it. */
function unfence(str) {
    const s = String(str || "");
    if (!s.startsWith(`${FENCE}\n`) || !s.endsWith(`\n${FENCE}`)) return null;
    return s.slice(FENCE.length + 1, s.length - FENCE.length - 1);
}

function formatRemaining(ms) {
    if (!(ms > 0)) return "expired";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/* ──────────────────────────────────────────────────────────────────────────
   Dates

   EVERY date in this app is stored and compared in UTC — the server keeps
   quiet hours in UTC (live-server/routes/messaging.js:175), the conversation
   export writes ISO-8601, and the TTL index reads `expiresAt` as an instant.
   So the day dividers below bucket by the UTC calendar day and render their
   clock in UTC too, which keeps the divider and the "14:05" chip that the
   server's own export would print describing the same day boundary. The
   per-bubble `toLocaleTimeString` chip below is left exactly as it was: that
   is the reader's own wall clock, and it is meant to be.
   ────────────────────────────────────────────────────────────────────────── */

const utcDayKey = (value) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
};

const utcTimeLabel = (value) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
};

function dayDividerLabel(value, nowMs) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const key = utcDayKey(d);
    if (key === utcDayKey(nowMs)) return "Today";
    if (key === utcDayKey(new Date(nowMs).getTime() - 86400000)) return "Yesterday";
    const sameYear = d.getUTCFullYear() === new Date(nowMs).getUTCFullYear();
    const label = d.toLocaleDateString("en-GB", sameYear
        ? { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }
        : { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return `${label} · ${utcTimeLabel(d)}`;
}

/* ──────────────────────────────────────────────────────────────────────────
   Clipboard

   `navigator.clipboard` is undefined on an insecure origin and rejects in some
   installed webviews, so the legacy `execCommand` path is kept as a real
   fallback rather than as decoration. A false return is a genuine failure and
   the callers toast instead of claiming success.
   ────────────────────────────────────────────────────────────────────────── */

async function copyText(text) {
    const value = String(text ?? "");
    if (!value) return false;
    try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch { /* fall through to execCommand */ }
    try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

/* ──────────────────────────────────────────────────────────────────────────
   Shared presentational bits (house style)
   ────────────────────────────────────────────────────────────────────────── */

const SHEET_BACKDROP = "fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]";
const SHEET_PANEL = "fixed inset-x-0 bottom-0 z-50 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[420px] max-h-[80vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl animate-scale-in";
const SHEET_ROW = "w-full min-h-[44px] flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-45 disabled:cursor-not-allowed";
const KV_LABEL = "text-[11px] text-gray-400 dark:text-gray-500 w-32 shrink-0";
const KV_VALUE = "text-xs text-gray-800 dark:text-gray-200 min-w-0 flex-1 break-words";

function Sheet({ title, subtitle, onClose, children }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <>
            <button className={SHEET_BACKDROP} aria-label="Close" onClick={onClose} />
            <div className={SHEET_PANEL} role="dialog" aria-modal="true" aria-label={title}>
                <div className="sticky top-0 z-10 flex items-start gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</h2>
                        {subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="shrink-0 w-11 h-11 -mr-2 -mt-1 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                {children}
            </div>
        </>
    );
}

function Kv({ k, v, mono }) {
    return (
        <div className="flex items-start gap-2 py-1 min-w-0">
            <span className={KV_LABEL}>{k}</span>
            <span className={`${KV_VALUE} ${mono ? "font-mono" : ""}`}>
                {v === null || v === undefined || v === "" ? "—" : String(v)}
            </span>
        </div>
    );
}

function Note({ tone = "info", title, children }) {
    const cls = {
        warn: "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200",
        info: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300",
    }[tone] || "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300";
    return (
        <div className={`rounded-xl border px-3 py-2.5 ${cls}`}>
            {title && <p className="text-xs font-bold">{title}</p>}
            {children && <div className={`text-[11px] leading-relaxed ${title ? "mt-1" : ""}`}>{children}</div>}
        </div>
    );
}

function ErrorBox({ message }) {
    if (!message) return null;
    return (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
            <p className="text-xs text-red-700 dark:text-red-300 break-words">{message}</p>
        </div>
    );
}

function Spinner({ label }) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 py-8" role="status">
            <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-700 border-t-gray-500 dark:border-t-gray-400 rounded-full animate-spin" />
            {label && <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>}
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   Message body renderers

   The composer can now send `videoUrl`, `attachments[]`, `location`, `poll`,
   `contact` and `kind`, and every one of them is written by POST /api/messages.
   None of them were rendered here, so a video-only, file-only, poll-only or
   location-only message painted a completely EMPTY bubble. Each renderer below
   guards every field, because documents written before these fields existed
   have none of them.
   ────────────────────────────────────────────────────────────────────────── */

function VideoBlock({ src }) {
    return (
        <video
            src={src}
            controls
            playsInline
            preload="metadata"
            aria-label="Video"
            className="block w-full max-h-[420px] bg-black object-contain"
        />
    );
}

function CodeBlock({ body, onCopyResult }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="relative min-w-0">
            <button
                type="button"
                onClick={async () => {
                    const ok = await copyText(body);
                    onCopyResult?.(ok);
                    if (!ok) return;
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                }}
                aria-label="Copy code"
                title="Copy code"
                className="absolute top-1.5 right-1.5 z-10 min-h-[32px] px-2 flex items-center gap-1 rounded-lg bg-black/55 text-white text-[10px] font-semibold hover:bg-black/70 transition-colors"
            >
                {copied ? "Copied" : "Copy"}
            </button>
            {/* `whitespace-pre` + `overflow-x-auto`: the point of a code block is
                that the author's line breaks and indentation survive, which
                `break-words` on a normal bubble would destroy. */}
            <pre className="m-0 overflow-x-auto px-3 py-2.5 text-[11px] leading-relaxed font-mono whitespace-pre text-left"><code>{body}</code></pre>
        </div>
    );
}

function AttachmentList({ items }) {
    return (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
            {items.map((a, i) => {
                const size = formatBytes(a.size);
                const name = a.name || fileNameFromUrl(a.url, `Attachment ${i + 1}`);
                return (
                    <li key={`${a.url}-${i}`} className="flex items-center gap-2.5 px-3 py-2 min-w-0">
                        <span className="shrink-0 w-8 h-8 rounded-lg bg-black/10 dark:bg-white/10 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 opacity-70">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.63c0-1.14-.45-2.23-1.24-3.04l-4.5-4.5A2.12 2.12 0 0 0 12.22 3H6.75A2.25 2.25 0 0 0 4.5 5.25v13.5A2.25 2.25 0 0 0 6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 3v4.5a1.5 1.5 0 0 0 1.5 1.5h4.5" />
                            </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-xs font-medium truncate">{name}</span>
                            <span className="block text-[10px] opacity-60">
                                {size || a.mimeType || "Attachment"}
                            </span>
                        </span>
                        {/* `download` is advisory for a cross-origin host: a
                            Cloudinary asset opens in a tab rather than saving
                            silently, which is why the label says both things. */}
                        <a
                            href={a.url}
                            download={name}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Open or download ${name}`}
                            className="shrink-0 min-h-[36px] px-2 flex items-center text-[11px] font-semibold rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                        >
                            Open
                        </a>
                    </li>
                );
            })}
        </ul>
    );
}

function LocationCard({ location }) {
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    const label = location.label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    return (
        <a
            href={osmUrl(lat, lng)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
            <span className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-emerald-600 dark:text-emerald-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold break-words">{label}</span>
                <span className="block text-[10px] opacity-60 font-mono mt-0.5">
                    {lat.toFixed(5)}, {lng.toFixed(5)}
                </span>
                <span className="block text-[10px] opacity-70 mt-0.5">Open in OpenStreetMap</span>
            </span>
        </a>
    );
}

/**
 * Read-only DM poll.
 *
 * There is NO DM poll vote endpoint. `PollCard` (components/Feed/PollCard.jsx)
 * posts to `/api/posts/:id/poll/vote`, which addresses a POST document — a
 * message id is not a post id, so that call is a guaranteed 404 here. Firing it
 * anyway would make every tap look broken and, worse, invite someone to wire up
 * a fake vote. So the card renders the real numbers and says plainly that
 * voting needs `POST /api/messaging/messages/:id/poll/vote`.
 */
function PollCardReadOnly({ poll, username }) {
    const options = Array.isArray(poll?.options) ? poll.options : [];
    if (!options.length) return null;
    const counts = options.map((o) => (Array.isArray(o?.votes) ? o.votes.length : 0));
    const total = counts.reduce((a, b) => a + b, 0);
    const myIdx = options.findIndex((o) => Array.isArray(o?.votes) && o.votes.includes(username));

    return (
        <div className="min-w-0">
            <p className="px-3 pt-2.5 pb-1.5 text-xs font-semibold break-words">{poll.question || "Poll"}</p>
            <ul className="px-1.5 pb-1.5 space-y-1">
                {options.map((o, i) => {
                    const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
                    const mine = i === myIdx;
                    return (
                        <li key={i} className="relative overflow-hidden rounded-lg">
                            <div
                                className="absolute inset-0 bg-blue-500/20 origin-left"
                                style={{ transform: `scaleX(${pct / 100})` }}
                                aria-hidden="true"
                            />
                            <div className="relative flex items-center justify-between gap-2 px-2.5 py-2 min-h-[36px]">
                                <span className="text-xs break-words min-w-0">
                                    {mine && <span className="font-bold text-blue-600 dark:text-blue-400 mr-1">✓</span>}
                                    {o?.text || "Option"}
                                </span>
                                <span className="shrink-0 text-[11px] tabular-nums font-semibold opacity-70">{pct}%</span>
                            </div>
                        </li>
                    );
                })}
            </ul>
            <div className="px-3 pb-2.5 space-y-1.5">
                <p className="text-[10px] opacity-70">
                    {total} vote{total === 1 ? "" : "s"}
                    {myIdx === -1 ? " · you have not voted" : " · you voted for “" + (options[myIdx]?.text || "an option") + "”"}
                </p>
                <p className="text-[10px] opacity-60 leading-relaxed">
                    Read-only: voting needs <span className="font-mono">POST /api/messaging/messages/:id/poll/vote</span>, which does
                    not exist. Until it does, this poll cannot be voted on from a DM.
                </p>
            </div>
        </div>
    );
}

function ContactCard({ contact }) {
    const name = contact.displayName || contact.username;
    return (
        <a
            href={`/profile/${encodeURIComponent(contact.username)}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
            {contact.avatarUrl ? (
                /* A plain <img> on purpose: the URL comes from a public profile
                 * and can be on any host, which `next/image` refuses at runtime
                 * unless every one of them is in `remotePatterns`. */
                // eslint-disable-next-line @next/next/no-img-element
                <img src={contact.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" loading="lazy" />
            ) : (
                <span className="w-9 h-9 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-sm font-bold shrink-0">
                    {String(contact.username || "?")[0]?.toUpperCase()}
                </span>
            )}
            <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold truncate">{name}</span>
                <span className="block text-[10px] opacity-60 truncate">@{contact.username}</span>
            </span>
            <span className="shrink-0 text-[10px] opacity-70">View profile</span>
        </a>
    );
}

/** The bubble's own count-down, ticking from a shared `now`. */
function ExpiryChip({ expiresAt, now }) {
    const left = new Date(expiresAt).getTime() - now;
    if (!Number.isFinite(left)) return null;
    return (
        <span
            className="shrink-0 inline-flex items-center gap-1 text-[10px] tabular-nums text-amber-600 dark:text-amber-400"
            title={`This message is deleted by the server at ${new Date(expiresAt).toISOString()}`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3.75 2.25M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            {formatRemaining(left)}
        </span>
    );
}

const THREAD_CHIP_ICON = {
    check: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    bookmark: <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c.1.128.157.29.157.46v16.878a1.25 1.25 0 0 1-1.884 1.122L12 18.75 8.134 21.782A1.25 1.25 0 0 1 6.25 20.66V3.782c0-.17.057-.332.157-.46A2.25 2.25 0 0 1 8.25 2.25h7.5a2.25 2.25 0 0 1 1.843 1.072Z" />,
    image: <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l3.182 3.182m-1.82-1.82 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Z" />,
};

/** A 40px-tall pill in the thread's own action strip. */
function ThreadChip({ onClick, label, icon }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="shrink-0 min-h-[40px] px-2.5 flex items-center gap-1 rounded-full text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                {THREAD_CHIP_ICON[icon]}
            </svg>
            {label}
        </button>
    );
}

function BulkBtn({ label, onClick, disabled, busy, danger }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-busy={!!busy}
            className={`shrink-0 min-h-[40px] px-3 flex items-center gap-1.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-40 ${
                danger
                    ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                    : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
        >
            {busy && (
                <span className="w-3 h-3 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
            )}
            {label}
        </button>
    );
}

/** One-line summary of any message, for the pinned strip and the saved list. */
function messageSummary(msg, kind) {
    if (msg?.deleted) return "Deleted message";
    if (kind === "poll") return `📊 Poll — ${msg.poll?.question || ""}`.trim();
    if (kind === "location") return `📍 ${msg.location?.label || "Location"}`;
    if (kind === "contact") return `👤 ${msg.contact?.displayName || msg.contact?.username || "Contact"}`;
    if (kind === "code") {
        const body = unfence(msg.text);
        return `💻 Code${body ? ` — ${body.slice(0, 80)}` : ""}`;
    }
    if (msg?.text) {
        const body = String(msg.text);
        return body.length > 90 ? `${body.slice(0, 90)}…` : body;
    }
    if (msg?.videoUrl) return "🎬 Video";
    if (extraAttachments(msg).length) return `📎 ${extraAttachments(msg).length} file${extraAttachments(msg).length === 1 ? "" : "s"}`;
    if (msg?.imageUrl) return "🖼 Photo";
    if (msg?.audioUrl) return "🎤 Voice message";
    return "Message";
}

export default function Chat({ pendingMessage, recipient, recipientUser, scrollContainerRef, setReplyingTo, isTyping, isRecording }) {
const { user } = useUser();
const router = useRouter();

    const { showToast } = useToast();
    const [messages, setMessages]   = useState([]);
    const [loading, setLoading]     = useState(true);
    const bottomRef                  = useRef(null);
    const isNearBottomRef            = useRef(true);
    const scrolledToLastReadRef      = useRef(false);
    const username                   = user?.username;
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [translations, setTranslations] = useState({});
    const [translatingIdx, setTranslatingIdx] = useState(null);
    const autoTranslatingRef = useRef(new Set());
    const [editingMsgId, setEditingMsgId] = useState(null);
    const [editMsgText, setEditMsgText] = useState("");
    const [activeMenu, setActiveMenu] = useState(null);
    const [forwardMsg, setForwardMsg] = useState(null);
    // The message the reader had already seen when this conversation was
    // opened, i.e. the "New messages" divider's anchor. Read once per
    // conversation (see the effect that performs the initial jump) because the
    // live localStorage marker advances as soon as anything scrolls.
    const [unreadAnchorId, setUnreadAnchorId] = useState(null);

    // ── Messaging features ───────────────────────────────────────────────
    // Pinned strip (GET /api/messaging/pinned/:username).
    const [pinned, setPinned]         = useState(null);   // null = not loaded
    const [pinnedOpen, setPinnedOpen] = useState(false);
    const [pinnedErr, setPinnedErr]   = useState("");

    // Multi-select (POST /api/messaging/messages/bulk).
    const [selectMode, setSelectMode]     = useState(false);
    const [selected, setSelected]         = useState([]);   // ids, not a Set: JSON-cheap
    const [bulkBusy, setBulkBusy]         = useState("");
    const [bulkResult, setBulkResult]     = useState(null);
    const [bulkReactOpen, setBulkReactOpen] = useState(false);

    // Message info sheet (GET /api/messaging/messages/:id).
    const [infoId, setInfoId]     = useState(null);
    const [infoData, setInfoData] = useState(null);
    const [infoErr, setInfoErr]   = useState("");
    const [infoBusy, setInfoBusy] = useState(false);

    // Saved (GET /api/messaging/bookmarked) and shared media
    // (GET /api/messaging/media/:username).
    const [savedOpen, setSavedOpen]     = useState(false);
    const [saved, setSaved]             = useState(null);
    const [savedErr, setSavedErr]       = useState("");
    const [mediaOpen, setMediaOpen]     = useState(false);
    const [media, setMedia]             = useState(null);
    const [mediaErr, setMediaErr]       = useState("");
    const [overflowOpen, setOverflowOpen] = useState(false);

    // Deep link / keyboard navigation.
    const [flashId, setFlashId]   = useState(null);
    const [focusedId, setFocusedId] = useState(null);
    const [jumpNote, setJumpNote] = useState("");

    // One clock for every countdown on screen. Nothing reads `Date.now()` in
    // the render body, so a re-render is the only way a countdown can move, and
    // the interval below is armed ONLY while something is actually counting.
    //
    // Reading the real clock at init is safe here even though this component is
    // server-rendered: `loading` starts `true`, so the server always returns the
    // spinner and the message list below — the only consumer of `now` — is never
    // part of the server's HTML.
    const [now, setNow] = useState(() => Date.now());

    // Set while a hash target is being paged in, so the stick-to-bottom branch
    // of the jump effect does not yank the reader back down mid-reveal.
    const revealPendingRef  = useRef(false);
    const revealTriedRef    = useRef("");
    const selectModeRef     = useRef(false);
    const pressTimerRef     = useRef(null);
    const longPressAtRef    = useRef(0);
    const pressStartRef     = useRef({ x: 0, y: 0 });

    // Cleared when the thread goes away, so a long-press in flight cannot open
    // selection on a conversation the reader has already left.
    useEffect(() => () => {
        if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    }, []);

    const isNearBottom = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    }, [scrollContainerRef]);

    const scrollToBottom = useCallback((smooth = true) => {
        bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
    }, []);

    const canRecall = useCallback((msg) => {
        if (msg.sender !== username) return false;
        if (msg._sending) return false;
        const elapsed = Date.now() - new Date(msg.timeStamp).getTime();
        return elapsed < RECALL_WINDOW_MS;
    }, [username]);

    // Make the Recall button actually disappear when its window closes.
    //
    // `canRecall` reads `Date.now()`, but a render is the only thing that can
    // hide the button, so a message rendered a second before its 60s expired
    // kept a live, clickable Recall until some unrelated re-render happened to
    // come along — the 8s poll at best, and nothing at all on an idle thread,
    // where the server would then reject it as too late, after the confirm
    // dialog.
    //
    // Instead of a blanket 1s tick, arm one timer for the moment the latest
    // still-recallable message expires, and re-arm after it fires. An idle
    // thread (nothing inside its window) arms no timer at all. The clock is
    // read inside the effect rather than in the render body: `Date.now()` during
    // render is not pure, and the earliest deadline is only needed to size the
    // timeout, not to draw anything.
    const [, forceRecallTick] = useState(0);

    useEffect(() => {
        if (!username) return;
        let timer;
        const arm = () => {
            let deadline = 0;
            for (const m of messages) {
                if (m.sender !== username || m._sending) continue;
                const expires = new Date(m.timeStamp).getTime() + RECALL_WINDOW_MS;
                if (expires > Date.now() && expires > deadline) deadline = expires;
            }
            if (!deadline) return;
            timer = setTimeout(() => {
                forceRecallTick((n) => n + 1);
                arm();
            }, Math.max(250, deadline - Date.now()));
        };
        arm();
        return () => clearTimeout(timer);
    }, [messages, username, forceRecallTick]);

    const handleStar = useCallback(async (msg) => {
        // Optimistic: the row re-renders from the local copy and the server is the
        // authority. Rolls back on failure so the star cannot get stuck on.
        const wasStarred = !!msg.starredBy?.includes(username);
        setMessages(prev => prev.map(m => (
            m._id === msg._id
                ? {
                    ...m,
                    starredBy: wasStarred
                        ? m.starredBy.filter(u => u !== username)
                        : [...(m.starredBy || []), username],
                }
                : m
        )));
        try {
            const res = await fetch("/api/messages", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "star", messageId: msg._id }),
            });
            if (!res.ok) throw new Error("star failed");
        } catch {
            setMessages(prev => prev.map(m => (
                m._id === msg._id
                    ? {
                        ...m,
                        starredBy: wasStarred
                            ? [...new Set([...(m.starredBy || []), username])]
                            : m.starredBy.filter(u => u !== username),
                    }
                    : m
            )));
            showToast("Could not update star", "error");
        }
    }, [username, showToast]);

    const handleRecall = useCallback(async (msg) => {
        if (!confirm("Recall this message?")) return;
        try {
            // This called `DELETE /api/messages` with the id in the body, but no
            // such route exists — only `DELETE /api/messages/:id`. So recall
            // always 404'd, `res.json()` then threw on the HTML error body, and
            // the user always saw "Failed to recall message". The button, the
            // 60s window and canRecall were all dead UI.
            const res = await fetch(`/api/messages/${encodeURIComponent(msg._id)}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
            });
            if (res.ok) {
                setMessages((prev) => prev.filter((m) => m._id !== msg._id));
                showToast("Message recalled", "success");
            } else {
                const data = await res.json().catch(() => ({}));
                showToast(data.error || "Failed to recall", "error");
            }
        } catch {
            showToast("Failed to recall message", "error");
        }
    }, [username, showToast]);

    const handleEditMessage = useCallback(async (msg) => {
        if (!editMsgText.trim()) return;
        try {
            const res = await fetch(`/api/messages/${msg._id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ text: editMsgText.trim() }),
            });
            if (res.ok) {
                const updated = await res.json();
                setMessages((prev) => prev.map((m) => m._id === msg._id ? { ...m, text: updated.text, editedAt: updated.editedAt } : m));
                setEditingMsgId(null);
                setEditMsgText("");
                showToast("Message edited", "success");
            } else {
                showToast("Failed to edit message", "error");
            }
        } catch {
            showToast("Failed to edit message", "error");
        }
    }, [editMsgText, showToast]);

    const handleDeleteMessage = useCallback(async (msg) => {
        if (!confirm("Delete this message?")) return;
        try {
            const res = await fetch(`/api/messages/${msg._id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
            });
            if (res.ok) {
                setMessages((prev) => prev.map((m) => m._id === msg._id ? { ...m, text: "", deleted: true } : m));
                showToast("Message deleted", "success");
            } else {
                showToast("Failed to delete message", "error");
            }
        } catch {
            showToast("Failed to delete message", "error");
        }
    }, [showToast]);

    /* ── Pinned strip ──────────────────────────────────────────────────── */

    const loadPinned = useCallback(async () => {
        if (!username || !recipient) return;
        setPinnedErr("");
        try {
            const data = await callApi(`/api/messaging/pinned/${encodeURIComponent(recipient)}`, { credentials: "include" });
            setPinned({ messages: Array.isArray(data?.messages) ? data.messages : [], count: Number(data?.count) || 0 });
        } catch (e) {
            setPinnedErr(errText(e));
        }
    }, [username, recipient]);

    // Loaded once per conversation. Every per-conversation surface resets here
    // so switching chats cannot leave one thread's pins, selection or sheets on
    // screen over another's messages.
    //
    // Deferred by a microtask, like `resetChatState` below, for the same reason:
    // the reset has to land after the commit that changed `recipient`, not as a
    // cascading render inside it. Without the deferral the previous thread's
    // pinned strip and selection toolbar paint for one frame over the new
    // thread's messages.
    useEffect(() => {
        queueMicrotask(() => {
            setPinned(null);
            setPinnedErr("");
            setPinnedOpen(false);
            setSavedOpen(false);
            setMediaOpen(false);
            setOverflowOpen(false);
            setSelectMode(false);
            setSelected([]);
            setBulkResult(null);
            setInfoId(null);
            setInfoData(null);
            setInfoErr("");
            setJumpNote("");
            setFlashId(null);
            setFocusedId(null);
            revealTriedRef.current = "";
            revealPendingRef.current = false;
            if (recipient) loadPinned();
        });
    }, [recipient, loadPinned]);

    /* ──────────────────────────────────────────────────────────────────────
       Pinned / bookmark / mark-unread

       All three are PATCH /api/messaging/messages/:id with a different
       `action`. All three are optimistic with a rollback, because they all
       paint from a field the list already carries, and a pin that sticks on
       after a 403 is worse than no pin at all. The server's own answer is
       taken verbatim where it reports one (`pinned`, `bookmarked`), so a
       disagreement resolves in the server's favour rather than in the guess.
       ────────────────────────────────────────────────────────────────────── */

    const patchMessage = useCallback(async (msg, action, mutate, describe) => {
        if (!msg?._id) return;
        const rollback = msg;
        // The pinned strip is a SEPARATE fetch of the same documents, so a
        // patch has to be reflected in both copies or the strip and the thread
        // disagree until the next 8s poll. Both updates are functional, so a
        // pin made while the strip is still loading is simply dropped from it.
        const apply = (m) => (m._id === msg._id ? { ...m, ...mutate(m) } : m);
        setMessages((prev) => prev.map(apply));
        setPinned((prev) => (prev?.messages ? { ...prev, messages: prev.messages.map(apply) } : prev));
        try {
            const data = await callApi(`/api/messaging/messages/${encodeURIComponent(msg._id)}`, jsonBody({ action }));
            setMessages((prev) => prev.map((m) => (m._id === msg._id
                ? {
                    ...m,
                    pinned: data?.pinned ?? m.pinned,
                    bookmarkedBy: typeof data?.bookmarked === "boolean"
                        ? (data.bookmarked ? [...new Set([...(m.bookmarkedBy || []), username])] : (m.bookmarkedBy || []).filter((u) => u !== username))
                        : m.bookmarkedBy,
                    markedUnreadBy: typeof data?.markedUnread === "boolean"
                        ? (data.markedUnread ? [...new Set([...(m.markedUnreadBy || []), username])] : (m.markedUnreadBy || []).filter((u) => u !== username))
                        : m.markedUnreadBy,
                    expiresAt: data && "expiresAt" in data ? data.expiresAt : m.expiresAt,
                }
                : m)));
            showToast(describe, "success");
            // A pin that takes the count to zero must take the strip with it.
            loadPinned();
        } catch (e) {
            // Exact rollback to the object we captured, not to a re-derived
            // guess: a second write could have landed while this was in flight.
            const revert = (m) => (m._id === msg._id ? rollback : m);
            setMessages((prev) => prev.map(revert));
            setPinned((prev) => (prev?.messages ? { ...prev, messages: prev.messages.map(revert) } : prev));
            showToast(errText(e), "error");
        }
    }, [username, showToast, loadPinned]);

    const togglePin = useCallback((msg) => {
        const pin = !msg.pinned;
        return patchMessage(
            msg,
            pin ? "pin" : "unpin",
            () => ({ pinned: pin }),
            pin ? "Message pinned" : "Message unpinned"
        );
    }, [patchMessage]);

    const toggleBookmark = useCallback((msg) => {
        const on = !(msg.bookmarkedBy || []).includes(username);
        return patchMessage(
            msg,
            on ? "bookmark" : "unbookmark",
            (m) => ({
                bookmarkedBy: on
                    ? [...new Set([...(m.bookmarkedBy || []), username])]
                    : (m.bookmarkedBy || []).filter((u) => u !== username),
            }),
            on ? "Message saved" : "Removed from saved"
        );
    }, [patchMessage, username]);

    /**
     * The server refuses `markUnread` unless the caller is the RECIPIENT and
     * the message is already read (live-server/routes/messaging.js:281-291).
     * Both are checked here so the item is visibly disabled instead of
     * answering a guaranteed 400 — the reason is on the item's title.
     */
    const canMarkUnread = useCallback((msg) => msg.recipient === username && msg.isRead === true, [username]);

    const markUnread = useCallback(async (msg) => {
        if (!canMarkUnread(msg)) return;
        try {
            const data = await callApi(`/api/messaging/messages/${encodeURIComponent(msg._id)}`, jsonBody({ action: "markUnread" }));
            if (typeof data?.markedUnread === "boolean") {
                setMessages((prev) => prev.map((m) => (m._id === msg._id
                    ? { ...m, markedUnreadBy: data.markedUnread ? [...new Set([...(m.markedUnreadBy || []), username])] : (m.markedUnreadBy || []).filter((u) => u !== username) }
                    : m)));
            }
            // The conversation's unread count is recomputed by the DM list from
            // `isRead`/`markedUnreadBy` on its own poll, so there is nothing
            // local to invalidate here.
            showToast("Marked as unread", "success");
        } catch (e) {
            showToast(errText(e), "error");
        }
    }, [canMarkUnread, username, showToast]);

    /* ── Saved + shared media ──────────────────────────────────────────── */

    // Both panels are loaded when they are OPENED, not on mount, and each one
    // is cancelled on unmount. The error is cleared by the button that opens
    // the sheet rather than by an assignment at the top of the request, so a
    // failed load is replaced by a fresh attempt instead of being sticky.
    useEffect(() => {
        if (!savedOpen) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const data = await callApi("/api/messaging/bookmarked", { credentials: "include" });
                if (cancelled) return;
                setSaved({ messages: Array.isArray(data?.messages) ? data.messages : [], count: Number(data?.count) || 0 });
            } catch (e) {
                if (cancelled) return;
                setSaved(null);
                setSavedErr(errText(e));
            }
        })();
        return () => { cancelled = true; };
    }, [savedOpen]);

    useEffect(() => {
        if (!mediaOpen || !recipient) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const data = await callApi(`/api/messaging/media/${encodeURIComponent(recipient)}`, { credentials: "include" });
                if (cancelled) return;
                setMedia({ items: Array.isArray(data?.items) ? data.items : [], count: Number(data?.count) || 0 });
            } catch (e) {
                if (cancelled) return;
                setMedia(null);
                setMediaErr(errText(e));
            }
        })();
        return () => { cancelled = true; };
    }, [mediaOpen, recipient]);

    /* ── Message info sheet ────────────────────────────────────────────── */

    const openInfo = useCallback(async (id) => {
        if (!id) return;
        setInfoId(id);
        setInfoData(null);
        setInfoErr("");
        setInfoBusy(true);
        try {
            setInfoData(await callApi(`/api/messaging/messages/${encodeURIComponent(id)}`, { credentials: "include" }));
        } catch (e) {
            setInfoErr(errText(e));
        } finally {
            setInfoBusy(false);
        }
    }, []);

    /* ── Copy text / copy link ─────────────────────────────────────────── */

    const copyMessageText = useCallback(async (msg) => {
        const kind = inferKind(msg);
        const body = kind === "code" ? (unfence(msg.text) ?? String(msg.text || "")) : String(msg.text || "");
        if (!body.trim()) { showToast("This message has no text to copy", "info"); return; }
        showToast(await copyText(body) ? "Message text copied" : "Could not copy — your browser blocked the clipboard", "success");
    }, [showToast]);

    /**
     * A permalink, not the current URL. The hash is the contract with the
     * search list pass: `#msg-<id>` is what both Copy Link writes and what the
     * reveal effect below consumes on mount and on `hashchange`.
     */
    const messagePermalink = useCallback((id) => {
        if (!id || typeof window === "undefined") return "";
        return `${window.location.origin}${window.location.pathname}#msg-${id}`;
    }, []);

    const copyMessageLink = useCallback(async (msg) => {
        if (!msg?._id) { showToast("This message has not been sent yet", "info"); return; }
        const url = messagePermalink(msg._id);
        showToast(await copyText(url) ? "Message link copied" : "Could not copy — your browser blocked the clipboard", "success");
    }, [messagePermalink, showToast]);

    /* ── Selection ─────────────────────────────────────────────────────── */

    // The mode lives in a ref as well because the arrow-key handler and the
    // scroll handler both need it without re-binding a listener.
    useEffect(() => { selectModeRef.current = selectMode; }, [selectMode]);

    /**
     * Entering selection must not move the thread.
     *
     * Two things used to be able to do that: a `setState` that re-ran the
     * jump-to-last-read effect, and an action bar added INSIDE the scroll
     * container, which changes `scrollHeight` and shifts everything above it
     * under a scroll-anchored browser. So the bar below is `fixed` (it cannot
     * change the scroll box) and no scroll effect lists selection state.
     */
    const enterSelect = useCallback(() => {
        setSelectMode(true);
        setSelected([]);
        setBulkResult(null);
        setActiveMenu(null);
    }, []);

    const exitSelect = useCallback(() => {
        setSelectMode(false);
        setSelected([]);
        setBulkResult(null);
        setBulkReactOpen(false);
        setBulkBusy("");
    }, []);

    const toggleSelect = useCallback((id) => {
        if (!id) return;
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }, []);

    const runBulk = useCallback(async (action, value) => {
        const ids = selected.filter(Boolean);
        if (!ids.length) return;
        setBulkBusy(action);
        setBulkResult(null);
        try {
            const data = await callApi("/api/messaging/messages/bulk", postBody({ ids, action, value }));
            // `matched` is how many of the submitted ids the server found in
            // the caller's conversations, `modified` how many it actually
            // wrote, and `skipped` is the remainder. The endpoint does NOT
            // re-check the write for `react`, so `modified` can exceed what
            // visibly changed; the counts are reported as the server sent
            // them rather than being second-guessed here.
            const result = {
                action,
                matched: Number(data?.matched) || 0,
                modified: Number(data?.modified) || 0,
                skipped: Number(data?.skipped) || 0,
                note: data?.note || "",
            };
            setBulkResult(result);

            // Bring the local list in line with what the server did, so the
            // bulk bar's own state and the next 8s poll agree immediately.
            if (action === "star" || action === "unstar") {
                setMessages((prev) => prev.map((m) => (ids.includes(m._id)
                    ? { ...m, starredBy: action === "star"
                        ? [...new Set([...(m.starredBy || []), username])]
                        : (m.starredBy || []).filter((u) => u !== username) }
                    : m)));
            }
            if (action === "bookmark" || action === "unbookmark") {
                setMessages((prev) => prev.map((m) => (ids.includes(m._id)
                    ? { ...m, bookmarkedBy: action === "bookmark"
                        ? [...new Set([...(m.bookmarkedBy || []), username])]
                        : (m.bookmarkedBy || []).filter((u) => u !== username) }
                    : m)));
            }
            if (action === "delete") {
                setMessages((prev) => prev.map((m) => (ids.includes(m._id)
                    ? { ...m, text: "", imageUrl: "", audioUrl: "", videoUrl: "", attachments: [], deleted: true }
                    : m)));
            }
            if (action === "pin" || action === "unpin") {
                setMessages((prev) => prev.map((m) => (ids.includes(m._id) ? { ...m, pinned: action === "pin" } : m)));
            }
            if (action === "react") {
                // Optimistic, and deliberately not trusted: the bulk route only
                // appends the username when the bucket already exists
                // (`if (m.reactions[value] && ...)`), so a first-ever reaction of
                // a given type is NOT written by the server. The local chip
                // shows the intended result and the next 8s poll replaces it
                // with whatever the server actually has. This is the same
                // trade `handleReactMessage` already makes.
                setMessages((prev) => prev.map((m) => {
                    if (!ids.includes(m._id)) return m;
                    const reactions = m.reactions ? { ...m.reactions } : {};
                    for (const r of MSG_REACTIONS) {
                        if (!reactions[r.type]) reactions[r.type] = [];
                        reactions[r.type] = reactions[r.type].filter((u) => u !== username);
                    }
                    if (reactions[value]) reactions[value] = [...new Set([...reactions[value], username])];
                    return { ...m, reactions };
                }));
            }

            // Only a delete ends the selection: the toggles are reversible, so
            // keeping the ids selected is what lets the reader see the result
            // and flip it straight back.
            if (action === "delete") setSelected([]);
            loadPinned();
        } catch (e) {
            showToast(errText(e), "error");
        } finally {
            setBulkBusy("");
        }
    }, [selected, username, showToast, loadPinned]);

    /* ── Reveal a message by id (permalink + search hit) ──────────────── */

    /**
     * Scroll to a bubble and flash it. `revealMessage` below pages older
     * messages in when the target is not loaded; this is the landing half.
     */
    const flashMessage = useCallback((id) => {
        if (!id) return;
        setFlashId(id);
        const el = document.getElementById(`msg-${id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 2200);
    }, []);

    // Writes the current position into the URL so a reload, a share, or the
    // browser Back button all resolve to a message the reader was actually on.
    const updateHash = useCallback((id) => {
        if (typeof window === "undefined") return;
        const next = id ? `#msg-${id}` : "";
        if (window.location.hash === next) return;
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
    }, []);

    /* ── Countdown clock ───────────────────────────────────────────────── */

    // Armed only while something is actually counting, so an idle thread does
    // not re-render once a second for nothing. Same reasoning as the recall
    // timer above.
    useEffect(() => {
        const pending = messages
            .map((m) => m.expiresAt ? new Date(m.expiresAt).getTime() : 0)
            .filter((t) => t && t > now);
        const next = pending.length ? Math.min(...pending) : 0;
        if (!next) return undefined;
        const delay = Math.max(250, Math.min(60000, next - now));
        const id = setTimeout(() => setNow(Date.now()), delay);
        return () => clearTimeout(id);
    }, [messages, now]);

    /* ── Keyboard ──────────────────────────────────────────────────────── */

    const closeTopLayer = useCallback(() => {
        if (infoId) { setInfoId(null); setInfoData(null); setInfoErr(""); return true; }
        if (savedOpen) { setSavedOpen(false); return true; }
        if (mediaOpen) { setMediaOpen(false); return true; }
        if (pinnedOpen) { setPinnedOpen(false); return true; }
        if (overflowOpen) { setOverflowOpen(false); return true; }
        if (bulkReactOpen) { setBulkReactOpen(false); return true; }
        if (activeMenu) { setActiveMenu(null); return true; }
        if (selectMode) { exitSelect(); return true; }
        return false;
    }, [infoId, savedOpen, mediaOpen, pinnedOpen, overflowOpen, bulkReactOpen, activeMenu, selectMode, exitSelect]);

    const stepFocus = useCallback((dir) => {
        const rows = messages.filter((m) => m._id);
        if (!rows.length) return;
        const ids = rows.map((m) => m._id);
        const at = focusedId ? ids.indexOf(focusedId) : -1;
        const next = at === -1
            ? (dir > 0 ? ids[0] : ids[ids.length - 1])
            : ids[Math.min(ids.length - 1, Math.max(0, at + dir))];
        if (!next) return;
        setFocusedId(next);
        document.getElementById(`msg-${next}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setFocusedId((cur) => (cur === next ? null : cur)), 1600);
    }, [messages, focusedId]);

    // Bound on `window` rather than the container, because the thread is a
    // scroll region with no tab stop of its own. Suppressed entirely while the
    // reader is typing: the composer is a textarea and owns ArrowUp/Down for
    // its mention list, and Escape there belongs to its own tray.
    //
    // `/` is deliberately NOT bound — the search field belongs to another pass.
    useEffect(() => {
        const onKey = (e) => {
            const tag = e.target?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === "Escape") {
                if (closeTopLayer()) e.preventDefault();
                return;
            }
            if (e.key === "ArrowDown") { e.preventDefault(); stepFocus(1); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); stepFocus(-1); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [closeTopLayer, stepFocus]);

    const translateMessage = async (idx, text) => {
        if (translations[idx]) {
            setTranslations((prev) => { const n = { ...prev }; delete n[idx]; return n; });
            return;
        }
        setTranslatingIdx(idx);
        try {
            const res = await fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, target: user?.language || "en" }),
            });
            const data = await res.json();
            if (data.translatedText) {
                setTranslations((prev) => ({ ...prev, [idx]: data.translatedText }));
            }
        } catch {}
        setTranslatingIdx(null);
    };

    const handleReactMessage = useCallback(async (msgId, reactionType) => {
        if (!username) return;
        setMessages(prev => prev.map(m => {
            if (m._id !== msgId) return m;
            const reactions = m.reactions ? { ...m.reactions } : {};
            for (const type of MSG_REACTIONS.map(r => r.type)) {
                if (!reactions[type]) reactions[type] = [];
                const idx = reactions[type].indexOf(username);
                if (idx !== -1) reactions[type] = reactions[type].filter(u => u !== username);
            }
            if (!reactions[reactionType]) reactions[reactionType] = [];
            const idx = reactions[reactionType].indexOf(username);
            if (idx === -1) reactions[reactionType] = [...reactions[reactionType], username];
            return { ...m, reactions };
        }));
        try {
            const res = await fetch("/api/messages", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ sender: username, messageId: msgId, action: "react", reactionType }),
            });
            if (!res.ok) throw new Error("react failed");
            // Take the server's `reactions` verbatim. The local guess above is
            // only correct if nothing else touched the row in the meantime: the
            // server strips the user from every other bucket before toggling,
            // the 8s poll can land between the optimistic write and this
            // response, and a second reaction can overlap. Discarding the
            // response (the old `catch {}`) let any of those leave the chips
            // showing a mixture of both answers — a chip the server never
            // agreed to, and one that self-heals only if a later poll happens
            // to fix it.
            const data = await res.json().catch(() => null);
            if (data?.reactions) {
                setMessages(prev => prev.map(m => (
                    m._id === msgId ? { ...m, reactions: data.reactions } : m
                )));
            }
        } catch {
            // Nothing to roll back: the optimistic write is the only state we
            // have, and the next 8s poll overwrites it with the truth.
        }
    }, [username]);

    useEffect(() => {
        if (!user?.autoTranslate || !username) return;
        const toTranslate = messages.filter(
            (msg) => msg.sender !== username && msg.text && !translations[msg._id] && !autoTranslatingRef.current.has(msg._id)
        );
        if (toTranslate.length === 0) return;

        toTranslate.forEach((msg) => autoTranslatingRef.current.add(msg._id));

        const items = toTranslate.map((msg) => ({ id: msg._id, text: msg.text }));
        fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ batch: items, target: user?.language || "en" }),
        }).then((r) => r.json()).then((data) => {
            if (data.results) {
                setTranslations((prev) => ({ ...prev, ...data.results }));
            }
        }).catch(() => {});
    }, [messages, user?.autoTranslate, user?.language, username]);

    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [oldestTimestamp, setOldestTimestamp] = useState(null);
    const [newMessagesCount, setNewMessagesCount] = useState(0);
    const latestTimestampRef = useRef(null);
    const isLoadingOlderRef = useRef(false);

    const resetChatState = useCallback(() => {
        setMessages([]);
        setHasMore(false);
        setOldestTimestamp(null);
        setUnreadAnchorId(null);
        setLoading(true);
    }, []);

    const syncPendingMessage = useCallback((pm) => {
        // A confirmed outgoing send advances the read marker. Done here, in the
        // callback body, and *not* inside the setMessages updater: updaters must
        // be pure, and React is free to call one more than once (StrictMode
        // double-invokes, and a discarded render can simply drop it), which
        // would replay a localStorage write — a side effect nobody can undo —
        // for something that only needs to happen once per message.
        if (pm._id && !pm._sending && pm.sender === username && username && recipient) {
            setLastReadId(username, recipient, pm._id);
        }

        setMessages((prev) => {
            if (pm._remove) {
                return prev.filter((m) => m._id !== pm._id && m._tempId !== pm._tempId);
            }

            if (pm._id && !pm._sending) {
                const tempIndex = prev.findIndex((m) => m._tempId && m.sender === pm.sender && m.text === pm.text && m.imageUrl === pm.imageUrl);
                if (tempIndex !== -1) {
                    const copy = prev.slice();
                    copy[tempIndex] = pm;
                    return copy;
                }

                const exists = prev.some((m) => m._id === pm._id);
                if (exists) {
                    return prev.map((m) => (m._id === pm._id ? { ...m, _sending: false } : m));
                }
                return [...prev, pm];
            }

            if (pm._tempId) {
                const existsTemp = prev.some((m) => m._tempId === pm._tempId);
                if (existsTemp) {
                    return prev.map((m) => (m._tempId === pm._tempId ? pm : m));
                }
            }

            return [...prev, pm];
        });

        if (pm.sender === user?.username) {
            isNearBottomRef.current = true;
            setShowScrollBtn(false);
            requestAnimationFrame(() => scrollToBottom());
        }
    }, [user?.username, recipient, scrollToBottom]);

    const resetScrollState = useCallback(() => {
        isNearBottomRef.current = true;
        setShowScrollBtn(false);
    }, []);

    const resetNewMessagesCount = useCallback(() => {
        if (!isNearBottomRef.current && newMessagesCount > 0) return;
        setNewMessagesCount(0);
    }, [newMessagesCount]);

    const fetchMessages = useCallback(async (options = {}) => {
        if (!username || !recipient) return null;
        const params = new URLSearchParams({
            user1: username,
            user2: recipient,
            limit: String(options.limit || 20),
        });
        if (options.before) params.set("before", options.before);
        // No `lang` param: GET /api/messages never read one, so sending it only
        // looked like the server was doing the translating. It isn't — the batch
        // effect above posts to /api/translate.

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const res = await fetch(`/api/messages?${params.toString()}`, {
                credentials: 'include',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (!res.ok) return null;
            const data = await res.json();

            const fetched = Array.isArray(data.messages) ? data.messages : [];
            setHasMore(Boolean(data.hasMore));

            // No `translations` merge either: the response is `{ messages,
            // hasMore }` and nothing else, so this branch never ran.

            setMessages(prev => {
                const keyOf = (m) => m._id || m._tempId;

                // If prepending (loading older), just prepend without re-sorting
                if (options.prepend) {
                    const prevIds = new Set(prev.map(keyOf));
                    const newItems = fetched.filter(m => !prevIds.has(keyOf(m)));
                    return [...newItems, ...prev];
                }

                // For polling (append/update), merge intelligently
                const prevMap = new Map(prev.map(m => [keyOf(m), m]));
                const items = fetched.map(m => {
                    const local = prevMap.get(m._id);
                    return local ? { ...m, _sending: local._sending } : m;
                });

                const mergedMap = new Map(prev.map(m => [keyOf(m), m]));
                for (const item of items) {
                    const existing = mergedMap.get(item._id);
                    mergedMap.set(item._id, existing ? { ...item, _sending: existing._sending } : item);
                }
                
                // Sort only when not prepending
                return Array.from(mergedMap.values()).sort((a, b) => new Date(a.timeStamp) - new Date(b.timeStamp));
            });

            if (fetched.length) {
                const first = fetched[0];
                const last = fetched[fetched.length - 1];
                
                if (options.prepend) {
                    // Update oldest timestamp only when loading older messages
                    setOldestTimestamp(first.timeStamp);
                } else {
                    // Initial load or polling
                    setOldestTimestamp(prevOldest => prevOldest || first.timeStamp);
                    
                    if (latestTimestampRef.current && !isNearBottomRef.current) {
                        const newCount = fetched.filter((m) => new Date(m.timeStamp) > new Date(latestTimestampRef.current)).length;
                        if (newCount > 0) {
                            setNewMessagesCount((count) => count + newCount);
                        }
                    }
                    latestTimestampRef.current = last.timeStamp;
                }
            }

            if (!options.prepend) {
                await fetch("/api/messages", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: 'include',
                    body: JSON.stringify({ sender: username, recipient }),
                }).catch(() => {});
            }

            return fetched;
        } catch (err) {
            if (err.name === 'AbortError') {
                console.warn("Message fetch timed out");
            } else {
                console.error("Failed to fetch messages:", err);
            }
            return null;
        }
    }, [username, recipient]);

    const loadOlderMessages = useCallback(async () => {
        if (!username || !recipient || !hasMore || loadingMore || !oldestTimestamp) return;
        const el = scrollContainerRef.current;
        const previousScrollTop = el?.scrollTop || 0;
        const previousScrollHeight = el?.scrollHeight || 0;
        
        setLoadingMore(true);
        isLoadingOlderRef.current = true;
        
        try {
            await fetchMessages({ limit: 20, before: oldestTimestamp, prepend: true });
            requestAnimationFrame(() => {
                if (!el) return;
                el.scrollTop = el.scrollHeight - previousScrollHeight + previousScrollTop;
                // Keep isLoadingOlderRef true for a bit longer to prevent auto-scroll
                setTimeout(() => {
                    isLoadingOlderRef.current = false;
                }, 300);
            });
        } catch (err) {
            isLoadingOlderRef.current = false;
        } finally {
            setLoadingMore(false);
        }
    }, [fetchMessages, hasMore, loadingMore, oldestTimestamp, recipient, scrollContainerRef, username]);

    /**
     * Scroll to a bubble and flash it, paging older messages in when the
     * target is not on the page yet.
     *
     * There is no "fetch around" id on GET /api/messages — only `before`, in
     * ascending page order — so the only honest way to reach a message that is
     * not loaded is to keep pulling the previous page until it appears or the
     * thread runs out. The attempt budget is bounded so a hash pointing at a
     * message from a different conversation cannot spin forever, and when it
     * gives up it SAYS so: silently doing nothing is the failure mode this
     * replaces.
     *
     * A loop, not recursion: each `loadOlderMessages` already re-renders with
     * the prepended page, so the DOM node this looks for exists by the next
     * iteration and there is no reason to build a call stack out of it.
     */
    const revealMessage = useCallback(async (id) => {
        if (!id) return;
        if (document.getElementById(`msg-${id}`)) {
            revealPendingRef.current = false;
            setJumpNote("");
            flashMessage(id);
            return;
        }

        // Not on the page. Before pulling up to six pages of history towards a
        // target, confirm the message is in THIS conversation at all — a hash
        // left in the URL by another thread (Chat is keyed by `recipient`, so
        // the component remounts but the URL fragment does not) would otherwise
        // page the reader through the whole history to fail anyway.
        let inThisThread = true;
        try {
            const info = await callApi(`/api/messaging/messages/${encodeURIComponent(id)}`, { credentials: "include" });
            inThisThread = (info?.sender === username && info?.recipient === recipient)
                || (info?.sender === recipient && info?.recipient === username);
        } catch (e) {
            revealPendingRef.current = false;
            setJumpNote(errText(e));
            showToast("Could not open that message", "error");
            return;
        }
        if (!inThisThread) {
            revealPendingRef.current = false;
            setJumpNote("That message belongs to a different conversation.");
            showToast("That message is not in this conversation", "info");
            return;
        }

        for (let attempt = 0; attempt < 6; attempt += 1) {
            const el = document.getElementById(`msg-${id}`);
            if (el) {
                revealPendingRef.current = false;
                setJumpNote("");
                flashMessage(id);
                return;
            }
            if (!hasMore || loadingMore) break;
            revealPendingRef.current = true;
            await loadOlderMessages();
            // One frame for React to commit the prepended rows into the DOM.
            await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        }
        revealPendingRef.current = false;
        setJumpNote(
            hasMore
                ? "That message is further back than the pages loaded here. Scroll to the top of the thread to load older messages."
                : "That message is in this conversation but has not been sent, or has been deleted."
        );
        showToast("That message is not loaded in this thread", "info");
    }, [hasMore, loadingMore, loadOlderMessages, flashMessage, showToast, username, recipient]);


    // The list pass navigates with a hash, so consume it on mount and on every
    // `hashchange` (a same-document jump fires no navigation, only this event).
    // `revealTriedRef` makes each id a one-shot: the 8s poll re-renders this
    // effect's deps constantly, and re-scrolling to the same bubble on every
    // tick would fight the reader.
    useEffect(() => {
        if (loading || !recipient) return undefined;
        const read = () => {
            const m = /^#msg-([A-Za-z0-9]{1,64})$/.exec(window.location.hash || "");
            const id = m?.[1] || null;
            if (!id || id === revealTriedRef.current) return;
            revealTriedRef.current = id;
            revealMessage(id);
        };
        read();
        window.addEventListener("hashchange", read);
        return () => window.removeEventListener("hashchange", read);
    }, [loading, recipient, revealMessage]);

    useEffect(() => {
        if (!recipient) {
            queueMicrotask(() => {
                resetChatState();
                setLoading(false);
            });
            return;
        }

        let cancelled = false;
        queueMicrotask(resetChatState);
        scrolledToLastReadRef.current = false;

        const load = async () => {
            const result = await fetchMessages({ limit: 20 });
            if (!cancelled) {
                setLoading(false);
                if (result === null) {
                    setMessages([]);
                }
            }
        };

        load();
        return () => { cancelled = true; };
    }, [fetchMessages, recipient, resetChatState]);

    useEffect(() => {
        if (!recipient) return;
        queueMicrotask(resetScrollState);
    }, [recipient, resetScrollState]);

    // Use ref to avoid recreating interval when fetchMessages changes
    const fetchMessagesRef = useRef(fetchMessages);
    useEffect(() => {
        fetchMessagesRef.current = fetchMessages;
    }, [fetchMessages]);

    useEffect(() => {
        if (!recipient) return;
        const interval = setInterval(() => {
            fetchMessagesRef.current();
        }, 8000); // Increased from 5s to 8s
        return () => clearInterval(interval);
    }, [recipient]);

    useEffect(() => {
        if (!pendingMessage) return;
        queueMicrotask(() => syncPendingMessage(pendingMessage));
    }, [pendingMessage, syncPendingMessage]);

    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        
        let scrollTimeout;
        const onScroll = () => {
            if (el.scrollTop < 120 && hasMore && !loadingMore) {
                if (scrollTimeout) clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    loadOlderMessages();
                }, 150);
            }
            
            const near = isNearBottom();
            isNearBottomRef.current = near;
            setShowScrollBtn(!near);

            // A reader who scrolls back to the bottom themselves has abandoned
            // any pending deep-link reveal, so auto-stick can resume.
            if (near) revealPendingRef.current = false;

            if (username && recipient) {
                const containerRect = el.getBoundingClientRect();
                let bottomMostId = null;
                el.querySelectorAll("[id^='msg-']").forEach((msgEl) => {
                    const rect = msgEl.getBoundingClientRect();
                    if (rect.top < containerRect.bottom) {
                        bottomMostId = msgEl.id.replace("msg-", "");
                    }
                });
                if (bottomMostId) {
                    setLastReadId(username, recipient, bottomMostId);
                    updateHash(bottomMostId);
                }
            }
        };
        
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            el.removeEventListener("scroll", onScroll);
            if (scrollTimeout) clearTimeout(scrollTimeout);
        };
    }, [hasMore, isNearBottom, loadOlderMessages, loadingMore, scrollContainerRef, username, recipient, updateHash]);

    useEffect(() => {
        if (!username || !recipient || loading) return;

        if (!scrolledToLastReadRef.current) {
            scrolledToLastReadRef.current = true;
            const lastReadId = getLastReadId(username, recipient);
            // The "New messages" divider is anchored to this read marker, so it
            // has to be read *here* and not during render: the scroll handler
            // above rewrites localStorage on every scroll event, and the jump
            // below fires one, so by the next render the stored value is
            // already "the newest thing that happened to be on screen". Reading
            // it in the same effect as the jump gets the pre-scroll value, which
            // is the only one that still means "where the reader stopped".
            if (lastReadId) queueMicrotask(() => setUnreadAnchorId(lastReadId));
            // A `#msg-<id>` in the URL is a more specific instruction than the
            // stored read marker, so it wins and this jump is skipped. The hash
            // effect below does the reveal, with paging, a beat later.
            const hashId = /^#msg-([A-Za-z0-9]{1,64})$/.exec(
                typeof window === "undefined" ? "" : window.location.hash || ""
            )?.[1];
            if (hashId) return;
            if (lastReadId) {
                const el = document.getElementById(`msg-${lastReadId}`);
                if (el) {
                    el.scrollIntoView({ behavior: "instant", block: "center" });
                    return;
                }
            }
            scrollToBottom(false);
            return;
        }

        // `revealPendingRef` only suppresses the STICK-TO-BOTTOM half, never the
        // initial jump above: a deep link pages the reader up through history
        // and the next 8s poll would otherwise snap them back to the newest
        // message mid-read.
        if (isNearBottomRef.current && !isLoadingOlderRef.current && !revealPendingRef.current) {
            scrollToBottom();
        }
    }, [messages, scrollToBottom, username, recipient, loading]);

    useEffect(() => {
        resetNewMessagesCount();
    }, [messages, resetNewMessagesCount]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 dark:text-gray-500">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-500 dark:border-t-gray-400 rounded-full animate-spin" />
                <p className="text-sm">Loading\u2026</p>
            </div>
        );
    }

    if (!recipient) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
                <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold"
                    style={{ backgroundColor: user?.color || "#3b82f6" }}
                >
                    {user?.username?.[0]?.toUpperCase() ?? "?"}
                </div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{user?.username}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Select a conversation to start messaging</p>
            </div>
        );
    }

    /* ── Derived render state ───────────────────────────────────────────── */

    // A disappearing message stops being drawn the moment `expiresAt` passes,
    // without waiting for the server's TTL monitor (which sweeps about once a
    // minute) to actually delete the document. It stays in `messages`, so if
    // the poll still returns it nothing flickers back — the filter is a pure
    // function of `now`, not a one-shot write.
    const visibleMessages = messages.filter(
        (m) => !(m.expiresAt && new Date(m.expiresAt).getTime() > 0 && new Date(m.expiresAt).getTime() <= now)
    );
    const allExpired = messages.length > 0 && visibleMessages.length === 0;

    const pinnedCount = pinned?.count ?? 0;
    const pinnedList = pinned?.messages ?? [];

    // Index of the first *unread* message, i.e. the one just after the marker
    // captured when the thread was opened. -1 whenever there is no marker, it
    // has been evicted, or it is not on the loaded page — and then no divider is
    // drawn, because there is no honest place to put one.
    const dividerAfter = unreadAnchorId
        ? visibleMessages.findIndex((m) => m._id === unreadAnchorId) + 1
        : 0;
    const showUnreadDivider = dividerAfter > 0 && dividerAfter < visibleMessages.length;

    if (messages.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
                <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold bg-gray-300 dark:bg-gray-700"
                >
                    {recipient?.[0]?.toUpperCase() ?? "?"}
                </div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{recipient}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">No messages yet. Say hello</p>
            </div>
        );
    }

    return (
        <div className="relative h-full">
        <div className="flex flex-col gap-0.5 w-full">

            {/* ── Sticky header: pinned strip + thread actions ────────────
                ONE sticky container for both rows, not two. Two siblings at
                `sticky top-0` occupy the same offset and paint over each
                other; the action strip would need the pinned strip's height as
                its `top`, which is a runtime measurement of a row whose
                content changes with the pin count. One container needs no
                measurement.

                It is sticky inside the thread's own scroll container, which
                puts it directly under the conversation header — the header is a
                sibling of the scroll box, not a child of it. */}
            <div className="sticky top-0 z-20 -mx-3 md:-mx-4 px-3 md:px-4 pt-1 pb-1.5 bg-white/95 dark:bg-gray-950/95 backdrop-blur">
            {pinnedCount > 0 && (
                <div className="pb-1.5 mb-1.5 border-b border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPinnedOpen((v) => !v)}
                            aria-expanded={pinnedOpen}
                            className="shrink-0 min-h-[40px] px-2 -ml-2 flex items-center gap-1 rounded-full text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                <path d="M11.48 3.5a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.563.563 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.563.563 0 0 0-.182-.557l-4.204-3.602a.563.563 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                            </svg>
                            Pinned · {pinnedCount}
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={`w-3 h-3 transition-transform ${pinnedOpen ? "rotate-180" : ""}`}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                        </button>
                        {/* Collapsed: one horizontally scrolling row. Expanded:
                            the full list, so a thread with many pins is
                            readable without a swipe. */}
                        <div className={`min-w-0 flex-1 ${pinnedOpen ? "max-h-[45vh] overflow-y-auto space-y-1" : "flex gap-2 overflow-x-auto"}`}>
                            {(pinnedOpen ? pinnedList : pinnedList.slice(0, 6)).map((p) => (
                                <div key={p._id} className={`${pinnedOpen ? "w-full" : "shrink-0"} flex items-center rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800`}>
                                    <button
                                        type="button"
                                        onClick={() => revealMessage(p._id)}
                                        className="min-h-[40px] max-w-full px-3 flex items-center text-xs text-gray-700 dark:text-gray-200 truncate"
                                        title="Jump to this message"
                                    >
                                        {messageSummary(p, inferKind(p))}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => togglePin(p)}
                                        aria-label="Unpin message"
                                        title="Unpin"
                                        className="shrink-0 w-10 h-10 -mr-1 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    {pinnedErr && <p className="text-[10px] text-red-500 mt-1">{pinnedErr}</p>}
                </div>
            )}

            {/* ── Thread actions ──────────────────────────────────────────
                The conversation header lives in ChatBox.jsx, which another
                pass owns, so Select / Saved / Shared media / the shortcut
                hints are surfaced on a strip of their own immediately under
                the pinned bar rather than in that header. */}
            {!selectMode && (
                <div className="flex items-center gap-1.5 overflow-x-auto">
                    <ThreadChip onClick={enterSelect} label="Select" icon="check" />
                    <ThreadChip onClick={() => { setSavedErr(""); setSaved(null); setSavedOpen(true); }} label="Saved" icon="bookmark" />
                    <ThreadChip onClick={() => { setMediaErr(""); setMedia(null); setMediaOpen(true); }} label="Media" icon="image" />
                    <div className="relative shrink-0">
                        <button
                            type="button"
                            onClick={() => setOverflowOpen((v) => !v)}
                            aria-label="Thread options and keyboard shortcuts"
                            aria-expanded={overflowOpen}
                            className="min-h-[40px] px-2.5 flex items-center gap-1 rounded-full text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            More
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                        </button>
                        {overflowOpen && (
                            <>
                                <button className="fixed inset-0 z-40 cursor-default" aria-hidden="true" tabIndex={-1} onClick={() => setOverflowOpen(false)} />
                                <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-2 px-3 animate-scale-in">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Keyboard</p>
                                    <ul className="mt-1 space-y-1">
                                                        {[
                                                            ["↑ / ↓", "Step through messages"],
                                                            ["Esc", "Close a panel, or leave selection mode"],
                                                        ].map(([k, label]) => (
                                                            <li key={k} className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-300">
                                                                <kbd className="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 min-w-[46px] text-center">{k}</kbd>
                                                                <span className="min-w-0 flex-1">{label}</span>
                                                            </li>
                                                        ))}
                                                        <li className="flex items-start gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                                                            <kbd className="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 min-w-[46px] text-center">/</kbd>
                                                            <span className="min-w-0 flex-1">Focus search — owned by the inbox list, not bound here.</span>
                                                        </li>
                                                    </ul>
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mt-3">Link previews</p>
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                                        Turned off, and not offered as a toggle. <span className="font-mono">resolveLinkPreview()</span> re-fetches
                                        a preview for any URL in the text whenever the client omits one, so sending
                                        <span className="font-mono"> linkPreview: null</span> does not suppress anything — the server would
                                        resolve it anyway. A client-side “no previews” switch would be a control that does nothing.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                    {jumpNote && (
                        <span className="ml-auto shrink-0 text-[10px] text-amber-600 dark:text-amber-400 max-w-[45%] truncate" title={jumpNote}>
                            {jumpNote}
                        </span>
                    )}
                </div>
            )}

            {selectMode && (
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={exitSelect}
                        aria-label="Leave selection mode"
                        className="min-h-[40px] px-2.5 flex items-center gap-1 rounded-full text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                        Done
                    </button>
                    <span className="min-w-0 flex-1 text-xs text-gray-600 dark:text-gray-300 truncate">
                        {selected.length} selected
                    </span>
                    <button
                        type="button"
                        onClick={() => setSelected(visibleMessages.filter((m) => m._id && !m.deleted).map((m) => m._id))}
                        className="shrink-0 min-h-[40px] px-2.5 flex items-center rounded-full text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        Select all loaded
                    </button>
                </div>
            )}
            </div>

            {loadingMore && (
                <div className="flex items-center justify-center py-2">
                    <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-700 border-t-transparent rounded-full animate-spin" />
                </div>
            )}
            {allExpired && (
                <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center select-none">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Every message in this thread has expired</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                        These are disappearing messages. The server deletes them for good; nothing is kept locally.
                    </p>
                </div>
            )}
            {visibleMessages.map((msg, i) => {
                const isMine  = msg.sender === user?.username;
                const isFirst = i === 0;
                const prev    = isFirst ? null : visibleMessages[i - 1];
                const next    = i < visibleMessages.length - 1 ? visibleMessages[i + 1] : null;

                /* Date divider.
                 * The old chip fired on any five-minute gap, which put a
                 * "2:05 PM / 2:11 PM" pair in the middle of one conversation
                 * and nothing at all across midnight. A day boundary in UTC
                 * (see the note above `utcDayKey`) is the actual unit a
                 * reader cares about, and it doubles as the grouping reset for
                 * the bubble tails below, so a new day never leaves a bubble
                 * hanging off the previous day's. */
                const newDay = isFirst || utcDayKey(prev?.timeStamp) !== utcDayKey(msg.timeStamp);

                const sameAsPrev = prev && prev.sender === msg.sender && !newDay;
                const sameAsNext = next && next.sender === msg.sender &&
                    utcDayKey(next.timeStamp) === utcDayKey(msg.timeStamp);

                let rounding;
                if (isMine) {
                    if (!sameAsPrev && !sameAsNext) rounding = "rounded-3xl";
                    else if (!sameAsPrev)           rounding = "rounded-3xl rounded-br-md";
                    else if (!sameAsNext)           rounding = "rounded-3xl rounded-tr-md";
                    else                            rounding = "rounded-3xl rounded-r-md";
                } else {
                    if (!sameAsPrev && !sameAsNext) rounding = "rounded-3xl";
                    else if (!sameAsPrev)           rounding = "rounded-3xl rounded-bl-md";
                    else if (!sameAsNext)           rounding = "rounded-3xl rounded-tl-md";
                    else                            rounding = "rounded-3xl rounded-l-md";
                }

                const tickStatus = isMine ? getMessageStatus(msg) : null;
                const kind = inferKind(msg);
                const isCode = kind === "code" && !msg.deleted;
                const extras = extraAttachments(msg);
                const hasCard = (kind === "poll" && !!msg.poll?.question)
                    || (kind === "location" && !!msg.location && hasCoords(msg.location))
                    || (kind === "contact" && !!msg.contact?.username);
                // What drew a block above the caption, if anything. Drives the
                // hairline between the media and the text, and — inverted —
                // the "nothing was renderable" backstop below.
                const drewBlock = !!(msg.imageUrl || msg.videoUrl || msg.audioUrl || extras.length || hasCard || isCode);
                const bodyBorder = drewBlock
                    ? (isMine ? " border-t border-white/20" : " border-t border-gray-200 dark:border-gray-700")
                    : "";
                // A file-only, video-only, location-only, poll-only or
                // contact-only message used to reach the bubble with nothing at
                // all in it. Every one of those types is drawn above, so this
                // only fires for a kind no branch above claims — and it names
                // the kind instead of painting an empty pill.
                const showKindFallback = !msg.deleted && editingMsgId !== msg._id
                    && !drewBlock && !msg.text;
                const isSelected = !!msg._id && selected.includes(msg._id);
                const isFocused = !!msg._id && focusedId === msg._id;

                // Long-press opens selection; a tap in selection mode toggles.
                // ONE timer for the whole thread, declared at the top of the
                // component: a `useRef` inside this map callback would be a
                // hook call in a loop, and React's rules of hooks forbid that
                // (the message count changes between renders, so the hook
                // order would not even be stable). A single shared timer is
                // also the correct model — only one press can be in flight.
                const startPress = () => {
                    if (!msg._id) return;
                    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
                    pressTimerRef.current = setTimeout(() => {
                        pressTimerRef.current = null;
                        longPressAtRef.current = Date.now();
                        if (selectModeRef.current) return;
                        setSelectMode(true);
                        setSelected([msg._id]);
                    }, 450);
                };
                const endPress = () => {
                    if (pressTimerRef.current) {
                        clearTimeout(pressTimerRef.current);
                        pressTimerRef.current = null;
                    }
                };

                return (
                    <div
                        key={msg._id || msg._tempId}
                        id={msg._id ? `msg-${msg._id}` : undefined}
                        className={`rounded-2xl transition-shadow duration-500 ${
                            flashId === msg._id
                                ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-950"
                                : isFocused ? "bg-blue-50/60 dark:bg-blue-950/30" : ""
                        }`}
                    >
                        {showUnreadDivider && i === dividerAfter && (
                            <div className="flex items-center gap-3 my-3">
                                <span className="h-px flex-1 bg-blue-300 dark:bg-blue-500/40" />
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400">
                                    New messages
                                </span>
                                <span className="h-px flex-1 bg-blue-300 dark:bg-blue-500/40" />
                            </div>
                        )}
                        {newDay && (
                            <div className="flex justify-center my-3">
                                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                                    {dayDividerLabel(msg.timeStamp, now)}
                                </span>
                            </div>
                        )}

                        <div className={`flex items-end gap-2 mt-0.5 ${isMine ? "justify-end" : "justify-start"}`}>
                            {!isMine && (
                                <div className="w-7 shrink-0">
                                    {!sameAsNext && <Avatar sender={msg.sender} color={msg.color} />}
                                </div>
                            )}

                            <div className="flex flex-col min-w-0 max-w-[72vw] sm:max-w-xs lg:max-w-md">
                                {!isMine && !sameAsPrev && (
                                    <div className="flex items-center gap-1 mb-1 ml-1">
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{msg.sender}</span>
                                        {msg.sender === recipient && (
                                            <UserBadges isPro={recipientUser?.isPro} isVerified={recipientUser?.isVerified} isAdmin={recipientUser?.isAdmin} roles={recipientUser?.roles || []} size="xs" />
                                        )}
                                    </div>
                                )}

                                {msg.forwardedFrom && (
                                    <div className={`mb-1 px-3 py-1.5 rounded-2xl text-xs border-l-3 ${
                                        isMine
                                            ? "bg-blue-600/30 border-blue-300 text-blue-100"
                                            : "bg-gray-200 dark:bg-gray-700 border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-300"
                                    }`}>
                                        <p className="font-semibold text-[10px] truncate">
                                            Forwarded from {msg.forwardedFrom.sender}
                                        </p>
                                        {msg.forwardedFrom.text && (
                                            <p className="truncate opacity-70">{msg.forwardedFrom.text}</p>
                                        )}
                                    </div>
                                )}

                                {msg.replyTo && (
                                    <div className={`mb-1 px-3 py-1.5 rounded-2xl text-xs border-l-3 ${
                                        isMine
                                            ? "bg-blue-600/30 border-blue-300 text-blue-100"
                                            : "bg-gray-200 dark:bg-gray-700 border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-300"
                                    }`}>
                                        <p className="font-semibold text-[10px] truncate">{msg.replyTo.sender}</p>
                                        <p className="truncate opacity-70">{msg.replyTo.text}</p>
                                    </div>
                                )}

                                <div
                                    className={`overflow-hidden ${rounding} ${
                                        isMine
                                            ? "bg-blue-500 text-white"
                                            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    } ${isSelected ? "ring-2 ring-blue-500" : ""}`}
                                    onClick={selectMode && msg._id ? () => toggleSelect(msg._id) : undefined}
                                    onTouchStart={(e) => {
                                        const t = e.touches?.[0];
                                        pressStartRef.current = { x: t?.clientX ?? 0, y: t?.clientY ?? 0 };
                                        startPress();
                                    }}
                                    onTouchEnd={endPress}
                                    onTouchCancel={endPress}
                                    onTouchMove={(e) => {
                                        /* A press is cancelled by MOVEMENT, not by
                                         * the least tremor: scrolling the thread
                                         * with a finger resting on a bubble is
                                         * common, and cancelling on the first
                                         * sub-pixel move made the long press feel
                                         * unreliable. 10px is well under the
                                         * ~40px it takes to start a scroll. */
                                        const t = e.touches?.[0];
                                        if (!t) { endPress(); return; }
                                        if (Math.abs(t.clientX - pressStartRef.current.x) > 10
                                            || Math.abs(t.clientY - pressStartRef.current.y) > 10) endPress();
                                    }}
                                    onContextMenu={(e) => {
                                        /* Android fires `contextmenu` about 500ms
                                         * into a long press, i.e. right after the
                                         * 450ms timer above has opened selection
                                         * — and the native menu swallows the
                                         * click. Suppressed only when a long
                                         * press actually fired, so a desktop
                                         * right-click (select text, open the
                                         * image) still works. */
                                        if (Date.now() - longPressAtRef.current < 900) e.preventDefault();
                                    }}
                                    role={selectMode && msg._id ? "checkbox" : undefined}
                                    tabIndex={selectMode && msg._id ? -1 : undefined}
                                    aria-checked={selectMode && msg._id ? isSelected : undefined}
                                    aria-label={selectMode && msg._id ? `Select message from ${msg.sender}` : undefined}
                                >
                                    {msg.imageUrl && (
                                        <button
                                            type="button"
                                            onClick={() => setLightboxSrc(msg.imageUrl)}
                                            className={`block w-full ${msg.text ? "" : "max-w-[300px]"} overflow-hidden rounded-3xl cursor-pointer`}
                                        >
                                            {isGifUrl(msg.imageUrl) ? (
                                                <img
                                                    src={msg.imageUrl}
                                                    alt="GIF"
                                                    className="w-full h-auto block"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <Image
                                                    src={msg.imageUrl}
                                                    alt="Photo"
                                                    width={600}
                                                    height={400}
                                                    /* `object-cover` was paired with
                                                       * `h-auto`, which makes it a
                                                       * no-op: with no fixed height
                                                       * the box is already the
                                                       * intrinsic ratio, so nothing
                                                       * is cropped. The real problem
                                                       * was the opposite one — a tall
                                                       * portrait (a screenshot, say)
                                                       * rendered at full height and
                                                       * swamped the thread. Clamp the
                                                       * height and switch to
                                                       * `object-contain` so the
                                                       * clamp letterboxes instead of
                                                       * squashing the image. */
                                                    className="w-full max-h-[420px] object-contain"
                                                    priority={false}
                                                />
                                            )}
                                        </button>
                                    )}
                                    {msg.videoUrl && <VideoBlock src={msg.videoUrl} />}
                                    {/* The voice-note branch used to read
                                        `msg.audioUrl && !msg.text && !msg.imageUrl`,
                                        so a voice note WITH a caption rendered the
                                        caption and no player at all — the
                                        recording was unreachable. Both blocks
                                        are now independent and a captioned
                                        voice note shows the player AND the
                                        caption. */}
                                    {msg.audioUrl && (
                                        <div className="p-1">
                                            <AudioPlayer src={msg.audioUrl} isMine={isMine} />
                                        </div>
                                    )}
                                    {extras.length > 0 && (
                                        <div className={bodyBorder}>
                                            <AttachmentList items={extras} />
                                        </div>
                                    )}
                                    {hasCard && (
                                        <>
                                            {kind === "location" && (
                                                <div className={bodyBorder}>
                                                    <LocationCard location={msg.location} />
                                                </div>
                                            )}
                                            {kind === "poll" && (
                                                <div className={bodyBorder}>
                                                    <PollCardReadOnly poll={msg.poll} username={username} />
                                                </div>
                                            )}
                                            {kind === "contact" && (
                                                <div className={bodyBorder}>
                                                    <ContactCard contact={msg.contact} />
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {msg.deleted ? (
                                        <div className={`px-4 py-2.5 text-sm italic ${msg.imageUrl ? "border-t border-white/20" : ""} ${isMine ? "text-blue-200/70" : "text-gray-400 dark:text-gray-500"}`}>
                                            This message was deleted
                                        </div>
                                    ) : editingMsgId === msg._id ? (
                                        <div className="px-3 py-2">
                                            <input
                                                type="text"
                                                value={editMsgText}
                                                onChange={(e) => setEditMsgText(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleEditMessage(msg);
                                                    if (e.key === "Escape") { setEditingMsgId(null); setEditMsgText(""); }
                                                }}
                                                className={`w-full bg-transparent border rounded-lg px-2 py-1 text-sm outline-none ${isMine ? "border-blue-300 text-white placeholder-blue-200/50" : "border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"}`}
                                                autoFocus
                                            />
                                            <div className="flex gap-2 mt-1">
                                                <button onClick={() => handleEditMessage(msg)} className="text-[10px] font-bold text-blue-400 hover:text-blue-300">Save</button>
                                                <button onClick={() => { setEditingMsgId(null); setEditMsgText(""); }} className="text-[10px] text-gray-400 hover:text-gray-300">Cancel</button>
                                            </div>
                                        </div>
                                    ) : isCode ? (
                                        <CodeBlock
                                            body={unfence(msg.text) ?? String(msg.text || "")}
                                            onCopyResult={(ok) => showToast(ok ? "Code copied" : "Could not copy — your browser blocked the clipboard", ok ? "success" : "error")}
                                        />
                                    ) : msg.text ? (
                                        <div className={`px-4 py-2.5 text-sm leading-snug break-words ${bodyBorder}`}>
                                            {/* `RichText` renders every `#tag` as a
                                                * <button onClick={() => onHashtag?.(tag)}>.
                                                * Without this prop the handler is a
                                                * no-op, so tapping a hashtag in a DM
                                                * looked live and did nothing. The feed
                                                * takes its tag filter from `?tag=`, not
                                                * from a `/tag/[tag]` route. */}
                                            <RichText text={msg.text} className="text-inherit" onHashtag={(tag) => router.push(`/?tag=${encodeURIComponent(tag)}`)} />
                                        </div>
                                    ) : null}
                                    {showKindFallback && (
                                        <div className={`px-4 py-2.5 text-[11px] opacity-60 ${bodyBorder}`}>
                                            {KIND_LABEL[kind] || "Message"}
                                        </div>
                                    )}
                                    {msg.linkPreview && !msg.deleted && (
                                        <div className={`p-1.5 ${msg.text ? "border-t" : ""} ${isMine ? "border-white/20" : "border-gray-200 dark:border-gray-700"}`}>
                                            <LinkPreviewCard preview={msg.linkPreview} small />
                                        </div>
                                    )}
                                    {msg.pinned && !msg.deleted && (
                                        <div className={`flex items-center gap-1 px-3 py-1 text-[10px] ${isMine ? "bg-blue-400/25 text-blue-50" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                                <path d="M11.48 3.5a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.563.563 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.563.563 0 0 0-.182-.557l-4.204-3.602a.563.563 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                                            </svg>
                                            Pinned
                                        </div>
                                    )}
                                </div>

                                {msg.expiresAt && !msg.deleted && (
                                    <span className={`mt-0.5 flex ${isMine ? "justify-end mr-1" : "justify-start ml-1"}`}>
                                        <ExpiryChip expiresAt={msg.expiresAt} now={now} />
                                    </span>
                                )}

                                {msg.editedAt && !msg.deleted && (
                                    <span className={`text-[10px] italic ${isMine ? "text-blue-200/60" : "text-gray-400 dark:text-gray-500"}`}>edited</span>
                                )}
                                {msg.text && !msg.deleted && translations[msg._id] && (
                                    <div className={`mt-0.5 px-3 py-1.5 rounded-2xl text-xs italic ${
                                        isMine
                                            ? "bg-blue-600/20 text-blue-100"
                                            : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                    }`}>
                                        {translations[msg._id]}
                                    </div>
                                )}

                                {/* The per-message action row is hidden in selection
                                    mode: eight 40px buttons under every bubble is
                                    both noise and a tap-target collision with the
                                    bubble itself, and the bottom bar owns the
                                    actions while a selection is live. */}
                                {!selectMode && (
                                <div className={`flex items-center gap-1 mt-0.5 ${isMine ? "justify-end mr-1" : "justify-start ml-1"}`}>
                                    <button
                                        onClick={() => setReplyingTo(msg)}
                                        className="p-1 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                                        title="Reply"
                                        aria-label="Reply">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                                        </svg>
                                    </button>
                                    {msg.text && (
                                        <button
                                            onClick={() => translateMessage(msg._id, msg.text)}
                                            className={`p-1 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full transition-colors ${
                                                translations[msg._id]
                                                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-500"
                                                    : "hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                            }`}
                                            title={translations[msg._id] ? "Hide translation" : "Translate"}
                                            aria-label={translations[msg._id] ? "Hide translation" : "Translate translation"}>
                                            {translatingIdx === msg._id ? (
                                                <div className="w-3.5 h-3.5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" />
                                                </svg>
                                            )}
                                        </button>
                                    )}
                                    {/* Star. Per-user, so the same message can be
                                        starred by one reader and not another. */}
                                    <button
                                        onClick={() => handleStar(msg)}
                                        disabled={msg._sending || !msg._id}
                                        className={`p-1 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                                            msg.starredBy?.includes(username)
                                                ? "text-yellow-500"
                                                : "text-gray-500 dark:text-gray-400 hover:text-yellow-500"
                                        }`}
                                        aria-label={msg.starredBy?.includes(username) ? "Unstar message" : "Star message"}
                                        title={msg.starredBy?.includes(username) ? "Unstar" : "Star"}
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 24 24"
                                            fill={msg.starredBy?.includes(username) ? "currentColor" : "none"}
                                            strokeWidth={1.8}
                                            stroke="currentColor"
                                            className="w-3.5 h-3.5"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.563.563 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.563.563 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                                        </svg>
                                    </button>
                                    {isMine && (
                                        <>
                                            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                                {new Date(msg.timeStamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                            <TickIcon status={tickStatus} />
                                            {canRecall(msg) && (
                                                <button
                                                    onClick={() => handleRecall(msg)}
                                                    className="ml-1 px-1.5 min-h-[32px] flex items-center text-[10px] text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors font-medium"
                                                    title="Recall message"
                                                >
                                                    Recall
                                                </button>
                                            )}
                                            {!msg.deleted && !msg._sending && (
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setActiveMenu(activeMenu === msg._id ? null : msg._id)}
                                                        className="p-1 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-white/20 text-gray-500 dark:text-gray-400 hover:text-gray-200 transition-colors"
                                                        aria-label="Message actions"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                                                        </svg>
                                                    </button>
                                                    {activeMenu === msg._id && (
                                                        <div className="absolute bottom-full right-0 mb-1 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-20 min-w-[180px] max-h-[70vh] overflow-y-auto">
                                                            <button
                                                                onClick={() => { setEditingMsgId(msg._id); setEditMsgText(msg.text || ""); setActiveMenu(null); }}
                                                                className="w-full min-h-[40px] flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                                                                </svg>
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => { setForwardMsg(msg); setActiveMenu(null); }}
                                                                className="w-full min-h-[40px] flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                                                                </svg>
                                                                Forward
                                                            </button>
                                                            <button
                                                                onClick={() => { togglePin(msg); setActiveMenu(null); }}
                                                                className="w-full min-h-[40px] flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={msg.pinned ? "currentColor" : "none"} strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.563.563 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.563.563 0 0 0-.182-.557l-4.204-3.602a.563.563 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                                                                </svg>
                                                                {msg.pinned ? "Unpin" : "Pin to top"}
                                                            </button>
                                                            <button
                                                                onClick={() => { toggleBookmark(msg); setActiveMenu(null); }}
                                                                className="w-full min-h-[40px] flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill={msg.bookmarkedBy?.includes(username) ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c.1.128.157.29.157.46v16.878a1.25 1.25 0 0 1-1.884 1.122L12 18.75 8.134 21.782A1.25 1.25 0 0 1 6.25 20.66V3.782c0-.17.057-.332.157-.46A2.25 2.25 0 0 1 8.25 2.25h7.5a2.25 2.25 0 0 1 1.843 1.072Z" />
                                                                </svg>
                                                                {msg.bookmarkedBy?.includes(username) ? "Remove from saved" : "Save message"}
                                                            </button>
                                                            <button
                                                                onClick={() => { copyMessageText(msg); setActiveMenu(null); }}
                                                                className="w-full min-h-[40px] flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75 5.25 5.25 0 0 1 7.416-2.4Z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75h3.75a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75H8.25a.75.75 0 0 1-.75-.75V7.5a.75.75 0 0 1 .75-.75H12Z" />
                                                                </svg>
                                                                Copy text
                                                            </button>
                                                            <button
                                                                onClick={() => { copyMessageLink(msg); setActiveMenu(null); }}
                                                                className="w-full min-h-[40px] flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                                                                </svg>
                                                                Copy link
                                                            </button>
                                                            <button
                                                                onClick={() => { openInfo(msg._id); setActiveMenu(null); }}
                                                                className="w-full min-h-[40px] flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9-3.75h.008v.008H12V8.25z" />
                                                                </svg>
                                                                Message info
                                                            </button>
                                                            <button
                                                                onClick={() => { markUnread(msg); setActiveMenu(null); }}
                                                                disabled={!canMarkUnread(msg)}
                                                                title={canMarkUnread(msg)
                                                                    ? "Show this as unread again"
                                                                    : msg.recipient !== username
                                                                        ? "Only the recipient can mark a message unread"
                                                                        : "This message has not been read yet"}
                                                                className="w-full min-h-[40px] flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                                                                </svg>
                                                                Mark as unread
                                                            </button>
                                                            <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                                                            <button
                                                                onClick={() => { handleDeleteMessage(msg); setActiveMenu(null); }}
                                                                className="w-full min-h-[40px] flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                                                </svg>
                                                                Delete
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {!isMine && (
                                        <span className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                                            {new Date(msg.timeStamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                            {!msg.deleted && (
                                                <>
                                                    <button
                                                        onClick={() => setForwardMsg(msg)}
                                                        title="Forward message"
                                                        aria-label="Forward message"
                                                        className="p-1 -m-1 min-h-[32px] min-w-[32px] flex items-center justify-center rounded-full hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                                                        </svg>
                                                    </button>
                                                    {/* An incoming message has no ⋯ menu
                                                        at all — the row above is only
                                                        rendered for `isMine` — so the
                                                        per-message actions that are
                                                        not sender-only (pin, save,
                                                        copy, info) live here instead. */}
                                                    <button
                                                        onClick={() => { openInfo(msg._id); }}
                                                        title="Message info"
                                                        aria-label="Message info"
                                                        className="p-1 -m-1 min-h-[32px] min-w-[32px] flex items-center justify-center rounded-full hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9-3.75h.008v.008H12V8.25z" />
                                                        </svg>
                                                    </button>
                                                </>
                                            )}
                                        </span>
                                    )}
                                </div>
                                )}
                                {msg.reactions && (() => {
                                    const counts = MSG_REACTIONS
                                        .map(r => ({ ...r, count: msg.reactions[r.type]?.length || 0, users: msg.reactions[r.type] || [] }))
                                        .filter(r => r.count > 0);
                                    const myReaction = MSG_REACTIONS.find(r => msg.reactions[r.type]?.includes(username));
                                    // `counts` keeps only buckets with at least one
                                    // voter, so an empty `counts` means every bucket
                                    // is empty — which makes `myReaction`
                                    // necessarily undefined. The second term could
                                    // never change the outcome.
                                    if (counts.length === 0) return null;
                                    return (
                                        <div className={`flex items-center gap-1 mt-0.5 flex-wrap ${isMine ? "justify-end mr-1" : "justify-start ml-1"}`}>
                                            {counts.map(r => (
                                                <button
                                                    key={r.type}
                                                    onClick={() => handleReactMessage(msg._id, r.type)}
                                                    className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
                                                        myReaction?.type === r.type
                                                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                                            : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                                    }`}
                                                >
                                                    <span>{r.emoji}</span>
                                                    <span>{r.count}</span>
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                );
            })}
            {(isTyping || isRecording) && (
                <div className="flex items-end gap-2 px-1 pt-1 pb-0.5 animate-fade-in">
                    <Avatar sender={recipient} color={recipientUser?.color || "#3b82f6"} />
                    <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-800">
                        {isRecording ? (
                            <div className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-red-500 animate-pulse">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                                </svg>
                                <div className="flex gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-[bounce_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0ms' }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-[bounce_0.8s_ease-in-out_infinite]" style={{ animationDelay: '150ms' }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-[bounce_0.8s_ease-in-out_infinite]" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-[bounce_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-[bounce_0.8s_ease-in-out_infinite]" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-[bounce_0.8s_ease-in-out_infinite]" style={{ animationDelay: '300ms' }} />
                            </div>
                        )}
                    </div>
                </div>
            )}
            <div ref={bottomRef} />
        </div>

        {showScrollBtn && (
            <button
                onClick={() => {
                    isNearBottomRef.current = true;
                    setShowScrollBtn(false);
                    scrollToBottom();
                }}
                className="sticky bottom-3 mx-auto w-11 h-11 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shadow-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors z-10 ml-auto mr-auto"
                aria-label="Scroll to bottom"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
            </button>
        )}

        {/* Hidden while selecting: this pill and the bulk action bar share the
            same `fixed` offset above the bottom nav, so both being on screen
            means one sits on top of the other. */}
        {newMessagesCount > 0 && !selectMode && (
            <button
                onClick={() => {
                    isNearBottomRef.current = true;
                    setShowScrollBtn(false);
                    setNewMessagesCount(0);
                    scrollToBottom();
                }}
                /* `bottom-24` is a flat 96px, but the fixed bottom nav is
                 * `h-16` PLUS `safe-bottom` (64px + up to 34px). With any
                 * inset of 32px or more the pill's bottom edge slid under the
                 * nav. `z-20` is also below the nav's `z-30`, so it could not
                 * simply be raised above it. */
                className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-20 rounded-full bg-blue-500 px-4 min-h-[40px] flex items-center text-xs font-semibold text-white shadow-lg hover:bg-blue-600 transition-colors"
            >
                {newMessagesCount} new message{newMessagesCount > 1 ? "s" : ""}
            </button>
        )}

        {lightboxSrc && (
            <ImageLightbox src={lightboxSrc} alt="Photo" onClose={() => setLightboxSrc(null)} />
        )}

        {forwardMsg && (
            <ForwardModal message={forwardMsg} onClose={() => setForwardMsg(null)} />
        )}

        {/* ── Bulk action bar ────────────────────────────────────────────
            `fixed`, like the new-messages pill above, and NOT inside the
            scroll column: an in-flow bar would change `scrollHeight` the
            moment selection mode opened, and a scroll-anchored container
            would then shift every bubble under the reader. Being out of flow
            is what makes "entering selection does not move the thread" true
            rather than merely intended. */}
        {selectMode && (
            <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-30 w-[min(94vw,560px)] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur shadow-2xl px-2 py-1.5 animate-fade-in">
                <div className="flex items-center gap-1 overflow-x-auto">
                    {/* React is a PICKER, not a single button: the bulk route
                        takes `value` as the reaction type, and hardwiring
                        "like" would silently apply the wrong emoji to a
                        selection the reader meant to 😭. */}
                    <div className="relative shrink-0">
                        <button
                            type="button"
                            onClick={() => setBulkReactOpen((v) => !v)}
                            disabled={!selected.length || !!bulkBusy}
                            aria-expanded={bulkReactOpen}
                            aria-label="React to selected messages"
                            className="min-h-[40px] px-3 flex items-center gap-1 rounded-full text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
                        >
                            React
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                        </button>
                        {bulkReactOpen && (
                            <>
                                <button className="fixed inset-0 z-40 cursor-default" aria-hidden="true" tabIndex={-1} onClick={() => setBulkReactOpen(false)} />
                                <div className="absolute bottom-full left-0 mb-1 z-50 flex gap-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-1.5 animate-scale-in">
                                    {MSG_REACTIONS.map((r) => (
                                        <button
                                            key={r.type}
                                            type="button"
                                            onClick={() => { setBulkReactOpen(false); runBulk("react", r.type); }}
                                            aria-label={`React with ${r.type}`}
                                            title={r.type}
                                            className="w-10 h-10 flex items-center justify-center rounded-lg text-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            {r.emoji}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <BulkBtn label="Star" busy={bulkBusy === "star"} disabled={!selected.length || !!bulkBusy} onClick={() => runBulk("star")} />
                    <BulkBtn label="Save" busy={bulkBusy === "bookmark"} disabled={!selected.length || !!bulkBusy} onClick={() => runBulk("bookmark")} />
                    <BulkBtn
                        label="Delete"
                        busy={bulkBusy === "delete"}
                        disabled={!selected.length || !!bulkBusy}
                        danger
                        onClick={() => {
                            if (confirm(`Delete ${selected.length} message${selected.length === 1 ? "" : "s"}? Only your own messages are removed.`)) runBulk("delete");
                        }}
                    />
                    <button
                        type="button"
                        onClick={exitSelect}
                        aria-label="Leave selection mode"
                        className="shrink-0 min-h-[40px] px-3 flex items-center rounded-full text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        Done
                    </button>
                </div>
                {bulkResult && (
                    <div className="mt-1.5 px-1.5 pb-1 space-y-1">
                        <p className="text-[11px] text-gray-600 dark:text-gray-300">
                            <span className="font-semibold">{bulkResult.action}</span>: {bulkResult.modified} of {bulkResult.matched} matched
                            message{bulkResult.matched === 1 ? "" : "s"} updated
                            {bulkResult.skipped > 0 ? `, ${bulkResult.skipped} skipped` : ", none skipped"}.
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                            {bulkResult.note || "skipped counts ids that were malformed or not part of your conversations."}
                        </p>
                    </div>
                )}
            </div>
        )}

        {/* ── Message info sheet ───────────────────────────────────────── */}
        {infoId && (
            <Sheet
                title="Message info"
                subtitle={infoData ? `With ${infoData.with}` : undefined}
                onClose={() => { setInfoId(null); setInfoData(null); setInfoErr(""); }}
            >
                <div className="px-4 py-3 space-y-3">
                    {infoBusy && <Spinner label="Loading message…" />}
                    <ErrorBox message={infoErr} />
                    {infoData && (
                        <>
                            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2.5">
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">Type</p>
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {KIND_LABEL[infoData.kind] || inferKind(infoData) || "Message"}
                                    {infoData.deleted ? " · deleted" : ""}
                                </p>
                            </div>
                            <div>
                                <Kv k="From" v={infoData.sender} />
                                <Kv k="To" v={infoData.recipient} />
                                <Kv k="Sent" v={infoData.timeStamp ? new Date(infoData.timeStamp).toISOString().replace("T", " ").slice(0, 19) + " UTC" : ""} mono />
                                <Kv k="Delivered" v={infoData.delivered ? "yes" : "no"} />
                                <Kv k="Read" v={infoData.isRead ? (infoData.readAt ? new Date(infoData.readAt).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "yes") : "no"} />
                                <Kv k="Read at" v={infoData.readAt ? new Date(infoData.readAt).toISOString().replace("T", " ").slice(0, 19) + " UTC" : ""} mono />
                                <Kv k="Edited" v={infoData.editedAt ? new Date(infoData.editedAt).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "never"} mono />
                                <Kv k="Deleted" v={infoData.deleted ? "yes" : "no"} />
                                <Kv k="Expires" v={infoData.expiresAt ? new Date(infoData.expiresAt).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "never"} mono />
                                <Kv k="Starred by" v={(infoData.starredBy || []).join(", ")} />
                                <Kv k="Saved by" v={(infoData.bookmarkedBy || []).join(", ")} />
                                <Kv k="Pinned" v={infoData.pinned ? "yes, for both of you" : "no"} />
                                <Kv k="Marked unread by" v={(infoData.markedUnreadBy || []).join(", ")} />
                                <Kv k="Reactions" v={Object.entries(infoData.reactions || {}).filter(([, v]) => v?.length).map(([k2, v]) => `${k2}: ${v.join(", ")}`).join(" · ")} />
                                <Kv k="Message id" v={infoData._id} mono />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => copyMessageText(infoData)}
                                    className="min-h-[44px] rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm font-medium transition-colors"
                                >
                                    Copy text
                                </button>
                                <button
                                    type="button"
                                    onClick={() => copyMessageLink(infoData)}
                                    className="min-h-[44px] rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm font-medium transition-colors"
                                >
                                    Copy link
                                </button>
                            </div>
                            <Note tone="info" title="Delivery state is the server's last word.">
                                <p>
                                    Delivery and read flags are only as fresh as the last poll of this thread, and <span className="font-mono">readAt</span> is written by
                                    the mark-read route — a message flagged unread again keeps its original <span className="font-mono">readAt</span>.
                                </p>
                            </Note>
                        </>
                    )}
                </div>
            </Sheet>
        )}

        {/* ── Saved messages ───────────────────────────────────────────── */}
        {savedOpen && (
            <Sheet
                title="Saved messages"
                subtitle="Bookmarks across every conversation. Tapping one jumps to it if it is loaded here."
                onClose={() => setSavedOpen(false)}
            >
                <div className="px-4 py-3 space-y-2">
                    <ErrorBox message={savedErr} />
                    {!savedErr && !saved && <Spinner label="Loading saved messages…" />}
                    {saved && saved.messages.length === 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">
                            Nothing saved yet. Use “Save message” on any message.
                        </p>
                    )}
                    {saved?.messages.map((m) => (
                        <button
                            key={m._id}
                            type="button"
                            onClick={() => revealMessage(m._id)}
                            className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 px-3 py-2.5 min-h-[44px] transition-colors"
                        >
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                {m.sentByMe ? `You → ${m.with}` : `${m.sender} → you`} · {new Date(m.timeStamp).toLocaleDateString()}
                            </p>
                            <p className="text-xs text-gray-800 dark:text-gray-100 mt-0.5 line-clamp-2 break-words">
                                {messageSummary(m, inferKind(m))}
                            </p>
                        </button>
                    ))}
                    {saved?.messages.length > 0 && (
                        <Note tone="info">
                            A jump only works for a message this thread has loaded. Anything older reports that it is not on the
                            page rather than appearing to do nothing.
                        </Note>
                    )}
                </div>
            </Sheet>
        )}

        {/* ── Shared media ─────────────────────────────────────────────── */}
        {mediaOpen && (
            <Sheet
                title={`Media with ${recipient}`}
                subtitle="Photos and videos shared in this conversation."
                onClose={() => setMediaOpen(false)}
            >
                <div className="px-4 py-3 space-y-2">
                    <ErrorBox message={mediaErr} />
                    {!mediaErr && !media && <Spinner label="Loading media…" />}
                    {media && media.items.length === 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">No shared media in this conversation.</p>
                    )}
                    {media && media.items.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                            {media.items.map((item, i) => (
                                <button
                                    key={`${item._id}-${i}`}
                                    type="button"
                                    onClick={() => (item.videoUrl ? setMediaOpen(false) : setLightboxSrc(item.imageUrl))}
                                    className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
                                    aria-label={item.videoUrl ? "Open video in thread" : "Open photo"}
                                >
                                    {/* Thumbnail only, and off the critical path:
                                        the sheet is a browser, not a viewer. */}
                                    {item.imageUrl ? (
                                        /* Same reason as the contact avatar: these
                                         * URLs are Cloudinary OR off-Cloudinary
                                         * (a Giphy send), so `next/image` cannot
                                         * be configured to accept them all. */
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={item.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                        <span className="w-full h-full flex items-center justify-center text-gray-400">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                                            </svg>
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </Sheet>
        )}
        </div>
    );
}
