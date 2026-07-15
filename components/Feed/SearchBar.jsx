"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import UserBadges from "@/components/shared/UserBadges";

function timeAgo(date) {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 60)    return `${Math.floor(diff)}s`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return new Date(date).toLocaleDateString([], { month: "short", day: "numeric" });
}

function SearchDropdown({ users, posts, hashtags, activeTab, loading, hasResults, onClose }) {
    const filteredUsers    = activeTab === "all" || activeTab === "people"   ? users    : [];
    const filteredPosts    = activeTab === "all" || activeTab === "posts"    ? posts    : [];
    const filteredHashtags = activeTab === "all" || activeTab === "hashtags" ? hashtags : [];

    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden max-h-[70vh] overflow-y-auto">
            {!loading && !hasResults && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No results</p>
            )}

            {filteredUsers.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 pt-3 pb-1">People</p>
                    {users.map((u) => (
                        <Link
                            key={u._id || u.username}
                            href={`/profile/${encodeURIComponent(u.username)}`}
                            onClick={onClose}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors min-h-[48px]"
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
                                <UserBadges isVerified={u.isVerified} isAdmin={u.isAdmin} roles={u.roles || []} size="sm" />
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {filteredHashtags.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 pt-3 pb-1">Hashtags</p>
                    {filteredHashtags.map((h) => (
                        <Link
                            key={h.tag}
                            href={`/?tag=${encodeURIComponent(h.tag)}`}
                            onClick={onClose}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors min-h-[48px]"
                        >
                            <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
                                <span className="text-blue-500 dark:text-blue-400 font-bold">#</span>
                            </div>
                            <div className="min-w-0">
                                <p className="font-medium text-sm text-gray-900 dark:text-gray-100">#{h.tag}</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500">{h.count} {h.count === 1 ? "post" : "posts"}</p>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {filteredPosts.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 pt-3 pb-1">Posts</p>
                    {posts.map((p) => (
                        <div key={p._id} className="px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors min-h-[48px]">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="font-medium text-xs text-gray-900 dark:text-gray-100">{p.sender}</span>
                                <span className="text-gray-300 dark:text-gray-600 text-xs">&middot;</span>
                                <span className="text-gray-400 dark:text-gray-500 text-xs">{timeAgo(p.timeStamp)}</span>
                            </div>
                            {p.text && (
                                <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 leading-relaxed">{p.text}</p>
                            )}
                            {p.hashtags?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {p.hashtags.slice(0, 3).map((tag) => (
                                        <span key={tag} className="text-xs text-blue-500 dark:text-blue-400">#{tag}</span>
                                    ))}
                                </div>
                            )}
                            {p.imageUrl && (
                                <div className="mt-1.5 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 w-16 h-16">
                                    <img src={p.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                </div>
                            )}
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
    const [hashtags, setHashtags] = useState([]);
    const [loading, setLoading]   = useState(false);
    const [open, setOpen]         = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("all");
    const wrapRef = useRef(null);
    const desktopInputRef = useRef(null);

    const search = useCallback(async (q) => {
        if (!q.trim()) { setUsers([]); setPosts([]); setHashtags([]); return; }
        setLoading(true);
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
                setPosts(data.posts || []);
                setHashtags(data.hashtags || []);
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

    const hasResults = users.length > 0 || posts.length > 0 || hashtags.length > 0;

    const handleClose = () => { setOpen(false); setMobileOpen(false); };

    const tabs = [
        { key: "all",      label: "All" },
        { key: "people",   label: "People" },
        { key: "posts",    label: "Posts" },
        { key: "hashtags", label: "Hashtags" },
    ];

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
                            onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveTab("all"); }}
                            onFocus={() => query.trim() && setOpen(true)}
                            placeholder="Search\u2026"
                            autoFocus
                            className="w-full pl-9 pr-4 py-3.5 text-sm bg-white dark:bg-gray-900 rounded-2xl outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-h-[48px]"
                        />
                        {query && (
                            <button
                                onClick={() => setQuery("")}
                                className="absolute right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                        {!query && loading && (
                            <div className="absolute right-3 text-gray-400">
                                <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-gray-500 dark:border-t-gray-400 rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                    {query.trim() && (
                        <div className="mt-2">
                            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <div className="flex gap-1 px-2 pt-2 border-b border-gray-100 dark:border-gray-800">
                                    {tabs.map((tab) => (
                                        <button
                                            key={tab.key}
                                            onClick={() => setActiveTab(tab.key)}
                                            className={`py-2 px-3 text-xs font-medium transition-colors relative ${
                                                activeTab === tab.key
                                                    ? "text-gray-900 dark:text-gray-100"
                                                    : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                                            }`}
                                        >
                                            {tab.label}
                                            {activeTab === tab.key && (
                                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-gray-100 rounded-full" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                                <div className="max-h-[60vh] overflow-y-auto">
                                    <SearchDropdown
                                        users={users}
                                        posts={posts}
                                        hashtags={hashtags}
                                        activeTab={activeTab}
                                        loading={loading}
                                        hasResults={hasResults}
                                        onClose={handleClose}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
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
                    ref={desktopInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveTab("all"); }}
                    onFocus={() => query.trim() && setOpen(true)}
                    placeholder="Search\u2026"
                    className="w-full pl-9 pr-9 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-full outline-none focus:bg-white dark:focus:bg-gray-700 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-h-[44px]"
                />
                {query && (
                    <button
                        onClick={() => { setQuery(""); desktopInputRef.current?.focus(); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
                {!query && loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-3.5 h-3.5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-500 dark:border-t-gray-400 rounded-full animate-spin" />
                    </div>
                )}
                {open && query.trim() && (
                    <div className="absolute z-40 top-full mt-2 left-0 right-0">
                        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden">
                            <div className="flex gap-1 px-2 pt-2 border-b border-gray-100 dark:border-gray-800">
                                {tabs.map((tab) => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key)}
                                        className={`py-2 px-3 text-xs font-medium transition-colors relative ${
                                            activeTab === tab.key
                                                ? "text-gray-900 dark:text-gray-100"
                                                : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                                        }`}
                                    >
                                        {tab.label}
                                        {activeTab === tab.key && (
                                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-gray-100 rounded-full" />
                                        )}
                                    </button>
                                ))}
                            </div>
                            <div className="max-h-[70vh] overflow-y-auto">
                                <SearchDropdown
                                    users={users}
                                    posts={posts}
                                    hashtags={hashtags}
                                    activeTab={activeTab}
                                    loading={loading}
                                    hasResults={hasResults}
                                    onClose={handleClose}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
