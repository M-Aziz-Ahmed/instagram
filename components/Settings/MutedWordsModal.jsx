"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";

export default function MutedWordsModal({ onClose }) {
    const { user } = useUser();
    const { showToast } = useToast();
    const [mutedWords, setMutedWords] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);

    const fetchMuted = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(user.username)}/muted-words`);
            if (res.ok) {
                const data = await res.json();
                setMutedWords(data.mutedWords || []);
            }
        } catch { /* silent */ }
        setLoading(false);
    }, [user]);

    useEffect(() => { fetchMuted(); }, [fetchMuted]);

    const addWord = async () => {
        const word = input.trim().toLowerCase().replace(/^#/, "");
        if (!word || mutedWords.includes(word)) return;
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(user.username)}/muted-words`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ word, action: "add" }),
            });
            if (res.ok) {
                const data = await res.json();
                setMutedWords(data.mutedWords);
                setInput("");
                showToast(`"${word}" muted`, "success");
            }
        } catch {
            showToast("Failed to mute word", "error");
        }
    };

    const removeWord = async (word) => {
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(user.username)}/muted-words`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ word, action: "remove" }),
            });
            if (res.ok) {
                const data = await res.json();
                setMutedWords(data.mutedWords);
                showToast(`"${word}" unmuted`, "success");
            }
        } catch {
            showToast("Failed to unmute word", "error");
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="font-bold text-base text-gray-900 dark:text-gray-100">Muted Words</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">
                        Done
                    </button>
                </div>

                <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Posts containing these words or hashtags won't appear in your feed.
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addWord()}
                            placeholder="Add a word or #hashtag"
                            className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <button
                            onClick={addWord}
                            disabled={!input.trim()}
                            className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
                        >
                            Add
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-3">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 rounded-full animate-spin" />
                        </div>
                    ) : mutedWords.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3 opacity-40">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                            </svg>
                            <p className="text-sm">No muted words</p>
                            <p className="text-xs mt-1">Add words or hashtags to filter your feed</p>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {mutedWords.map((word) => (
                                <span
                                    key={word}
                                    className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium px-3 py-1.5 rounded-full"
                                >
                                    {word.startsWith("#") ? word : `#${word}`}
                                    <button
                                        onClick={() => removeWord(word)}
                                        className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
                                    >
                                        &#x2715;
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
