"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useToast } from "@/context/ToastContext";

const CLOUDINARY_UPLOAD = `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export default function CreateGroup({ user, onClose, onCreated }) {
    const { showToast } = useToast();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [dmContacts, setDmContacts] = useState([]);
    const [contactSearch, setContactSearch] = useState("");
    const [loadingContacts, setLoadingContacts] = useState(true);
    const [creating, setCreating] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState("");
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/messages?username=${user.username}`);
                const data = await res.json();
                const contacts = (Array.isArray(data) ? data : []).map(c => ({
                    username: c.username,
                    avatarUrl: c.avatarUrl || "",
                    color: c.avatarColor || "#3b82f6",
                    lastMessage: c.lastMessage?.text || "",
                }));
                setDmContacts(contacts);
            } catch { /* silent */ }
            setLoadingContacts(false);
        })();
    }, [user.username]);

    const filteredContacts = dmContacts.filter(c =>
        c.username.toLowerCase().includes(contactSearch.toLowerCase()) &&
        c.username !== user.username &&
        !selectedMembers.find(m => m.username === c.username)
    );

    const handleAvatarUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showToast("Image must be under 5MB", "error");
            return;
        }
        setUploadingAvatar(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("upload_preset", UPLOAD_PRESET);
            const res = await fetch(CLOUDINARY_UPLOAD, { method: "POST", body: formData });
            const data = await res.json();
            if (data.secure_url) {
                setAvatarUrl(data.secure_url);
            } else {
                showToast("Upload failed", "error");
            }
        } catch {
            showToast("Upload failed", "error");
        }
        setUploadingAvatar(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const addMember = (member) => {
        setSelectedMembers(prev => [...prev, { username: member.username, avatarUrl: member.avatarUrl || "", color: member.color || "#3b82f6" }]);
        setContactSearch("");
    };

    const removeMember = (username) => {
        setSelectedMembers(prev => prev.filter(m => m.username !== username));
    };

    const handleCreate = async () => {
        if (!name.trim() || creating) return;
        setCreating(true);
        try {
            const res = await fetch("/api/groups", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim(),
                    creator: user.username,
                    members: selectedMembers.map(m => m.username),
                    avatarUrl,
                }),
            });
            if (res.ok) {
                const group = await res.json();
                showToast("Group created!", "success");
                onCreated?.(group);
                onClose();
            } else {
                const d = await res.json();
                showToast(d.error || "Failed to create group", "error");
            }
        } catch {
            showToast("Network error", "error");
        } finally { setCreating(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-gray-950 rounded-2xl w-full max-w-md mx-4 shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100">New Group</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1" aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Group Avatar */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="relative w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                        >
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Group" className="w-full h-full object-cover" />
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-400">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                            )}
                            {uploadingAvatar && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                        <div className="text-xs text-gray-400 dark:text-gray-500">Tap to upload group photo<br />(max 5MB)</div>
                    </div>

                    {/* Group Name */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Group Name *</label>
                        <input
                            type="text" value={name} onChange={e => setName(e.target.value.slice(0, 50))}
                            placeholder="e.g. Weekend Plans"
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                        />
                        <span className="text-[11px] text-gray-400 mt-1 block text-right">{name.length}/50</span>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Description</label>
                        <textarea
                            value={description} onChange={e => setDescription(e.target.value.slice(0, 200))}
                            placeholder="What's this group about?"
                            rows={2}
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors resize-none"
                        />
                    </div>

                    {/* Add Members from DM contacts */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Add from your chats</label>
                        <input
                            type="text" value={contactSearch} onChange={e => setContactSearch(e.target.value)}
                            placeholder="Filter your conversations..."
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                        />
                        {loadingContacts ? (
                            <p className="text-xs text-gray-400 mt-2">Loading your chats...</p>
                        ) : (
                            <div className="mt-2 max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                                {filteredContacts.length === 0 ? (
                                    <p className="text-xs text-gray-400 p-3 text-center">
                                        {dmContacts.length === 0 ? "No conversations yet" : "No matching contacts"}
                                    </p>
                                ) : (
                                    filteredContacts.map(c => (
                                        <button
                                            key={c.username}
                                            onClick={() => addMember(c)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                                        >
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white overflow-hidden shrink-0"
                                                style={{ backgroundColor: c.color }}>
                                                {c.avatarUrl ? <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" /> : c.username[0]?.toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-sm text-gray-900 dark:text-gray-100 block">{c.username}</span>
                                                {c.lastMessage && <span className="text-[11px] text-gray-400 truncate block">{c.lastMessage}</span>}
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Selected Members */}
                    {selectedMembers.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {selectedMembers.map(m => (
                                <span key={m.username} className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-1 rounded-full">
                                    {m.username}
                                    <button onClick={() => removeMember(m.username)} className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200" aria-label={`Remove ${m.username}`}>
                                        &#x2715;
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800">
                    <button
                        onClick={handleCreate}
                        disabled={!name.trim() || creating}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                    >
                        {creating ? "Creating..." : "Create Group"}
                    </button>
                </div>
            </div>
        </div>
    );
}
