"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";

export default function SetupForm({ onDone }) {
    const { reloadUser, AVATAR_COLORS } = useUser();
    const [username, setUsername]       = useState("");
    const [bio, setBio]                 = useState("");
    const [color, setColor]             = useState(AVATAR_COLORS[0]);
    const [error, setError]             = useState("");
    const [saving, setSaving]           = useState(false);

    const initial = username.trim() ? username.trim()[0].toUpperCase() : "?";

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username.trim() || saving) return;
        setSaving(true);
        setError("");
        try {
            const res = await fetch("/api/auth/setup", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ username: username.trim(), bio: bio.trim(), avatarColor: color }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            await reloadUser();
            onDone?.();
        } catch {
            setError("Something went wrong.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full max-w-sm flex flex-col items-center gap-6">
            <div className="text-center">
                <h2 className="text-xl font-black text-gray-900">Create your profile</h2>
                <p className="text-sm text-gray-500 mt-1">Pick a username to get started</p>
            </div>

            {/* Avatar preview */}
            <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-black select-none transition-colors"
                style={{ backgroundColor: color }}
            >
                {initial}
            </div>

            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
                {/* Username */}
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        Username
                    </label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => { setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, "")); setError(""); }}
                            placeholder="yourname"
                            maxLength={30}
                            autoFocus
                            className="w-full border border-gray-300 rounded-xl pl-7 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-black transition-colors"
                        />
                    </div>
                </div>

                {/* Bio */}
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        Bio <span className="font-normal normal-case text-gray-400">(optional)</span>
                    </label>
                    <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Tell us a bit about yourself…"
                        maxLength={160}
                        rows={2}
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-black transition-colors resize-none"
                    />
                </div>

                {/* Color */}
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Avatar color
                    </label>
                    <div className="flex gap-2 flex-wrap">
                        {AVATAR_COLORS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setColor(c)}
                                className="w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none"
                                style={{
                                    backgroundColor: c,
                                    boxShadow: color === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : "none",
                                }}
                                aria-label={`Color ${c}`}
                            />
                        ))}
                    </div>
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}

                <button
                    type="submit"
                    disabled={!username.trim() || saving}
                    className="w-full bg-black text-white font-bold py-3 rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors"
                >
                    {saving ? "Saving…" : "Let's go →"}
                </button>
            </form>
        </div>
    );
}
