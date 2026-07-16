"use client";

import { useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export default function EditProfileModal({ onClose }) {
    const { user, reloadUser, AVATAR_COLORS } = useUser();
    const { showToast } = useToast();
    const [bio, setBio]             = useState(user?.bio ?? "");
    const [color, setColor]         = useState(user?.avatarColor ?? AVATAR_COLORS[0]);
    const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
    const [lang, setLang]           = useState(user?.language ?? "en");
    const [saving, setSaving]       = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError]         = useState("");
    const fileRef                   = useRef(null);

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

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const res = await fetch("/api/auth/profile", {
                method:  "PATCH",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ bio: bio.trim(), avatarColor: color, avatarUrl, language: lang }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            await reloadUser();
            showToast("Profile updated", "success");
            onClose();
        } catch {
            setError("Something went wrong.");
        } finally {
            setSaving(false);
        }
    };

    const displayColor = avatarUrl ? "#3b82f6" : color;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm p-6 flex flex-col gap-5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100">Edit profile</h2>
                        <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Avatar preview + upload */}
                <div className="flex items-center gap-4">
                    <div className="relative shrink-0">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt={user?.username}
                                className="w-14 h-14 rounded-full object-cover border-2 border-gray-100 dark:border-gray-800" />
                        ) : (
                            <div
                                className="w-14 h-14 rounded-full flex items-center justify-center text-white font-black text-xl select-none"
                                style={{ backgroundColor: color }}
                            >
                                {user?.username?.[0]?.toUpperCase()}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            title="Change photo"
                            aria-label="Change profile photo"
                            className="absolute inset-0 rounded-full bg-black/35 flex items-center justify-center transition-opacity disabled:cursor-wait opacity-100 sm:opacity-0 sm:hover:opacity-100"
                        >
                            {uploading
                                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                                  </svg>}
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    </div>
                    <div>
                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{user?.username}</p>
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="text-xs text-blue-500 hover:underline mt-0.5"
                        >
                            {uploading ? "Uploading\u2026" : "Change profile photo"}
                        </button>
                        {avatarUrl && (
                            <button
                                type="button"
                                onClick={() => setAvatarUrl("")}
                                className="block text-xs text-red-400 hover:underline mt-0.5"
                            >
                                Remove photo
                            </button>
                        )}
                    </div>
                </div>

                <form onSubmit={handleSave} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Bio</label>
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Tell us about yourself\u2026"
                            maxLength={160}
                            rows={3}
                            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-3 text-sm outline-none focus:border-black dark:focus:border-gray-500 transition-colors resize-none"
                        />
                        <p className="text-right text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{bio.length}/160</p>
                    </div>

                    {!avatarUrl && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Avatar color</label>
                            <div className="flex gap-2 flex-wrap">
                                {AVATAR_COLORS.map((c) => (
                                    <button key={c} type="button" onClick={() => setColor(c)}
                                        className="w-10 h-10 rounded-full hover:scale-110 transition-transform"
                                        aria-label={`Color ${c}`}
                                        style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : "none" }} />
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Language</label>
                        <select
                            value={lang}
                            onChange={(e) => setLang(e.target.value)}
                            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-3 text-sm outline-none focus:border-black dark:focus:border-gray-500 transition-colors appearance-none cursor-pointer"
                        >
                            <option value="en">English</option>
                            <option value="es">Español</option>
                            <option value="fr">Français</option>
                            <option value="de">Deutsch</option>
                            <option value="pt">Português</option>
                            <option value="it">Italiano</option>
                            <option value="ja">日本語</option>
                            <option value="ko">한국어</option>
                            <option value="zh-CN">中文 (简体)</option>
                            <option value="zh-TW">中文 (繁體)</option>
                            <option value="ar">العربية</option>
                            <option value="hi">हिन्दी</option>
                            <option value="ru">Русский</option>
                            <option value="tr">Türkçe</option>
                            <option value="vi">Tiếng Việt</option>
                            <option value="th">ไทย</option>
                            <option value="pl">Polski</option>
                            <option value="nl">Nederlands</option>
                            <option value="sv">Svenska</option>
                            <option value="id">Bahasa Indonesia</option>
                            <option value="ms">Bahasa Melayu</option>
                            <option value="uk">Українська</option>
                            <option value="cs">Čeština</option>
                            <option value="ro">Română</option>
                            <option value="el">Ελληνικά</option>
                            <option value="he">עברית</option>
                            <option value="fi">Suomi</option>
                            <option value="no">Norsk</option>
                            <option value="da">Dansk</option>
                            <option value="hu">Magyar</option>
                        </select>
                    </div>

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <button type="submit" disabled={saving || uploading}
                        className="w-full bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold py-2.5 rounded-xl disabled:opacity-40 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors">
                        {saving ? "Saving\u2026" : "Save changes"}
                    </button>
                </form>
            </div>
        </div>
    );
}
