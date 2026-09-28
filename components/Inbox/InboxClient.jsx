"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter, useSearchParams } from "next/navigation";
import ChatBox from "./ChatBox";
import GroupChatBox from "./GroupChatBox";
import CreateGroup from "./CreateGroup";
import InviteSheet from "@/components/Qr/InviteSheet";
import { useSidebar } from "@/context/SidebarContext";
import { useToast } from "@/context/ToastContext";
import UserBadges from "@/components/shared/UserBadges";
import { setActiveChat } from "@/utils/activeChat";
import { timeAgo } from "@/utils/timeAgo";
import { ConversationSkeleton } from "@/components/shared/Skeleton";

/* ────────────────────────────────────────────────────────────────────────────
 * Per-conversation state lives on the User document (models/user.js), NOT on a
 * Conversation collection, and the server hands the whole list back on every
 * 15s poll. Two consequences shape everything below:
 *
 *  1. Anything the reader sees is DERIVED from `conversations` at render time.
 *     The poll replaces that array wholesale, so nothing which has to survive a
 *     poll may be stored beside it.
 *  2. A write is applied optimistically, the server's own response is adopted
 *     where one exists, and the next poll is the final authority.
 *
 * `archived` / `muted` were already on the payload and the list ignored both, so
 * archiving a chat appeared to do nothing at all. The view switcher and the row
 * menu are what make them mean something.
 * ──────────────────────────────────────────────────────────────────────────── */

const JSON_HEADERS = { "Content-Type": "application/json" };
const lower = (s) => String(s ?? "").toLowerCase();

/** fetch + JSON, throwing with the server's own words attached. */
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

/** `error` AND `detail`, verbatim, joined — never a bare "Failed". */
const errText = (e) => {
    const p = e?.payload;
    const parts = [];
    if (p?.error) parts.push(String(p.error));
    if (p?.detail && String(p.detail) !== String(p.error || "")) parts.push(String(p.detail));
    if (parts.length === 0) parts.push(e?.message || "Request failed");
    return parts.join(" — ");
};

/** A missing `preferences` is normal: old documents, and never-configured chats. */
const PREFS_DEFAULT = {
    nickname: "",
    notify: "all",
    sound: "default",
    autoDeleteHours: 0,
    disappearingDays: 0,
    excludeFromBadge: false,
};
const prefsOf = (convo) => ({
    ...PREFS_DEFAULT,
    ...(convo?.preferences && typeof convo.preferences === "object" ? convo.preferences : {}),
});
const isPinnedRow = (c) => !!c?.pinned;
const stampOf = (c) => new Date(c?.lastMessage?.timeStamp || 0).getTime() || 0;
/** A nickname is local-only and never changes routing. */
const labelOf = (c) => prefsOf(c).nickname || c?.username || "";
/**
 * GET /api/messages/unread excludes muted threads and `excludeFromBadge` from
 * the badge, so the tab title has to exclude the same two or it would promise a
 * number the app's own badge never shows.
 */
const countsToBadge = (c) => !c?.muted && prefsOf(c).excludeFromBadge !== true;

const VIEWS = [
    { id: "active", label: "Inbox" },
    { id: "archived", label: "Archived" },
    { id: "muted", label: "Muted" },
];
const SORTS = [
    { id: "recent", label: "Recent" },
    { id: "unread", label: "Unread" },
    { id: "name", label: "Name" },
];
const FILTERS = [
    { id: "unread", label: "Unread only" },
    { id: "media", label: "Has media" },
    { id: "starred", label: "Starred" },
    { id: "groups", label: "Groups" },
];
const NOTIFY_OPTIONS = [
    { value: "off", label: "Off" },
    { value: "mentions", label: "Mentions" },
    { value: "all", label: "All" },
];
const SOUND_OPTIONS = [
    { value: "default", label: "Default" },
    { value: "none", label: "None" },
];
/** 0 = off, everywhere in the schema. */
const DISAPPEARING_OPTIONS = [
    { value: 0, label: "Off" },
    { value: 1, label: "1 day" },
    { value: 7, label: "7 days" },
    { value: 30, label: "30 days" },
];
const AUTO_DELETE_OPTIONS = [
    { value: 0, label: "Off" },
    { value: 1, label: "1 hour" },
    { value: 24, label: "24 hours" },
    { value: 168, label: "7 days" },
];
const EXPORT_FORMATS = [
    { id: "json", label: "JSON", ext: "json" },
    { id: "csv", label: "CSV", ext: "csv" },
    { id: "text", label: "Text", ext: "txt" },
];
const REPORT_REASONS = [
    "Spam or scam",
    "Harassment or bullying",
    "Hate speech",
    "Nudity or sexual content",
    "False information",
    "Impersonation",
    "Other",
];
/** The "has media" sweep is paged and capped; the UI says so rather than quietly under-reporting. */
const MEDIA_PAGES = 3;
const MEDIA_PAGE_SIZE = 50;
const MENU_WIDTH = 288;

/* ── Icons ────────────────────────────────────────────────────────────────── */

function OnlineDot({ username, onlineMap }) {
    const online = onlineMap?.[username]?.isOnline;
    if (!online) return null;
    return <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" title="Online" />;
}

function PinIcon({ className = "w-3.5 h-3.5" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
            <path d="M12 2.4a1.6 1.6 0 0 0-1.6 1.6v5.9l-2.5 2.5a.8.8 0 0 0-.23.57v1.63a.8.8 0 0 0 .8.8h2.13v3.2a1.6 1.6 0 0 0 3.2 0v-3.2h2.13a.8.8 0 0 0 .8-.8v-1.63a.8.8 0 0 0-.23-.57L13.6 9.9V4A1.6 1.6 0 0 0 12 2.4Z" />
        </svg>
    );
}

function BellSlashIcon({ className = "w-3.5 h-3.5" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0M3 3l18 18" />
        </svg>
    );
}

function BellIcon({ className = "w-4 h-4" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
    );
}

function ArchiveIcon({ className = "w-4 h-4" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5 3.75 11.632a.75.75 0 0 0 0 1.268l16.5 4.132a.75.75 0 0 0 .693-1.264L20.25 7.5ZM20.25 7.5H3.75" />
        </svg>
    );
}

function EllipsisIcon({ className = "w-5 h-5" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className={className} aria-hidden="true">
            <path d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
        </svg>
    );
}

function PencilIcon({ className = "w-3.5 h-3.5" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49a1.75 1.75 0 1 1 2.47 2.47l-9.4 9.4-3.1.63.63-3.1 9.4-9.4Z" />
        </svg>
    );
}

function TrashIcon({ className = "w-4 h-4" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9 14.4 18m-4.8 0L9.26 9m9.968-3.21c.34.05.68.11 1.02.17m-1.02-.17L18.16 19.67a2.25 2.25 0 0 1-2.24 2.08H8.08a2.25 2.25 0 0 1-2.24-2.08L4.77 5.79m14.46 0a48.1 48.1 0 0 0-3.48-.4m-12 .56c.34-.05.68-.11 1.02-.16m0 0a48.1 48.1 0 0 1 3.48-.4m7.5 0v-.92c0-1.18-.91-2.16-2.09-2.2a51.96 51.96 0 0 0-3.32 0c-1.18.04-2.09 1.02-2.09 2.2v.92m7.5 0a48.67 48.67 0 0 0-7.5 0" />
        </svg>
    );
}

function DownloadIcon({ className = "w-4 h-4" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
    );
}

function FlagIcon({ className = "w-4 h-4" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.69a9 9 0 0 1 6.21.68l.11.05a9 9 0 0 0 6.08.71l3.11-.73a48.5 48.5 0 0 1 0-10.5l-3.11.73a9 9 0 0 1-6.08-.71l-.11-.05a9 9 0 0 0-6.21-.68L3 4.5M3 15V4.5" />
        </svg>
    );
}

function BlockIcon({ className = "w-4 h-4" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.36 18.36A9 9 0 0 0 5.64 5.64m12.72 12.72A9 9 0 0 1 5.64 5.64m12.72 12.72L5.64 5.64" />
        </svg>
    );
}

function CheckIcon({ className = "w-4 h-4" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
    );
}

function EyeOffIcon({ className = "w-3.5 h-3.5" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.22A10.9 10.9 0 0 0 1.82 12c1.63 4.29 5.5 7.5 10.18 7.5 1.6 0 3.11-.37 4.47-1.03m3.1-2.36c.98-.92 1.8-2.02 2.43-3.21-1.63-4.29-5.5-7.5-10.18-7.5-.65 0-1.28.06-1.9.17m4.5 12.06L4.62 4.63m3.1 12.98 12.68-12.68M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        </svg>
    );
}

function DraftIcon({ className = "w-2.5 h-2.5" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49a1.75 1.75 0 1 1 2.47 2.47l-9.4 9.4-3.1.63.63-3.1 9.4-9.4Z" />
        </svg>
    );
}

function ChatBubbleIcon({ className = "w-10 h-10" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
        </svg>
    );
}

function GroupIcon({ className = "w-10 h-10" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.09 9.09 0 0 0 3.74-.48 3 3 0 0 0-4.68-2.72m.94 3.2.001.03c0 .23-.01.45-.04.67A11.94 11.94 0 0 1 12 21c-2.17 0-4.21-.58-5.96-1.58A6.06 6.06 0 0 1 6 18.72m12 0a5.97 5.97 0 0 0-.94-3.2m0 0A5.99 5.99 0 0 0 12 12.75 5.99 5.99 0 0 0 6.94 15.5m0 0a3 3 0 0 0-4.68 2.72 8.99 8.99 0 0 0 3.74.48m.94-3.2a5.97 5.97 0 0 0-.94 3.2M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
        </svg>
    );
}

function StarIcon({ className = "w-10 h-10" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.13 5.11a.56.56 0 0 0 .47.35l5.52.44c.5.04.71.69.32 1.02l-4.16 3.6a.56.56 0 0 0-.17.55l1.28 5.39c.12.5-.42.88-.85.61L12 16.75a.56.56 0 0 0-.53 0l-4.8 3.32c-.43.27-.97-.11-.85-.6l1.28-5.4a.56.56 0 0 0-.17-.55l-4.16-3.6a.56.56 0 0 1 .32-1.02l5.52-.44a.56.56 0 0 0 .47-.35l2.13-5.11Z" />
        </svg>
    );
}

/* ── Shared small pieces ──────────────────────────────────────────────────── */

