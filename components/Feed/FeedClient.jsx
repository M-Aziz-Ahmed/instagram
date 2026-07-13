"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Compose from "./Compose";
import Feed from "./Feed";
import TrendingTags from "./TrendingTags";
import SearchBar from "./SearchBar";
import NotificationBell from "@/components/Notifications/NotificationBell";
import Sidebar from "@/components/Layout/Sidebar";
import Link from "next/link";

export default function FeedClient() {
    const { user, ready, logout } = useUser();
    const router                  = useRouter();
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [activeTag, setActiveTag]           = useState(null);
    const [sidebarOpen, setSidebarOpen]       = useState(false);

    const [skipRedirect, setSkipRedirect] = useState(false);

    useEffect(() => {
        if (ready && !user && !skipRedirect) {
            setSkipRedirect(true);
            router.replace("/login");
        }
    }, [ready, user, skipRedirect, router]);

    if (!ready || !user || skipRedirect) {
        return (
            <div className="flex h-dvh items-center justify-center">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (user.needsSetup) {
        router.replace("/login");
        return (
            <div className="flex h-dvh items-center justify-center">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
        );
    }

    const handleHashtag = (tag) => {
        setActiveTag(tag);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleAuthError = useCallback(() => {
        logout();
        router.replace("/login");
    }, [logout, router]);

    return (
        <div className="min-h-dvh bg-white lg:pl-72">
            {/* ── Top nav ──────────────────────────────────────────────── */}
            <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200 safe-top">
                <div className="max-w-4xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            aria-label="Open menu"
                            className="p-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setActiveTag(null)}
                            className="font-black text-lg sm:text-xl tracking-tight text-gray-900 hover:opacity-70 transition-opacity shrink-0"
                        >
                            {activeTag
                                ? <span className="text-blue-600">#{activeTag}</span>
                                : "AnonFeed"}
                        </button>
                    </div>

                    <div className="hidden sm:block flex-1 max-w-xs">
                        <SearchBar />
                    </div>

                    <div className="flex items-center gap-0.5 sm:gap-1">
                        <div className="sm:hidden">
                            <SearchBar />
                        </div>
                        <NotificationBell />

                        <Link
                            href={`/profile/${encodeURIComponent(user.username)}`}
                            className="flex items-center gap-2 hover:bg-gray-100 px-2 sm:px-3 py-2 rounded-full transition-colors min-h-[44px]"
                        >
                            <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs select-none"
                                style={{ backgroundColor: user.avatarColor }}
                            >
                                {user.username?.[0]?.toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-gray-700 hidden lg:block">
                                {user.username}
                            </span>
                        </Link>
                    </div>
                </div>
            </header>

            {/* ── Body ─────────────────────────────────────────────────── */}
            <div className="max-w-4xl mx-auto flex gap-4 lg:gap-8 px-3 sm:px-4">
                <main className="flex-1 min-w-0 border-x border-gray-100">
                    <Compose onPosted={() => setRefreshTrigger((n) => n + 1)} />
                    <Feed
                        refreshTrigger={refreshTrigger}
                        activeTag={activeTag}
                        onHashtag={handleHashtag}
                        onAuthError={handleAuthError}
                    />
                </main>
                <TrendingTags activeTag={activeTag} onTagClick={handleHashtag} />
            </div>

            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </div>
    );
}
