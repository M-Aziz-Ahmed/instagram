"use client";

import { useUser } from "@/context/UserContext";
import ChatBox from "./ChatBox";

export default function InboxClient() {
    const { user } = useUser();

    return (
        <div className="flex h-screen bg-white">
            {/* ── Sidebar ─────────────────────────────────────────── */}
            <aside className="w-80 border-r border-gray-200 flex flex-col shrink-0">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
                    <span className="font-semibold text-base tracking-tight">Messages</span>
                    <button aria-label="New message" className="text-gray-900 hover:text-gray-500 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="M16.862 3.487a2.25 2.25 0 1 1 3.182 3.182L7.5 19.213l-4.5 1.125 1.125-4.5L16.862 3.487z" />
                        </svg>
                    </button>
                </div>

                {/* Conversation list */}
                <div className="flex-1 overflow-y-auto">
                    <button className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                        {user ? (
                            <div
                                className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl select-none shrink-0"
                                style={{ backgroundColor: user.color }}
                            >
                                {user.username[0].toUpperCase()}
                            </div>
                        ) : (
                            <div className="w-14 h-14 rounded-full bg-gray-200 shrink-0" />
                        )}

                        <div className="flex-1 min-w-0 text-left">
                            <p className="font-medium text-sm text-gray-900 truncate">
                                {user?.username ?? "…"}
                            </p>
                            <p className="text-xs text-gray-500 truncate">You · Active now</p>
                        </div>

                        {/* Online dot */}
                        <span className="w-2.5 h-2.5 bg-green-400 rounded-full shrink-0" />
                    </button>
                </div>
            </aside>

            {/* ── Chat area ───────────────────────────────────────── */}
            <main className="flex-1 flex flex-col min-w-0">
                <ChatBox />
            </main>
        </div>
    );
}
