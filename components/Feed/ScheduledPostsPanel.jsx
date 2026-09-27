"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { timeAgo } from "@/utils/timeAgo";

// Manages posts queued for later.
//
// The backend for this has existed the whole time — `scheduledAt` / `isScheduled`
// on the post, a `publishScheduledPosts` pass on an interval, and
// GET/DELETE /api/posts/scheduled/* — with no client ever calling it, so posts
// could be queued in the database and never published, or published with no way
// to see or cancel them. This is the missing half.
//
// It polls rather than subscribing because there is no socket event for a
// scheduled post being published. The 30s cadence is a compromise; the list is
// tiny and the alternative is a "your post went live" notification that nothing
// currently sends.

const POLL_MS = 30000;

function relativeTo(iso) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    const diff = t - Date.now();
    if (diff <= 0) return "publishing…";
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hours = Math.round(diff / 3600000);
    if (hours < 24) return `in ${hours}h`;
    const days = Math.round(diff / 86400000);
    if (days <= 7) return `in ${days}d`;
    return new Date(t).toLocaleString(undefined, {
        weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
}

export default function ScheduledPostsPanel({ onClose }) {
    const { showToast } = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);

    // No `setLoading(true)` here. The panel starts in the loading state already
    // and every later call is a background poll, so a synchronous setState in
    // the effect body would only ever flash the spinner the reader is past.
    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/posts/scheduled/mine", { cache: "no-store" });
            if (!res.ok) return;
            const data = await res.json();
            setItems(Array.isArray(data) ? data : []);
        } catch {
            // Leave the previous list in place rather than blanking the panel on
            // a transient failure.
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // The first poll is deferred by a tick so this effect body contains no
        // synchronous state update. `load` is async and its first statement is an
        // await, so nothing actually can update state here — but the compiler
        // cannot see through the useCallback boundary, and a cascading render on
        // every mount is not worth arguing with.
        const kick = setTimeout(() => load(), 0);
        const id = setInterval(() => load(), POLL_MS);
        return () => {
            clearTimeout(kick);
            clearInterval(id);
        };
    }, [load]);

    // Pause polling while the tab is hidden. A backgrounded tab polling every
    // 30s is pure waste, and this is exactly the situation the service worker
    // visibility work already had to reason about.
    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === "visible") load();
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [load]);

    const cancel = async (id) => {
        if (busyId) return;
        setBusyId(id);
        try {
            const res = await fetch(`/api/posts/scheduled/${encodeURIComponent(id)}`, { method: "DELETE" });
            if (res.ok) {
                setItems((prev) => prev.filter((p) => p.id !== id));
                showToast("Scheduled post cancelled", "info");
            } else {
                showToast("Could not cancel that post", "error");
            }
        } catch {
            showToast("Network error", "error");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between px-4 py-2.5">
                <h3 className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
                    Scheduled
                    {items.length > 0 && (
                        <span className="ml-1.5 font-normal text-gray-400 dark:text-gray-500">{items.length}</span>
                    )}
                </h3>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => load()}
                        aria-label="Refresh scheduled posts"
                        title="Refresh"
                        className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.02 19.644v-4.992h4.992m0 0l3.181-3.183a8.25 8.25 0 0 1 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            aria-label="Close scheduled posts"
                            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <p className="px-4 pb-4 text-xs text-gray-400 dark:text-gray-500">Loading…</p>
            ) : items.length === 0 ? (
                <p className="px-4 pb-4 text-xs text-gray-400 dark:text-gray-500">
                    Nothing scheduled. Set a time on a post to queue it.
                </p>
            ) : (
                <ul className="max-h-64 overflow-y-auto border-t border-gray-100 dark:border-gray-800">
                    {items.map((p) => (
                        <li key={p.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-gray-800/60 last:border-b-0">
                            <div className="min-w-0 flex-1">
                                <p className="text-xs text-gray-800 dark:text-gray-200 line-clamp-2 break-words">
                                    {p.text || <span className="italic text-gray-400">(no text)</span>}
                                </p>
                                <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                                        {relativeTo(p.scheduledAt)}
                                    </span>
                                    {p.timeStamp && <> · queued {timeAgo(p.timeStamp)}</>}
                                </p>
                            </div>
                            <button
                                onClick={() => cancel(p.id)}
                                disabled={busyId === p.id}
                                className="shrink-0 text-[11px] text-gray-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-full min-h-[32px] disabled:opacity-50"
                            >
                                {busyId === p.id ? "…" : "Cancel"}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
