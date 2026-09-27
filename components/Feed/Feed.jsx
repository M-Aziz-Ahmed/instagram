"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PostCard from "./PostCard";
import { PostSkeleton } from "@/components/shared/Skeleton";
import AdCard from "@/components/shared/AdCard";
import { isRenderableAd } from "@/utils/adSession";
import UserBadges from "@/components/shared/UserBadges";
import { useUser } from "@/context/UserContext";
import { timeAgo } from "@/utils/timeAgo";
import useFeedShortcuts from "@/utils/useFeedShortcuts";

const PAGE_SIZE = 5;
// Upper bound on the in-memory feed. Keeps a long-lived tab from growing an
// unbounded post list (and an unbounded number of ad slots) via the 60s prepend.
const MAX_FEED_POSTS = 300;

// Content-type filters. `all` is the absence of a filter, so it is not sent to
// the server (see buildParams). These must stay in sync with FEED_FILTERS in
// live-server/routes/posts.js — an unrecognised value there is ignored, which
// would leave the chip looking selected while the feed showed everything.
const FEED_FILTERS = [
    { value: "all",    label: "All",    emoji: "✳️" },
    { value: "media",  label: "Media",  emoji: "🖼️" },
    { value: "video",  label: "Video",  emoji: "▶️" },
    { value: "links",  label: "Links",  emoji: "🔗" },
    { value: "polls",  label: "Polls",  emoji: "📊" },
    { value: "text",   label: "Text",   emoji: "💬" },
];

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
                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`py-3 px-4 text-xs font-medium transition-colors relative min-h-[44px] min-w-[80px] flex items-center justify-center whitespace-nowrap ${
                                activeTab === tab.key
                                    ? "text-gray-900 dark:text-gray-100"
                                    : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                            }`}
                        >
                            {tab.label}
                            {activeTab === tab.key && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-900 dark:bg-gray-100 rounded-full" />
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
                                        <UserBadges isPro={u.isPro} isVerified={u.isVerified} isAdmin={u.isAdmin} roles={u.roles || []} size="sm" />
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

export default function Feed({ refreshTrigger, activeTag, onHashtag, onAuthError, feedType, username, searchQuery, onClearSearch, onToggleScheduled }) {
    const { user } = useUser();
    const [posts, setPosts]             = useState([]);
    const [ads, setAds]                 = useState([]);
    const [serverTranslations, setServerTranslations] = useState({});
    const [loading, setLoading]         = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore]         = useState(true);
    // Set to the number of posts the 60s tick found, so the reader is told rather
    // than having the page silently reshuffle under them mid-read — which is what
    // a silent prepend does to someone halfway down a thread.
    const [newPostCount, setNewPostCount] = useState(0);
    const [filter, setFilter]           = useState("all");
    const [refreshing, setRefreshing]   = useState(false);
    const sentinelRef                   = useRef(null);
    const lastRefreshRef                = useRef(0);
    const viewBatchRef                  = useRef([]);
    const viewTimerRef                  = useRef(null);
    const postsRef                      = useRef([]);
    const hasMoreRef                    = useRef(true);
    const postsLoadingRef               = useRef(false);

    // Keep refs in sync
    postsRef.current = posts;
    hasMoreRef.current = hasMore;

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

    // Fetch ads once on mount. We ask for more than we can place so consecutive
    // slots get *different* creatives when several are configured, and drop
    // anything that can only render an empty box.
    //
    // `slot=feed` scopes this to creatives an admin has assigned to the social
    // feed. The endpoint used to accept an unplaced request, which was fine when
    // the feed was the only surface - now that ads are targeted, an unplaced
    // request would be ambiguous, and the server treats it as "unassigned ads
    // only" to keep a typo from dumping another surface's ads here.
    useEffect(() => {
        fetch("/api/ads?slot=feed&limit=20", { cache: "no-store" })
            .then((r) => r.ok ? r.json() : [])
            .then((data) => {
                if (!Array.isArray(data)) return;
                setAds(data.filter(isRenderableAd));
            })
            .catch(() => {});
    }, []);

    // Insert an ad every N posts. N is deliberately smaller than PAGE_SIZE so
    // that at least one slot always lands inside the first page: with N === 5
    // and a 5-post page, the only ad rendered was the last item on screen, which
    // is indistinguishable from having no ads at all.
    const AD_INTERVAL = 3;
    // Hard ceiling on how many ad slots a single feed render may contain.
    // The feed grows with every 60s prepend and every scroll-driven append, so
    // without a cap the number of live ad slots — and the number of ad
    // executions on the page — grew without bound.
    const MAX_AD_SLOTS = 6;

    const insertAds = useCallback((postsList) => {
        if (postsList.length === 0) return postsList;

        const items = [];
        let adCount = 0;
        let lastPostId = "";
        for (let i = 0; i < postsList.length; i++) {
            const post = postsList[i];
            items.push({ type: "post", data: post });
            if (post?._id) lastPostId = post._id;
            if ((i + 1) % AD_INTERVAL === 0 && ads.length > 0 && adCount < MAX_AD_SLOTS) {
                // Walk `ads` in order so consecutive slots get different ads
                // until the configured pool runs dry, at which point they
                // cycle. Every slot renders a real creative, so cycling is
                // preferable to leaving a slot empty.
                const ad = ads[adCount % ads.length];
                // Anchor the slot to the post it follows, not to its ordinal
                // position. Ordinal keys renumbered on every prepend/delete and
                // remounted the slot, which re-ran the creative. Anchoring to
                // the preceding post id keeps a slot's identity stable while
                // posts are added above or removed from it.
                items.push({ type: "ad", data: ad, adKey: `${lastPostId}:${ad._id}` });
                adCount++;
            }
        }

        // A feed shorter than AD_INTERVAL (new or low-activity account) would
        // otherwise contain no ad at all, so always close it out with one.
        if (adCount === 0 && ads.length > 0 && items.length > 0) {
            items.push({ type: "ad", data: ads[0], adKey: `${lastPostId}:${ads[0]._id}:tail` });
        }

        return items;
    }, [ads]);

    const fetchPostsRef = useRef(null);

    // Pulled out of `user` so the deps below are exact primitives. Listing
    // `user?.autoTranslate, user?.language` against a body that reads them off
    // `user` makes the compiler infer the whole object, and it then refuses to
    // preserve the memoisation.
    const { autoTranslate, language } = user || {};

    // One place that knows what the feed is asking for.
    //
    // This used to be written out three times — in fetchPosts, inline in the
    // 60s auto-refresh, and (for a manual refresh) nowhere at all. The copies
    // had already drifted: the auto-refresh only sent `username` inside the
    // `feedType === "following"` branch, while fetchPosts sent it whenever it
    // was set. On a profile that meant every 60 seconds the auto-refresh
    // requested the *global* feed and prepended unrelated posts into the
    // profile view, with no error to show for it.
    //
    // `append` adds the `before` cursor. The refresh paths deliberately do not
    // pass it: they want the newest page, not the next page.
    const buildParams = useCallback(({ append = false } = {}) => {
        const params = new URLSearchParams();
        if (activeTag) params.set("tag", activeTag);
        if (feedType === "following") {
            params.set("feed", "following");
        }
        if (username) params.set("username", username);
        if (filter && filter !== "all") params.set("filter", filter);
        if (autoTranslate && language) params.set("lang", language);
        if (append && postsRef.current.length > 0) {
            const oldest = postsRef.current[postsRef.current.length - 1];
            if (oldest?.timeStamp) params.set("before", oldest.timeStamp);
        }
        params.set("limit", String(PAGE_SIZE));
        return params;
    }, [activeTag, feedType, username, filter, autoTranslate, language]);

    const fetchPosts = useCallback(async ({ append = false } = {}) => {
        if (append && (!hasMoreRef.current || postsLoadingRef.current)) return;
        try {
            if (!append) setLoading(true);
            postsLoadingRef.current = true;
            setLoadingMore(true);

            const params = buildParams({ append });

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const res = await fetch(`/api/posts?${params}`, { 
                cache: "no-store",
                signal: controller.signal 
            });
            clearTimeout(timeoutId);
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
            } else if (!append) {
                setPosts([]);
                setHasMore(false);
            }
        } catch (err) {
            console.error(err);
            if (!append) {
                setPosts([]);
                setHasMore(false);
            }
        } finally {
            postsLoadingRef.current = false;
            setLoading(false);
            setLoadingMore(false);
        }
    }, [buildParams, onAuthError]);

    // Keep a ref to fetchPosts so the observer always calls the latest version
    fetchPostsRef.current = fetchPosts;

    // Changing what the feed is asking for has to actually go and ask for it.
    //
    // This used to only clear the list and set `loading`, on the assumption that
    // the IntersectionObserver sentinel would notice the empty list and fetch.
    // It cannot: while `loading` is true the component renders skeletons, so the
    // sentinel is unmounted, and the only thing that ever clears `loading` is a
    // completed fetch. Switching between the All and For You tabs, or clearing a
    // hashtag filter, therefore hung on the skeleton until a full page reload.
    //
    // This effect also covers the initial load, which is why the separate
    // once-per-mount effect below is gone — it was the same fetch, and having
    // both meant the first render raced two requests.
    //
    // Deps are deliberately the query identity only, and the fetch is read
    // through a ref. Depending on `fetchPosts` itself would re-run this whenever
    // its identity changed, and that identity includes `onAuthError`, which the
    // parent does not necessarily keep stable — an inline handler there would
    // turn this into an unbounded refetch loop.
    useEffect(() => {
        // `setHasMore` is deliberately not called here: fetchPosts sets it from
        // the response, and setting it now would be a synchronous setState in an
        // effect body for a value that is about to be overwritten anyway.
        hasMoreRef.current = true;
        postsLoadingRef.current = false;
        lastRefreshRef.current = 0;
        fetchPostsRef.current?.().finally(() => {
            setLoading(false);
        });
    }, [activeTag, feedType, username, filter]);

    // The `refreshTrigger` prop was destructured and then never read, so
    // publishing a post did nothing to the feed underneath the composer — the
    // new post only appeared after the 60s tick, or on a manual page reload.
    // FeedClient increments this from Compose's onPosted.
    const lastTriggerRef = useRef(refreshTrigger);
    useEffect(() => {
        if (lastTriggerRef.current === refreshTrigger) return;
        lastTriggerRef.current = refreshTrigger;
        lastRefreshRef.current = 0;
        fetchPosts().finally(() => setLoading(false));
    }, [refreshTrigger, fetchPosts]);

    const loadingRef = useRef(false);
    const loadingMoreRef = useRef(false);
    loadingRef.current = loading;
    loadingMoreRef.current = loadingMore;

    // Prepend anything published since the last page, keeping the buffer bounded.
    // Shared by the 60s tick, the refresh button and the keyboard shortcut, so
    // all three behave identically instead of drifting apart.
    const refreshLatest = useCallback(async ({ timeout = 10000 } = {}) => {
        const params = buildParams();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const res = await fetch(`/api/posts?${params}`, {
                cache: "no-store",
                signal: controller.signal,
            });
            if (!res.ok) return 0;
            const data = await res.json();
            if (data.translations) {
                setServerTranslations((prev) => ({ ...prev, ...data.translations }));
            }
            if (!Array.isArray(data.posts)) return 0;
            setPosts((prev) => {
                const ids = new Set(prev.map((p) => p._id));
                const fresh = data.posts.filter((p) => p && p._id && !ids.has(p._id));
                if (fresh.length === 0) return prev;
                // Only count what is genuinely new. On the very first load the
                // list is empty, so every post is "new" and the pill would claim
                // there are 5 new posts before the reader has seen any.
                if (prev.length > 0) setNewPostCount((n) => n + fresh.length);
                // Cap the buffer. Prepending without ever trimming meant a tab
                // left open grew an unbounded post list — and an unbounded
                // number of ad slots with it.
                return [...fresh, ...prev].slice(0, MAX_FEED_POSTS);
            });
            return data.posts.length;
        } catch {
            return 0;
        } finally {
            clearTimeout(timeoutId);
        }
    }, [buildParams]);

    // Manual refresh. The 60s tick is a safety net, not something to make someone
    // wait on: posting, replying and toggling a filter all change what the feed
    // should contain, and none of them waited for it.
    const handleRefresh = useCallback(async () => {
        if (refreshing) return;
        setRefreshing(true);
        lastRefreshRef.current = Date.now();
        try {
            await refreshLatest();
        } finally {
            setRefreshing(false);
        }
    }, [refreshing, refreshLatest]);

