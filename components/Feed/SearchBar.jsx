"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import UserBadges from "@/components/shared/UserBadges";

function SearchDropdown({ users, posts, loading, hasResults, onClose }) {
    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden max-h-[70vh] overflow-y-auto">
            {!loading && !hasResults && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No results</p>
            )}

            {users.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 pt-3 pb-1">People</p>
                    {users.map((u) => (
                        <Link
                            key={u._id || u.username}
                            href={`/profile/${encodeURIComponent(u.username)}`}
                            onClick={onClose}
                            className="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors min-h-[48px]"
                        >
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                style={{ backgroundColor: u.avatarColor }}
                            >
                                {u.avatarUrl ? (
                                    <img src={u.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                                ) : (
                                    u.username?.[0]?.toUpperCase()
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{u.username}</span>
                                <UserBadges user={u} size="sm" />
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {posts.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 pt-3 pb-1">Posts</p>
                    {posts.map((p) => (
                        <div key={p._id} className="px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors min-h-[48px]">
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">
                                {p.sender} · {new Date(p.timeStamp).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-gray-900 dark:text-gray-100 line-clamp-2">{p.text}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function SearchBar() {
    const [query, setQuery]       = useState("");
    const [users, setUsers]       = useState([]);
    const [posts, setPosts]       = useState([]);
    const [loading, setLoading]   = useState(false);
    const [open, setOpen]         = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
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
            if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                setOpen(false);
                setMobileOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const hasResults = users.length > 0 || posts.length > 0;

    const handleClose = () => { setOpen(false); setMobileOpen(false); };

    return (
        <div ref={wrapRef} className="relative flex-1 max-w-xs">
            {/* Mobile: search icon */}
            <button
                onClick={() => setMobileOpen((v) => !v)}
                className="sm:hidden p-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Search"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                    strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round"
                        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
            </button>

            {/* Mobile expanded search */}
            {mobileOpen && (
                <div className="sm:hidden fixed inset-x-0 top-14 z-50 px-4">
                    <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 absolute left-3 text-gray-400 dark:text-gray-500 pointer-events-none">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                            onFocus={() => query.trim() && setOpen(true)}
                            placeholder="Search\u2026"
                            autoFocus
                            className="w-full pl-9 pr-4 py-3.5 text-sm bg-white dark:bg-gray-900 rounded-2xl outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-h-[48px]"
                        />
                        {loading && (
                            <div className="absolute right-3 text-gray-400">
                                <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-gray-500 dark:border-t-gray-400 rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                    <div className="mt-2 max-h-[60vh] overflow-y-auto">
                        {open && query.trim() && (
                            <SearchDropdown users={users} posts={posts} loading={loading} hasResults={hasResults} onClose={handleClose} />
                        )}
                    </div>
                </div>
            )}

            {/* Desktop: full search input */}
            <div className="relative hidden sm:block">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                    strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                    <path strokeLinecap="round" strokeLinejoin="round"
                        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => query.trim() && setOpen(true)}
                    placeholder="Search\u2026"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-full outline-none focus:bg-white dark:focus:bg-gray-700 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-h-[44px]"
                />
                {loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-3.5 h-3.5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-500 dark:border-t-gray-400 rounded-full animate-spin" />
                    </div>
                )}
                {open && query.trim() && (
                    <div className="absolute z-40 top-full mt-2 left-0 right-0">
                        <SearchDropdown users={users} posts={posts} loading={loading} hasResults={hasResults} onClose={handleClose} />
                    </div>
                )}
            </div>
        </div>
    );
}
