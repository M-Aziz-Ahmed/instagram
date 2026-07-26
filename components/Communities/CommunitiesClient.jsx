"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

export default function CommunitiesClient() {
    const { user } = useUser();
    const [myCommunities, setMyCommunities] = useState([]);
    const [publicCommunities, setPublicCommunities] = useState([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("mine");

    useEffect(() => {
        setLoading(true);
        Promise.all([
            fetch("/api/communities/mine", { credentials: "include" }).then((r) => r.json()),
            fetch(`/api/communities?sort=memberCount`, { credentials: "include" }).then((r) => r.json()),
        ]).then(([mine, publics]) => {
            setMyCommunities(Array.isArray(mine) ? mine : []);
            setPublicCommunities(Array.isArray(publics) ? publics : []);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    const joinCommunity = useCallback(async (inviteCode) => {
        const res = await fetch(`/api/communities/join/${inviteCode}`, { method: "POST", credentials: "include" });
        if (res.ok) {
            const c = await res.json();
            setMyCommunities((prev) => [...prev, c]);
            setPublicCommunities((prev) => prev.map((p) => p._id === c._id ? c : p));
        }
    }, []);

    const leaveCommunity = useCallback(async (id) => {
        const res = await fetch(`/api/communities/${id}/leave`, { method: "POST", credentials: "include" });
        if (res.ok) {
            setMyCommunities((prev) => prev.filter((c) => c._id !== id));
        }
    }, []);

    const filtered = tab === "mine" ? myCommunities : publicCommunities.filter((c) => {
        if (!search) return true;
        return c.name.toLowerCase().includes(search.toLowerCase());
    });

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Communities</h1>
                <Link href="/communities/create" className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors">
                    Create
                </Link>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                <button onClick={() => setTab("mine")} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "mine" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                    My Communities ({myCommunities.length})
                </button>
                <button onClick={() => setTab("browse")} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "browse" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                    Browse
                </button>
            </div>

            {tab === "browse" && (
                <input
                    type="text"
                    placeholder="Search communities..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-4 py-2.5 mb-4 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
                />
            )}

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <p className="text-3xl mb-2">{tab === "mine" ? "🏠" : "🔍"}</p>
                    <p className="text-sm">{tab === "mine" ? "You haven't joined any communities yet" : "No communities found"}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((c) => (
                        <CommunityCard key={c._id} community={c} isMember={myCommunities.some((m) => m._id === c._id)} onJoin={() => joinCommunity(c.inviteCode)} onLeave={() => leaveCommunity(c._id)} user={user} />
                    ))}
                </div>
            )}
        </div>
    );
}

function CommunityCard({ community: c, isMember, onJoin, onLeave, user }) {
    return (
        <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 overflow-hidden" style={{ backgroundColor: c.color || "#3b82f6" }}>
                {c.avatarUrl ? (
                    <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                    c.name?.[0]?.toUpperCase()
                )}
            </div>
            <div className="flex-1 min-w-0">
                <Link href={`/communities/${c._id}`} className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:underline truncate block">
                    {c.name}
                </Link>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.memberCount} member{c.memberCount !== 1 ? "s" : ""} · {c.channels?.length || 0} channels</p>
            </div>
            {isMember ? (
                <div className="flex items-center gap-2 shrink-0">
                    <Link href={`/communities/${c._id}`} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        Open
                    </Link>
                    <button onClick={onLeave} className="px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                        Leave
                    </button>
                </div>
            ) : (
                <button onClick={onJoin} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shrink-0">
                    Join
                </button>
            )}
        </div>
    );
}
