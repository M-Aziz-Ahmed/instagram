"use client";

import { useState, useCallback, useRef } from "react";
import { useToast } from "@/context/ToastContext";

const AVATAR_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"];

export default function CreateGroup({ user, onClose, onCreated }) {
    const { showToast } = useToast();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [avatarColor] = useState(() => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [creating, setCreating] = useState(false);
    const searchTimeout = useRef(null);

    const handleSearch = useCallback((query) => {
        setSearchQuery(query);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (!query.trim()) { setSearchResults([]); return; }
        searchTimeout.current = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await fetch(`/api/users/search?username=${encodeURIComponent(query.trim())}&limit=8`);
                const data = await res.json();
                const filtered = (data.users || []).filter(
                    u => u.username !== user.username && !selectedMembers.find(m => m.username === u.username)
                );
                setSearchResults(filtered);
            } catch { setSearchResults([]); }
            setSearching(false);
        }, 300);
    }, [user, selectedMembers]);

    const addMember = (member) => {
        setSelectedMembers(prev => [...prev, { username: member.username, avatarUrl: member.avatarUrl || "", color: member.avatarColor || "#3b82f6" }]);
        setSearchQuery(""); setSearchResults([]);
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
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100">New Group</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1" aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
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

                    {/* Add Members */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Add Members</label>
                        <input
                            type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)}
                            placeholder="Search by username..."
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                        />
                        {searching && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
                        {searchResults.length > 0 && (
                            <div className="mt-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                {searchResults.map(u => (
                                    <button
                                        key={u.username}
                                        onClick={() => addMember(u)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-white overflow-hidden shrink-0"
                                            style={{ backgroundColor: u.avatarColor || "#3b82f6" }}>
                                            {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" /> : u.username[0]?.toUpperCase()}
                                        </div>
                                        <span className="text-sm text-gray-900 dark:text-gray-100">{u.username}</span>
                                    </button>
                                ))}
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

                {/* Footer */}
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
