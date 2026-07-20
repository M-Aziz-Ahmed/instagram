"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Compose from "./Compose";
import Feed from "./Feed";
import TrendingTags from "./TrendingTags";
import SearchBar from "./SearchBar";
import NotificationBell from "@/components/Notifications/NotificationBell";
import { useSidebar } from "@/context/SidebarContext";
import Link from "next/link";
import StoryTray from "@/components/Stories/StoryTray";

export default function FeedClient() {
    const { user, ready, logout } = useUser();
    const router                  = useRouter();
    const { openSidebar }         = useSidebar();
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [activeTag, setActiveTag]           = useState(null);
    const [feedType, setFeedType]             = useState("all");
    const [searchQuery, setSearchQuery]       = useState(null);

    const isGuest = ready && !user;

    const handleAuthError = useCallback(() => {
        logout();
        router.replace("/login");
    }, [logout, router]);

    if (!ready) {
        return (
            <div className="flex h-dvh items-center justify-center bg-white dark:bg-gray-950">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    const handleHashtag = (tag) => {
        setActiveTag(tag);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const hasFollowing = user?.following?.length > 0;

    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950">
            {/* ── Top nav ──────────────────────────────────────────────── */}
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-4xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={openSidebar}
                            aria-label="Open menu"
                            className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setActiveTag(null)}
                            className="font-black text-lg sm:text-xl tracking-tight text-gray-900 dark:text-gray-100 hover:opacity-70 transition-opacity shrink-0"
                        >
                            {activeTag
                                ? <span className="text-blue-600">#{activeTag}</span>
                                : "AnonTweet"}
                        </button>
                    </div>

                    <div className="hidden sm:block flex-1 max-w-xs">
                        <SearchBar onSearch={setSearchQuery} searchQuery={searchQuery} onClearSearch={() => setSearchQuery(null)} />
                    </div>

                    <div className="flex items-center gap-0.5 sm:gap-1">
                        <div className="sm:hidden">
                            <SearchBar onSearch={setSearchQuery} searchQuery={searchQuery} onClearSearch={() => setSearchQuery(null)} />
                        </div>
                        {isGuest ? (
                            <Link
                                href="/login"
                                className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-full transition-colors min-h-[44px] flex items-center"
                            >
                                Sign In
                            </Link>
                        ) : (
                            <>
                                <NotificationBell />
                                <Link
                                    href={`/profile/${encodeURIComponent(user?.username || "")}`}
                                    className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 px-2 sm:px-3 py-2 rounded-full transition-colors min-h-[44px]"
                                >
                                    <div
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs select-none"
                                        style={{ backgroundColor: user?.avatarColor || "#3b82f6" }}
                                    >
                                        {user?.username?.[0]?.toUpperCase() || "?"}
                                    </div>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden lg:block">
                                        {user?.username || ""}
                                    </span>
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Guest sign-in banner ───────────────────────────────── */}
            {isGuest && (
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border-b border-blue-100 dark:border-blue-900/30">
                    <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Welcome to AnonTweet</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Sign in to like, comment, post & follow</p>
                            </div>
                        </div>
                        <Link
                            href="/login"
                            className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold px-5 py-2 rounded-full transition-colors shrink-0"
                        >
                            Sign In
                        </Link>
                    </div>
                </div>
            )}

            {/* ── Feed tabs ──────────────────────────────────────────────── */}
            {!searchQuery && (
                <div className="max-w-4xl mx-auto px-3 sm:px-4">
                    <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
                        <button
                            onClick={() => setFeedType("all")}
                            className={`flex-1 py-3 text-sm font-semibold transition-colors relative ${
                                feedType === "all"
                                    ? "text-gray-900 dark:text-gray-100"
                                    : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                            }`}
                        >
                            {isGuest ? "Trending" : "All"}
                            {feedType === "all" && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-gray-100 rounded-full" />
                            )}
                        </button>
                        {hasFollowing && (
                            <button
                                onClick={() => setFeedType("following")}
                                className={`flex-1 py-3 text-sm font-semibold transition-colors relative ${
                                    feedType === "following"
                                        ? "text-gray-900 dark:text-gray-100"
                                        : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                                }`}
                            >
                                For You
                                {feedType === "following" && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-gray-100 rounded-full" />
                                )}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Body ─────────────────────────────────────────────────── */}
            <div className="max-w-4xl mx-auto flex gap-4 lg:gap-8 px-3 sm:px-4">
                <main className="flex-1 min-w-0 border-x border-gray-100 dark:border-gray-800">
                    {!isGuest && <StoryTray />}
                    {!searchQuery && !isGuest && <Compose onPosted={() => setRefreshTrigger((n) => n + 1)} />}
                    <Feed
                        refreshTrigger={refreshTrigger}
                        activeTag={activeTag}
                        onHashtag={handleHashtag}
                        onAuthError={handleAuthError}
                        feedType={feedType}
                        username={user?.username || ""}
                        searchQuery={searchQuery}
                        onClearSearch={() => setSearchQuery(null)}
                        isGuest={isGuest}
                    />
                </main>
                <TrendingTags activeTag={activeTag} onTagClick={handleHashtag} />
            </div>
        </div>
    );
}
