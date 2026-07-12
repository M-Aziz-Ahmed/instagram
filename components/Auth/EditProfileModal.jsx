"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";

export default function EditProfileModal({ onClose }) {
    const { user, reloadUser, AVATAR_COLORS } = useUser();
    const [bio, setBio]         = useState(user?.bio ?? "");
    const [color, setColor]     = useState(user?.avatarColor ?? AVATAR_COLORS[0]);
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState("");

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const res = await fetch("/api/auth/profile", {
                method:  "PATCH",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ bio: bio.trim(), avatarColor: color }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            await reloadUser();
            onClose();
        } catch {
            setError("Something went wrong.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-lg">Edit profile</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Avatar preview */}
                <div className="flex items-center gap-4">
                    <div
                        className="w-14 h-14 rounded-full flex items-center justify-center text-white font-black text-xl select-none"
                        style={{ backgroundColor: color }}
                    >
                        {user?.username?.[0]?.toUpperCase()}
                    </div>
                    <div>
                        <p className="font-semibold text-sm">{user?.username}</p>
                        <p className="text-xs text-gray-400">{user?.email}</p>
                    </div>
                </div>

                <form onSubmit={handleSave} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Bio</label>
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Tell us about yourself…"
                            maxLength={160}
                            rows={3}
                            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-black transition-colors resize-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Avatar color</label>
                        <div className="flex gap-2 flex-wrap">
                            {AVATAR_COLORS.map((c) => (
                                <button key={c} type="button" onClick={() => setColor(c)}
                                    className="w-8 h-8 rounded-full hover:scale-110 transition-transform"
                                    style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : "none" }} />
                            ))}
                        </div>
                    </div>

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <button type="submit" disabled={saving}
                        className="w-full bg-black text-white font-bold py-2.5 rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors">
                        {saving ? "Saving…" : "Save changes"}
                    </button>
                </form>
            </div>
        </div>
    );
}
