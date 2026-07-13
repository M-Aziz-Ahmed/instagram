"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";

export default function Input({ onMessageSent, recipient }) {
    const { user } = useUser();
    const [text, setText]       = useState("");
    const [sending, setSending] = useState(false);

    const handleSend = async () => {
        if (!text.trim() || sending || !user || !recipient) return;

        const snapshot = text.trim();
        setText("");
        setSending(true);

        try {
            await fetch("/api/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: snapshot, sender: user.username, recipient, color: user.color }),
            });
            if (onMessageSent) onMessageSent();
        } catch (err) {
            console.error("Failed to send:", err);
            setText(snapshot);
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const hasText = text.trim().length > 0;

    return (
        <div className="flex items-center gap-2">
            <button aria-label="Emoji" className="shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition-colors p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                    strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round"
                        d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
                </svg>
            </button>

            <div className="flex-1 flex items-center border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-full px-4 py-2.5 focus-within:border-gray-400 dark:focus-within:border-gray-500 transition-colors min-h-[44px]">
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={recipient ? "Message\u2026" : "Select a conversation\u2026"}
                    disabled={!user || !recipient}
                    className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none disabled:cursor-not-allowed"
                />
                {!hasText && (
                    <button aria-label="Voice message" className="shrink-0 ml-2 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3z" />
                        </svg>
                    </button>
                )}
            </div>

            {hasText ? (
                <button
                    onClick={handleSend}
                    disabled={sending}
                    aria-label="Send"
                    className="shrink-0 text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 transition-colors font-semibold text-sm"
                >
                    {sending
                        ? <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        : "Send"
                    }
                </button>
            ) : (
                <button aria-label="Like" className="shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition-colors p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                        strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round"
                            d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375z" />
                    </svg>
                </button>
            )}
        </div>
    );
}
