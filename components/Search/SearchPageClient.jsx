"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";
import UserBadges from "@/components/shared/UserBadges";
import { timeAgo } from "@/utils/timeAgo";

export default function SearchPageClient() {
    const { user, ready } = useUser();
    const router = useRouter();
    const [query, setQuery]       = useState("");
    const [users, setUsers]       = useState([]);
    const [posts, setPosts]       = useState([]);
    const [hashtags, setHashtags] = useState([]);
    const [loading, setLoading]   = useState(false);
    const [activeTab, setActiveTab] = useState("all");
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const search = useCallback(async (q) => {
        if (!q.trim()) {
            setUsers([]);
            setPosts([]);
            setHashtags([]);
            return;
        }
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

    if (!ready) {
        return (
            <div className="flex h-dvh items-center justify-center bg-white dark:bg-gray-950">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    const hasResults = users.length > 0 || posts.length > 0 || hashtags.length > 0;
    const tabs = [
        { key: "all",      label: "All" },
        { key: "people",   label: "People" },
        { key: "posts",    label: "Posts" },
        { key: "hashtags", label: "Hashtags" },
    ];

    const filteredUsers    = activeTab === "all" || activeTab === "people"   ? users    : [];
    const filteredPosts    = activeTab === "all" || activeTab === "posts"    ? posts    : [];
    const filteredHashtags = activeTab === "all" || activeTab === "hashtags" ? hashtags : [];

    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950">
            {/* Header */}
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label="Go back"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <div className="relative flex-1">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search people, posts, hashtags\u2026"
                            className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-full outline-none focus:bg-white dark:focus:bg-gray-700 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-h-[44px]"
                        />
                        {query && (
                            <button
                                onClick={() => setQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                        {loading && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-gray-500 dark:border-t-gray-400 rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                {query.trim() && (
                    <div className="max-w-2xl mx-auto px-4">
                        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`py-2.5 px-4 text-sm font-medium transition-colors relative ${
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
                    </div>
                )}
            </header>

            {/* Results */}
            <div className="max-w-2xl mx-auto px-4 py-2">
                {!query.trim() && (
                    <div className="text-center py-16">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-16 h-16 mx-auto text-gray-200 dark:text-gray-700 mb-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                        <p className="text-gray-400 dark:text-gray-500 text-sm">Search for people, posts, or hashtags</p>
                    </div>
                )}

                {query.trim() && !hasResults && !loading && (
                    <div className="flex flex-col items-center py-16 text-gray-400 dark:text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mb-3 opacity-40">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                        <p className="text-sm">No results found for &ldquo;{query}&rdquo;</p>
                    </div>
                )}

                {/* People */}
                {filteredUsers.length > 0 && (
                    <div className="mb-4">
                        {activeTab === "all" && (
                            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 py-2">People</p>
                        )}
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {filteredUsers.map((u) => (
                                <Link
                                    key={u._id || u.username}
                                    href={`/profile/${encodeURIComponent(u.username)}`}
                                    className="flex items-center gap-3 px-2 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors min-h-[56px]"
                                >
                                    <div
                                        className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
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
                    </div>
                )}

                {/* Hashtags */}
                {filteredHashtags.length > 0 && (
                    <div className="mb-4">
                        {activeTab === "all" && (
                            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 py-2">Hashtags</p>
                        )}
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {filteredHashtags.map((h) => (
                                <Link
                                    key={h.tag}
                                    href={`/?tag=${encodeURIComponent(h.tag)}`}
                                    className="flex items-center gap-3 px-2 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors min-h-[56px]"
                                >
                                    <div className="w-11 h-11 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
                                        <span className="text-blue-500 dark:text-blue-400 font-bold text-lg">#</span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">#{h.tag}</p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">{h.count} {h.count === 1 ? "post" : "posts"}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Posts */}
                {filteredPosts.length > 0 && (
                    <div className="mb-4">
                        {activeTab === "all" && (
                            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 py-2">Posts</p>
                        )}
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {filteredPosts.map((p) => (
                                <div key={p._id} className="px-2 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors min-h-[56px]">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-xs text-gray-900 dark:text-gray-100">{p.sender}</span>
                                        <span className="text-gray-300 dark:text-gray-600 text-xs">&middot;</span>
                                        <span className="text-gray-400 dark:text-gray-500 text-xs">{timeAgo(p.timeStamp)}</span>
                                    </div>
                                    {p.text && (
                                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 leading-relaxed">{p.text}</p>
                                    )}
                                    {p.hashtags?.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {p.hashtags.slice(0, 5).map((tag) => (
                                                <span key={tag} className="text-xs text-blue-500 dark:text-blue-400">#{tag}</span>
                                            ))}
                                        </div>
                                    )}
                                    {p.imageUrl && (
                                        <div className="mt-2 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 max-w-xs">
                                            <img src={p.imageUrl} alt="" className="w-full h-auto block" loading="lazy" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
