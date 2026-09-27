"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import UserBadges from "@/components/shared/UserBadges";

// Who reacted to a post or comment.
//
// The data needed this already existed and was already on the client: reactions
// are plain username arrays on the post, the feed projection includes them, and
// ReactionCounts was handing the full array to its click handler as
// `reaction.users`. Nothing used it — the handler was a `console.log`. So this
// needs no endpoint, no request, and no second source of truth for "who liked
// this"; it renders what the post document already carried.
//
// One entry point for both surfaces. Posts group by reaction (who 🔥'd it,
// who ❤️'d it); a comment has one small set per reaction, so it renders the same
// grouping.
//
// Escape-to-close and the body scroll lock follow ImageLightbox, which is the
// only dialog in the codebase that got both right. The other four copies of this
// dialog each handle Escape and none lock the body behind them.

const REACTION_META = {
    like:  { emoji: "👍", label: "Like" },
    love:  { emoji: "❤️", label: "Love" },
    laugh: { emoji: "😂", label: "Laugh" },
    fire:  { emoji: "🔥", label: "Fire" },
    sad:   { emoji: "😢", label: "Sad" },
    angry: { emoji: "😠", label: "Angry" },
};

function Row({ username }) {
    return (
        <li>
            <Link
                href={`/profile/${encodeURIComponent(username)}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
                <span className="shrink-0 w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-200 flex items-center justify-center text-xs font-bold select-none">
                    {username?.[0]?.toUpperCase() || "?"}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {username}
                </span>
            </Link>
        </li>
    );
}

export default function ReactionListModal({ reactions, onClose, title = "Reactions" }) {
    // `null` means "no explicit choice yet", which resolves to the first
    // populated group below. Deriving `active` rather than storing it means the
    // tab survives the reaction counts changing underneath it without an effect
    // to re-validate it.
    const [tab, setTab] = useState(null);

    // Only the reaction types actually present, in a stable order, so the tab
    // strip does not reshuffle between renders as counts change.
    const groups = useMemo(() => {
        if (!reactions) return [];
        return Object.keys(REACTION_META)
            .map((type) => ({
                type,
                ...REACTION_META[type],
                users: Array.isArray(reactions[type]) ? reactions[type] : [],
            }))
            .filter((g) => g.users.length > 0);
    }, [reactions]);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onClose?.();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        // The page behind must not scroll under the sheet. Restored on unmount,
        // and only if we were the ones who locked it.
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [onClose]);

    const active = groups.find((g) => g.type === tab) || groups[0];
    const total = groups.reduce((n, g) => n + g.users.length, 0);

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div
                className="w-full sm:max-w-md max-h-[85dvh] sm:max-h-[80dvh] bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden shadow-xl animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {title}
                        {total > 0 && (
                            <span className="ml-1.5 font-normal text-gray-400 dark:text-gray-500">{total}</span>
                        )}
                    </h2>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {groups.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                        No reactions yet
                    </p>
                ) : (
                    <>
                        {groups.length > 1 && (
                            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide px-3 py-2 border-b border-gray-100 dark:border-gray-800" role="tablist">
                                {groups.map((g) => (
                                    <button
                                        key={g.type}
                                        role="tab"
                                        aria-selected={g.type === active?.type}
                                        onClick={() => setTab(g.type)}
                                        className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors min-h-[32px] ${
                                            g.type === active?.type
                                                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                                                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        }`}
                                    >
                                        <span aria-hidden="true">{g.emoji}</span>
                                        {g.users.length}
                                    </button>
                                ))}
                            </div>
                        )}
                        <ul className="overflow-y-auto flex-1 divide-y divide-gray-50 dark:divide-gray-800">
                            {(active?.users || []).map((u) => (
                                <Row key={u} username={u} />
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </div>
    );
}

export { REACTION_META };
