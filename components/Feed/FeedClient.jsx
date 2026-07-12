"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";
import Compose from "./Compose";
import Feed from "./Feed";
import ProfileSetup from "@/components/ProfileSetup";

export default function FeedClient() {
    const { user, ready } = useUser();
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [editingProfile, setEditingProfile] = useState(false);

    if (!ready) {
        return (
            <div className="flex h-dvh items-center justify-center">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (!user || editingProfile) {
        return <ProfileSetup onDone={() => setEditingProfile(false)} />;
    }

    return (
        <div className="min-h-dvh bg-white">
            {/* ── Top nav ──────────────────────────────────────────────── */}
            <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200">
                <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
                    {/* Logo */}
                    <span className="font-black text-xl tracking-tight text-gray-900">AnonFeed</span>

                    {/* Profile button */}
                    <button
                        onClick={() => setEditingProfile(true)}
                        aria-label="Edit profile"
                        className="flex items-center gap-2 hover:bg-gray-100 px-3 py-1.5 rounded-full transition-colors"
                    >
                        <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs select-none"
                            style={{ backgroundColor: user.color }}
                        >
                            {user.username?.[0]?.toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-gray-700 hidden sm:block">
                            {user.username}
                        </span>
                    </button>
                </div>
            </header>

            {/* ── Feed ─────────────────────────────────────────────────── */}
            <main className="max-w-xl mx-auto">
                <Compose onPosted={() => setRefreshTrigger((n) => n + 1)} />
                <Feed refreshTrigger={refreshTrigger} />
            </main>
        </div>
    );
}
