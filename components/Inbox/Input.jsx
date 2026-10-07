"use client";

/**
 * DM composer.
 *
 * ── What this file owns ───────────────────────────────────────────────────
 * Everything the sender can put in a direct message: text, images, videos,
 * documents, voice notes, location, polls, code blocks, replies and links,
 * plus the per-conversation draft lifecycle around all of it.
 *
 * ── The one contract it must not break ────────────────────────────────────
 * `onMessageSent` is a single `setPendingMessage` call in ChatBox, and
 * `Chat.jsx:386-432` reconciles what comes back out of it:
 *
 *   • a temp bubble is matched by `_tempId`, then, once confirmed, by
 *     `_tempId` + `sender` + `text` + `imageUrl` (`Chat.jsx:403`) — so the
 *     optimistic bubble MUST carry all four with the same values the confirmed
 *     message ends up with, or the temp row is never replaced and the message
 *     appears twice;
 *   • a failure is signalled with `{ _tempId, _remove: true }`;
 *   • `_sending: false` on the confirmed message is what flips the tick.
 *
 * `Chat.jsx` is owned by another pass, so the shape below is preserved
 * deliberately rather than tidied: the new fields (`videoUrl`, `attachments`,
 * `kind`, `location`, `poll`) are sent to the API but are NOT added to the
 * optimistic bubble, because the bubble renderer does not know about them yet.
 *
 * ── Limits, and why ───────────────────────────────────────────────────────
 * `MAX_TEXT` (4000) is not arbitrary: `live-server/routes/messaging.js:706`
 * already slices a stored draft to 4000 characters, so a 4000-character
 * composer is the largest message that survives a draft round trip intact. It
 * is ~4x the group-chat cap of 1000 because a DM is one-to-one, and the draft
 * endpoint is the only place in the messaging stack that stores the text
 * verbatim.
 *
 * `MAX_QUEUE` (10) matches `attachments.slice(0, 10)` on the draft route
 * (`messaging.js:722`), so the draft is a lossless mirror of what is sent.
 * The per-kind byte caps are enforced here and re-checked by Cloudinary; see
 * `limitFor` for the reasoning on each.
 *
 * NONE of these are enforced by `POST /api/messages`. That route destructures
 * exactly seven fields off the body (`live-server/routes/messages.js:331`) and
 * 400s when there is no text, image or audio (`messages.js:336`), so a
 * video-only / file-only / poll-only / location-only message is rejected
 * outright and `videoUrl` / `attachments` / `kind` / `location` / `poll` are
 * dropped even when a text body is present. Both are server gaps; the composer
 * sends the correct payload regardless and reports the server's own error
 * message back to the user.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";
import VoiceRecorder from "@/components/shared/VoiceRecorder";
import EmojiPicker from "@/components/shared/EmojiPicker";
import GifPicker from "@/components/shared/GifPicker";
import LinkPreviewCard from "@/components/shared/LinkPreviewCard";

import { getCloudName, getUploadPreset, noteUploadedBytes } from "@/components/Feed/mediaTargetStore";
import useMediaTarget from "@/components/Feed/useMediaTarget";

// ── Limits ────────────────────────────────────────────────────────────────
const MAX_TEXT = 4000;                       // see file header
const FENCE = "```";
const FENCE_OVERHEAD = FENCE.length * 2 + 2; // two fences + two newlines
const COUNTER_AT = Math.floor(MAX_TEXT * 0.8);
const MAX_QUEUE = 10;                        // matches the draft route
// 10 MB: the cap this composer already applied to single images.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// 25 MB. An unsigned preset accepts far more, but a phone video is routinely
// 30-60 MB and a mid-upload failure on mobile data is a worse outcome than a
// clear rejection up front.
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
// 5 MB for documents. Cloudinary's free plan caps an unsigned `raw` upload at
// 10 MB, so this leaves headroom rather than betting on the limit.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const MAX_COMPOSER_PX = 160;                 // ~6 lines, then internal scroll
const DRAFT_DEBOUNCE_MS = 1200;
const UNDO_WINDOW_MS = 6000;
const RECALL_WINDOW_SECONDS = 60;            // mirrors the server's window
const UPLOAD_TIMEOUT_MS = 180000;

const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 6;
const MAX_POLL_QUESTION = 200;
const MAX_POLL_OPTION = 100;

const ENTER_MODE_KEY = "dm-enter-mode";      // "send" | "newline"
const ENTER_HINT_KEY = "dm-enter-hint-seen";
const DRAFT_CHANNEL = "dm-drafts";

const URL_RE = /https?:\/\/[^\s<>"'\u2026]+/i;
const SPOILER_RE = /\|\|([\s\S]*?)\|\|/;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)$/;
const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|avi|mkv)$/;

// ── Small helpers ─────────────────────────────────────────────────────────
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

const KIND_LABEL = { image: "Photo", video: "Video", file: "File" };

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

// Cloudinary needs the resource type in BOTH the URL and the form. `raw` is
// what a non-media document has to go through; posting a PDF to `image/upload`
// is rejected, which is exactly the failure the old single-purpose uploader
// would have hit if it had been reused as-is.
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

function uploadToCloudinary(file, { resourceType = "image", onProgress, onXhr } = {}) {
    return new Promise((resolve, reject) => {
        // Read at CALL time. These used to be module-level constants, which froze
        // the site's cloud into every DM attachment: a user who moved their media
        // to their own storage kept paying for their direct messages here.
        const cloudName = getCloudName();
        const uploadPreset = getUploadPreset();
        if (!cloudName || !uploadPreset) {
            reject(new Error("Uploads are not configured on this deployment"));
            return;
        }
        const fd = new FormData();
        fd.append("file", file, file.name || "upload");
        fd.append("upload_preset", uploadPreset);
        fd.append("folder", "anon-feed");
        fd.append("resource_type", resourceType);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`);
        xhr.timeout = UPLOAD_TIMEOUT_MS;
        xhr.onload = () => {
            onXhr?.(null);
            if (xhr.status !== 200) { reject(new Error(describeCloudinaryError(xhr))); return; }
            try {
                const result = JSON.parse(xhr.responseText);
                const url = result?.secure_url;
                if (url) {
                    noteUploadedBytes(result.bytes || file.size);
                    resolve(url);
                }
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

/**
 * `||spoiler||text||` -> alternating plain/spoiler parts, for the composer's
 * own preview. The wire format stays plain text: the tags travel verbatim and
 * the real reveal/hide rendering belongs to `components/Feed/RichText.jsx`,
 * which does not currently parse them.
 */
