"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";

export default function CloseFriendsModal({ onClose }) {
    const { user, reloadUser } = useUser();
    const { showToast } = useToast();
    const [closeFriends, setCloseFriends] = useState([]);
    const [search, setSearch] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchCloseFriends = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(user.username)}/close-friends`);
            if (res.ok) {
                const data = await res.json();
                setCloseFriends(data.closeFriends || []);
            }
        } catch { /* silent */ }
        setLoading(false);
    }, [user]);

    useEffect(() => { fetchCloseFriends(); }, [fetchCloseFriends]);

    useEffect(() => {
        if (!search.trim()) { setResults([]); return; }
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(search.trim())}`);
                if (res.ok) {
                    const data = await res.json();
                    setResults((data.users || []).filter((u) => u.username !== user?.username).slice(0, 10));
                }
            } catch { /* silent */ }
        }, 300);
        return () => clearTimeout(t);
    }, [search, user]);

    const toggle = async (targetUsername) => {
        const isAdded = closeFriends.includes(targetUsername);
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(user.username)}/close-friends`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetUsername, action: isAdded ? "remove" : "add" }),
            });
            if (res.ok) {
                const data = await res.json();
                setCloseFriends(data.closeFriends);
                showToast(isAdded ? "Removed from Close Friends" : "Added to Close Friends", "success");
            }
        } catch {
            showToast("Failed to update", "error");
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="font-bold text-base text-gray-900 dark:text-gray-100">Close Friends</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">
                        Done
                    </button>
                </div>

                <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-gray-400 shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search people..."
                            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {closeFriends.length > 0 && (
                        <div className="px-5 pt-3">
                            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                                Your Close Friends ({closeFriends.length})
                            </p>
                            <div className="flex flex-col gap-0.5">
                                {closeFriends.map((u) => (
                                    <div key={u} className="flex items-center gap-3 py-2">
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                                            {u[0]?.toUpperCase()}
                                        </div>
                                        <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{u}</span>
                                        <button
                                            onClick={() => toggle(u)}
                                            className="text-xs font-medium text-red-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="px-5 pt-3">
                            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                                {closeFriends.length > 0 ? "Suggested" : "Results"}
                            </p>
                            <div className="flex flex-col gap-0.5">
                                {results.map((u) => (
                                    <div key={u.username} className="flex items-center gap-3 py-2">
                                        <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 font-bold text-sm shrink-0 overflow-hidden">
                                            {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" /> : u.username[0]?.toUpperCase()}
                                        </div>
                                        <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{u.username}</span>
                                        <button
                                            onClick={() => toggle(u.username)}
                                            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                                closeFriends.includes(u.username)
                                                    ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                    : "text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                            }`}
                                        >
                                            {closeFriends.includes(u.username) ? "Remove" : "Add"}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!loading && closeFriends.length === 0 && !search.trim() && (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3 opacity-40">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                            </svg>
                            <p className="text-sm">No close friends yet</p>
                            <p className="text-xs mt-1">Search for people to add</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
