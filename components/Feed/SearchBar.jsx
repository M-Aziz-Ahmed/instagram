"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import UserBadges from "@/components/shared/UserBadges";

export default function SearchBar() {
    const [query, setQuery]       = useState("");
    const [users, setUsers]       = useState([]);
    const [posts, setPosts]       = useState([]);
    const [loading, setLoading]   = useState(false);
    const [open, setOpen]         = useState(false);
    const wrapRef = useRef(null);

    const search = useCallback(async (q) => {
        if (!q.trim()) { setUsers([]); setPosts([]); return; }
        setLoading(true);
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
                setPosts(data.posts || []);
            }
        } catch { /* silent */ }
        setLoading(false);
    }, []);

    useEffect(() => {
        const t = setTimeout(() => search(query), 300);
        return () => clearTimeout(t);
    }, [query, search]);

    useEffect(() => {
        const handler = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const hasResults = users.length > 0 || posts.length > 0;

    return (
        <div ref={wrapRef} className="relative flex-1 max-w-xs">
            <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                    strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <path strokeLinecap="round" strokeLinejoin="round"
                        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => query.trim() && setOpen(true)}
                    placeholder="Search…"
                    className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-100 rounded-full outline-none focus:bg-gray-50 focus:ring-2 focus:ring-gray-200 transition-all text-gray-900 placeholder-gray-400"
                />
                {loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                    </div>
                )}
            </div>

            {open && query.trim() && (
                <div className="absolute z-40 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-[70vh] overflow-y-auto">
                    {!loading && !hasResults && (
                        <p className="text-sm text-gray-400 text-center py-6">No results for &ldquo;{query}&rdquo;</p>
                    )}

                    {users.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1">People</p>
                            {users.map((u) => (
                                <Link
                                    key={u._id || u.username}
                                    href={`/profile/${encodeURIComponent(u.username)}`}
                                    onClick={() => setOpen(false)}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                                >
                                    <div
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                        style={{ backgroundColor: u.avatarColor }}
                                    >
                                        {u.avatarUrl ? (
                                            <img src={u.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                                        ) : (
                                            u.username?.[0]?.toUpperCase()
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="font-medium text-sm text-gray-900 truncate">{u.username}</span>
                                        <UserBadges user={u} size="sm" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}

                    {posts.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1">Posts</p>
                            {posts.map((p) => (
                                <div key={p._id} className="px-3 py-2.5 hover:bg-gray-50 transition-colors">
                                    <p className="text-xs text-gray-400 mb-0.5">
                                        {p.sender} · {new Date(p.timeStamp).toLocaleDateString()}
                                    </p>
                                    <p className="text-sm text-gray-900 line-clamp-2">{p.text}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
