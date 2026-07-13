"use client";

import { useRef, useState } from "react";
import { useUser } from "@/context/UserContext";

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export default function SetupForm({ onDone }) {
    const { reloadUser, AVATAR_COLORS } = useUser();
    const [username, setUsername]       = useState("");
    const [bio, setBio]                 = useState("");
    const [color, setColor]             = useState(AVATAR_COLORS[0]);
    const [avatarUrl, setAvatarUrl]     = useState("");
    const [uploading, setUploading]     = useState(false);
    const [error, setError]             = useState("");
    const [saving, setSaving]           = useState(false);
    const fileRef                       = useRef(null);

    const initial = username.trim() ? username.trim()[0].toUpperCase() : "?";

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { setError("Image must be under 10 MB"); return; }
        setUploading(true);
        setError("");
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("upload_preset", UPLOAD_PRESET);
            fd.append("folder", "anon-avatars");
            const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: fd });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error?.message ?? "Upload failed");
            setAvatarUrl(json.secure_url);
        } catch (err) {
            setError(err.message ?? "Upload failed.");
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username.trim() || saving) return;
        setSaving(true);
        setError("");
        try {
            const res = await fetch("/api/auth/setup", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ username: username.trim(), bio: bio.trim(), avatarColor: color, avatarUrl }),
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

            {/* Avatar preview + upload */}
            <div className="relative shrink-0">
                {avatarUrl ? (
                    <img src={avatarUrl} alt="Preview"
                        className="w-20 h-20 rounded-full object-cover border-2 border-gray-100" />
                ) : (
                    <div
                        className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-black select-none transition-colors"
                        style={{ backgroundColor: color }}
                    >
                        {initial}
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    title="Upload photo"
                    className="absolute inset-0 rounded-full bg-black/35 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity disabled:cursor-wait"
                >
                    {uploading
                        ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                          </svg>}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                {avatarUrl && (
                    <button
                        type="button"
                        onClick={() => setAvatarUrl("")}
                        className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-red-400 hover:underline whitespace-nowrap"
                    >
                        Remove photo
                    </button>
                )}
            </div>

            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4 mt-2">
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
                {!avatarUrl && (
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
                )}

                {error && <p className="text-xs text-red-500">{error}</p>}

                <button
                    type="submit"
                    disabled={!username.trim() || saving || uploading}
                    className="w-full bg-black text-white font-bold py-3 rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors"
                >
                    {saving ? "Saving…" : "Let's go →"}
                </button>
            </form>
        </div>
    );
}