// Auto-refresh for new posts (every 60s, skip if loading)
    useEffect(() => {
        const id = setInterval(() => {
            const now = Date.now();
            if (now - lastRefreshRef.current < 60000) return;
            if (loadingRef.current || loadingMoreRef.current) return;
            lastRefreshRef.current = now;
            refreshLatest();
        }, 60000);
        return () => clearInterval(id);
    }, [refreshLatest]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    fetchPostsRef.current?.({ append: true });
                }
            },
            { rootMargin: "400px" }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [loading]);

    // j/k move between posts by asking the browser to scroll the next rendered
    // post into view, rather than tracking an index: the list is reordered by
    // the 60s prepend and by infinite scroll, so any index held in state would
    // drift out of date and scroll to the wrong post. Deriving from the DOM at
    // the moment of the keystroke cannot drift.
    const focusPostAtOffset = useCallback((offset) => {
        const nodes = Array.from(document.querySelectorAll("[data-feed-post]"));
        if (nodes.length === 0) return;

        // The post currently occupying the middle of the viewport.
        let currentIndex = nodes.findIndex((el) => {
            const rect = el.getBoundingClientRect();
            return rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2;
        });
        if (currentIndex === -1) {
            // Nothing straddles the middle (long post, or the gap between two):
            // fall back to the first post whose top has not yet passed.
            currentIndex = nodes.findIndex((el) => el.getBoundingClientRect().top > 0);
            if (currentIndex === -1) currentIndex = nodes.length - 1;
        }

        const nextIndex = Math.min(Math.max(currentIndex + offset, 0), nodes.length - 1);
        nodes[nextIndex]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    const { showHelp, setShowHelp, shortcuts } = useFeedShortcuts({
        onNext: () => focusPostAtOffset(1),
        onPrevious: () => focusPostAtOffset(-1),
        onRefresh: handleRefresh,
    });

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
            {newPostCount > 0 && (
                <div className="sticky top-12 z-20 flex justify-center pt-2 pointer-events-none">
                    <button
                        onClick={() => {
                            setNewPostCount(0);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 shadow-lg transition-colors animate-fade-up"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5V4.5m0 0-6.75 6.75M12 4.5l6.75 6.75" />
                        </svg>
                        {newPostCount} new post{newPostCount !== 1 ? "s" : ""}
                    </button>
                </div>
            )}

            {/* Feed toolbar: content-type filter, manual refresh, shortcut help. */}
            <div className="sticky top-0 z-10 flex items-center gap-2 py-2 px-1 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-100 dark:border-gray-800">
                <div
                    className="flex items-center gap-1 overflow-x-auto scrollbar-hide min-w-0"
                    role="group"
                    aria-label="Filter feed by content type"
                >
                    {FEED_FILTERS.map((f) => (
                        <button
                            key={f.value}
                            onClick={() => setFilter(f.value)}
                            aria-pressed={filter === f.value}
                            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors min-h-[32px] ${
                                filter === f.value
                                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                        >
                            <span aria-hidden="true">{f.emoji}</span>
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="ml-auto flex items-center gap-0.5 shrink-0">
                    <button
                        onClick={onToggleScheduled}
                        aria-label="Scheduled posts"
                        title="Scheduled posts"
                        className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                    </button>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        aria-label="Refresh feed"
                        title="Refresh feed (R)"
                        className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8}
                            stroke="currentColor"
                            className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.02 19.644v-4.992h4.992m0 0l3.181-3.183a8.25 8.25 0 0 1 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                    </button>
                    <button
                        onClick={() => setShowHelp((v) => !v)}
                        aria-label="Keyboard shortcuts"
                        title="Keyboard shortcuts (?)"
                        aria-pressed={showHelp}
                        className={`p-2 rounded-full transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center ${
                            showHelp
                                ? "text-blue-600 bg-blue-50 dark:bg-blue-900/30"
                                : "text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                    >
                        <span className="text-xs font-bold">?</span>
                    </button>
                </div>
            </div>

            {showHelp && (
                <div className="mt-2 mx-1 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">Keyboard shortcuts</p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                        {shortcuts.map((s) => (
                            <li key={s.keys} className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                                <span>{s.label}</span>
                                <kbd className="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900">
                                    {s.keys}
                                </kbd>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

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
                    <AdCard key={`ad-${item.adKey}-${item.data._id}`} ad={item.data} />
                ) : item.data?._id ? (
                    <div key={item.data._id} data-feed-post>
                        <PostCard
                            post={item.data}
                            onDelete={handleDelete}
                            onHashtag={onHashtag}
                            serverTranslation={serverTranslations[item.data._id]}
                            trackView={trackView}
                        />
                    </div>
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
