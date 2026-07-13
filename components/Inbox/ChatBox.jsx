"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";
import Chat from "./Chat";
import Input from "./Input";
import ProfileSetup from "@/components/ProfileSetup";

export default function ChatBox({ onBack, recipient, recipientUser }) {
    const { user, ready } = useUser();
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [editingProfile, setEditingProfile] = useState(false);

    if (!ready) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    if (!user || editingProfile) {
        return <ProfileSetup onDone={() => setEditingProfile(false)} />;
    }

    return (
        <div className="flex flex-col h-full">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <header className="flex items-center gap-2 px-3 md:px-6 py-3 md:py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">

                {onBack && (
                    <button
                        onClick={onBack}
                        aria-label="Back"
                        className="md:hidden text-gray-800 dark:text-gray-200 hover:text-gray-600 dark:hover:text-gray-400 transition-colors p-2.5 -ml-1 shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                )}

                <div
                    className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white font-bold text-sm md:text-base select-none shrink-0"
                    style={{ backgroundColor: recipientUser?.color || "#3b82f6" }}
                >
                    {recipientUser?.avatarUrl ? (
                        <img src={recipientUser.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                        (recipient || user?.username)?.[0]?.toUpperCase() ?? "?"
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{recipient || user?.username}</p>
                </div>

                <div className="flex items-center gap-1 md:gap-2 text-gray-700 dark:text-gray-400 shrink-0">
                    <button
                        onClick={() => setEditingProfile(true)}
                        aria-label="Edit profile"
                        title="Edit profile"
                        className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0zM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                    </button>

                    <button aria-label="Video call" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25z" />
                        </svg>
                    </button>

                    <button aria-label="Info" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9-3.75h.008v.008H12V8.25z" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* ── Messages ────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-3 md:px-4 py-3 md:py-4">
                <Chat refreshTrigger={refreshTrigger} recipient={recipient} />
            </div>

            {/* ── Input ───────────────────────────────────────────────────── */}
            <div className="px-3 md:px-4 py-2.5 md:py-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
                <Input onMessageSent={() => setRefreshTrigger((n) => n + 1)} recipient={recipient} />
            </div>
        </div>
    );
}
