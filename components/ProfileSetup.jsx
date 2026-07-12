"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";

export default function ProfileSetup({ onDone }) {
    const { user, saveUser, AVATAR_COLORS } = useUser();
    const [username, setUsername] = useState(user?.username ?? "");
    const [color, setColor]       = useState(user?.color ?? AVATAR_COLORS[0]);
    const [error, setError]       = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!username.trim()) { setError("Please enter a username."); return; }
        if (username.trim().length < 2) { setError("Username must be at least 2 characters."); return; }
        saveUser(username, color);
        if (onDone) onDone();
    };

    const initial = username.trim() ? username.trim()[0].toUpperCase() : "?";

    return (
        /* Full-screen overlay — scrollable on short/small screens */
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-white overflow-y-auto">
            <div className="w-full max-w-sm px-6 md:px-8 py-8 md:py-10 flex flex-col items-center gap-5 md:gap-6 min-h-full md:min-h-0 justify-center">

                {/* Logo */}
                <svg viewBox="0 0 24 24" fill="none" className="w-12 h-12 text-gray-900" stroke="currentColor" strokeWidth={1.5}>
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                    <circle cx="12" cy="12" r="4.5"/>
                    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
                </svg>

                <div className="text-center">
                    <h1 className="text-xl font-semibold text-gray-900">Set up your profile</h1>
                    <p className="text-sm text-gray-500 mt-1">No account needed — just pick a name and color.</p>
                </div>

                {/* Avatar preview */}
                <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold select-none transition-colors duration-200"
                    style={{ backgroundColor: color }}
                >
                    {initial}
                </div>

                <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
                    {/* Username input */}
                    <div>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => { setUsername(e.target.value); setError(""); }}
                            placeholder="Username"
                            maxLength={30}
                            autoFocus
                            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-500 transition-colors"
                        />
                        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                    </div>

                    {/* Color picker */}
                    <div>
                        <p className="text-xs text-gray-500 mb-2">Avatar color</p>
                        <div className="flex gap-2 flex-wrap">
                            {AVATAR_COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className="w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none"
                                    style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : "none" }}
                                    aria-label={`Pick color ${c}`}
                                />
                            ))}
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
                    >
                        {user ? "Save changes" : "Start chatting"}
                    </button>

                    {onDone && (
                        <button
                            type="button"
                            onClick={onDone}
                            className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors py-1"
                        >
                            Cancel
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
}