function parseSpoilers(str) {
    const parts = [];
    let rest = String(str || "");
    while (rest.length) {
        const m = SPOILER_RE.exec(rest);
        if (!m) { parts.push({ spoiler: false, value: rest }); break; }
        if (m.index > 0) parts.push({ spoiler: false, value: rest.slice(0, m.index) });
        parts.push({ spoiler: true, value: m[1] });
        rest = rest.slice(m.index + m[0].length);
    }
    return parts;
}

const spoilerParts = (s) => String(s || "").split(SPOILER_RE);

/** Rough pointer check, the same one EmojiPicker and GifPicker use for focus. */
function isTouchFirst() {
    if (typeof window === "undefined") return false;
    return !window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
}

// ── Cross-tab draft channel ───────────────────────────────────────────────
// Same shape as utils/activeChat.js: one lazily-created channel per document,
// every send guarded, because BroadcastChannel throws in some private-browsing
// modes and a missing channel must never take the composer down.
let draftChannel = null;
function getDraftChannel() {
    if (typeof window !== "undefined" && !draftChannel) {
        try { draftChannel = new BroadcastChannel(DRAFT_CHANNEL); } catch { /* unsupported */ }
    }
    return draftChannel;
}
function broadcastDraft(message) {
    try { getDraftChannel()?.postMessage(message); } catch { /* unsupported */ }
}

// ── Local artwork ─────────────────────────────────────────────────────────
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
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Z" />
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

