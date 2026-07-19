"use client";

import { useState, useRef, useEffect } from "react";
import { useToast } from "@/context/ToastContext";

const CLOUDINARY_UPLOAD = `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export default function GroupSettings({ group, user, onClose, onGroupUpdated, onLeave }) {
    const { showToast } = useToast();
    const isAdmin = group.members?.find(m => m.username === user.username)?.role === "admin";
    const isCreator = group.creator === user.username;

    const [name, setName] = useState(group.name || "");
    const [description, setDescription] = useState(group.description || "");
    const [avatarUrl, setAvatarUrl] = useState(group.avatarUrl || "");
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [saving, setSaving] = useState(false);
    const [addMemberQuery, setAddMemberQuery] = useState("");
    const [addMemberResults, setAddMemberResults] = useState([]);
    const [searchingMembers, setSearchingMembers] = useState(false);
    const fileInputRef = useRef(null);
    const searchTimeout = useRef(null);

    const [whoCanSend, setWhoCanSend] = useState(group.permissions?.whoCanSend || "all");
    const [whoCanAdd, setWhoCanAdd] = useState(group.permissions?.whoCanAdd || "all");

    const handleAvatarUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || file.size > 5 * 1024 * 1024) {
            if (file) showToast("Image must be under 5MB", "error");
            return;
        }
        setUploadingAvatar(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("upload_preset", UPLOAD_PRESET);
            const res = await fetch(CLOUDINARY_UPLOAD, { method: "POST", body: fd });
            const data = await res.json();
            if (data.secure_url) setAvatarUrl(data.secure_url);
            else showToast("Upload failed", "error");
        } catch { showToast("Upload failed", "error"); }
        setUploadingAvatar(false);
    };

    const handleSaveInfo = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/groups/${group._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, action: "updateInfo", name: name.trim(), description: description.trim(), avatarUrl }),
            });
            if (res.ok) {
                const updated = await res.json();
                showToast("Group updated", "success");
                onGroupUpdated?.(updated);
            } else {
                const d = await res.json();
                showToast(d.error || "Failed", "error");
            }
        } catch { showToast("Network error", "error"); }
        setSaving(false);
    };

    const handleSavePermissions = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/groups/${group._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, action: "updatePermissions", whoCanSend, whoCanAdd }),
            });
            if (res.ok) {
                const updated = await res.json();
                showToast("Permissions updated", "success");
                onGroupUpdated?.(updated);
            } else {
                const d = await res.json();
                showToast(d.error || "Failed", "error");
            }
        } catch { showToast("Network error", "error"); }
        setSaving(false);
    };

    const handleSearchMember = (query) => {
        setAddMemberQuery(query);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (!query.trim()) { setAddMemberResults([]); return; }
        searchTimeout.current = setTimeout(async () => {
            setSearchingMembers(true);
            try {
                const res = await fetch(`/api/users/search?username=${encodeURIComponent(query.trim())}&limit=8`);
                const data = await res.json();
                const filtered = (data.users || []).filter(
                    u => !group.members?.find(m => m.username === u.username)
                );
                setAddMemberResults(filtered);
            } catch { setAddMemberResults([]); }
            setSearchingMembers(false);
        }, 300);
    };

    const handleAddMember = async (memberUsername) => {
        try {
            const res = await fetch(`/api/groups/${group._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, action: "addMember", memberUsername }),
            });
            if (res.ok) {
                const updated = await res.json();
                onGroupUpdated?.(updated);
                setAddMemberQuery("");
                setAddMemberResults([]);
                showToast(`${memberUsername} added`, "success");
            } else {
                const d = await res.json();
                showToast(d.error || "Failed", "error");
            }
        } catch { showToast("Network error", "error"); }
    };

    const handleRemoveMember = async (memberUsername) => {
        if (!confirm(`Remove ${memberUsername} from the group?`)) return;
        try {
            const res = await fetch(`/api/groups/${group._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, action: "removeMember", memberUsername }),
            });
            if (res.ok) {
                const updated = await res.json();
                onGroupUpdated?.(updated);
                showToast(`${memberUsername} removed`, "success");
            }
        } catch { showToast("Network error", "error"); }
    };

    const handlePromoteMember = async (memberUsername) => {
        try {
            const res = await fetch(`/api/groups/${group._id}/members`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, action: "promote", memberUsername }),
            });
            if (res.ok) {
                const updated = await res.json();
                onGroupUpdated?.(updated);
                showToast(`${memberUsername} promoted to admin`, "success");
            }
        } catch { showToast("Network error", "error"); }
    };

    const handleLeave = async () => {
        if (!confirm("Leave this group?")) return;
        try {
            const res = await fetch(`/api/groups/${group._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, action: "leave" }),
            });
            if (res.ok) {
                showToast("Left group", "success");
                onLeave?.();
                onClose();
            }
        } catch { showToast("Network error", "error"); }
    };

    const handleDelete = async () => {
        if (!confirm("Delete this group for everyone? This cannot be undone.")) return;
        try {
            const res = await fetch(`/api/groups/${group._id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            });
            if (res.ok) {
                showToast("Group deleted", "success");
                onLeave?.();
                onClose();
            }
        } catch { showToast("Network error", "error"); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-gray-950 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100">Group Settings</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Avatar + Info (admin only) */}
                    {isAdmin && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="relative w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 transition-colors"
                                >
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-2xl font-bold text-gray-400">{name[0]?.toUpperCase() || "G"}</span>
                                    )}
                                    {uploadingAvatar && (
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    )}
                                </button>
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                                <div className="text-xs text-gray-400">Change photo</div>
                            </div>
                            <input
                                type="text" value={name} onChange={e => setName(e.target.value.slice(0, 50))}
                                placeholder="Group name"
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 transition-colors"
                            />
                            <textarea
                                value={description} onChange={e => setDescription(e.target.value.slice(0, 200))}
                                placeholder="Description" rows={2}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 transition-colors resize-none"
                            />
                            <button onClick={handleSaveInfo} disabled={saving || !name.trim()}
                                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40">
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    )}

                    {/* Permissions (admin only) */}
                    {isAdmin && (
                        <div className="space-y-3 border-t border-gray-200 dark:border-gray-800 pt-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Permissions</h3>
                            <div className="space-y-2">
                                <label className="flex items-center justify-between">
                                    <span className="text-xs text-gray-600 dark:text-gray-400">Who can send messages</span>
                                    <select value={whoCanSend} onChange={e => setWhoCanSend(e.target.value)}
                                        className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-gray-100 outline-none">
                                        <option value="all">Everyone</option>
                                        <option value="admin">Admins only</option>
                                    </select>
                                </label>
                                <label className="flex items-center justify-between">
                                    <span className="text-xs text-gray-600 dark:text-gray-400">Who can add members</span>
                                    <select value={whoCanAdd} onChange={e => setWhoCanAdd(e.target.value)}
                                        className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-gray-100 outline-none">
                                        <option value="all">Everyone</option>
                                        <option value="admin">Admins only</option>
                                    </select>
                                </label>
                            </div>
                            <button onClick={handleSavePermissions} disabled={saving}
                                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40">
                                Save Permissions
                            </button>
                        </div>
                    )}

                    {/* Members */}
                    <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Members ({group.members?.length || 0})</h3>
                        {isAdmin && (
                            <div>
                                <input
                                    type="text" value={addMemberQuery} onChange={e => handleSearchMember(e.target.value)}
                                    placeholder="Add a member..." className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 transition-colors"
                                />
                                {addMemberResults.length > 0 && (
                                    <div className="mt-1 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-32 overflow-y-auto">
                                        {addMemberResults.map(u => (
                                            <button key={u.username} onClick={() => handleAddMember(u.username)}
                                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
                                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                                    style={{ backgroundColor: u.avatarColor || "#3b82f6" }}>
                                                    {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" /> : u.username[0]?.toUpperCase()}
                                                </div>
                                                <span className="text-xs text-gray-900 dark:text-gray-100">{u.username}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                            {group.members?.map(m => (
                                <div key={m.username} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                                        style={{ backgroundColor: m.color || m._profile?.avatarUrl ? undefined : "#3b82f6" }}>
                                        {m._profile?.avatarUrl || m.avatarUrl ? (
                                            <img src={m._profile?.avatarUrl || m.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                                        ) : m.username[0]?.toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm text-gray-900 dark:text-gray-100">{m.username}</span>
                                        {m.role === "admin" && <span className="ml-1.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-medium">admin</span>}
                                        {m.username === group.creator && <span className="ml-1 text-[10px] text-gray-400">(creator)</span>}
                                    </div>
                                    {isAdmin && m.username !== user.username && m.username !== group.creator && (
                                        <div className="flex items-center gap-1">
                                            {m.role !== "admin" && (
                                                <button onClick={() => handlePromoteMember(m.username)} className="text-[10px] text-blue-500 hover:text-blue-600 px-1.5 py-1">Promote</button>
                                            )}
                                            <button onClick={() => handleRemoveMember(m.username)} className="text-[10px] text-red-500 hover:text-red-600 px-1.5 py-1">Remove</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Leave / Delete */}
                    <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-2">
                        <button onClick={handleLeave}
                            className="w-full py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-colors border border-red-200 dark:border-red-800/30">
                            Leave Group
                        </button>
                        {isAdmin && (
                            <button onClick={handleDelete}
                                className="w-full py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-colors border border-red-300 dark:border-red-800/50">
                                Delete Group
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
