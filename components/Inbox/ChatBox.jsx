"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";
import Chat from "./Chat";
import Input from "./Input";
import ProfileSetup from "@/components/ProfileSetup";

export default function ChatBox() {
    const { user, ready } = useUser();
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [editingProfile, setEditingProfile] = useState(false);

    // Wait for localStorage hydration
    if (!ready) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
        );
    }

    // Show profile setup if no user yet, or if user clicked "Edit profile"
    if (!user || editingProfile) {
        return <ProfileSetup onDone={() => setEditingProfile(false)} />;
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <header className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 shrink-0">
                <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base select-none shrink-0"
                    style={{ backgroundColor: user.color }}
                >
                    {user.username[0].toUpperCase()}
                </div>
                <div>
                    <p className="font-semibold text-sm text-gray-900">{user.username}</p>
                    <p className="text-xs text-green-500">You · Active now</p>
                </div>

                {/* Actions */}
                <div className="ml-auto flex items-center gap-3 text-gray-700">
                    {/* Edit profile */}
                    <button
                        onClick={() => setEditingProfile(true)}
                        aria-label="Edit profile"
                        title="Edit profile"
                        className="hover:text-gray-900 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0zM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                    </button>

                    {/* Video call */}
                    <button aria-label="Video call" className="hover:text-gray-900 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25z" />
                        </svg>
                    </button>

                    {/* Info */}
                    <button aria-label="Info" className="hover:text-gray-900 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9-3.75h.008v.008H12V8.25z" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
                <Chat refreshTrigger={refreshTrigger} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-gray-200 shrink-0">
                <Input onMessageSent={() => setRefreshTrigger((n) => n + 1)} />
            </div>
        </div>
    );
}
