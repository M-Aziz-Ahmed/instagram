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
        return c.name.toLowerCase().includes(search.toLowerCase()) || (c.description || "").toLowerCase().includes(search.toLowerCase());
    });

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Communities</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Join communities, post & discuss</p>
                </div>
                <Link href="/communities/create" className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                    Create
                </Link>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                <button onClick={() => setTab("mine")} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${tab === "mine" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                    My Communities
                </button>
                <button onClick={() => setTab("browse")} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${tab === "browse" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                    Browse All
                </button>
            </div>

            {tab === "browse" && (
                <div className="relative mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search communities..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
            )}

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-gray-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                        </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {tab === "mine" ? "No communities yet" : "No results"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {tab === "mine" ? "Join a community to get started" : "Try a different search"}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((c) => (
                        <CommunityCard key={c._id} community={c} isMember={myCommunities.some((m) => m._id === c._id)} onJoin={() => joinCommunity(c.inviteCode)} onLeave={() => leaveCommunity(c._id)} />
                    ))}
                </div>
            )}
        </div>
    );
}

function CommunityCard({ community: c, isMember, onJoin, onLeave }) {
    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
            {/* Banner color strip */}
            <div className="h-1.5" style={{ backgroundColor: c.color || "#3b82f6" }} />
            <div className="p-3 flex items-center gap-3">
                <Link href={`/communities/${c._id}`} className="shrink-0">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm overflow-hidden" style={{ backgroundColor: c.color || "#3b82f6" }}>
                        {c.avatarUrl ? (
                            <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            c.name?.[0]?.toUpperCase()
                        )}
                    </div>
                </Link>
                <div className="flex-1 min-w-0">
                    <Link href={`/communities/${c._id}`} className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:underline block truncate">
                        {c.name}
                    </Link>
                    {c.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{c.description}</p>
                    )}
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                        {c.memberCount || 0} member{(c.memberCount || 0) !== 1 ? "s" : ""}
                    </p>
                </div>
                {isMember ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                        <Link href={`/communities/${c._id}`} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                            View
                        </Link>
                        <button onClick={onLeave} className="px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                            Leave
                        </button>
                    </div>
                ) : (
                    <button onClick={onJoin} className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shrink-0">
                        Join
                    </button>
                )}
            </div>
        </div>
    );
}
