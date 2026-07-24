"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";

export default function SuggestedUsers() {
    const { user } = useUser();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [following, setFollowing] = useState(new Set());

    useEffect(() => {
        if (!user?.username) { setLoading(false); return; }
        setFollowing(new Set(user.following || []));
        fetch(`/api/suggested?username=${user.username}&limit=8`)
            .then((r) => r.json())
            .then((d) => { setUsers(Array.isArray(d) ? d : []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [user]);

    const handleFollow = async (username) => {
        setFollowing((prev) => new Set([...prev, username]));
        try {
            await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, target: username }),
            });
        } catch {
            setFollowing((prev) => { const n = new Set(prev); n.delete(username); return n; });
        }
    };

    if (loading) return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex justify-center py-4">
                <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
        </div>
    );

    if (!users.length) return null;

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">Who to Follow</h3>
            </div>
            <div className="p-4 space-y-3">
                {users.slice(0, 5).map((u) => (
                    <div key={u.username} className="flex items-center gap-3">
                        <Link href={`/profile/${u.username}`} className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                            style={{ backgroundColor: u.avatarColor || "#3b82f6" }}>
                            {u.avatarUrl ? <img src={u.avatarUrl} className="w-full h-full rounded-full object-cover" alt="" /> : u.username?.[0]?.toUpperCase()}
                        </Link>
                        <div className="flex-1 min-w-0">
                            <Link href={`/profile/${u.username}`} className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate block hover:underline">
                                {u.username}
                            </Link>
                            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                                {u.postCount > 0 && <span>{u.postCount} posts</span>}
                                {u.postingStreak > 0 && <span>🔥 {u.postingStreak}d</span>}
                                {u.achievements?.length > 0 && <span>🏆 {u.achievements.length}</span>}
                            </div>
                        </div>
                        {!following.has(u.username) && u.username !== user?.username && (
                            <button onClick={() => handleFollow(u.username)}
                                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors shrink-0">
                                Follow
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
