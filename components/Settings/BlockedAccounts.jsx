"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";

/**
 * Manage muted and blocked accounts.
 *
 * Blocking is enforced server-side (live-server/lib/visibility.js), so this
 * screen is the only way to *undo* it — which is why it has to exist and be
 * reachable. Muting and blocking both live on the same two arrays, so they are
 * shown together to make it obvious that the stricter action wins.
 */
export default function BlockedAccounts({ mutedWords, onClose, embedded = false }) {
    const { user } = useUser();
    const viewer = user?.username ?? "";
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (!viewer) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await fetch(
                    `/api/users/${encodeURIComponent(viewer)}/blocks`,
                    { credentials: "include" }
                );
                if (!res.ok) throw new Error("Could not load your lists");
                const body = await res.json();
                if (!cancelled) setData(body);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [viewer]);

    const undo = async (action, target) => {
        if (!viewer) return;
        setBusy(`${action}:${target}`);
        setError("");
        try {
            const res = await fetch(
                `/api/users/${encodeURIComponent(viewer)}/${action}`,
                {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ target }),
                }
            );
            if (!res.ok) throw new Error("That didn't work, try again");
            setData((prev) => {
                if (!prev) return prev;
                const key = action === "block" ? "blockedUsers" : "mutedUsers";
                return {
                    ...prev,
                    [key]: (prev[key] || []).filter(
                        (u) => u.toLowerCase() !== target.toLowerCase()
                    ),
                };
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy("");
        }
    };

    const blocked = data?.blockedUsers || [];
    const muted = data?.mutedUsers || [];

    const body = (
        <div className={embedded ? "" : "min-h-dvh bg-gray-50 dark:bg-gray-950"}>
            {!embedded && (
                <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                    <div className="max-w-2xl mx-auto px-4 h-12 sm:h-14 flex items-center gap-3">
                        <Link
                            href="/me"
                            aria-label="Back"
                            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                            </svg>
                        </Link>
                        <span className="font-bold text-base text-gray-900 dark:text-gray-100 flex-1">Muted &amp; blocked</span>
                    </div>
                </header>
            )}

            <main className={embedded ? "" : "max-w-2xl mx-auto px-4 py-4"}>
                {error && (
                    <p className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2.5">
                        {error}
                    </p>
                )}

                {loading ? (
                    <div className="space-y-2">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-14 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <>
                        <section className="mb-6">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1 mb-2">
                                Blocked · {blocked.length}
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 px-1 mb-2.5">
                                You won&apos;t see their posts or replies, and they can&apos;t message you.
                            </p>
                            {blocked.length === 0 ? (
                                <p className="px-1 text-sm text-gray-500 dark:text-gray-400">No blocked accounts.</p>
                            ) : (
                                <ul className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                                    {blocked.map((u) => (
                                        <Row
                                            key={`b-${u}`}
                                            username={u}
                                            action="block"
                                            label="Unblock"
                                            busy={busy === `block:${u}`}
                                            onUndo={() => undo("block", u)}
                                        />
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className="mb-6">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1 mb-2">
                                Muted · {muted.length}
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 px-1 mb-2.5">
                                Hidden from your feed, search and suggestions. You can still message them.
                            </p>
                            {muted.length === 0 ? (
                                <p className="px-1 text-sm text-gray-500 dark:text-gray-400">No muted accounts.</p>
                            ) : (
                                <ul className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                                    {muted.map((u) => (
                                        <Row
                                            key={`m-${u}`}
                                            username={u}
                                            action="mute"
                                            label="Unmute"
                                            busy={busy === `mute:${u}`}
                                            onUndo={() => undo("mute", u)}
                                        />
                                    ))}
                                </ul>
                            )}
                        </section>

                        {mutedWords > 0 && (
                            <p className="px-1 text-xs text-gray-500 dark:text-gray-400">
                                You also have {mutedWords} muted {mutedWords === 1 ? "word" : "words"} that hide posts by keyword.
                            </p>
                        )}
                    </>
                )}
            </main>
        </div>
    );

    if (embedded) return body;
    return body;
}

function Row({ username, label, busy, onUndo }) {
    return (
        <li className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
            <Link
                href={`/profile/${encodeURIComponent(username)}`}
                className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100 truncate hover:underline"
            >
                @{username}
            </Link>
            <button
                onClick={onUndo}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 min-h-[36px] shrink-0"
            >
                {busy ? "…" : label}
            </button>
        </li>
    );
}