function EmptyState({ icon, title, children, action }) {
    return (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <span className="text-gray-400 dark:text-gray-600">{icon}</span>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2">{title}</p>
            {children && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-[17rem] leading-relaxed">{children}</p>}
            {action}
        </div>
    );
}

function SectionHeader({ children, right }) {
    return (
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1.5 sticky top-0 z-10 bg-white/95 dark:bg-gray-950/95 backdrop-blur">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 truncate">{children}</span>
            {right}
        </div>
    );
}

const MENU_ITEM =
    "w-full text-left px-3 py-2.5 min-h-10 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2.5 rounded-lg transition-colors disabled:opacity-50";
const MENU_HEAD = "px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500";
const MENU_RULE = "my-1.5 border-t border-gray-100 dark:border-gray-800";
const CONFIRM_INPUT =
    "w-full px-3 py-2 mt-2 min-h-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-gray-100";
const BTN_PRIMARY =
    "px-3 py-2 min-h-10 bg-black dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40 transition-colors";
const BTN_GHOST =
    "px-3 py-2 min-h-10 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors";
const BTN_DANGER =
    "px-3 py-2 min-h-10 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors";

function OptionGroup({ label, hint, options, value, onPick, busy }) {
    return (
        <div className="px-3 py-2">
            <p className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">{label}</p>
            {hint && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">{hint}</p>}
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={label}>
                {options.map((o) => {
                    const active = value === o.value;
                    return (
                        <button
                            key={String(o.value)}
                            type="button"
                            disabled={!!busy}
                            aria-pressed={active}
                            onClick={() => onPick(o.value)}
                            className={`min-h-10 px-2.5 rounded-full text-[11px] font-semibold border transition-colors disabled:opacity-50 ${
                                active
                                    ? "border-black dark:border-gray-100 bg-black dark:bg-gray-100 text-white dark:text-gray-900"
                                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                        >
                            {o.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function MenuBack({ onClick, children }) {
    return (
        <button type="button" onClick={onClick} className={`${MENU_ITEM} font-semibold text-gray-900 dark:text-gray-100`}>
            <span aria-hidden="true">&larr;</span> {children}
        </button>
    );
}

/* ── The per-row menu ─────────────────────────────────────────────────────── */

const PANEL = "fixed z-50 max-h-[min(70vh,34rem)] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl";

/**
 * One popover for the open row. `fixed` and positioned from the trigger's
 * rect rather than `absolute`: the list lives inside an `overflow-y-auto`
 * column, and an absolutely-positioned panel would be clipped by it, which on a
 * long list means an unreachable menu for the rows near the top.
 *
 * `stage` is local UI state, not conversation state, so it does not belong in
 * the polled array. The parent re-keys the panel so a different stage remounts.
 */
function RowMenu({ username, prefs, flags, initialStage, style, panelRef, busy, onRun, onClose }) {
    const [stage, setStage] = useState(initialStage);
    const [nickname, setNickname] = useState(prefs.nickname);
    const [typed, setTyped] = useState("");
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");

    const go = (next) => {
        setStage(next);
        setTyped("");
        setError("");
    };

    /** A local failure keeps the panel open with the server's own words on it. */
    const run = async (action, extra) => {
        setError("");
        try {
            await onRun(action, { username, ...(extra || {}) });
            // These three change the list itself — a row is gone, or its content
            // is rewritten — so leaving the panel open would strand a scrim over
            // something that has moved underneath it.
            if (action === "clear" || action === "delete" || action === "block") onClose();
        } catch (e) {
            setError(errText(e));
        }
    };

    const clearPhrase = `clear ${username}`;
    const deletePhrase = "delete";
    const idSuffix = lower(username);

    if (stage === "rename") {
        return (
            <div ref={panelRef} role="dialog" aria-label={`Rename conversation with ${username}`}
                style={style} className={`${PANEL} w-[18rem] max-w-[calc(100vw-1rem)] p-1.5`}>
                <MenuBack onClick={() => go("main")}>Back</MenuBack>
                <p className="px-3 pb-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    A local name for @{username}. Only you see it, and it never changes where messages are sent.
                </p>
                <div className="px-3 pb-1">
                    <label htmlFor={`nick-${idSuffix}`} className="sr-only">Nickname for {username}</label>
                    <input
                        id={`nick-${idSuffix}`}
                        value={nickname}
                        maxLength={40}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder={username}
                        className={CONFIRM_INPUT}
                    />
                </div>
                {error && <p className="px-3 pt-1 pb-1 text-[11px] text-red-600 dark:text-red-400 break-words">{error}</p>}
                <div className="px-3 pb-1.5 flex gap-1.5">
                    <button
                        type="button"
                        disabled={busy === "rename"}
                        onClick={() => run("rename", { nickname })}
                        className={`${BTN_PRIMARY} flex-1`}
                    >
                        {busy === "rename" ? "Saving…" : "Save label"}
                    </button>
                    <button type="button" onClick={() => go("main")} className={BTN_GHOST}>Cancel</button>
                </div>
            </div>
        );
    }

    if (stage === "clear") {
        return (
            <div ref={panelRef} role="dialog" aria-label={`Clear history with ${username}`}
                style={style} className={`${PANEL} w-[18rem] max-w-[calc(100vw-1rem)] p-1.5`}>
                <MenuBack onClick={() => go("main")}>Back</MenuBack>
                <p className="px-3 text-xs font-semibold text-red-700 dark:text-red-300">Clear this conversation&apos;s history?</p>
                <p className="px-3 pt-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    This one is not symmetric, so the wording is exact: only YOUR messages are cleared. Their messages
                    are left intact, and they keep their own copy of the thread.
                </p>
                <div className="px-3">
                    <label htmlFor={`clear-${idSuffix}`} className="block text-[11px] text-gray-500 dark:text-gray-400">
                        Type <span className="font-mono text-gray-700 dark:text-gray-300">{clearPhrase}</span> to confirm
                    </label>
                    <input
                        id={`clear-${idSuffix}`}
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck="false"
                        className={CONFIRM_INPUT}
                    />
                </div>
                {error && <p className="px-3 pt-2 text-[11px] text-red-600 dark:text-red-400 break-words">{error}</p>}
                <div className="px-3 pt-2.5 pb-1.5 flex gap-1.5">
                    <button
                        type="button"
                        disabled={typed.trim().toLowerCase() !== clearPhrase || busy === "clear"}
                        onClick={() => run("clear")}
                        className={`${BTN_DANGER} flex-1`}
                    >
                        {busy === "clear" ? "Clearing…" : "Clear my messages"}
                    </button>
                    <button type="button" onClick={() => go("main")} className={BTN_GHOST}>Cancel</button>
                </div>
            </div>
        );
    }

    if (stage === "delete") {
        return (
            <div ref={panelRef} role="dialog" aria-label={`Delete conversation with ${username}`}
                style={style} className={`${PANEL} w-[18rem] max-w-[calc(100vw-1rem)] p-1.5`}>
                <MenuBack onClick={() => go("main")}>Back</MenuBack>
                <p className="px-3 text-xs font-semibold text-red-700 dark:text-red-300">Delete this conversation from your lists?</p>
                <p className="px-3 pt-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    It removes the thread from YOUR lists — your pin, its archive and mute flags, and its settings. It does
                    NOT delete any messages: @{username} still has the whole conversation, and so do you. Because threads
                    here are a query over messages rather than a stored list, the row itself returns on the next poll; use
                    Archive to actually keep it out of the inbox.
                </p>
                <div className="px-3">
                    <label htmlFor={`del-${idSuffix}`} className="block text-[11px] text-gray-500 dark:text-gray-400">
                        Type <span className="font-mono text-gray-700 dark:text-gray-300">{deletePhrase}</span> to confirm
                    </label>
                    <input
                        id={`del-${idSuffix}`}
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck="false"
                        className={CONFIRM_INPUT}
                    />
                </div>
                {error && <p className="px-3 pt-2 text-[11px] text-red-600 dark:text-red-400 break-words">{error}</p>}
                <div className="px-3 pt-2.5 pb-1.5 flex gap-1.5">
                    <button
                        type="button"
                        disabled={typed.trim().toLowerCase() !== deletePhrase || busy === "delete"}
                        onClick={() => run("delete")}
                        className={`${BTN_DANGER} flex-1`}
                    >
                        {busy === "delete" ? "Deleting…" : "Delete conversation"}
                    </button>
                    <button type="button" onClick={() => go("main")} className={BTN_GHOST}>Cancel</button>
                </div>
            </div>
        );
    }

    if (stage === "block") {
        return (
            <div ref={panelRef} role="dialog" aria-label={`Block ${username}`}
                style={style} className={`${PANEL} w-[18rem] max-w-[calc(100vw-1rem)] p-1.5`}>
                <MenuBack onClick={() => go("main")}>Back</MenuBack>
                <p className="px-3 text-xs font-semibold text-red-700 dark:text-red-300">Block @{username}?</p>
                <p className="px-3 pt-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    You stop seeing their posts, neither of you can message the other, and you stop following each other in
                    both directions. The thread leaves this inbox completely — a blocked conversation is filtered out of
                    the list server-side — so this panel cannot undo it. Unblock lives in Settings.
                </p>
                {error && <p className="px-3 pt-2 text-[11px] text-red-600 dark:text-red-400 break-words">{error}</p>}
                <div className="px-3 pt-2.5 pb-1.5 flex gap-1.5">
                    <button type="button" disabled={busy === "block"} onClick={() => run("block")} className={`${BTN_DANGER} flex-1`}>
                        {busy === "block" ? "Blocking…" : `Block @${username}`}
                    </button>
                    <button type="button" onClick={() => go("main")} className={BTN_GHOST}>Cancel</button>
                </div>
            </div>
        );
    }

    if (stage === "report" || stage === "reportGo") {
        return (
            <div ref={panelRef} role="dialog" aria-label={`Report ${username}`}
                style={style} className={`${PANEL} w-[18rem] max-w-[calc(100vw-1rem)] p-1.5`}>
                <MenuBack onClick={() => go(stage === "reportGo" ? "report" : "main")}>
                    {stage === "reportGo" ? "Reasons" : "Back"}
                </MenuBack>
                {stage === "report" ? (
                    <>
                        <p className="px-3 pb-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                            Filed against the account, with this conversation&apos;s context attached to the details field.
                        </p>
                        {REPORT_REASONS.map((r) => (
                            <button
                                key={r}
                                type="button"
                                disabled={!!busy}
                                onClick={() => { setReason(r); go("reportGo"); }}
                                className={`${MENU_ITEM} hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400`}
                            >
                                <FlagIcon className="w-3.5 h-3.5 shrink-0" />
                                {r}
                            </button>
                        ))}
                    </>
                ) : (
                    <>
                        <p className="px-3 text-xs font-semibold text-gray-900 dark:text-gray-100">
                            Report @{username} as &ldquo;{reason}&rdquo;?
                        </p>
                        <p className="px-3 pt-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                            The server keeps one open report per reporter and target for 24h, so a second tap returns the
                            report already filed instead of creating a duplicate.
                        </p>
                        {error && <p className="px-3 pt-2 text-[11px] text-red-600 dark:text-red-400 break-words">{error}</p>}
                        <div className="px-3 pt-2.5 pb-1.5 flex gap-1.5">
                            <button type="button" disabled={busy === "report"} onClick={() => run("report", { reason })} className={`${BTN_DANGER} flex-1`}>
                                {busy === "report" ? "Sending…" : "Send report"}
                            </button>
                            <button type="button" onClick={() => go("main")} className={BTN_GHOST}>Cancel</button>
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div ref={panelRef} role="menu" aria-label={`Options for ${username}`}
            style={style} className={`${PANEL} w-[18rem] max-w-[calc(100vw-1rem)] py-1 animate-scale-in`}>

            <p className={MENU_HEAD}>Conversation</p>
            <button type="button" disabled={!!busy} aria-pressed={flags.pinned}
                onClick={() => run(flags.pinned ? "unpin" : "pin")} className={MENU_ITEM}>
                <PinIcon className={`w-4 h-4 shrink-0 ${flags.pinned ? "text-blue-500" : ""}`} />
                {flags.pinned ? "Unpin conversation" : "Pin to top"}
            </button>
            <button type="button" disabled={!!busy} aria-pressed={flags.muted}
                onClick={() => run(flags.muted ? "unmute" : "mute")} className={MENU_ITEM}>
                <BellSlashIcon className="w-4 h-4 shrink-0" />
                {flags.muted ? "Unmute conversation" : "Mute conversation"}
            </button>
            <button type="button" disabled={!!busy} aria-pressed={flags.archived}
                onClick={() => run(flags.archived ? "unarchive" : "archive")} className={MENU_ITEM}>
                <ArchiveIcon className="w-4 h-4 shrink-0" />
                {flags.archived ? "Unarchive" : "Archive"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => run("markRead")} className={MENU_ITEM}>
                <CheckIcon className="w-4 h-4 shrink-0" />
                Mark as read
            </button>

            <div className={MENU_RULE} />
            <p className={MENU_HEAD}>Alerts</p>
            <OptionGroup
                label="Notifications"
                hint="Per thread. The server combines this with your account's quiet hours."
                options={NOTIFY_OPTIONS}
                value={prefs.notify}
                busy={busy === "notify" ? busy : null}
                onPick={(value) => run("notify", { value })}
            />
            <OptionGroup
                label="Sound"
                options={SOUND_OPTIONS}
                value={prefs.sound}
                busy={busy === "sound" ? busy : null}
                onPick={(value) => run("sound", { value })}
            />
            <button
                type="button"
                role="switch"
                aria-checked={prefs.excludeFromBadge === true}
                disabled={!!busy}
                onClick={() => run("excludeFromBadge", { value: !prefs.excludeFromBadge })}
                className={`${MENU_ITEM} justify-between`}
            >
                <span className="flex items-center gap-2.5">
                    <EyeOffIcon className="w-4 h-4 shrink-0" />
                    Hide from unread badge
                </span>
                <span className={`text-[10px] font-bold uppercase shrink-0 ${prefs.excludeFromBadge ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"}`}>
                    {prefs.excludeFromBadge ? "On" : "Off"}
                </span>
            </button>

            <div className={MENU_RULE} />
            <p className={MENU_HEAD}>Timers</p>
            <OptionGroup
                label="Disappearing messages"
                hint="A sender-requested expiry. It is capped by what YOU allow here — the server refuses a longer request — so this value is the ceiling for anyone messaging you in this thread."
                options={DISAPPEARING_OPTIONS}
                value={Number(prefs.disappearingDays) || 0}
                busy={busy === "disappearing" ? busy : null}
                onPick={(days) => run("disappearing", { days })}
            />
            <OptionGroup
                label="Auto-delete incoming"
                hint="Hides new messages in this thread after this long. 0 is off."
                options={AUTO_DELETE_OPTIONS}
                value={Number(prefs.autoDeleteHours) || 0}
                busy={busy === "autoDelete" ? busy : null}
                onPick={(hours) => run("autoDelete", { hours })}
            />

            <div className={MENU_RULE} />
            <p className={MENU_HEAD}>Label</p>
            <button type="button" onClick={() => go("rename")} className={MENU_ITEM}>
                <PencilIcon className="w-4 h-4 shrink-0" />
                {prefs.nickname ? `Rename (${prefs.nickname})` : "Rename this conversation"}
            </button>

            <div className={MENU_RULE} />
            <p className={MENU_HEAD}>Export</p>
            <p className="px-3 pb-1.5 text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Built by the server and streamed straight to a file, so a 5000-message thread is never pulled into this tab.
            </p>
            <div className="px-3 pb-1.5 flex gap-1.5">
                {EXPORT_FORMATS.map((f) => (
                    <button
                        key={f.id}
                        type="button"
                        disabled={!!busy}
                        onClick={() => run("export", { format: f.id, ext: f.ext })}
                        className={`${BTN_GHOST} flex-1 flex items-center justify-center gap-1`}
                    >
                        <DownloadIcon className="w-3.5 h-3.5 shrink-0" />
                        {busy === `export:${f.id}` ? "…" : f.label}
                    </button>
                ))}
            </div>

            <div className={MENU_RULE} />
            <button type="button" disabled={!!busy} onClick={() => go("clear")} className={MENU_ITEM}>
                <TrashIcon className="w-4 h-4 shrink-0" />
                Clear history (mine only)
            </button>
            <button type="button" disabled={!!busy} onClick={() => go("delete")} className={MENU_ITEM}>
                <TrashIcon className="w-4 h-4 shrink-0" />
                Delete conversation
            </button>

            <div className={MENU_RULE} />
            <p className={MENU_HEAD}>Safety</p>
            <button type="button" disabled={!!busy} onClick={() => go("block")} className={`${MENU_ITEM} text-red-600 dark:text-red-400`}>
                <BlockIcon className="w-4 h-4 shrink-0" />
                Block @{username}
            </button>
            <button type="button" disabled={!!busy} onClick={() => go("report")} className={MENU_ITEM}>
                <FlagIcon className="w-4 h-4 shrink-0" />
                Report @{username}
            </button>

            {error && <p className="px-3 pt-2 pb-1 text-[11px] text-red-600 dark:text-red-400 break-words">{error}</p>}
        </div>
    );
}

/* ── The list ─────────────────────────────────────────────────────────────── */

export default function InboxClient() {
    const { user, ready } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { showToast } = useToast();
    const targetUser = searchParams.get("user");
    const targetGroup = searchParams.get("group");
    // Group invite links render and copy correctly in GroupSettings, but until
    // now nothing on this page read `invite`, so following one landed here and
    // did nothing at all. `POST /api/groups/join` also had no client caller.
    const inviteCode = searchParams.get("invite");
    const [view, setView] = useState("list");
    const [tab, setTab] = useState("dm"); // "dm" | "groups"
    const [listView, setListView] = useState("active"); // "active" | "archived" | "muted"
    const [sort, setSort] = useState("recent"); // "recent" | "unread" | "name"
    const [filters, setFilters] = useState([]); // a subset of FILTERS ids
    const [conversations, setConversations] = useState([]);
    const [groups, setGroups] = useState([]);
    const [onlineMap, setOnlineMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState("");
    const [selectedConvo, setSelectedConvo] = useState(null);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showInvite, setShowInvite] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    // Hits carry the query that produced them, so results from an earlier
    // keystroke are ignored by comparison rather than cleared inside an effect.
    const [hitState, setHitState] = useState({ query: "", results: [] });
    // Server-derived filter sets, keyed on counterpart username. `peers: null`
    // means "not loaded yet", which is what the "looking…" state reads; a Set
    // that happens to be empty is a real answer of "none".
    const [starred, setStarred] = useState({ peers: null, count: 0, truncated: false, error: "" });
    const [media, setMedia] = useState({ peers: null, total: 0, truncated: false, error: "" });
    const [drafts, setDrafts] = useState({ scopes: null, count: 0, error: "" });
    const [openMenu, setOpenMenu] = useState(null); // { username, stage }
    const [menuBox, setMenuBox] = useState(null); // { left, top, width, maxHeight }
    const [busyRow, setBusyRow] = useState(null); // "<action>:<username>"
    const [armAllRead, setArmAllRead] = useState(false);
    const { openSidebar } = useSidebar();
    const prevUserRef = useRef(null);
    const prevGroupRef = useRef(null);
    const menuPanelRef = useRef(null);
    const titleRef = useRef(null);
    const filtersRef = useRef(filters);

    const unreadOnly = filters.includes("unread");
    const mediaOnly = filters.includes("media");
    const starredOnly = filters.includes("starred");

    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);

    useEffect(() => {
        if (!user) return;
        if (selectedConvo) {
            setActiveChat(selectedConvo.username);
        } else if (selectedGroup) {
            setActiveChat(`group:${selectedGroup._id}`);
        }
        const clearTyping = () => {
            fetch("/api/typing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, typingTo: "" }),
            }).catch(() => {});
        };
        return () => {
            setActiveChat(null);
            clearTyping();
        };
    }, [user, selectedConvo?.username, selectedGroup?._id]);

    const fetchConversations = useCallback(async () => {
        if (!user?.username) {
            // Used to return before the `finally`, so `loading` stayed true
            // forever and the skeleton never cleared. `ready` can be true with no
            // user (logged out, or a session error), which is exactly the case
            // that hung.
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            // `?view=` is the server-side half of the view switcher. The client
            // filters on the same flags regardless, so a server that ignores the
            // param degrades to correct client-side behaviour instead of showing
            // the wrong section.
            const res = await fetch(
                `/api/messages?username=${encodeURIComponent(user.username)}&view=${encodeURIComponent(listView)}`,
                { credentials: "include", signal: controller.signal },
            );
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setConversations(data);
                    setListError("");
                } else {
                    setListError("The conversation list came back in an unexpected shape.");
                }
            } else {
                const payload = await res.json().catch(() => ({}));
                setListError(
                    [payload?.error, payload?.detail].filter(Boolean).join(" — ")
                    || `Could not load the inbox (HTTP ${res.status})`,
                );
            }
        } catch {
            clearTimeout(timeoutId);
        } finally { setLoading(false); }
    }, [user, listView]);

    const fetchGroups = useCallback(async () => {
        if (!user?.username) return;
        try {
            const res = await fetch(`/api/groups?username=${encodeURIComponent(user.username)}`);
            if (res.ok) {
                const data = await res.json();
                setGroups(data);
            }
        } catch {}
    }, [user]);

    /** Saved drafts: one row per thread, scope = lowercase username or `group:<id>`. */
    const loadDrafts = useCallback(async () => {
        if (!user?.username) return;
        try {
            const d = await callApi("/api/messaging/drafts", { cache: "no-store" });
            const rows = Array.isArray(d.drafts) ? d.drafts : [];
            setDrafts({
                scopes: new Set(rows.map((r) => lower(r?.scope)).filter(Boolean)),
                count: typeof d.count === "number" ? d.count : rows.length,
                error: "",
            });
        } catch (e) {
            setDrafts((s) => ({ ...s, error: errText(e) }));
        }
    }, [user?.username]);

    /**
     * "Starred" is per-MESSAGE, so it cannot be read off a conversation field.
     * The starred endpoint attributes every starred message to its thread, and
     * the set of those `with` values is the filter. `GET /api/messages/starred`
     * (what ChatBox reads) returns a bare array of the same rows, so both work.
     */
    const loadStarred = useCallback(async () => {
        if (!user?.username) return;
        try {
            const d = await callApi("/api/messaging/starred", { cache: "no-store" });
            const rows = Array.isArray(d.messages) ? d.messages : [];
            setStarred({
                peers: new Set(rows.map((m) => lower(m?.with)).filter(Boolean)),
                count: typeof d.count === "number" ? d.count : rows.length,
                truncated: rows.length >= 100,
                error: "",
            });
        } catch (e) {
            setStarred((s) => ({ ...s, error: errText(e) }));
        }
    }, [user?.username]);

    /**
     * "Has media" has the same shape of problem: the conversation aggregate
     * carries only the LAST message, so a thread whose photo is forty messages
     * back looks text-only. The messaging search endpoint answers it properly
     * with `has:image` and attributes each hit to a thread. Paged and capped,
     * because an unbounded sweep of a long history is not a request this list
     * should make on a tap.
     */
    const loadMedia = useCallback(async () => {
        if (!user?.username) return;
        try {
            const peers = new Set();
            let page = 1;
            let total = 0;
            let hasMore = true;
            while (page <= MEDIA_PAGES && hasMore) {
                const d = await callApi(
                    `/api/messaging/search?has=image&limit=${MEDIA_PAGE_SIZE}&page=${page}`,
                    { cache: "no-store" },
                );
                for (const r of Array.isArray(d.results) ? d.results : []) {
                    if (r?.with) peers.add(lower(r.with));
                }
                if (typeof d.total === "number") total = d.total;
                hasMore = d.hasMore === true;
                page += 1;
            }
            setMedia({ peers, total, truncated: hasMore, error: "" });
        } catch (e) {
            setMedia((s) => ({ ...s, error: errText(e) }));
        }
    }, [user?.username]);

    useEffect(() => {
        queueMicrotask(() => {
            fetchConversations();
            fetchGroups();
            loadDrafts();
        });
    }, [fetchConversations, fetchGroups, loadDrafts]);

    useEffect(() => {
        const interval = setInterval(() => {
            fetchConversations();
            fetchGroups();
            loadDrafts();
            // The two server-derived filter sets ride the same beat, but only
            // while their chip is on: an unused chip must not cost a request
            // every 15 seconds.
            const on = filtersRef.current;
            if (on.includes("starred")) loadStarred();
            if (on.includes("media")) loadMedia();
        }, 15000);
        return () => clearInterval(interval);
    }, [fetchConversations, fetchGroups, loadDrafts, loadStarred, loadMedia]);

    useEffect(() => {
        if (starredOnly) loadStarred();
    }, [starredOnly, loadStarred]);

    useEffect(() => {
        if (mediaOnly) loadMedia();
    }, [mediaOnly, loadMedia]);

    useEffect(() => {
        const handleGroupUpdate = (e) => {
            const updated = e.detail;
            if (updated?._id) {
                setGroups(prev => prev.map(g => g._id === updated._id ? { ...g, ...updated } : g));
                if (selectedGroup?._id === updated._id) {
                    setSelectedGroup(prev => prev ? { ...prev, ...updated } : prev);
                }
            }
        };
        window.addEventListener("groupUpdated", handleGroupUpdate);
        return () => window.removeEventListener("groupUpdated", handleGroupUpdate);
    }, [selectedGroup?._id]);

    // Online status polling
    //
    // Keyed on the *joined username string*, not on `conversations`. The
    // conversation poll replaces the array with a new reference every 15s, so
    // this effect tore down and re-created its 30s interval before it could ever
    // fire — the interval body was unreachable, and the only thing that actually
    // ran was `fetchOnline()` on every conversation poll, i.e. double the
    // intended request rate. Now the interval survives until the roster itself
    // changes.
    useEffect(() => {
        if (conversations.length === 0) return;
        const usernames = conversations.map(c => c.username).join(",");
        const fetchOnline = async () => {
            try {
                const res = await fetch(`/api/users/online?usernames=${encodeURIComponent(usernames)}`);
                if (res.ok) {
                    const data = await res.json();
                    setOnlineMap(data.users || {});
                }
            } catch {}
        };
        fetchOnline();
        const id = setInterval(fetchOnline, 30000);
        return () => clearInterval(id);
    }, [conversations.map(c => c.username).join(",")]);

    // Keep the open conversation's header in step with the poll.
    //
    // `selectedConvo` is captured once — by the deep link, by a search hit, or by
    // a click — and the 15s poll replaces `conversations` without touching it. So
    // a thread opened that way kept `user: null` for as long as it stayed open:
    // no avatar, no badges, no last-seen, even after the list caught up.
    //
    // Derived rather than synced with an effect: the fix is a pure read of the
    // list, and copying it into state on every poll is both an extra render and a
    // place for the two copies to disagree.
    const activeConvo = useMemo(() => {
        if (!selectedConvo?.username) return null;
        return conversations.find((c) => c.username === selectedConvo.username) || selectedConvo;
    }, [conversations, selectedConvo]);

    // An open thread is being read, but `unreadCount` only refreshes on the 15s
    // conversation poll — so its badge sat next to the very messages you were
    // reading, still claiming they were unread, for up to 15s after you opened
    // it. Read as zero for that one thread and let the poll keep supplying the
    // real number for every other row; leaving the thread restores it.
    //
    // Derived rather than written into state on selection: the poll replaces the
    // array wholesale, so a zeroed copy would be reverted on the next tick
    // anyway, and a deep-linked or search-opened thread never goes through
    // `handleSelectConvo` at all.
    const unreadOf = useCallback(
        (convo) => (convo.username === activeConvo?.username ? 0 : convo.unreadCount || 0),
        [activeConvo?.username],
    );

    // Deep linking
    useEffect(() => {
        // Two refs, not one. `prevTargetRef` was shared, so a URL carrying both
        // params (`/inbox?user=a&group=b`) made each branch overwrite the other's
        // marker and the two fought on every re-run, flipping the open pane.
        if (targetUser && targetUser !== prevUserRef.current) {
            prevUserRef.current = targetUser;
            const existing = conversations.find(c => c.username === targetUser);
            if (existing) {
                queueMicrotask(() => { setSelectedConvo(existing); setSelectedGroup(null); setView("chat"); });
            } else {
                queueMicrotask(() => {
                    setSelectedConvo({ username: targetUser, user: { username: targetUser, avatarUrl: "", color: "#3b82f6" }, lastMessage: null, unreadCount: 0 });
                    setSelectedGroup(null);
                    setView("chat");
                });
            }
        }
        if (targetGroup && targetGroup !== prevGroupRef.current) {
            prevGroupRef.current = targetGroup;
            const existing = groups.find(g => g._id === targetGroup);
            if (existing) {
                queueMicrotask(() => { setSelectedGroup(existing); setSelectedConvo(null); setTab("groups"); setView("chat"); });
            } else {
                // Fetch group details
                fetch(`/api/groups/${targetGroup}`).then(r => r.json()).then(data => {
                    if (data._id) {
                        queueMicrotask(() => { setSelectedGroup(data); setSelectedConvo(null); setTab("groups"); setView("chat"); });
                    }
                }).catch(() => {});
            }
        }
    }, [targetUser, targetGroup, conversations, groups]);

    // ── Group invite links ────────────────────────────────────────────────
    // The group pass renders and copies a shareable link, but nothing consumed
    // the `invite` parameter and `POST /api/groups/join` had no client caller at
    // all — so following a group's invite link used to land here and do nothing.
    // A ref guards against re-running on every poll: the join is a mutation, so
    // re-firing it on each 15s refresh would be a bug, not a retry.
    const handledInviteRef = useRef("");
    useEffect(() => {
        if (!ready || !inviteCode) return;
        if (handledInviteRef.current === inviteCode) return;
        handledInviteRef.current = inviteCode;

        let cancelled = false;
        (async () => {
            try {
                // Resolve first so a dead or rotated link says so, rather than
                // silently doing nothing the way it used to.
                const res = await callApi(`/api/groups/invite/${encodeURIComponent(inviteCode)}`);
                if (cancelled) return;
                const preview = res?.group;
                if (preview?.isMember) {
                    showToast(`You are already in "${preview.name}"`, "info");
                    return;
                }
                if (preview?.maxMembers > 0 && preview.memberCount >= preview.maxMembers) {
                    showToast(`"${preview.name}" is full`, "error");
                    return;
                }
                const join = await callApi("/api/groups/join", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code: inviteCode }),
                });
                if (cancelled) return;
                if (join?.group?._id) {
                    showToast(`Joined "${join.group.name}"`, "success");
                    setGroups((prev) => [join.group, ...prev.filter((g) => g._id !== join.group._id)]);
                    setSelectedGroup(join.group);
                    setSelectedConvo(null);
                    setTab("groups");
                    setView("chat");
                }
            } catch (e) {
                if (cancelled) return;
                showToast(errText(e), "error");
            } finally {
                if (!cancelled) {
                    // Drop the param either way. Leaving it in place means a
                    // refresh re-runs the whole flow, and a failed invite would
                    // toast on every poll for the rest of the session.
                    try {
                        const url = new URL(window.location.href);
                        url.searchParams.delete("invite");
                        window.history.replaceState({}, "", url.toString());
                    } catch { /* non-browser context */ }
                }
            }
        })();
        return () => { cancelled = true; };
    }, [ready, inviteCode, showToast]);

    // The box filters loaded conversations by name, but the interesting query is
    // "what did we say about X" — that needs the server, since only the first
    // page of each thread is ever loaded client-side.
    useEffect(() => {
        const q = searchQuery.trim();
        if (tab !== "dm" || q.length < 2 || !user?.username) return;

        const controller = new AbortController();
        const id = setTimeout(async () => {
            try {
                const res = await fetch(`/api/messages/search?q=${encodeURIComponent(q)}`, {
                    credentials: "include", signal: controller.signal,
                });
                if (res.ok) {
                    const data = await res.json();
                    setHitState({ query: q, results: data.results || [], failed: false });
                } else {
                    setHitState({ query: q, results: [], failed: true });
                }
            } catch (e) {
                // An abort is a superseded query, not a failure — the next effect
                // run will set the real state.
                if (e?.name !== "AbortError") {
                    setHitState({ query: q, results: [], failed: true });
                }
            }
        }, 300);

        return () => { clearTimeout(id); controller.abort(); };
    }, [searchQuery, tab, user?.username]);

    const messageHits = hitState.query === searchQuery.trim() ? hitState.results : [];
    // `searchingMessages` used to be derived only from `hitState.query`, which is
    // set *inside* `if (res.ok)`. A 500 or a network error therefore left it
    // comparing unequal forever, and the list showed a permanent
    // "Searching messages…" with no results and no empty state. `searchFailed`
    // records that the request finished without a usable answer.
    const searchingMessages =
        tab === "dm" &&
        searchQuery.trim().length >= 2 &&
        hitState.query !== searchQuery.trim() &&
        !hitState.failed;

    /* ── Tab title: unread count, restored on unmount ────────────────────────
     * There is no other title badge in the app, and the navigation badge in
     * LayoutWrapper only covers the icon, so an unread DM was invisible until
     * the tab itself was opened. The original is captured once in a ref: reading
     * `document.title` at the top of this effect would capture the title this
     * very effect set, and a drop from N to 0 would then restore "(N) AnonTweet".
     * Muted threads and `excludeFromBadge` are skipped for the same reason the
     * server skips them in GET /api/messages/unread. */
    const badgeTotal = useMemo(
        () => conversations.reduce(
            (n, c) => (countsToBadge(c) ? n + (c.unreadCount || 0) : n),
            0,
        ),
        [conversations],
    );
    useEffect(() => {
        if (titleRef.current === null) titleRef.current = document.title;
        const original = titleRef.current;
        document.title = badgeTotal > 0 ? `(${badgeTotal}) AnonTweet` : original;
        return () => { document.title = original; };
    }, [badgeTotal]);

    /* ── Row menu: open, close, and outside-tap ──────────────────────────── */

    const closeMenu = useCallback(() => {
        setOpenMenu(null);
        setMenuBox(null);
    }, []);

    /**
     * Positioned from the trigger's rect. `fixed` is not clipped by the list's
     * `overflow-y-auto`; an absolutely-positioned panel would be.
     */
    const openRowMenu = useCallback((e, username, stage = "main") => {
        const rect = e.currentTarget.getBoundingClientRect();
        const margin = 8;
        const wanted = 520;
        const below = window.innerHeight - rect.bottom - margin;
        const flip = below < wanted && rect.top > below;
        const left = Math.min(
            Math.max(margin, rect.right - MENU_WIDTH),
            Math.max(margin, window.innerWidth - MENU_WIDTH - margin),
        );
        const maxHeight = Math.max(240, Math.min(544, flip ? rect.top - margin * 2 : below));
        setMenuBox({
            left,
            top: flip ? undefined : rect.bottom + 6,
            bottom: flip ? window.innerHeight - rect.top + 6 : undefined,
            width: MENU_WIDTH,
            maxHeight,
        });
        setOpenMenu((prev) => (prev?.username === username && prev?.stage === stage ? null : { username, stage }));
    }, []);

    useEffect(() => {
        if (!openMenu) return;
        // `pointerdown`, not `mousedown`: a touch that is handled as a click
        // does not always produce a mousedown on iOS, so a mousedown-only
        // dismiss leaves the panel stuck open over the conversation behind it.
        const onPointerDown = (e) => {
            if (menuPanelRef.current && !menuPanelRef.current.contains(e.target)) closeMenu();
        };
        const onKey = (e) => { if (e.key === "Escape") closeMenu(); };
        // The panel is fixed, so a scroll would leave it floating over a list
        // that moved underneath it. Capture, so the list's own scroll counts.
        // The panel is itself a scroll container though — `PANEL` carries
        // `overflow-y-auto` under a `max-h` — and scrolling it reaches this
        // listener too, which made the menu disappear the instant you tried to
        // scroll its options. Scrolling inside the panel is not reflow of the
        // page underneath it, so it is left alone.
        const onReflow = (e) => {
            if (e.target instanceof Node && menuPanelRef.current?.contains(e.target)) return;
            closeMenu();
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKey);
        window.addEventListener("scroll", onReflow, true);
        window.addEventListener("resize", onReflow);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", onReflow, true);
            window.removeEventListener("resize", onReflow);
        };
    }, [openMenu, closeMenu]);

    /* ── Navigation ────────────────────────────────────────────────────────
     * After the row-menu section, because `handleBack` lists `closeMenu` in its
     * dependencies and that array is evaluated during render: declared above
     * `closeMenu` it would read a const before its initializer (a TDZ throw on
     * every render, not just a stale closure). */

    const handleSelectConvo = (convo) => {
        setSelectedConvo(convo);
        setSelectedGroup(null);
        setView("chat");
        const url = new URL(window.location.href);
        url.searchParams.set("user", convo.username);
        url.searchParams.delete("group");
        router.replace(url.pathname + url.search, { scroll: false });
    };

    const handleSelectGroup = (group) => {
        setSelectedGroup(group);
        setSelectedConvo(null);
        setView("chat");
        const url = new URL(window.location.href);
        url.searchParams.set("group", group._id);
        url.searchParams.delete("user");
        router.replace(url.pathname + url.search, { scroll: false });
    };

    const handleBack = useCallback(() => {
        setView("list");
        setSelectedConvo(null);
        setSelectedGroup(null);
        prevUserRef.current = null;
        prevGroupRef.current = null;
        closeMenu();
        const url = new URL(window.location.href);
        url.searchParams.delete("user");
        url.searchParams.delete("group");
        router.replace(url.pathname, { scroll: false });
    }, [router, closeMenu]);

    const openSearchHit = (hit) => {
        const existing = conversations.find(c => c.username === hit.with);
        handleSelectConvo(existing || { username: hit.with, user: null, lastMessage: hit.text });
    };

    /* ── Writes ──────────────────────────────────────────────────────────── */

    /**
     * The single writer for per-conversation flags. It patches the polled array
     * in place rather than keeping a second copy, because the next poll replaces
     * that array and any parallel copy would immediately disagree with it.
     * Case-insensitive because a deep link can carry a different casing than the
     * username stored on the user document.
     */
    const patchConvo = useCallback((username, patch) => {
        const key = lower(username);
        setConversations(prev => prev.map(c => (
            lower(c.username) === key
                ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) }
                : c
        )));
    }, []);

    /**
     * Every per-conversation action, in the shape ChatBox uses (`runOption`
     * with an action string) so the two surfaces cannot drift. Optimistic first,
     * then the server's own response is adopted, then a toast. Failures throw so
     * the row menu can keep them on screen next to the button that caused them.
     */
    const runOption = useCallback(async (action, extra) => {
        const username = extra?.username;
        if (!username || !user?.username) return;
        const key = lower(username);
        const convoPath = `/api/messaging/conversation/${encodeURIComponent(username)}`;
        const json = (body) => ({
            method: "PATCH",
            headers: JSON_HEADERS,
            credentials: "include",
            body: JSON.stringify(body),
        });
        setBusyRow(`${action}:${username}`);

        try {
            if (action === "pin" || action === "unpin") {
                patchConvo(username, { pinned: action === "pin" });
                const d = await callApi(convoPath, json({ action }));
                // `pinned` and `preferences` both come back from every PATCH, so
                // the response — not the guess — decides what the row shows.
                patchConvo(username, (c) => ({
                    ...c,
                    pinned: !!d.pinned,
                    ...(d.preferences ? { preferences: { ...PREFS_DEFAULT, ...d.preferences } } : {}),
                }));
                showToast(d.pinned ? "Pinned to the top of your inbox" : "Unpinned", "success");
                return;
            }

            if (action === "rename" || action === "notify" || action === "sound"
                || action === "excludeFromBadge" || action === "autoDelete" || action === "disappearing") {
                const body = { action };
                if (action === "rename") body.nickname = String(extra.nickname ?? "").slice(0, 40);
                if (action === "notify") body.value = extra.value;
                if (action === "sound") body.value = extra.value;
                if (action === "excludeFromBadge") body.value = !!extra.value;
                if (action === "autoDelete") body.hours = Number(extra.hours) || 0;
                if (action === "disappearing") body.days = Number(extra.days) || 0;

                // Optimistic, but from the SAME value that is being sent, so a
                // refused write is corrected by the response rather than by guess.
                if (action === "rename") patchConvo(username, (c) => ({ ...c, preferences: { ...prefsOf(c), nickname: body.nickname } }));
                if (action === "notify") patchConvo(username, (c) => ({ ...c, preferences: { ...prefsOf(c), notify: body.value } }));
                if (action === "sound") patchConvo(username, (c) => ({ ...c, preferences: { ...prefsOf(c), sound: body.value } }));
                if (action === "excludeFromBadge") patchConvo(username, (c) => ({ ...c, preferences: { ...prefsOf(c), excludeFromBadge: body.value } }));
                if (action === "autoDelete") patchConvo(username, (c) => ({ ...c, preferences: { ...prefsOf(c), autoDeleteHours: body.hours } }));
                if (action === "disappearing") patchConvo(username, (c) => ({ ...c, preferences: { ...prefsOf(c), disappearingDays: body.days } }));

                const d = await callApi(convoPath, json(body));
                if (d.preferences) {
                    patchConvo(username, (c) => ({
                        ...c,
                        pinned: typeof d.pinned === "boolean" ? d.pinned : c.pinned,
                        preferences: { ...PREFS_DEFAULT, ...d.preferences },
                    }));
                }
                const done = {
                    rename: d.preferences?.nickname
                        ? `Saved as “${d.preferences.nickname}”`
                        : `Label cleared — showing @${username} again`,
                    notify: extra.value === "off" ? "Notifications off for this conversation" : `Notifications: ${extra.value}`,
                    sound: extra.value === "none" ? "Sound off for this conversation" : "Sound on for this conversation",
                    excludeFromBadge: extra.value ? "Hidden from the unread badge" : "Counted in the unread badge again",
                    autoDelete: Number(extra.hours) > 0 ? `Auto-delete set to ${extra.hours}h` : "Auto-delete turned off",
                    disappearing: Number(extra.days) > 0 ? `Disappearing set to ${extra.days} day(s)` : "Disappearing messages turned off",
                }[action];
                showToast(done, "success");
                return;
            }

            if (action === "mute" || action === "unmute" || action === "archive" || action === "unarchive") {
                // Only PATCH /api/messages/conversation handles these four;
                // /api/messaging/conversation/:username rejects them outright.
                const isMute = action === "mute" || action === "unmute";
                const on = action === "mute" || action === "archive";
                patchConvo(username, isMute ? { muted: on } : { archived: on });
                const d = await callApi("/api/messages/conversation", {
                    method: "PATCH",
                    headers: JSON_HEADERS,
                    credentials: "include",
                    body: JSON.stringify({ with: username, action }),
                });
                const list = isMute ? d.mutedChats : d.archivedChats;
                const serverFlag = Array.isArray(list) ? list.some((u) => lower(u) === key) : on;
                patchConvo(username, isMute ? { muted: serverFlag } : { archived: serverFlag });
                showToast(
                    action === "mute" ? "Conversation muted"
                        : action === "unmute" ? "Conversation unmuted"
                            : action === "archive" ? "Chat archived — find it under Archived"
                                : "Chat unarchived — back in your Inbox",
                    "success",
                );
                return;
            }

            if (action === "markRead") {
                // `?sender=` names the OTHER party: the route reads
                // `{ sender, recipient: me }`, so `?sender=<me>` would ask for
                // messages sent to me by me and match nothing.
                patchConvo(username, { unreadCount: 0 });
                await callApi(`/api/messages/read-all?sender=${encodeURIComponent(username)}`, {
                    method: "PATCH", credentials: "include",
                });
                showToast("Marked as read", "success");
                return;
            }

            if (action === "clear") {
                const d = await callApi(`${convoPath}/clear`, {
                    method: "POST", headers: JSON_HEADERS, credentials: "include", body: "{}",
                });
                // The server's own note is the honest description of what it did
                // (mine only), so it is shown verbatim rather than reworded.
                showToast(d.note || `Cleared ${d.cleared ?? 0} message(s)`, "success");
                await fetchConversations();
                return;
            }

            if (action === "delete") {
                const d = await callApi(convoPath, { method: "DELETE", credentials: "include" });
                // Adopt the server's own state: the flags and the preferences are
                // what the delete actually removed.
                patchConvo(username, {
                    pinned: false, archived: false, muted: false, preferences: { ...PREFS_DEFAULT },
                });
                showToast(d.note || "Removed from your lists", "success");
                await fetchConversations();
                return;
            }

            if (action === "export") {
                const format = extra.format;
                const res = await fetch(
                    `${convoPath}/export?format=${encodeURIComponent(format)}`,
                    { credentials: "include" },
                );
                if (!res.ok) {
                    const payload = await res.json().catch(() => ({}));
                    const e = new Error(payload.error || `Export failed (HTTP ${res.status})`);
                    e.payload = payload;
                    throw e;
                }
                // Streamed to a file rather than parsed: a 5000-message export
                // must never become React state.
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                const stamp = new Date().toISOString().slice(0, 10);
                a.href = url;
                a.download = `conversation-${key}-${stamp}.${extra.ext || format}`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
                showToast(`Export downloaded (${format.toUpperCase()})`, "success");
                return;
            }

            if (action === "block") {
                // The path segment is the VIEWER and the target comes from the
                // body; the route refuses to edit anyone else's block list.
                const d = await callApi(`/api/users/${encodeURIComponent(user.username)}/block`, {
                    method: "POST",
                    headers: JSON_HEADERS,
                    credentials: "include",
                    body: JSON.stringify({ target: username }),
                });
                const blocked = (d.blockedUsers || []).some((u) => lower(u) === key);
                if (blocked) {
                    // A blocked conversation is dropped from the list by the
                    // server, so the row cannot be kept locally.
                    setConversations(prev => prev.filter((c) => lower(c.username) !== key));
                }
                showToast(blocked ? `Blocked @${username}` : `Unblocked @${username}`, "success");
                if (selectedConvo && lower(selectedConvo.username) === key) handleBack();
                await fetchConversations();
                return;
            }

            if (action === "report") {
                // There is no "message" target type: the reports route accepts
                // post | comment | user | profile, and anything else is silently
                // stored as a post. The conversation context therefore has to
                // travel in `details`.
                const convo = conversations.find((c) => lower(c.username) === key);
                const last = convo?.lastMessage;
                const details = [
                    `Reported from the inbox conversation with @${username}.`,
                    convo ? `Unread on screen: ${unreadOf(convo)}.` : null,
                    last?.text ? `Last message: "${String(last.text).slice(0, 300)}"` : last ? "Last message: media only." : "No messages loaded.",
                    last?.timeStamp ? `Last message at ${new Date(last.timeStamp).toISOString()}.` : null,
                ].filter(Boolean).join(" ").slice(0, 2000);
                const d = await callApi("/api/reports", {
                    method: "POST",
                    headers: JSON_HEADERS,
                    credentials: "include",
                    body: JSON.stringify({
                        targetType: "user",
                        targetId: username,
                        reason: String(extra.reason || "Other").slice(0, 120),
                        details,
                    }),
                });
                showToast(d.duplicate ? "Already reported in the last 24h" : "Report sent to the moderators", "success");
                return;
            }

            throw new Error(`Unsupported action "${action}"`);
        } finally {
            setBusyRow(null);
        }
    }, [user, patchConvo, showToast, fetchConversations, conversations, unreadOf, selectedConvo, handleBack]);

    /* ── Derived list ─────────────────────────────────────────────────────── */

    const hasSearch = searchQuery.trim().length > 0;
    const filtersActive = filters.filter((id) => id !== "groups");

    /**
     * View, then search, then chips — in that order, and all of it derived.
     * The view filter is applied client-side as well as server-side: `?view=` is
     * the efficient half, this is the half that cannot go stale.
     */
    const visibleRows = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return conversations.filter((c) => {
            if (listView === "active" && c.archived) return false;
            if (listView === "archived" && !c.archived) return false;
            if (listView === "muted" && !c.muted) return false;
            // The label is searched too: renaming a conversation to something
            // memorable and then not being able to find it is the failure mode
            // of a local alias.
            if (q && !lower(c.username).includes(q) && !lower(prefsOf(c).nickname).includes(q)) return false;
            if (unreadOnly && unreadOf(c) < 1) return false;
            if (mediaOnly && !media.peers?.has(lower(c.username))) return false;
            if (starredOnly && !starred.peers?.has(lower(c.username))) return false;
            return true;
        });
    }, [conversations, listView, searchQuery, unreadOnly, mediaOnly, starredOnly, media.peers, starred.peers, unreadOf]);

    /**
     * Pinned threads are pulled into their own section rather than sorted into
     * the top of the list: a pin and a sort order are different things, and
     * letting a comparator decide between them meant "Sorted by name" quietly
     * unpinned everything.
     */
    const sections = useMemo(() => {
        const byTime = (a, b) => stampOf(b) - stampOf(a);
        const cmp = sort === "unread"
            ? (a, b) => (unreadOf(b) - unreadOf(a)) || byTime(a, b)
            : sort === "name"
                ? (a, b) => labelOf(a).localeCompare(labelOf(b), undefined, { sensitivity: "base" }) || byTime(a, b)
                : byTime;
        const pinnedRows = visibleRows.filter(isPinnedRow).sort(cmp);
        const rest = visibleRows.filter((c) => !isPinnedRow(c));
        return {
            pinned: pinnedRows,
            unread: rest.filter((c) => unreadOf(c) > 0).sort(cmp),
            quiet: rest.filter((c) => unreadOf(c) < 1).sort(cmp),
        };
    }, [visibleRows, sort, unreadOf]);

    const unreadInView = useMemo(
        () => visibleRows.filter((c) => unreadOf(c) > 0),
        [visibleRows, unreadOf],
    );
    const unreadMessages = useMemo(
        () => unreadInView.reduce((n, c) => n + unreadOf(c), 0),
        [unreadInView, unreadOf],
    );

    const filteredGroups = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return groups;
        return groups.filter(g => (
            lower(g.name).includes(q)
            || g.members?.some(m => lower(m.username).includes(q))
        ));
    }, [groups, searchQuery]);

    const sortedGroups = useMemo(() => {
        const list = [...filteredGroups];
        if (sort === "name") {
            list.sort((a, b) => lower(a.name).localeCompare(lower(b.name), undefined, { sensitivity: "base" }));
        } else {
            list.sort((a, b) => (
                new Date(b?.lastMessage?.timeStamp || 0).getTime() - new Date(a?.lastMessage?.timeStamp || 0).getTime()
            ));
        }
        return list;
    }, [filteredGroups, sort]);

    const hasDraftFor = useCallback(
        (username) => !!drafts.scopes?.has(lower(username)),
        [drafts.scopes],
    );
    const hasGroupDraft = useCallback(
        (groupId) => !!drafts.scopes?.has(`group:${groupId}`),
        [drafts.scopes],
    );

    /**
     * "Mark all read" is two-step. It is reversible, but it is a bulk write
     * across every unread thread in the current view and one tap on a phone in
     * a hurry should not do it silently.
     */
    useEffect(() => {
        if (!armAllRead) return;
        const id = setTimeout(() => setArmAllRead(false), 5000);
        return () => clearTimeout(id);
    }, [armAllRead]);

    const markAllRead = useCallback(async () => {
        const targets = unreadInView;
        if (targets.length === 0) {
            showToast("Nothing unread in this view", "info");
            return;
        }
        setArmAllRead(false);
        setBusyRow("markAllRead");
        try {
            // One call per unread thread. `PATCH /api/messages/read-all` reads
            // `?sender=` as the OTHER party, so a single call with no sender
            // would mark the messages YOU sent, and one with `sender=<me>` would
            // ask for messages sent to you by you and match none at all.
            const results = await Promise.allSettled(
                targets.map((c) => callApi(`/api/messages/read-all?sender=${encodeURIComponent(c.username)}`, {
                    method: "PATCH", credentials: "include",
                })),
            );
            const failed = results.filter((r) => r.status === "rejected");
            if (failed.length === 0) {
                targets.forEach((c) => patchConvo(c.username, { unreadCount: 0 }));
                showToast(`Marked ${targets.length} conversation${targets.length === 1 ? "" : "s"} as read`, "success");
            } else {
                showToast(
                    `${targets.length - failed.length} marked, ${failed.length} failed — ${errText(failed[0].reason)}`,
                    "error",
                );
            }
            await fetchConversations();
        } finally {
            setBusyRow(null);
        }
    }, [unreadInView, showToast, patchConvo, fetchConversations]);

    /* ── Row rendering ────────────────────────────────────────────────────── */

    if (!ready) {
        // Same formula as the loaded tree below: LayoutWrapper reserves a flat
        // `pb-16` for the bottom nav on mobile, so a bare `h-dvh` here made the
        // document `100dvh + 64px` tall and the page rubber-banded while the
        // session was still being resolved.
        //
        // After every hook, not before them: a conditional return above a hook
        // makes the hook order depend on the session and React will throw.
        return (
            <div className="flex h-[calc(100dvh-4rem)] lg:h-dvh items-center justify-center bg-white dark:bg-gray-950">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    const renderConvoRow = (convo) => {
        const prefs = prefsOf(convo);
        const nickname = String(prefs.nickname || "");
        const label = nickname || convo.username;
        const unread = unreadOf(convo);
        const isOpen = openMenu?.username === convo.username;
        const silent = convo.muted || prefs.notify === "off";
        return (
            // Wrapper, not the button itself: the row has to carry a second
            // control, and a <button> inside a <button> is invalid and breaks
            // keyboard activation of the row.
            <div
                key={convo.username}
                className={`relative flex items-stretch transition-colors ${
                    activeConvo?.username === convo.username
                        ? "bg-gray-100 dark:bg-gray-800"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                }`}
            >
                <button
                    onClick={() => handleSelectConvo(convo)}
                    className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-1 py-3.5 text-left active:bg-gray-100 dark:active:bg-gray-700 rounded-none"
                >
                    {convo.user?.avatarUrl ? (
                        <img src={convo.user.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
                    ) : (
                        <div
                            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl select-none shrink-0"
                            style={{ backgroundColor: convo.user?.color || "#3b82f6" }}
                        >
                            {(nickname || convo.username)?.[0]?.toUpperCase() ?? "?"}
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        {/* Every UserBadges child is `shrink-0`, so in a
                            no-wrap row the badges could not absorb
                            pressure and the name took all of it. The badges
                            themselves are dropped on the narrowest screens,
                            and where they do render they are capped, so the
                            name keeps a readable floor. */}
                        <div className="flex items-center gap-1.5 min-w-0">
                            {isPinnedRow(convo) && (
                                <span role="img" className="shrink-0 text-blue-500" title="Pinned" aria-label="Pinned">
                                    <PinIcon />
                                </span>
                            )}
                            <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate min-w-0 max-w-[55%] sm:max-w-none">
                                {label}
                            </p>
                            {nickname && (
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate min-w-0">@{convo.username}</span>
                            )}
                            <span className="hidden min-[360px]:flex items-center gap-1.5 shrink min-w-0 overflow-hidden">
                                <UserBadges isPro={convo.user?.isPro} isVerified={convo.user?.isVerified} isAdmin={convo.user?.isAdmin} roles={convo.user?.roles || []} size="sm" />
                                <OnlineDot username={convo.username} onlineMap={onlineMap} />
                            </span>
                            {hasDraftFor(convo.username) && (
                                <span
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[9px] font-bold shrink-0"
                                    title="You have an unsent draft in this conversation"
                                >
                                    <DraftIcon /> Draft
                                </span>
                            )}
                            {silent && (
                                <span
                                    role="img"
                                    className="shrink-0 text-gray-400 dark:text-gray-500"
                                    title={convo.muted ? "Muted conversation" : "Notifications are off for this conversation"}
                                    aria-label={convo.muted ? "Muted" : "Notifications off"}
                                >
                                    <BellSlashIcon />
                                </span>
                            )}
                            {prefs.excludeFromBadge === true && (
                                <span
                                    role="img"
                                    className="shrink-0 text-gray-400 dark:text-gray-500"
                                    title="Hidden from the unread badge"
                                    aria-label="Hidden from unread badge"
                                >
                                    <EyeOffIcon />
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                            {convo.lastMessage?.sender === user?.username ? "You: " : ""}
                            {convo.lastMessage?.audioUrl && !convo.lastMessage?.text ? "\uD83C\uDFA4 Voice message" : convo.lastMessage?.imageUrl && !convo.lastMessage?.text ? "\uD83D\uDCF7 Photo" : convo.lastMessage?.text?.slice(0, 30) || "Message"} · {timeAgo(convo.lastMessage?.timeStamp)}
                        </p>
                    </div>
                </button>

                <div className="flex items-center gap-0.5 pr-1.5 shrink-0">
                    {unread > 0 && (
                        <span className="bg-blue-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                            {unread > 9 ? "9+" : unread}
                        </span>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); openRowMenu(e, convo.username, "rename"); }}
                        aria-label={`Rename conversation with ${convo.username}`}
                        title={nickname ? `Renamed to ${nickname}` : "Rename this conversation"}
                        className="min-w-10 min-h-10 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <PencilIcon />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); openRowMenu(e, convo.username); }}
                        aria-label={`Options for the conversation with ${convo.username}`}
                        aria-haspopup="menu"
                        aria-expanded={isOpen}
                        title="Conversation options"
                        className="min-w-10 min-h-11 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <EllipsisIcon />
                    </button>
                </div>

                {isOpen && (
                    <>
                        {/* Scrim: every outside tap lands here instead of the row
                            underneath, so dismissing the menu never also opens
                            the thread behind it. `pointerdown`, not click, so a
                            fast tap-then-tap does not slip a click through. */}
                        <button
                            type="button"
                            className="fixed inset-0 z-40 cursor-default"
                            aria-hidden="true"
                            tabIndex={-1}
                            onPointerDown={closeMenu}
                        />
                        <RowMenu
                            key={`${convo.username}|${openMenu.stage}`}
                            username={convo.username}
                            prefs={prefs}
                            flags={{ pinned: isPinnedRow(convo), archived: !!convo.archived, muted: !!convo.muted }}
                            initialStage={openMenu.stage}
                            busy={busyRow && busyRow.endsWith(`:${convo.username}`)
                                ? busyRow.slice(0, busyRow.length - convo.username.length - 1)
                                : ""}
                            onRun={runOption}
                            onClose={closeMenu}
                            panelRef={menuPanelRef}
                            style={menuBox ? {
                                left: menuBox.left,
                                top: menuBox.top,
                                bottom: menuBox.bottom,
                                width: menuBox.width,
                                maxHeight: menuBox.maxHeight,
                            } : undefined}
                        />
                    </>
                )}
            </div>
        );
    };

    /* ── Empty states: one per view/filter combination, never a blank list ── */

    const derivedPending = (starredOnly && starred.peers === null && !starred.error)
        || (mediaOnly && media.peers === null && !media.error);
    const derivedError = starredOnly ? starred.error : mediaOnly ? media.error : "";
    const derivedLabel = starredOnly ? "starred" : "media";

    const dmEmpty = derivedPending ? (
        <EmptyState icon={<ChatBubbleIcon />} title={`Looking for ${derivedLabel} conversations…`}>
            Asking the server which of your threads contain {derivedLabel}.
        </EmptyState>
    ) : hasSearch ? (
        <EmptyState
            icon={<ChatBubbleIcon />}
            title="No matching conversations"
            action={(
                <button onClick={() => setSearchQuery("")} className={`${BTN_GHOST} mt-3`}>Clear the search</button>
            )}
        >
            Nothing in the {VIEWS.find((v) => v.id === listView)?.label.toLowerCase()} view matches
            &ldquo;{searchQuery.trim()}&rdquo;. Archived and muted threads are separate views — check those too.
        </EmptyState>
    ) : filtersActive.length > 0 ? (
        <EmptyState
            icon={<ChatBubbleIcon />}
            title="No conversations match these filters"
            action={(
                <button onClick={() => setFilters([])} className={`${BTN_GHOST} mt-3`}>
                    Clear filters
                </button>
            )}
        >
            {unreadInView.length > 0
                ? `A filter is hiding ${unreadInView.length} unread conversation${unreadInView.length === 1 ? "" : "s"} that ${unreadInView.length === 1 ? "is" : "are"} in this view.`
                : "Nothing in this view matches the active filters."}
        </EmptyState>
    ) : listView === "archived" ? (
        <EmptyState icon={<ChatBubbleIcon />} title="Nothing archived">
            Archived conversations collect here. They keep receiving messages, and unarchiving one puts it straight back in
            your Inbox.
        </EmptyState>
    ) : listView === "muted" ? (
        <EmptyState icon={<ChatBubbleIcon />} title="No muted conversations">
            Muting stops a conversation counting towards your unread badge. It is not a block: messages still arrive, and
            the thread stays in your Inbox.
        </EmptyState>
    ) : (
        <EmptyState icon={<ChatBubbleIcon />} title="No conversations yet">
            Open someone&apos;s profile and send them a message, and the thread will appear here.
        </EmptyState>
    );

    const unreadHeader = (
        <SectionHeader
            right={(
                <button
                    onClick={markAllRead}
                    onBlur={() => setArmAllRead(false)}
                    disabled={busyRow === "markAllRead"}
                    aria-label={armAllRead ? "Confirm: mark every unread conversation as read" : "Mark every unread conversation as read"}
                    className={`shrink-0 min-h-10 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                        armAllRead
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : "text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    }`}
                >
                    {busyRow === "markAllRead" ? "Working…" : armAllRead ? "Tap again to confirm" : "Mark all read"}
                </button>
            )}
        >
            {`Unread (${unreadMessages})`}
        </SectionHeader>
    );

    return (
        // The bottom nav is `h-16` PLUS `.safe-bottom` padding, so on a phone
        // with a home indicator it is taller than a flat 4rem. Reserving only
        // `4rem` left the bottom `env(safe-area-inset-bottom)` pixels of the
        // conversation list underneath the nav, and because that list is the
        // page's scroll container there was no way to scroll its last row clear.
        <div className="flex h-[calc(100dvh-4rem-env(safe-area-inset-bottom,0px))] lg:h-dvh bg-white dark:bg-gray-950 overflow-hidden">
            {/* `safe-top` for the status bar in standalone PWA mode — the page has
                no header of its own, so this column is what sat under the clock. It
                goes here rather than on the header row below because `.safe-top` is
                an unlayered rule and would override that row's own `py-4`. */}
            <aside className={`
                flex flex-col shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950
                w-full md:w-80 xl:w-96 safe-top
                ${view === "chat" ? "hidden md:flex" : "flex"}
            `}>
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
                    <span className="font-semibold text-base tracking-tight text-gray-900 dark:text-gray-100">Inbox</span>
                    <div className="flex items-center gap-1">
                        {/* Starting a conversation, not just answering one. This is
                            the entry point for the invite flow, and it lives on the
                            DM tab because "add a person" is a DM action; the group
                            tab keeps its own compose button. It is always present
                            rather than hidden on an empty list, so the feature is
                            discoverable on a brand-new account that has no threads
                            to show yet. */}
                        {tab === "dm" && !user?.needsSetup && (
                            <button
                                onClick={() => setShowInvite(true)}
                                className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                                aria-label="Add people"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h16.5v15H3.75zM3.75 9.75h16.5M8.25 14.25h3" />
                                </svg>
                            </button>
                        )}
                        {tab === "groups" && (
                            <button
                                onClick={() => setShowCreateGroup(true)}
                                className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                                aria-label="Create group"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                            </button>
                        )}
                        <button
                            onClick={openSidebar}
                            aria-label="Open menu"
                            className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-800">
                    <button
                        onClick={() => { setTab("dm"); setFilters((f) => f.filter((x) => x !== "groups")); }}
                        className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                            tab === "dm"
                                ? "text-gray-900 dark:text-gray-100 border-b-2 border-gray-900 dark:border-gray-100"
                                : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                        }`}
                    >
                        Messages
                        {badgeTotal > 0 && <span className="ml-1 text-gray-400">({badgeTotal})</span>}
                    </button>
                    <button
                        onClick={() => { setTab("groups"); setFilters((f) => f.filter((x) => x !== "groups")); }}
                        className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                            tab === "groups"
                                ? "text-gray-900 dark:text-gray-100 border-b-2 border-gray-900 dark:border-gray-100"
                                : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                        }`}
                    >
                        Groups {groups.length > 0 && <span className="ml-1 text-gray-400">({groups.length})</span>}
                    </button>
                </div>

                {/* Search */}
                <div className="px-4 pt-3">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={tab === "dm" ? "Search messages and people..." : "Search groups..."}
                        aria-label={tab === "dm" ? "Search messages and people" : "Search groups"}
                        className="w-full bg-gray-100 dark:bg-gray-800 rounded-full px-4 py-2 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none min-h-10"
                    />
                </div>

                {/* View switcher + sort. The view is per-conversation state that
                    only exists for DMs, so it is not offered on the Groups tab;
                    the sort applies to both. */}
                <div className="px-4 pt-2.5 space-y-2">
                    {tab === "dm" && (
                        // A `group` of toggles rather than a tablist: there is no
                        // tab panel to point `aria-controls` at (the same column
                        // also holds the search hits), and a tablist without
                        // arrow-key handling is a keyboard trap rather than an
                        // improvement.
                        <div role="group" aria-label="Conversation view" className="flex p-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                            {VIEWS.map((v) => (
                                <button
                                    key={v.id}
                                    type="button"
                                    aria-pressed={listView === v.id}
                                    onClick={() => { setListView(v.id); closeMenu(); }}
                                    className={`flex-1 min-h-10 px-1 rounded-full text-[11px] font-bold transition-colors ${
                                        listView === v.id
                                            ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm"
                                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                    }`}
                                >
                                    {v.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {tab === "dm" && (
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter conversations">
                            {FILTERS.map((f) => {
                                const on = filters.includes(f.id);
                                return (
                                    <button
                                        key={f.id}
                                        aria-pressed={on}
                                        title={f.id === "groups" ? "Show your group chats instead" : undefined}
                                        onClick={() => {
                                            closeMenu();
                                            if (f.id === "groups") {
                                                // Not a data filter: there are no group
                                                // rows on this tab, so it switches tab
                                                // and drops the DM-only chips.
                                                setTab("groups");
                                                setFilters((prev) => prev.filter((x) => x !== "groups" && x !== "unread" && x !== "media" && x !== "starred"));
                                                return;
                                            }
                                            setFilters((prev) => (prev.includes(f.id) ? prev.filter((x) => x !== f.id) : [...prev, f.id]));
                                        }}
                                        className={`min-h-10 px-2.5 rounded-full text-[11px] font-semibold border transition-colors ${
                                            on
                                                ? "border-black dark:border-gray-100 bg-black dark:bg-gray-100 text-white dark:text-gray-900"
                                                : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-2 min-w-0">
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate min-w-0">
                            {tab === "dm"
                                ? `${visibleRows.length} of ${conversations.length} conversation${conversations.length === 1 ? "" : "s"}`
                                : `${sortedGroups.length} of ${groups.length} group${groups.length === 1 ? "" : "s"}`}
                            {drafts.count >= 50 && tab === "dm" ? " · draft chips cover the 50 newest" : ""}
                        </p>
                        <label className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Sort</span>
                            <select
                                value={sort}
                                onChange={(e) => { setSort(e.target.value); closeMenu(); }}
                                aria-label={tab === "dm" ? "Sort conversations" : "Sort groups"}
                                className="min-h-10 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-gray-100"
                            >
                                {SORTS.map((s) => (
                                    <option key={s.id} value={s.id}>{s.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {tab === "dm" && filtersActive.length > 0 && (
                        <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate min-w-0">
                                Filtering by {filtersActive.map((id) => FILTERS.find((f) => f.id === id)?.label).join(", ")}
                            </p>
                            <button
                                onClick={() => setFilters([])}
                                className="shrink-0 min-h-10 px-2 text-[10px] font-bold uppercase tracking-wide text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
                            >
                                Clear
                            </button>
                        </div>
                    )}

                    {listError && (
                        <p className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-2.5 py-2 text-[11px] text-red-700 dark:text-red-300 break-words">
                            {listError}
                        </p>
                    )}
                    {derivedError && (
                        <p className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2 text-[11px] text-amber-800 dark:text-amber-200 break-words">
                            Could not work out which conversations have {derivedLabel}: {derivedError}
                        </p>
                    )}
                    {starred.truncated && starredOnly && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
                            Showing the {starred.count} newest starred messages. A conversation whose only starred message is
                            older than that will not appear.
                        </p>
                    )}
                    {media.truncated && mediaOnly && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
                            {media.total} image messages exist; the {MEDIA_PAGES * MEDIA_PAGE_SIZE} newest were checked, so a
                            conversation whose only image is older may be missing from this filter.
                        </p>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Message-content hits from the server */}
                    {tab === "dm" && searchQuery.trim().length >= 2 && (
                        searchingMessages ? (
                            <p className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500">Searching messages...</p>
                        ) : messageHits.length > 0 ? (
                            <div className="pb-1">
                                <p className="px-4 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                    Messages
                                </p>
                                {messageHits.map(hit => (
                                    <button
                                        key={hit.id || hit._id}
                                        onClick={() => openSearchHit(hit)}
                                        className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-700 transition-colors text-left"
                                    >
                                        {hit.hasImage ? (
                                            <span className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-xs">📷</span>
                                        ) : hit.hasAudio ? (
                                            <span className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-xs">🎤</span>
                                        ) : (
                                            <span className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">
                                                {hit.with?.[0]}
                                            </span>
                                        )}
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-2">
                                                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{hit.with}</span>
                                                <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{timeAgo(hit.timeStamp)}</span>
                                            </span>
                                            <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                                                {hit.text}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : hitState.failed ? (
                            <p className="px-4 py-2 text-xs text-red-600 dark:text-red-400">
                                Message search did not come back. The conversation list below is unaffected.
                            </p>
                        ) : null
                    )}

                    {loading ? (
                        <ConversationSkeleton />
                    ) : tab === "dm" ? (
                        visibleRows.length === 0 ? (
                            dmEmpty
                        ) : (
                            <>
                                {sections.pinned.length > 0 && (
                                    <>
                                        <SectionHeader>{`Pinned (${sections.pinned.length})`}</SectionHeader>
                                        {sections.pinned.map(renderConvoRow)}
                                    </>
                                )}
                                {sections.unread.length > 0 && (
                                    <>
                                        {unreadHeader}
                                        {sections.unread.map(renderConvoRow)}
                                    </>
                                )}
                                {sections.quiet.length > 0 && (
                                    <>
                                        {sections.unread.length > 0 && (
                                            <SectionHeader>
                                                {`${VIEWS.find((v) => v.id === listView)?.label} (${sections.quiet.length})`}
                                            </SectionHeader>
                                        )}
                                        {sections.quiet.map(renderConvoRow)}
                                    </>
                                )}
                            </>
                        )
                    ) : (
                        sortedGroups.length === 0 ? (
                            <EmptyState
                                icon={<GroupIcon />}
                                title={hasSearch ? "No matching groups" : "No groups yet"}
                                action={!hasSearch ? (
                                    <button onClick={() => setShowCreateGroup(true)} className={`${BTN_GHOST} mt-3`}>
                                        Create a group
                                    </button>
                                ) : (
                                    <button onClick={() => setSearchQuery("")} className={`${BTN_GHOST} mt-3`}>
                                        Clear the search
                                    </button>
                                )}
                            >
                                {hasSearch
                                    ? `Nothing in your groups matches “${searchQuery.trim()}”.`
                                    : "Group chats appear here once you create or are added to one."}
                            </EmptyState>
                        ) : (
                            sortedGroups.map(group => (
                                <button
                                    key={group._id}
                                    onClick={() => handleSelectGroup(group)}
                                    className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-700 transition-colors text-left ${
                                        selectedGroup?._id === group._id ? "bg-gray-100 dark:bg-gray-800" : ""
                                    }`}
                                >
                                    <div
                                        className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg select-none shrink-0"
                                        style={{ backgroundColor: group.members?.[0]?.color || "#3b82f6" }}
                                    >
                                        {group.avatarUrl ? (
                                            <img src={group.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                                        ) : (
                                            group.name?.[0]?.toUpperCase() ?? "G"
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{group.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                            {hasGroupDraft(group._id) && (
                                                <span className="inline-flex items-center gap-0.5 mr-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[9px] font-bold align-middle">
                                                    <DraftIcon /> Draft
                                                </span>
                                            )}
                                            {group.members?.length || 0} members
                                            {group.lastMessage?.text ? ` · ${group.lastMessage.sender}: ${group.lastMessage.text.slice(0, 25)}` : ""}
                                        </p>
                                    </div>
                                </button>
                            ))
                        )
                    )}
                </div>
            </aside>

            <main className={`
                flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-950
                ${view === "list" ? "hidden md:flex" : "flex"}
            `}>
                {selectedGroup ? (
                    <GroupChatBox
                        groupId={selectedGroup._id}
                        user={user}
                        group={selectedGroup}
                        onBack={handleBack}
                    />
                ) : (
                    <ChatBox
                        key={activeConvo?.username || "none"}
                        onBack={handleBack}
                        recipient={activeConvo?.username}
                        recipientUser={activeConvo?.user}
                        archived={!!activeConvo?.archived}
                        muted={!!activeConvo?.muted}
                        onConversationChange={(action) => {
                            // The header menu writes through
                            // PATCH /api/messages/conversation, so the flags are
                            // patched here for an instant flip. An archived chat
                            // now really does leave the list: the view filter is
                            // derived from these flags, and the Archived view
                            // still lists it, so nothing is unreachable.
                            setConversations(prev => prev.map(c => (
                                lower(c.username) === lower(activeConvo?.username)
                                    ? {
                                        ...c,
                                        archived: action === "archive" ? true
                                            : action === "unarchive" ? false : c.archived,
                                        muted: action === "mute" ? true
                                            : action === "unmute" ? false : c.muted,
                                    }
                                    : c
                            )));
                        }}
                    />
                )}
            </main>

            {showInvite && (
                <InviteSheet
                    onClose={() => setShowInvite(false)}
                    onScanned={(code) => {
                        // The sheet only ever hands back a code, never a URL, so
                        // there is nothing here that a hostile QR could point at.
                        // Going through the invite route means the landing page
                        // resolves the profile and writes the greeting, rather
                        // than this file growing its own second send path.
                        setShowInvite(false);
                        router.push(`/invite/${code}`);
                    }}
                />
            )}

            {showCreateGroup && (
                <CreateGroup
                    user={user}
                    onClose={() => setShowCreateGroup(false)}
                    onCreated={(group) => {
                        setGroups(prev => [group, ...prev]);
                        handleSelectGroup(group);
                    }}
                />
            )}
        </div>
    );
}
