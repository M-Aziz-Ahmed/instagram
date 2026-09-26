"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { useSidebar } from "@/context/SidebarContext";
import BookmarksPanel from "@/components/Feed/BookmarksPanel";
import MediaBookmarksPanel from "@/components/MediaBookmarks/MediaBookmarksPanel";

const TABS = [
    { id: "posts", label: "Posts" },
    { id: "media", label: "Anime & Manga" },
];

/**
 * One home for everything the viewer saved.
 *
 * `/bookmarks` (saved posts) and `/library` (saved anime/manga) used to be two
 * separate pages with their own headers, filters and empty states, which made
 * "where did I save that?" a guessing game. Both are now tabs here, and the old
 * routes redirect into the matching tab.
 */
export default function SavedClient({ initialTab = "posts" }) {
    const { user, ready } = useUser();
    const { openSidebar } = useSidebar();
    const [tab, setTab] = useState(TABS.some((t) => t.id === initialTab) ? initialTab : "posts");

    // Keep the address bar in step so the tab survives a reload and can be
    // linked to. `replaceState` avoids stacking a history entry per switch.
    useEffect(() => {
        const url = new URL(window.location.href);
        if (url.searchParams.get("tab") !== tab) {
            url.searchParams.set("tab", tab);
            window.history.replaceState(null, "", url);
        }
    }, [tab]);

    if (!ready) {
        return (
            <div className="min-h-dvh app-bg flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-[var(--brand-500)] rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="min-h-dvh app-bg">
                <Header onMenu={openSidebar} title="Saved" />
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500 select-none px-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3 opacity-40">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                    </svg>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Sign in to see what you saved
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                        Saved posts, anime and manga all live here
                    </p>
                    <Link href="/login" className="btn-primary px-5 py-2.5 text-xs font-bold">
                        Sign In
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-dvh app-bg">
            <Header onMenu={openSidebar} title="Saved" />

            <div className="sticky top-14 z-10 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-2xl mx-auto px-4">
                    <div className="flex gap-2 overflow-x-auto py-2.5">
                        {TABS.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                aria-current={tab === t.id ? "page" : undefined}
                                className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                                    tab === t.id
                                        ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <main className="max-w-2xl mx-auto px-4 py-6">
                {tab === "posts" ? <BookmarksPanel /> : <MediaBookmarksPanel />}
            </main>
        </div>
    );
}

function Header({ onMenu, title }) {
    return (
        <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
            <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
                <button
                    onClick={onMenu}
                    aria-label="Open menu"
                    className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                </button>
                <span className="font-bold text-base text-gray-900 dark:text-gray-100">{title}</span>
            </div>
        </header>
    );
}