export default function Input({ onMessageSent, recipient, replyingTo, setReplyingTo }) {
    const { user } = useUser();
    const { showToast } = useToast();
    // The upload helper above is module-level, so the resolved storage target is
    // published here rather than passed into it.
    useMediaTarget({ enabled: !!user?.username });

    // ── Composer content ──────────────────────────────────────────────────
    const [text, setText]           = useState("");
    const [sending, setSending]     = useState(false);
    const [queue, setQueue]         = useState([]);   // attachments, uploaded + uploading
    const [audioUrl, setAudioUrl]   = useState("");
    const [linkPreview, setLinkPreview] = useState(null);
    const [codeMode, setCodeMode]   = useState(false);
    const [location, setLocation]   = useState(null);  // { lat, lng, label }
    const [poll, setPoll]           = useState(null);  // { question, options, votes }

    // ── Pickers ───────────────────────────────────────────────────────────
    // ONE state for the whole tray. The three sibling `relative` wrappers with
    // three booleans that manually closed each other are gone: opening any
    // tool is the same transition, and exactly one popover can exist.
    const [showTray, setShowTray]   = useState(null);  // null | TRAY_ITEMS id
    const [locationMode, setLocationMode] = useState("idle"); // idle | locating | manual
    const [locationErr, setLocationErr]   = useState("");
    const [manualLoc, setManualLoc]       = useState({ lat: "", lng: "", label: "" });
    const [pollDraft, setPollDraft]       = useState({ question: "", options: ["", ""] });
    const [pollErr, setPollErr]           = useState("");

    // ── Chrome ────────────────────────────────────────────────────────────
    const [enterSends, setEnterSends] = useState(true);
    const [hintSeen, setHintSeen]     = useState(true);
    const [online, setOnline]         = useState(true);
    const [queuedCount, setQueuedCount] = useState(0);
    const [undo, setUndo]             = useState(null);   // { id, at }
    const [now, setNow]               = useState(() => Date.now());
    const [draftStatus, setDraftStatus] = useState("idle"); // idle|saving|saved|error|restored
    const [remoteDraft, setRemoteDraft] = useState(null);

    // ── Mentions / hashtags (unchanged behaviour, moved onto the textarea) ─
    const [mentionQuery, setMentionQuery]     = useState(null);
    const [mentionResults, setMentionResults] = useState([]);
    const [mentionHighlight, setMentionHighlight] = useState(0);
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionMode, setMentionMode] = useState(null); // "user" or "hashtag"
    const [hashtagResults, setHashtagResults] = useState([]);

    // ── Refs ──────────────────────────────────────────────────────────────
    const linkUrlRef      = useRef(null);
    const imageInputRef   = useRef(null);
    const anyInputRef     = useRef(null);
    const inputRef        = useRef(null);
    const typingTimeoutRef = useRef(null);
    const typingIdleRef    = useRef(null);
    const draftTimerRef    = useRef(null);
    const draftRestoredRef = useRef(false);
    const hadDraftRef      = useRef(false);
    const queueLenRef      = useRef(0);
    const composerEmptyRef = useRef(true);
    const xhrRef           = useRef({});
    const removedRef       = useRef(new Set());
    const localUrlsRef     = useRef(new Set());
    const offlineRef       = useRef([]);
    const flushRef         = useRef(() => {});
    const undoRef          = useRef(null);
    const pollQuestionRef  = useRef(null);
    const manualLatRef     = useRef(null);

    const scope = useMemo(() => String(recipient || "").toLowerCase(), [recipient]);

    // ── Derived ───────────────────────────────────────────────────────────
    const readyQueue = useMemo(() => queue.filter((i) => i.status === "ready" && i.url), [queue]);
    const firstImage = useMemo(() => readyQueue.find((i) => i.kind === "image") || null, [readyQueue]);
    const firstVideo = useMemo(() => readyQueue.find((i) => i.kind === "video") || null, [readyQueue]);
    const uploadingCount = useMemo(() => queue.filter((i) => i.status === "uploading").length, [queue]);
    const hasContent = !!(text.trim() || audioUrl || readyQueue.length || location || poll);
    const canSend = hasContent && !sending && uploadingCount === 0 && !!user && !!recipient;
    // A focused pointer opens pickers with their keyboard; a touch one must not,
    // or the software keyboard shrinks the viewport the popover is anchored to.
    const textLimit = codeMode ? Math.max(0, MAX_TEXT - FENCE_OVERHEAD) : MAX_TEXT;
    const composerEnabled = !!user && !!recipient;
    const showCounter = text.length >= COUNTER_AT;
    const showHint = !hintSeen && composerEnabled;
    const undoLeft = undo ? Math.max(0, undo.at + UNDO_WINDOW_MS - now) : 0;

    useEffect(() => { queueLenRef.current = queue.length; }, [queue]);
    useEffect(() => { undoRef.current = undo; }, [undo]);

    useEffect(() => {
        composerEmptyRef.current = !(text.trim() || audioUrl || queue.length || location || poll);
    }, [text, audioUrl, queue, location, poll]);

    // ── Typing indicator ──────────────────────────────────────────────────
    //
    // One place that talks to /api/typing.
    //
    // `typingTo: ""` used to mean "delete my row", which also deleted the
    // `recording` flag VoiceRecorder sets — so any keystroke cleared the other
    // person's "recording…" state. Updating the row instead of removing it fixes
    // that, but `recording` is now genuinely independent of `typingTo`: a
    // keystroke must NOT claim it. Sending `recording: true` here made a merely
    // typing user report as `isRecording`, and since the UI prefers
    // `isRecording`, the typing indicator never lit at all. So the key is
    // omitted unless the caller is actually VoiceRecorder, and the server
    // preserves the stored value when it is absent.
    const postTyping = useCallback((typingTo, recording) => {
        if (!user) return;
        const body = { typingTo };
        if (typeof recording === "boolean") body.recording = recording;
        fetch("/api/typing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
        }).catch(() => {});
    }, [user]);

    useEffect(() => {
        if (!user || !recipient) return;
        return () => {
            postTyping("", undefined);
        };
    }, [user, recipient, postTyping]);

    // Fires for anything the USER did — typing, an emoji, a mention insert, a
    // draft restore is deliberately excluded. A programmatic text change is not
    // typing, and a restored draft that lit the indicator would claim the other
    // person is being answered by someone who has not written a word.
    const handleTextChange = (val) => {
        setText(val);
        if (!user || !recipient) return;

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

        if (val.trim()) {
            typingTimeoutRef.current = setTimeout(() => {
                postTyping(recipient);
            }, 400);
        }

        if (val.trim()) {
            clearTimeout(typingIdleRef.current);
            typingIdleRef.current = setTimeout(() => {
                postTyping("");
            }, 3000);
        } else {
            postTyping("");
        }

        const pos = inputRef.current?.selectionStart || val.length;
        const before = val.slice(0, pos);
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

    // ── Auto-grow ─────────────────────────────────────────────────────────
    //
    // Called synchronously from onChange as well as from the effect below. The
    // effect alone measures a DOM node React has not re-rendered yet, so a
    // keystroke would paint one frame at the old height; measuring inside the
    // handler is flicker-free and the effect only has to catch the changes that
    // do not come from typing (emoji, mention insert, draft restore, toggles).
    const resizeComposer = useCallback(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        const next = Math.min(el.scrollHeight, MAX_COMPOSER_PX);
        el.style.height = `${next}px`;
        el.style.overflowY = el.scrollHeight > MAX_COMPOSER_PX ? "auto" : "hidden";
    }, []);

    useEffect(() => { resizeComposer(); }, [text, codeMode, resizeComposer]);

    // ── Mention / hashtag lookups (unchanged) ─────────────────────────────
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
                        setMentionResults(Array.isArray(data.users) ? data.users : []);
                    }
                }
            } catch { /* silent — includes the AbortError of a superseded keystroke */ }
        }, 200);
        return () => { clearTimeout(t); controller.abort(); };
    }, [mentionQuery, mentionMode]);

    useEffect(() => { setMentionHighlight(0); }, [mentionResults, hashtagResults, mentionMode]);

    // Debounced link preview fetch while typing. Suppressed in code mode: a URL
    // inside a fenced block is source, not a thing to unfurl.
    useEffect(() => {
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
                } catch {}
            })();
        }, 600);
        return () => clearTimeout(t);
    }, [text, codeMode]);

    // ── Attachment queue ──────────────────────────────────────────────────
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
        if (rejected.length) showToast(rejected.slice(0, 2).join(" \u00b7 "), "error");
        if (!accepted.length) return;
        setQueue((prev) => [...prev, ...accepted]);
        for (const item of accepted) startUpload(item);
    }, [startUpload, showToast]);

    /** A file that already has a URL (GIF picker, restored draft). */
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

    // ── Draft payload ─────────────────────────────────────────────────────
    //
    // `attachments` carries the COMPLETE manifest, including the item that also
    // appears in the `imageUrl` / `videoUrl` scalars. That is deliberate: the
    // scalars exist for the bubble and the sender's own inline preview, while
    // `attachments` is what makes the draft lossless, so a multi-file message
    // survives a reload intact rather than collapsing to its first photo.
    const draftPayload = useCallback(() => ({
        // A code block is persisted already fenced, so a restored draft can
        // detect it and come back in code mode. `ChatDraft` has no `kind` field
        // and adding one is a server change.
        text: codeMode ? fence(text) : text,
        imageUrl: firstImage?.url || "",
        audioUrl,
        videoUrl: firstVideo?.url || "",
        attachments: readyQueue.map(toAttachment),
        replyTo: replyingTo ? { sender: replyingTo.sender, text: replyingTo.text } : null,
    }), [codeMode, text, firstImage, audioUrl, firstVideo, readyQueue, replyingTo]);

    const applyDraft = useCallback((d) => {
        if (!d) return;
        if (typeof d.text === "string" && d.text) {
            const raw = unfence(d.text);
            if (raw !== null) { setCodeMode(true); setText(raw); }
            else setText(d.text);
        }
        setAudioUrl(d.audioUrl || "");
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

    // Load this conversation's draft once, on mount. `Input` is keyed by
    // recipient in ChatBox, so a remount IS a conversation switch.
    useEffect(() => {
        if (!recipient) return;
        let cancelled = false;
        draftRestoredRef.current = false;
        hadDraftRef.current = false;

        (async () => {
            try {
                const res = await fetch(`/api/messaging/drafts/${encodeURIComponent(scope)}`, { credentials: "include" });
                if (cancelled) return;
                if (res.ok) {
                    const data = await res.json().catch(() => null);
                    if (cancelled) return;
                    const d = data?.draft;
                    const has = d && (d.text || d.audioUrl || d.imageUrl || d.videoUrl || (d.attachments && d.attachments.length) || d.replyTo?.sender);
                    if (has) {
                        hadDraftRef.current = true;
                        applyDraft(d);
                        if (d.replyTo?.sender) {
                            // ChatBox nulls `replyingTo` in its own
                            // `[recipient]` effect, and a child's effects run
                            // BEFORE the parent's — so applying it here would be
                            // wiped a moment later. A microtask lands after the
                            // whole commit, so the restore is the value that
                            // survives. (Same idiom as Chat.jsx:598.)
                            queueMicrotask(() => {
                                if (!cancelled) setReplyingTo({ sender: d.replyTo.sender, text: d.replyTo.text || "" });
                            });
                        }
                        setDraftStatus("restored");
                    }
                }
            } catch { /* offline or no draft: composing still works */ }
            if (!cancelled) draftRestoredRef.current = true;
        })();

        return () => { cancelled = true; };
    }, [recipient, scope, applyDraft, setReplyingTo]);

    // Debounced write on every change. Empty composers are only written when
    // there is something stored to clear, so opening a chat does not fire a
    // pointless DELETE.
    useEffect(() => {
        if (!recipient || !draftRestoredRef.current) return;
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        draftTimerRef.current = setTimeout(() => {
            const payload = draftPayload();
            const empty = !payload.text.trim() && !payload.imageUrl && !payload.audioUrl && !payload.videoUrl && payload.attachments.length === 0;
            if (empty && !hadDraftRef.current) return;
            hadDraftRef.current = true;
            setDraftStatus("saving");
            // Broadcast on the same debounce as the write: the other tab then
            // only ever sees settled state, which is the whole point — two tabs
            // on one thread must not interleave keystroke by keystroke.
            broadcastDraft({ type: "draft", scope, payload });
            (async () => {
                try {
                    const res = await fetch(`/api/messaging/drafts/${encodeURIComponent(scope)}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(payload),
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    setDraftStatus("saved");
                } catch (err) {
                    setDraftStatus("error");
                }
            })();
        }, DRAFT_DEBOUNCE_MS);
        return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
    }, [draftPayload, recipient, scope]);

    const clearDraft = useCallback(async () => {
        if (draftTimerRef.current) { clearTimeout(draftTimerRef.current); draftTimerRef.current = null; }
        hadDraftRef.current = false;
        setDraftStatus("idle");
        broadcastDraft({ type: "clear", scope });
        try {
            await fetch(`/api/messaging/drafts/${encodeURIComponent(scope)}`, { method: "DELETE", credentials: "include" });
        } catch { /* best effort: the stale draft is overwritten on next open */ }
    }, [scope]);

    // Cross-tab: adopt another tab's settled draft, but never mid-keystroke.
    // Applying it unconditionally is the fight this is meant to end, so when
    // this tab already has something in the composer the update is offered
    // instead of forced.
    useEffect(() => {
        const channel = getDraftChannel();
        if (!channel) return;
        const onMessage = (event) => {
            const data = event.data;
            if (!data || data.scope !== scope) return;
            if (data.type === "clear") {
                if (!composerEmptyRef.current) return;
                setQueue([]);
                setAudioUrl("");
                setText("");
                setCodeMode(false);
                return;
            }
            if (data.type !== "draft" || !data.payload) return;
            if (composerEmptyRef.current) applyDraft(data.payload);
            else setRemoteDraft(data.payload);
        };
        channel.addEventListener("message", onMessage);
        return () => channel.removeEventListener("message", onMessage);
    }, [scope, applyDraft]);

    const acceptRemoteDraft = () => {
        if (remoteDraft) applyDraft(remoteDraft);
        setRemoteDraft(null);
    };

    // ── Composer snapshot / restore ───────────────────────────────────────
    //
    // One object, three consumers: the wire payload, the optimistic bubble and
    // the failure restore. Taking it in one place is what keeps the rollback
    // honest — the old code restored text/image/audio by hand and quietly lost
    // the link preview.
    const snapshotComposer = () => {
        const rawText = text;
        const fenced = codeMode ? fence(rawText) : rawText;
        return {
            text: fenced.slice(0, MAX_TEXT).trim(),
            imageUrl: firstImage?.url || "",
            audioUrl,
            videoUrl: firstVideo?.url || "",
            attachments: readyQueue.map(toAttachment),
            link: linkPreview,
            reply: replyingTo ? { sender: replyingTo.sender, text: replyingTo.text } : null,
            location,
            poll,
            kind: resolveKind({ codeMode, location, poll, hasVideo: !!firstVideo, hasImage: !!firstImage, audioUrl, attachmentCount: readyQueue.length }),
            composer: { rawText, audioUrl, queue: readyQueue, location, poll, codeMode, reply: replyingTo, link: linkPreview },
        };
    };

    const restoreComposer = useCallback((snap) => {
        if (!snap?.composer) return;
        const c = snap.composer;
        setText(c.rawText);
        setAudioUrl(c.audioUrl);
        setQueue(c.queue);
        setLocation(c.location);
        setPoll(c.poll);
        setCodeMode(c.codeMode);
        setLinkPreview(c.link);
        // Only resets the de-dupe guard so the preview effect refetches — it does
        // not put the chip back. Without restoring the state, a fast retry (or
        // any edit that does not change the URL) went out with the preview
        // silently dropped.
        linkUrlRef.current = null;
        if (c.reply) setReplyingTo({ sender: c.reply.sender, text: c.reply.text });
    }, [setReplyingTo]);

    const clearComposer = () => {
        setText("");
        setAudioUrl("");
        setQueue([]);
        setLocation(null);
        setPoll(null);
        setCodeMode(false);
        setLinkPreview(null);
        linkUrlRef.current = null;
        setReplyingTo(null);
        setRemoteDraft(null);
    };

    // ── Connection awareness ──────────────────────────────────────────────
    const flushOfflineQueue = useCallback(async () => {
        const pending = offlineRef.current;
        if (!pending.length) return;
        for (const item of pending) {
            const result = await sendPayload(item.payload);
            if (result.ok) {
                onMessageSent?.({ ...result.msg, _sending: false });
                if (result.msg?._id) setUndo({ id: result.msg._id, at: Date.now() });
            } else if (result.queued) {
                offlineRef.current.push(item);
            } else {
                // It is not coming back, so the composer has to give it back to
                // the user rather than losing the text silently.
                restoreComposer(item.snap);
                onMessageSent?.({ _tempId: item.tempId, _remove: true });
                showToast(result.error || "Queued message could not be sent", "error");
            }
        }
        setQueuedCount(offlineRef.current.length);
    }, [onMessageSent, showToast, restoreComposer]);

    useEffect(() => { flushRef.current = flushOfflineQueue; });

    useEffect(() => {
        const goOnline = () => { setOnline(true); flushRef.current(); };
        const goOffline = () => { setOnline(false); };
        const raf = window.requestAnimationFrame(() => setOnline(navigator.onLine !== false));
        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, []);

    // ── Persisted Enter mode ──────────────────────────────────────────────
    useEffect(() => {
        // Read after mount, in a microtask: localStorage does not exist during
        // SSR, and a lazy initialiser would produce different server and
        // client markup on the very first paint.
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

    // ── Undo ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!undo) return;
        const id = setInterval(() => setNow(Date.now()), 200);
        return () => clearInterval(id);
    }, [undo]);

    useEffect(() => {
        if (!undo) return;
        const id = setTimeout(() => setUndo(null), Math.max(0, undo.at + UNDO_WINDOW_MS - Date.now()));
        return () => clearTimeout(id);
    }, [undo]);

    const doUndo = async () => {
        const target = undoRef.current;
        setUndo(null);
        if (!target?.id) return;
        try {
            const res = await fetch(`/api/messages/${encodeURIComponent(target.id)}?recall=1`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
            });
            if (res.ok) {
                // Chat.jsx owns the list; its 8s poll brings the tombstone in.
                showToast("Message unsent", "success");
                return;
            }
            const data = await res.json().catch(() => null);
            if (res.status === 400 && Number.isFinite(data?.ageSeconds)) {
                // The 60s window closed. Nothing left to do but say so and stop
                // offering the button.
                showToast(
                    `Too late to unsend \u2014 the ${data.windowSeconds || RECALL_WINDOW_SECONDS}s window closed ${Math.round(data.ageSeconds)}s ago. The message stays sent.`,
                    "error"
                );
                return;
            }
            showToast(data?.error || "Could not unsend the message", "error");
        } catch {
            showToast("Could not unsend the message", "error");
        }
    };

    const handleSend = async () => {
        if (!canSend) return;

        const snap = snapshotComposer();
        clearComposer();
        setSending(true);

        postTyping("");
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

        const tempId = `temp_${Date.now()}_${Math.random()}`;

        const payload = {
            text: snap.text,
            imageUrl: snap.imageUrl,
            audioUrl: snap.audioUrl,
            videoUrl: snap.videoUrl,
            sender: user.username,
            recipient,
            color: user.color,
            replyTo: snap.reply,
            linkPreview: snap.link,
            attachments: snap.attachments,
            kind: snap.kind,
        };
        if (snap.location) payload.location = snap.location;
        if (snap.poll) payload.poll = snap.poll;

        // The optimistic bubble. Shape is fixed by Chat.jsx:386-432 — see the
        // header. The new fields are deliberately absent: the bubble renderer
        // does not read them, and adding them would not make the temp row match
        // any better.
        onMessageSent?.({
            _tempId: tempId,
            text: snap.text,
            imageUrl: snap.imageUrl || "",
            audioUrl: snap.audioUrl || "",
            sender: user.username,
            recipient,
            color: user.color,
            replyTo: snap.reply,
            linkPreview: snap.link,
            timeStamp: new Date().toISOString(),
            isRead: false,
            delivered: false,
            _sending: true,
        });

        const result = await sendPayload(payload);
        setSending(false);

        if (result.ok) {
            onMessageSent?.({ ...result.msg, _sending: false });
            if (result.msg._id) setUndo({ id: result.msg._id, at: Date.now() });
            clearDraft();
            dismissHint();
        } else if (result.queued) {
            offlineRef.current = [...offlineRef.current, { payload, snap, tempId }];
            setQueuedCount(offlineRef.current.length);
            showToast("You are offline \u2014 this will send when you reconnect", "info");
        } else {
            restoreComposer(snap);
            onMessageSent?.({ _tempId: tempId, _remove: true });
            showToast(result.error, "error");
        }
    };

    // ── Keyboard ──────────────────────────────────────────────────────────
    const insertAtCaret = (snippet) => {
        const el = inputRef.current;
        const start = el?.selectionStart ?? text.length;
        const end = el?.selectionEnd ?? start;
        const next = (text.slice(0, start) + snippet + text.slice(end)).slice(0, textLimit);
        handleTextChange(next);
        const pos = Math.min(next.length, start + snippet.length);
        requestAnimationFrame(() => {
            if (!el) return;
            el.focus();
            el.setSelectionRange(pos, pos);
            resizeComposer();
        });
    };

    const insertMention = (username) => {
        const pos = inputRef.current?.selectionStart ?? text.length;
        const before = text.slice(0, pos);
        const after = text.slice(pos);
        const atIdx = before.lastIndexOf("@");
        const newText = before.slice(0, atIdx) + `@${username} ` + after;
        setShowMentionDropdown(false);
        setMentionQuery(null);
        setMentionMode(null);
        handleTextChange(newText);
        setTimeout(() => {
            const newPos = atIdx + username.length + 2;
            inputRef.current?.setSelectionRange(newPos, newPos);
            inputRef.current?.focus();
        }, 0);
    };

    const insertHashtag = (tag) => {
        // Coerce once, and refuse to touch the input if nothing usable came
        // through. The callers are not uniform — the dropdown passes
        // `item.tag` from an object, the keyboard path can hand over a stale
        // `undefined` — so `tag.replace` could throw on a non-string (killing
        // the keypress) and `` `#${cleanTag}` `` on a raw object would paste a
        // literal "[object Object]" into a message the user is about to send.
        const raw = typeof tag === "string" ? tag : tag?.tag;
        if (typeof raw !== "string") return;
        const cleanTag = raw.replace(/^#/, "").trim();
        if (!cleanTag) return;
        const pos = inputRef.current?.selectionStart ?? text.length;
        const before = text.slice(0, pos);
        const after = text.slice(pos);
        const hashIdx = before.lastIndexOf("#");
        const newText = before.slice(0, hashIdx) + `#${cleanTag} ` + after;
        setShowMentionDropdown(false);
        setMentionQuery(null);
        setMentionMode(null);
        handleTextChange(newText);
        setTimeout(() => {
            const newPos = hashIdx + cleanTag.length + 2;
            inputRef.current?.setSelectionRange(newPos, newPos);
            inputRef.current?.focus();
        }, 0);
    };

    const handleKeyDown = (e) => {
        const items = mentionMode === "hashtag" ? hashtagResults : mentionResults;
        if (showMentionDropdown && items.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionHighlight((h) => (h + 1) % items.length);
                return;
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionHighlight((h) => (h - 1 + items.length) % items.length);
                return;
            } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                if (mentionMode === "hashtag") {
                    // The item can be an object (`{ tag, count }`) or a bare
                    // string depending on the endpoint; insertHashtag normalises
                    // it and no-ops on anything else.
                    const hit = items[mentionHighlight];
                    insertHashtag(hit?.tag ?? hit);
                } else {
                    insertMention(items[mentionHighlight].username);
                }
                return;
            } else if (e.key === "Escape") {
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

    // ── Tools ─────────────────────────────────────────────────────────────
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

    const setPollOption = (index, value) => {
        setPollDraft((prev) => {
            const options = prev.options.slice();
            options[index] = value;
            return { ...prev, options };
        });
    };

    const addPollOption = () => {
        setPollDraft((prev) => (prev.options.length >= MAX_POLL_OPTIONS ? prev : { ...prev, options: [...prev.options, ""] }));
    };

    const removePollOption = (index) => {
        setPollDraft((prev) => (prev.options.length <= MIN_POLL_OPTIONS ? prev : { ...prev, options: prev.options.filter((_, i) => i !== index) }));
    };

    const createPoll = () => {
        const question = pollDraft.question.trim().slice(0, MAX_POLL_QUESTION);
        const options = pollDraft.options.map((o) => o.trim().slice(0, MAX_POLL_OPTION)).filter(Boolean);
        if (!question) { setPollErr("Give the poll a question"); return; }
        if (options.length < MIN_POLL_OPTIONS) { setPollErr(`A poll needs at least ${MIN_POLL_OPTIONS} options`); return; }
        setPoll({ question, options: options.map((t) => ({ text: t, votes: [] })), votes: [] });
        setPollDraft({ question: "", options: ["", ""] });
        setPollErr("");
        setShowTray(null);
    };

    // Only a fine pointer gets the keyboard. On touch, focusing a field inside
    // an `absolute bottom-full` popover raises the software keyboard, which
    // shrinks the visual viewport the popover is anchored to and cuts off its
    // first row.
    useEffect(() => {
        if (isTouchFirst()) return;
        if (showTray === "poll") pollQuestionRef.current?.focus();
        if (showTray === "location" && locationMode === "manual") manualLatRef.current?.focus();
    }, [showTray, locationMode]);

    // Escape closes the tray. The emoji and GIF panels have their own listener,
    // but the tool panels (photo / file / location / poll / code) had no way
    // out except picking something else.
    useEffect(() => {
        if (!showTray) return;
        const onKey = (e) => { if (e.key === "Escape") setShowTray(null); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [showTray]);

    // ── Render ────────────────────────────────────────────────────────────
    const trayVisible = !!showTray && !showMentionDropdown;
    const barePanel = showTray === "gif" || showTray === "emoji";

    return (
        <div className="flex flex-col gap-2 w-full max-w-full">
            {/* Offline / queued */}
            {(!online || queuedCount > 0) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <p className="flex-1 min-w-0 text-xs">
                        {!online
                            ? "Offline \u2014 messages will send when you reconnect"
                            : `${queuedCount} message${queuedCount === 1 ? "" : "s"} waiting to send`}
                    </p>
                </div>
            )}

            {/* Undo send */}
            {undo && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <p className="flex-1 min-w-0 text-xs text-gray-600 dark:text-gray-300 truncate">
                        Message sent \u2014 {Math.ceil(undoLeft / 1000)}s to change your mind
                    </p>
                    <button
                        onClick={doUndo}
                        className="shrink-0 min-h-[40px] px-3 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 transition-colors touch-manipulation"
                        aria-label="Undo send"
                    >
                        Undo
                    </button>
                </div>
            )}

            {/* Another tab changed this conversation's draft */}
            {remoteDraft && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="flex-1 min-w-0 text-xs text-blue-800 dark:text-blue-200 truncate">
                        Draft changed in another tab
                    </p>
                    <button
                        onClick={acceptRemoteDraft}
                        className="shrink-0 min-h-[40px] px-3 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-800 transition-colors touch-manipulation"
                        aria-label="Load draft from other tab"
                    >
                        Load
                    </button>
                    <button
                        onClick={() => setRemoteDraft(null)}
                        aria-label="Keep this draft"
                        className="shrink-0 w-10 h-10 -my-1 flex items-center justify-center text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors rounded-lg touch-manipulation"
                    >
                        <XIcon />
                    </button>
                </div>
            )}

            {/* Attachment queue. The single image preview that used to live here
                became this row: every attachment is a chip with its own remove
                button, progress bar and error, so "remove the second file" is
                possible at all. */}
            {queue.length > 0 && (
                /* A single scrolling strip, not a wrapping grid. Each chip is
                   44px tall, so `flex-wrap` made the composer's height a function
                   of the attachment count — ten files was four rows, ~200px, all
                   of it inside a `shrink-0` composer in a fixed-height column, and
                   that is what shoved the send button off the bottom of a phone.
                   `nowrap` + `overflow-x-auto` pins it to one row at any count and
                   the chips scroll sideways instead; each is `shrink-0` so it
                   keeps its intrinsic width rather than being squashed. */
                <div className="flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain scrollbar-hide pb-0.5">
                    {queue.map((item) => (
                        <div
                            key={item.id}
                            className="relative shrink-0 flex items-center gap-2 pl-1.5 py-1 pr-1 min-h-[44px] bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-[190px] sm:w-[220px]"
                        >
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                                {(() => {
                                    const src = item.localUrl || (item.kind === "image" && item.url ? item.url : "");
                                    if (!src) return <KindIcon kind={item.kind} />;
                                    // Background-image rather than <img>: this is
                                    // an arbitrary user-supplied URL, and the
                                    // next/image pipeline is neither needed nor
                                    // configured for a chat thumbnail.
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
                                    {item.status === "uploading" && `Uploading \u2026 ${item.progress}%`}
                                    {item.status === "error" && (item.error || "Upload failed")}
                                    {item.status === "ready" && `${item.size ? `${formatBytes(item.size)} \u00b7 ` : ""}${KIND_LABEL[item.kind]}`}
                                </span>
                            </div>
                            {item.status === "uploading" && (
                                <div className="absolute left-1.5 right-11 bottom-1 h-0.5 bg-gray-300 dark:bg-gray-600 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.max(3, item.progress)}%` }} />
                                </div>
                            )}
                            {/* 40px target, 14px glyph. */}
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

            {/* Voice note. Shown whenever `audioUrl` is set — *not* gated on
                there being an image. The send snapshots audio and media
                independently and sends both, so hiding the chip the moment a
                photo was attached left a recorded voice note with no way to
                clear it: it went out attached to the photo no matter what the
                user did. */}
            {audioUrl && (
                <div className="relative inline-flex self-start max-w-full">
                    <div className="pl-4 pr-11 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-2">
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
                        <span className="bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-700 transition-colors shadow">
                            &#x2715;
                        </span>
                    </button>
                </div>
            )}

            {/* Location */}
            {location && (
                <div className="relative inline-flex self-start max-w-full">
                    <div className="pl-4 pr-11 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-2">
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
                        <span className="bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-700 transition-colors shadow">
                            &#x2715;
                        </span>
                    </button>
                </div>
            )}

            {/* Poll. Read-only here on purpose: voting is the recipient's
                screen, and the composer only has to show what is about to go
                out. `PollCard` needs `poll.enabled` plus a `post._id`, neither
                of which exists on a DM, so it cannot be reused here. */}
            {poll && (
                <div className="relative inline-flex self-start max-w-full">
                    <div className="pl-4 pr-11 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-start gap-2 min-w-0">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-purple-500 shrink-0 mt-0.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h10.5m-10.5 5.25h16.5" />
                        </svg>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{poll.question}</p>
                            <ul className="mt-0.5 space-y-0.5">
                                {poll.options.map((o, i) => (
                                    <li key={i} className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                        {o.votes.length ? `${o.votes.length} \u00b7 ` : ""}{o.text}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <button
                        onClick={() => setPoll(null)}
                        className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center"
                        aria-label="Remove poll"
                    >
                        <span className="bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-700 transition-colors shadow">
                            &#x2715;
                        </span>
                    </button>
                </div>
            )}

            {/* Code block toggle */}
            {codeMode && (
                <div className="inline-flex self-start items-center gap-2 pl-3 pr-1 py-1 min-h-[40px] bg-gray-900 text-gray-100 rounded-xl border border-gray-700">
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

            {/* Reply preview */}
            {replyingTo && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl border-l-3 border-blue-500">
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-blue-500 dark:text-blue-400 font-semibold">Replying to {replyingTo.sender}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{replyingTo.text}</p>
                    </div>
                    <button onClick={() => setReplyingTo(null)} aria-label="Cancel reply"
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center justify-center w-11 h-11 -mr-2 shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Link preview */}
            {linkPreview && (
                <div className="relative self-start w-full max-w-xs sm:max-w-sm">
                    <LinkPreviewCard preview={linkPreview} />
                    <button
                        onClick={() => { setLinkPreview(null); linkUrlRef.current = null; }}
                        className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center"
                        aria-label="Remove link preview"
                    >
                        <span className="bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-700 transition-colors shadow">
                            &#x2715;
                        </span>
                    </button>
                </div>
            )}

            {/* Spoiler / code preview. The `||spoiler||text||` tags travel as
                plain text; only this preview interprets them, and it is local
                state that is never sent. */}
            {text && (codeMode || SPOILER_RE.test(text)) && (
                <div className="self-start w-full px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                    {codeMode
                        ? <pre className="font-mono text-xs"><code>{text}</code></pre>
                        : parseSpoilers(text).map((part, i) =>
                            part.spoiler ? (
                                <span
                                    key={i}
                                    className="px-1 py-0.5 rounded bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                    title="Spoiler \u2014 wraps the text in || as you send it"
                                >
                                    {part.value}
                                </span>
                            ) : <span key={i}>{part.value}</span>
                        )}
                </div>
            )}

            {/* Enter-mode hint, first use only */}
            {showHint && (
                <div className="flex items-center gap-2 pl-1 -mt-1">
                    <p className="flex-1 min-w-0 text-[11px] text-gray-500 dark:text-gray-400">
                        {enterSends ? "Enter sends \u00b7 Shift+Enter adds a new line" : "Enter adds a new line \u00b7 Ctrl/\u2318+Enter sends"}
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

            {/* Input row */}
            <div className="relative flex items-end gap-1.5 sm:gap-2 w-full max-w-full">
                {/* The one tray launcher. Replaces three sibling popovers, each
                    of which used to own a boolean and hand-close the others. */}
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

                {/* Emoji shortcut. Same state as the tray, so opening it closes
                    whatever else was open without a chain of setters. */}
                <button
                    onClick={() => setShowTray(showTray === "emoji" ? null : "emoji")}
                    disabled={!composerEnabled}
                    aria-label="Add emoji"
                    aria-expanded={showTray === "emoji"}
                    className={`shrink-0 w-11 h-11 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 touch-manipulation ${showTray === "emoji" ? "text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20" : "text-gray-500 dark:text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                        <circle cx="12" cy="12" r="10" />
                        <path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2" />
                        <line x1="9" y1="9" x2="9.01" y2="9" strokeLinecap="round" />
                        <line x1="15" y1="9" x2="15.01" y2="9" strokeLinecap="round" />
                    </svg>
                </button>

                {/* Text input */}
                <div className="flex-1 min-w-0 flex items-end bg-gray-100 dark:bg-gray-800 rounded-2xl px-3 sm:px-4 py-1.5 focus-within:ring-1 focus-within:ring-gray-300 dark:focus-within:ring-gray-600 transition-shadow relative">
                    <textarea
                        ref={inputRef}
                        rows={1}
                        value={text}
                        onChange={(e) => { handleTextChange(e.target.value); resizeComposer(); }}
                        onKeyDown={handleKeyDown}
                        placeholder={recipient ? "Message\u2026" : "Select a conversation\u2026"}
                        disabled={!composerEnabled}
                        maxLength={textLimit}
                        aria-label="Message"
                        // `resize-none` because the height is driven from
                        // script; leaving the native handle on would let a drag
                        // fight the auto-grow on every keystroke.
                        // 16px on touch: 14px made iOS zoom the page on focus,
                        // and the layout viewport meta in app/layout.js leaves no
                        // way to zoom back out.
                        className="flex-1 min-w-0 bg-transparent text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none disabled:cursor-not-allowed resize-none leading-6 py-1.5 sm:py-2"
                    />
                    {showMentionDropdown && mentionMode === "user" && mentionResults.length > 0 && (
                        <div className="absolute bottom-full mb-2 left-0 right-0 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto z-40">
                            {mentionResults.map((u, i) => (
                                <button
                                    key={u._id || u.username}
                                    type="button"
                                    // `onPointerDown`, not `onMouseDown`: on touch the
                                    // mouse event is synthesised AFTER `touchend`, so a
                                    // scroll gesture that started on a row both scrolled
                                    // the list and inserted the mention. Pointer events
                                    // cover mouse, touch and pen in one path, and firing
                                    // before the gesture resolves is what makes
                                    // `preventDefault()` able to stop the input losing
                                    // focus. `touch-manipulation` drops the 300ms
                                    // double-tap delay.
                                    onPointerDown={(e) => { e.preventDefault(); insertMention(u.username); }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors touch-manipulation ${i === mentionHighlight ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                                >
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: u.avatarColor }}>
                                        {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" /> : u.username?.[0]?.toUpperCase()}
                                    </div>
                                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{u.username}</span>
                                </button>
                            ))}
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
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors touch-manipulation ${i === mentionHighlight ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                                    >
                                        <span className="text-blue-500 font-medium text-xs">#</span>
                                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{tagName}</span>
                                        {tagCount != null && <span className="ml-auto text-[10px] text-gray-400">{tagCount.toLocaleString()}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Send / Mic button */}
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
                    <VoiceRecorder
                        onRecorded={(url) => setAudioUrl(url)}
                        maxDuration={60}
                        recipient={recipient}
                        username={user?.username}
                    />
                )}

                {/* ── The one popover ──────────────────────────────────────
                    One container, one rail, one panel. The previous three
                    sibling `relative` wrappers could not be open together but
                    had no way to know that, so each button closed the other two
                    by hand and any new tool would have needed a fourth boolean
                    and a third pair of setters. */}
                {trayVisible && (
                    /* Width differs for the bare panels (emoji/GIF): those mount a
                       picker that is 340px wide, and inside a 360px container minus
                       the 48px rail only 312px was left for it, so ~28px was
                       clipped by the container's `overflow-hidden` — the emoji grid
                       lost its right-hand column. Sizing the container to fit the
                       rail + picker resolves it without touching the pickers.

                       The rail is `overflow-y-auto` because there are seven items at
                       40px each (~300px) and `max-h` is a dvh fraction: on a
                       landscape phone, or with the keyboard open, 62dvh can fall
                       below 300px and the bottom rail buttons used to be cut off with
                       no way to scroll to them. */
                    <div
                        className={`absolute bottom-full left-0 mb-2 z-50 flex items-stretch overflow-hidden max-h-[min(62dvh,400px)] ${
                            barePanel
                                ? "w-[min(400px,calc(100vw-2rem))]"
                                : `w-[min(360px,calc(100vw-2rem))] ${PANEL_CHROME} rounded-2xl`
                        }`}
                    >
                        <div className="shrink-0 w-12 flex flex-col items-center gap-0.5 p-1 overflow-y-auto border-r border-gray-100 dark:border-gray-800">
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
                                        Up to {MAX_QUEUE} attachments per message, {formatBytes(MAX_IMAGE_BYTES)} per photo. The first one rides along in the message body; the rest are listed as attachments.
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
                                        Anything that is not a photo. {formatBytes(MAX_FILE_BYTES)} per document, {formatBytes(MAX_VIDEO_BYTES)} per video. Sent as a named attachment with its size.
                                    </p>
                                    <button onClick={() => anyInputRef.current?.click()} className={panelButton}>
                                        Choose files
                                    </button>
                                </div>
                            )}

                            {showTray === "gif" && (
                                <GifPicker
                                    onSelect={(url) => {
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
                                                {locationMode === "locating" ? "Finding you\u2026" : "Use my current location"}
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
                                                onChange={(e) => setPollOption(i, e.target.value.slice(0, MAX_POLL_OPTION))}
                                                placeholder={`Option ${i + 1}`}
                                                maxLength={MAX_POLL_OPTION}
                                                aria-label={`Poll option ${i + 1}`}
                                                className={panelInput}
                                            />
                                            <button
                                                onClick={() => removePollOption(i)}
                                                disabled={pollDraft.options.length <= MIN_POLL_OPTIONS}
                                                aria-label={`Remove option ${i + 1}`}
                                                className="shrink-0 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 rounded-lg transition-colors touch-manipulation"
                                            >
                                                <XIcon />
                                            </button>
                                        </div>
                                    ))}
                                    {pollDraft.options.length < MAX_POLL_OPTIONS && (
                                        <button onClick={addPollOption} className="text-xs font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 min-h-[40px] px-1">
                                            + Add option
                                        </button>
                                    )}
                                    {pollErr && <p className="text-xs text-red-500 dark:text-red-400">{pollErr}</p>}
                                    <button onClick={createPoll} className={panelButton}>Create poll</button>
                                </div>
                            )}

                            {showTray === "code" && (
                                <div className="space-y-3">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Code block</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Wraps what you type in a fenced block and sends it as <span className="font-mono">kind: &quot;code&quot;</span>. No highlighting \u2014 nothing in this app can render it yet.
                                    </p>
                                    <button
                                        onClick={() => { setCodeMode((v) => !v); setShowTray(null); }}
                                        className={panelButton}
                                    >
                                        {codeMode ? "Turn off code block" : "Turn on code block"}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer: draft state, character counter, Enter-mode toggle */}
            <div className="flex items-center justify-between gap-2 -mt-1 min-h-[40px]">
                <p className={`flex-1 min-w-0 truncate text-[11px] ${
                    draftStatus === "error" ? "text-red-500 dark:text-red-400" : "text-gray-400 dark:text-gray-500"
                }`}>
                    {draftStatus === "restored" && "Draft restored"}
                    {draftStatus === "saving" && "Saving draft\u2026"}
                    {draftStatus === "saved" && "Draft saved"}
                    {draftStatus === "error" && "Draft not saved \u2014 it will not survive a reload"}
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
                        title={enterSends ? "Enter sends \u00b7 click for Enter = new line" : "Enter = new line \u00b7 click for Enter sends"}
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
                        {!enterSends && <span className="text-[11px] font-bold leading-none">\u21e7</span>}
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * POST /api/messages, with the three outcomes the composer has to tell apart:
 * sent, "we are offline, hold it", and "the server said no".
 *
 * Module scope: it reads nothing from the component, and the offline flush path
 * needs to reach it from an event listener without re-subscribing on every
 * render.
 */
async function sendPayload(payload) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { queued: true };
    let res;
    try {
        res = await fetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
        });
    } catch {
        // A fetch rejection is the classic offline case; anything else is a real
        // network failure and must not be retried silently forever.
        if (typeof navigator !== "undefined" && navigator.onLine === false) return { queued: true };
        return { error: "Network error \u2014 the message was not sent" };
    }
    if (res.ok) {
        const msg = await res.json().catch(() => null);
        if (msg?._id) return { ok: true, msg };
        return { error: "The server accepted the message but did not return it" };
    }
    const data = await res.json().catch(() => null);
    return { error: data?.error || `Send failed (HTTP ${res.status})`, status: res.status };
}

/** Mirrors the `kind` enum on models/messages.js:57. Only declared values. */
function resolveKind({ codeMode, location, poll, hasVideo, hasImage, audioUrl, attachmentCount }) {
    if (codeMode) return "code";
    if (location) return "location";
    if (poll) return "poll";
    if (hasVideo) return "video";
    if (hasImage) return "image";
    if (audioUrl) return "audio";
    if (attachmentCount > 0) return "file";
    return "text";
}
