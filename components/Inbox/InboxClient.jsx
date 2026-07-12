"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";
import ChatBox from "./ChatBox";

// Back-arrow icon
function BackIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
            strokeWidth={2} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
    );
}

// Compose icon
function ComposeIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
            strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round"
                d="M16.862 3.487a2.25 2.25 0 1 1 3.182 3.182L7.5 19.213l-4.5 1.125 1.125-4.5L16.862 3.487z" />
        </svg>
    );
}

export default function InboxClient() {
    const { user } = useUser();
    // On mobile we show either "list" (sidebar) or "chat"
    const [view, setView] = useState("list");

    return (
        <div className="flex h-dvh bg-white overflow-hidden">

            {/* ── Sidebar ─────────────────────────────────────────────────────
                Desktop: always visible, fixed width
                Mobile:  full-screen, hidden when view === "chat"           */}
            <aside className={`
                flex flex-col shrink-0 border-r border-gray-200 bg-white
                w-full md:w-80
                ${view === "chat" ? "hidden md:flex" : "flex"}
            `}>
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                    <span className="font-semibold text-base tracking-tight">Messages</span>
                    <button aria-label="New message" className="text-gray-900 hover:text-gray-500 transition-colors p-1 -mr-1">
                        <ComposeIcon />
                    </button>
                </div>

                {/* Conversation list */}
                <div className="flex-1 overflow-y-auto">
                    {/* Tap the conversation to open chat on mobile */}
                    <button
                        onClick={() => setView("chat")}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                    >
                        {/* Avatar */}
                        {user ? (
                            <div
                                className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl select-none shrink-0"
                                style={{ backgroundColor: user.color }}
                            >
                                {user.username[0].toUpperCase()}
                            </div>
                        ) : (
                            <div className="w-14 h-14 rounded-full bg-gray-200 shrink-0 animate-pulse" />
                        )}

                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gray-900 truncate">
                                {user?.username ?? "…"}
                            </p>
                            <p className="text-xs text-gray-500 truncate mt-0.5">You · Active now</p>
                        </div>

                        <span className="w-2.5 h-2.5 bg-green-400 rounded-full shrink-0" />
                    </button>
                </div>
            </aside>

            {/* ── Chat area ───────────────────────────────────────────────────
                Desktop: always visible, fills remaining space
                Mobile:  full-screen, only shown when view === "chat"       */}
            <main className={`
                flex-1 flex flex-col min-w-0 bg-white
                ${view === "list" ? "hidden md:flex" : "flex"}
            `}>
                <ChatBox onBack={() => setView("list")} />
            </main>
        </div>
    );
}
