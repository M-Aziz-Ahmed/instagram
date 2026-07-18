"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PostCard from "./PostCard";
import { PostSkeleton } from "@/components/shared/Skeleton";
import AdCard from "@/components/shared/AdCard";
import UserBadges from "@/components/shared/UserBadges";
import { useUser } from "@/context/UserContext";
import { timeAgo } from "@/utils/timeAgo";

const PAGE_SIZE = 10;

function SearchResults({ query, onClear, onHashtag }) {
    const [users, setUsers]             = useState([]);
    const [posts, setPosts]             = useState([]);
    const [hashtags, setHashtags]       = useState([]);
    const [loading, setLoading]         = useState(true);
    const [activeTab, setActiveTab]     = useState("all");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                if (res.ok && !cancelled) {
                    const data = await res.json();
                    setUsers(data.users || []);
                    setPosts(data.posts || []);
                    setHashtags(data.hashtags || []);
                }
            } catch { /* silent */ }
            if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [query]);

    const filteredUsers    = activeTab === "all" || activeTab === "people"   ? users    : [];
    const filteredPosts    = activeTab === "all" || activeTab === "posts"    ? posts    : [];
    const filteredHashtags = activeTab === "all" || activeTab === "hashtags" ? hashtags : [];
    const hasResults = filteredUsers.length > 0 || filteredPosts.length > 0 || filteredHashtags.length > 0;

    const tabs = [
        { key: "all",      label: "All" },
        { key: "people",   label: "People" },
        { key: "posts",    label: "Posts" },
        { key: "hashtags", label: "Hashtags" },
    ];

    return (
        <div>
            {/* Search header */}
            <div className="py-3 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-2 mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                        strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round"
                            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                        Results for &ldquo;{query}&rdquo;
                    </span>
                    <button
                        onClick={onClear}
                        className="ml-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-3 py-2 min-h-[44px] shrink-0"
                    >
                        Clear
                    </button>
                </div>
                <div className="flex gap-1">
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
            </div>

            {/* Results */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                </div>
            ) : !hasResults ? (
                <div className="flex flex-col items-center py-16 text-gray-400 dark:text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mb-3 opacity-40">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    <p className="text-sm">No results found for &ldquo;{query}&rdquo;</p>
                </div>
            ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {/* People */}
                    {filteredUsers.length > 0 && (
                        <div className="py-2">
                            {activeTab === "all" && (
                                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 py-2">People</p>
                            )}
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
                    )}

                    {/* Hashtags */}
                    {filteredHashtags.length > 0 && (
                        <div className="py-2">
                            {activeTab === "all" && (
                                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 py-2">Hashtags</p>
                            )}
                            {filteredHashtags.map((h) => (
                                <button
                                    key={h.tag}
                                    onClick={() => onHashtag?.(h.tag)}
                                    className="flex items-center gap-3 px-2 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors min-h-[56px] w-full text-left"
                                >
                                    <div className="w-11 h-11 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
                                        <span className="text-blue-500 dark:text-blue-400 font-bold text-lg">#</span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">#{h.tag}</p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">{h.count} {h.count === 1 ? "post" : "posts"}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Posts */}
                    {filteredPosts.length > 0 && (
                        <div className="py-2">
                            {activeTab === "all" && (
                                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 py-2">Posts</p>
                            )}
                            {filteredPosts.map((p) => (
                                <div key={p._id} className="px-2 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors min-h-[56px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className="font-medium text-xs text-gray-900 dark:text-gray-100">{p.sender}</span>
                                        <span className="text-gray-300 dark:text-gray-600 text-xs">&middot;</span>
                                        <span className="text-gray-400 dark:text-gray-500 text-xs">{timeAgo(p.timeStamp)}</span>
                                    </div>
                                    {p.text && (
                                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 leading-relaxed">{p.text}</p>
                                    )}
                                    {p.hashtags?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {p.hashtags.slice(0, 5).map((tag) => (
                                                <button key={tag} onClick={() => onHashtag?.(tag)}
                                                    className="text-xs text-blue-500 dark:text-blue-400 hover:underline">
                                                    #{tag}
                                                </button>
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
                    )}
                </div>
            )}
        </div>
    );
}

export default function Feed({ refreshTrigger, activeTag, onHashtag, onAuthError, feedType, username, searchQuery, onClearSearch }) {
    const { user } = useUser();
    const [posts, setPosts]             = useState([]);
    const [ads, setAds]                 = useState([]);
    const [serverTranslations, setServerTranslations] = useState({});
    const [loading, setLoading]         = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore]         = useState(true);
    const sentinelRef                   = useRef(null);
    const lastRefreshRef                = useRef(0);
    const viewBatchRef                  = useRef([]);
    const viewTimerRef                  = useRef(null);
    const adIntervalRef                 = useRef(10 + Math.floor(Math.random() * 6)); // 10-15
    const postsSinceAdRef               = useRef(0);

    const isSmartFeed = !!user && !activeTag && feedType !== "following";

    const handleDelete = useCallback((postId) => {
        setPosts((prev) => prev.filter((p) => p._id !== postId));
    }, []);

    const flushViews = useCallback(async () => {
        const ids = viewBatchRef.current.splice(0);
        if (ids.length === 0) return;
        try {
            await fetch("/api/posts/views", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ postIds: ids }),
            });
        } catch {}
    }, []);

    const trackView = useCallback((postId) => {
        viewBatchRef.current.push(postId);
        if (!viewTimerRef.current) {
            viewTimerRef.current = setTimeout(() => {
                viewTimerRef.current = null;
                flushViews();
            }, 3000);
        }
    }, [flushViews]);

    useEffect(() => {
        return () => {
            if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
            flushViews();
        };
    }, [flushViews]);

    // Fetch ads once on mount
    useEffect(() => {
        fetch("/api/ads", { cache: "no-store" })
            .then((r) => r.ok ? r.json() : [])
            .then((data) => { if (Array.isArray(data)) setAds(data); })
            .catch(() => {});
    }, []);

    const insertAds = useCallback((postsList) => {
        if (postsList.length === 0) return postsList;
        if (ads.length === 0) return postsList.map((post) => ({ type: "post", data: post }));

        const interval = adIntervalRef.current;
        let postsSinceAd = postsSinceAdRef.current;
        const items = [];
        let adIdx = 0;

        for (const post of postsList) {
            items.push({ type: "post", data: post });
            postsSinceAd++;
            if (postsSinceAd >= interval && ads.length > 0) {
                items.push({ type: "ad", data: ads[adIdx % ads.length] });
                adIdx++;
                postsSinceAd = 0;
                adIntervalRef.current = 10 + Math.floor(Math.random() * 6);
            }
        }

        postsSinceAdRef.current = postsSinceAd;
        return items;
    }, [ads]);

    const fetchPosts = useCallback(async ({ append = false } = {}) => {
        try {
            let url;
            const params = new URLSearchParams();

            if (isSmartFeed) {
                params.set("username", username || user.username);
                if (user?.autoTranslate && user?.language) params.set("lang", user.language);
                if (append && posts.length > 0) {
                    const oldest = posts[posts.length - 1];
                    if (oldest?.timeStamp) params.set("before", oldest.timeStamp);
                }
                params.set("limit", String(PAGE_SIZE + 10));
                url = `/api/feed/smart?${params}`;
            } else {
                if (activeTag) params.set("tag", activeTag);
                if (feedType === "following" && username) {
                    params.set("feed", "following");
                    params.set("username", username);
                }
                if (user?.autoTranslate && user?.language) params.set("lang", user.language);
                if (append && posts.length > 0) {
                    const oldest = posts[posts.length - 1];
                    if (oldest?.timeStamp) params.set("before", oldest.timeStamp);
                }
                params.set("limit", String(PAGE_SIZE));
                url = `/api/posts?${params}`;
            }

            const res = await fetch(url, { cache: "no-store" });
            if (res.status === 401) {
                onAuthError?.();
                return;
            }
            if (res.ok) {
                const data = await res.json();
                if (data.translations) {
                    setServerTranslations((prev) => ({ ...prev, ...data.translations }));
                }
                const newPosts = Array.isArray(data.posts) ? data.posts : [];
                if (append) {
                    setPosts((prev) => {
                        const ids = new Set(prev.map((p) => p._id));
                        const fresh = newPosts.filter((p) => !ids.has(p._id));
                        return [...prev, ...fresh];
                    });
                } else {
                    setPosts(newPosts);
                }
                setHasMore(data.hasMore);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [activeTag, onAuthError, feedType, username, posts, user, isSmartFeed]);

    useEffect(() => {
        setPosts([]);
        setHasMore(true);
        setLoading(true);
        lastRefreshRef.current = 0;
    }, [activeTag, feedType, username]);

    useEffect(() => {
        if (loading) fetchPosts();
    }, [fetchPosts, loading]);

    useEffect(() => {
        const id = setInterval(() => {
            const now = Date.now();
            if (now - lastRefreshRef.current < 12000) return;
            lastRefreshRef.current = now;

            const params = new URLSearchParams();
            if (activeTag) params.set("tag", activeTag);
            if (feedType === "following" && username) {
                params.set("feed", "following");
                params.set("username", username);
            }
            if (user?.autoTranslate && user?.language) {
                params.set("lang", user.language);
            }
            params.set("limit", "5");

            fetch(`/api/posts?${params}`, { cache: "no-store" })
                .then((r) => r.ok ? r.json() : null)
                .then((data) => {
                    if (!data?.posts || !Array.isArray(data.posts)) return;
                    if (data.translations) {
                        setServerTranslations((prev) => ({ ...prev, ...data.translations }));
                    }
                    setPosts((prev) => {
                        const ids = new Set(prev.map((p) => p._id));
                        const fresh = data.posts.filter((p) => p && p._id && !ids.has(p._id));
                        if (fresh.length === 0) return prev;
                        return [...fresh, ...prev];
                    });
                })
                .catch(() => {});
        }, 30000);
        return () => clearInterval(id);
    }, [activeTag, feedType, username, user?.autoTranslate, user?.language]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
                    setLoadingMore(true);
                    fetchPosts({ append: true });
                }
            },
            { rootMargin: "400px" }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, loading, fetchPosts]);

    // Show search results when searchQuery is set
    if (searchQuery) {
        return <SearchResults query={searchQuery} onClear={onClearSearch} onHashtag={onHashtag} />;
    }

    if (loading) {
        return (
            <div>
                <PostSkeleton />
                <PostSkeleton />
                <PostSkeleton />
            </div>
        );
    }

    if (posts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 select-none">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                    strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3 opacity-40">
                    <path strokeLinecap="round" strokeLinejoin="round"
                        d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
                </svg>
                <p className="text-sm">
                    {activeTag ? `No posts with #${activeTag} yet.` : "Nothing here yet. Be the first to post!"}
                </p>
            </div>
        );
    }

    return (
        <div>
            {activeTag && (
                <div className="py-3 border-b border-gray-200 flex items-center gap-2">
                    <span className="text-sm font-bold text-blue-600">#{activeTag}</span>
                    <span className="text-xs text-gray-400">{posts.length} post{posts.length !== 1 ? "s" : ""}</span>
                    <button
                        onClick={() => onHashtag(null)}
                        className="ml-auto text-xs text-gray-400 hover:text-gray-600 px-3 py-2 min-h-[44px]"
                    >
                        ✕ Clear
                    </button>
                </div>
            )}
            {insertAds(posts).map((item, i) =>
                item.type === "ad" ? (
                    <AdCard key={`ad-${i}`} ad={item.data} />
                ) : item.data?._id ? (
                    <PostCard
                        key={item.data._id}
                        post={item.data}
                        onDelete={handleDelete}
                        onHashtag={onHashtag}
                        serverTranslation={serverTranslations[item.data._id]}
                        trackView={trackView}
                    />
                ) : null
            )}
            <div ref={sentinelRef} className="h-1" />
            {loadingMore && (
                <div className="flex justify-center py-8">
                    <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                </div>
            )}
            {!hasMore && posts.length > 0 && (
                <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-6">You&apos;re all caught up</p>
            )}
        </div>
    );
}
