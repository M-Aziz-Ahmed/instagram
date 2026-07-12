"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Compose from "./Compose";
import Feed from "./Feed";
import TrendingTags from "./TrendingTags";
import NotificationBell from "@/components/Notifications/NotificationBell";
import EditProfileModal from "@/components/Auth/EditProfileModal";
import Link from "next/link";

export default function FeedClient() {
    const { user, ready, logout } = useUser();
    const router                  = useRouter();
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [activeTag, setActiveTag]           = useState(null);
    const [editingProfile, setEditingProfile] = useState(false);

    useEffect(() => {
        if (ready && !user) router.replace("/login");
    }, [user, ready, router]);

    if (!ready || !user) {
        return (
            <div className="flex h-dvh items-center justify-center">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (user.needsSetup) {
        router.replace("/login");
        return null;
    }

    const handleHashtag = (tag) => {
        setActiveTag(tag);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleLogout = async () => {
        await logout();
        router.replace("/login");
    };

    return (
        <div className="min-h-dvh bg-white">
            {/* ── Top nav ──────────────────────────────────────────────── */}
            <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
                <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
                    <button
                        onClick={() => setActiveTag(null)}
                        className="font-black text-xl tracking-tight text-gray-900 hover:opacity-70 transition-opacity"
                    >
                        {activeTag
                            ? <span className="text-blue-600">#{activeTag}</span>
                            : "AnonFeed"}
                    </button>

                    <div className="flex items-center gap-1">
                        <NotificationBell />

                        {/* Avatar → profile page */}
                        <Link
                            href={`/profile/${encodeURIComponent(user.username)}`}
                            className="flex items-center gap-2 hover:bg-gray-100 px-3 py-1.5 rounded-full transition-colors"
                        >
                            <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs select-none"
                                style={{ backgroundColor: user.avatarColor }}
                            >
                                {user.username?.[0]?.toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-gray-700 hidden sm:block">
                                {user.username}
                            </span>
                        </Link>

                        {/* Edit profile */}
                        <button
                            onClick={() => setEditingProfile(true)}
                            aria-label="Edit profile"
                            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round"
                                    d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0zM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                            </svg>
                        </button>

                        {/* Log out */}
                        <button
                            onClick={handleLogout}
                            aria-label="Log out"
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round"
                                    d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Body ─────────────────────────────────────────────────── */}
            <div className="max-w-4xl mx-auto flex gap-8 px-4">
                <main className="flex-1 min-w-0 border-x border-gray-100">
                    <Compose onPosted={() => setRefreshTrigger((n) => n + 1)} />
                    <Feed
                        refreshTrigger={refreshTrigger}
                        activeTag={activeTag}
                        onHashtag={handleHashtag}
                    />
                </main>
                <TrendingTags activeTag={activeTag} onTagClick={handleHashtag} />
            </div>

            {/* Edit profile modal */}
            {editingProfile && (
                <EditProfileModal onClose={() => setEditingProfile(false)} />
            )}
        </div>
    );
}
