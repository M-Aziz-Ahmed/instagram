"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";

export default function ProfileSetup({ onDone }) {
    const { user, reloadUser, AVATAR_COLORS } = useUser();
    const [username, setUsername] = useState(user?.username ?? "");
    const [color, setColor]       = useState(user?.color ?? AVATAR_COLORS[0]);
    const [error, setError]       = useState("");
    const [saving, setSaving]     = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username.trim()) { setError("Please enter a username."); return; }
        if (username.trim().length < 2) { setError("Username must be at least 2 characters."); return; }
        if (username.trim().length > 30) { setError("Username must be 30 characters or less."); return; }
        if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) { setError("Username can only contain letters, numbers and underscores."); return; }
        setSaving(true);
        setError("");
        try {
            const res = await fetch("/api/auth/setup", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: username.trim(), avatarColor: color }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || "Failed to save profile."); return; }
            await reloadUser(data.user);
            if (onDone) onDone();
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const initial = username.trim() ? username.trim()[0].toUpperCase() : "?";

    return (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-white dark:bg-gray-950 overflow-y-auto">
            <div className="w-full max-w-sm px-6 md:px-8 py-8 md:py-10 flex flex-col items-center gap-5 md:gap-6 min-h-full md:min-h-0 justify-center">

                <span className="font-black text-2xl tracking-tight text-gray-900 dark:text-gray-100">AnonTweet</span>

                <div className="text-center">
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Set up your profile</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">No account needed — just pick a name and color.</p>
                </div>

                <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold select-none transition-colors duration-200"
                    style={{ backgroundColor: color }}
                >
                    {initial}
                </div>

                <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
                    <div>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => { setUsername(e.target.value); setError(""); }}
                            placeholder="Username"
                            maxLength={30}
                            autoFocus
                            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-gray-500 dark:focus:border-gray-500 transition-colors"
                        />
                        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                    </div>

                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Avatar color</p>
                        <div className="flex gap-2 flex-wrap">
                            {AVATAR_COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className="w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none"
                                    style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 3px white, 0 0 0 5px ${c}, 0 0 0 3px var(--ring-color, transparent)` : "none" }}
                                    aria-label={`Pick color ${c}`}
                                />
                            ))}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                        {saving ? "Saving\u2026" : user ? "Save changes" : "Start chatting"}
                    </button>

                    {onDone && (
                        <button
                            type="button"
                            onClick={onDone}
                            className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors py-1"
                        >
                            Cancel
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
}
