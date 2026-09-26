"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";

// Explore is the app's discovery surface: what is worth reading right now,
// ranked across the whole platform rather than just the people you follow.
//
// Backed by GET /api/trending (tags + hot posts) and GET /api/trending/top
// (cursor-paginated ranked feed). The server applies the same visibility rules
// as the main feed — close-friends posts, scheduled posts, and anything blocked
// or muted never surface here.

const WINDOWS = [
    { id: "day", label: "24h" },
    { id: "week", label: "7d" },
    { id: "month", label: "30d" },
];

// Categories are static, so they're hardcoded rather than fetched. Each one is
// a real route already in the app.
const CATEGORIES = [
    { name: "Watch", href: "/watch", emoji: "\u{1F3AC}", blurb: "Anime, K-dramas, films" },
    { name: "Manga", href: "/manga", emoji: "\u{1F4D6}", blurb: "Read and follow series" },
    { name: "Learn", href: "/education", emoji: "\u{1F393}", blurb: "Courses and live rooms" },
    { name: "Games", href: "/games", emoji: "\u{1F3AE}", blurb: "Play with friends" },
    { name: "Communities", href: "/communities", emoji: "\u{1F465}", blurb: "Find your people" },
    { name: "Trending", href: "/trending", emoji: "\u{1F525}", blurb: "What's moving today" },
    { name: "Leaderboard", href: "/leaderboard", emoji: "\u{1F3C6}", blurb: "See the top accounts" },
    { name: "Messages", href: "/inbox", emoji: "\u{1F4AC}", blurb: "Pick up a conversation" },
];

function timeAgo(date) {
    const s = Math.max(0, Math.floor((Date.now() - new Date(date)) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    const w = Math.floor(d / 7);
    if (w < 5) return `${w}w`;
    return `${Math.floor(w / 4)}mo`;
}

function PostCard({ post, rank }) {
    return (
        <Link
            href={`/post/${post.id}`}
            className="relative block bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all"
        >
            {rank > 0 && rank <= 3 && (
                <span
                    className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow ${
                        rank === 1
                            ? "bg-gradient-to-br from-yellow-400 to-orange-500"
                            : rank === 2
                              ? "bg-gradient-to-br from-gray-300 to-gray-500"
                              : "bg-gradient-to-br from-amber-600 to-amber-800"
                    }`}
                >
                    {rank}
                </span>
            )}
            <div className="flex items-start gap-3">
                <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: post.avatarColor || "#3b82f6" }}
                >
                    {post.avatarUrl ? (
                        <img src={post.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                        post.sender?.[0]?.toUpperCase()
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                            {post.sender}
                        </span>
                        {post.isVerified && (
                            <span className="text-blue-500 text-xs shrink-0" title="Verified">&#10003;</span>
                        )}
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
                            &middot; {timeAgo(post.timeStamp)}
                        </span>
                    </div>
                    {post.text && (
                        <p className="text-sm text-gray-800 dark:text-gray-200 mt-1 line-clamp-3 whitespace-pre-wrap break-words">
                            {post.text}
                        </p>
                    )}
                    <div className="flex items-center gap-4 mt-2.5 text-[11px] text-gray-400 dark:text-gray-500">
                        <span>&#9825; {post.likeCount || 0}</span>
                        <span>&#128172; {post.commentCount || 0}</span>
                        <span>&#128065; {post.viewCount || 0}</span>
                    </div>
                </div>
            </div>
        </Link>
    );
}

function TagPill({ tag, count }) {
    return (
        <Link
            href={`/search?tag=${encodeURIComponent(tag)}`}
            className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">#{tag}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
                {count} post{count !== 1 ? "s" : ""}
            </span>
        </Link>
    );
}

function Skeleton() {
    return (
        <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
                <div
                    key={i}
                    className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 animate-pulse"
                >
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
                            <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-800/60" />
                            <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-gray-800/60" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function ExploreClient() {
    const { user } = useUser();
    const viewer = user?.username || "";

    const [tab, setTab] = useState("top");
    const [windowKey, setWindowKey] = useState("week");

    const [top, setTop] = useState({ posts: [], hasMore: false, nextCursor: null });
    const [trending, setTrending] = useState({ hashtags: [], hotPosts: [] });
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");

    // Which tab/window the data currently on screen belongs to. `loading` is
    // derived from it rather than being set inside an effect: setting a loading
    // flag synchronously in an effect body is what makes these components
    // cascade a render on every tab switch.
    // "browse" is static markup with nothing to fetch, so it counts as settled
    // from the start and must not show the skeleton.
    const activeKey =
        tab === "categories" ? "categories"
        : tab === "top" ? "top"
        : tab === "tags" ? "tags"
        : `trending:${windowKey}`;
    const [loadedKey, setLoadedKey] = useState(null);
    // The static tab is the one case with nothing to wait for, so it must be
    // excluded here and not just in the effect: gating the category grid
    // behind `!loading` would otherwise leave the tab permanently blank.
    const loading = tab !== "categories" && loadedKey !== activeKey;

    const qs = useCallback(
        (extra) => {
            const p = new URLSearchParams(extra);
            // The server uses this to drop posts from accounts this viewer has
            // blocked or muted, so it has to travel with every request.
            if (viewer) p.set("username", viewer);
            return p.toString();
        },
        [viewer]
    );

    useEffect(() => {
        // "browse" is entirely static, so it needs no request.
        if (tab === "categories") return;
        let cancelled = false;

        (async () => {
            try {
                const url =
                    tab === "top"
                        ? `/api/trending/top?${qs({ limit: 24 })}`
                        : `/api/trending?${qs({ window: windowKey, tags: 12, posts: tab === "tags" ? 0 : 10 })}`;

                const res = await fetch(url);
                if (cancelled) return;
                if (!res.ok) throw new Error(res.status === 404 ? "Not found" : "Something went wrong");

                const data = await res.json();
                if (cancelled) return;
                if (tab === "top") setTop(data);
                else setTrending(data);
                setError("");
            } catch (err) {
                if (cancelled) return;
                setError(err.message === "Failed to fetch" ? "You appear to be offline" : err.message);
            } finally {
                // Marks this view as settled so the skeleton stops, including
                // on failure — otherwise a failed tab would spin forever.
                if (!cancelled) setLoadedKey(activeKey);
            }
        })();

        return () => { cancelled = true; };
    }, [tab, windowKey, activeKey, qs]);

    const loadMore = async () => {
        if (loadingMore || !top.hasMore || !top.nextCursor) return;
        setLoadingMore(true);
        try {
            const res = await fetch(`/api/trending/top?${qs({ limit: 24, before: top.nextCursor })}`);
            if (!res.ok) return;
            const data = await res.json();
            setTop((prev) => {
                // Cursor pagination can repeat a post when several share a
                // timestamp, so dedupe on the way in.
                const seen = new Set(prev.posts.map((p) => p.id));
                const fresh = (data.posts || []).filter((p) => !seen.has(p.id));
                return { ...data, posts: [...prev.posts, ...fresh] };
            });
        } catch {
            /* keep what we have; the user can retry */
        } finally {
            setLoadingMore(false);
        }
    };

    const TABS = [
        { id: "top", label: "Top" },
        { id: "trending", label: "Trending" },
        { id: "tags", label: "Tags" },
        { id: "categories", label: "Browse" },
    ];

    return (
        <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-20 lg:pb-4">
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-2xl mx-auto px-4 h-12 sm:h-14 flex items-center gap-3">
                    <Link
                        href="/social"
                        aria-label="Back to Social"
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </Link>
                    <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">Explore</h1>
                </div>
                <div className="max-w-2xl mx-auto px-4 flex gap-1 border-b border-gray-100 dark:border-gray-800">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                                tab === t.id
                                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </header>

            <div className="max-w-2xl mx-auto px-4 mt-4 space-y-4">
                {error && (
                    <p className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
                        {error}
                    </p>
                )}

                {tab === "trending" && (
                    <div className="flex gap-1 justify-center">
                        {WINDOWS.map((w) => (
                            <button
                                key={w.id}
                                onClick={() => setWindowKey(w.id)}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                                    windowKey === w.id
                                        ? "bg-blue-600 text-white"
                                        : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800"
                                }`}
                            >
                                {w.label}
                            </button>
                        ))}
                    </div>
                )}

                {loading && <Skeleton />}

                {/* ── Top ─────────────────────────────────────────────────── */}
                {!loading && tab === "top" && (
                    <>
                        {top.posts.length > 0 ? (
                            <div className="space-y-3">
                                {top.posts.map((p, i) => (
                                    <PostCard key={p.id} post={p} rank={i + 1} />
                                ))}
                            </div>
                        ) : (
                            <Empty
                                title="Nothing trending yet"
                                body="No public posts from the last month. Be the first to post."
                            />
                        )}

                        {top.hasMore && (
                            <button
                                onClick={loadMore}
                                disabled={loadingMore}
                                className="w-full py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                            >
                                {loadingMore ? "Loading…" : "Load more"}
                            </button>
                        )}
                    </>
                )}

                {/* ── Trending ───────────────────────────────────────────── */}
                {!loading && tab === "trending" && (
                    <>
                        {trending.hashtags.length > 0 && (
                            <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">
                                    Trending hashtags
                                </h2>
                                <div className="space-y-1">
                                    {trending.hashtags.map((h, i) => (
                                        <div key={h.tag} className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-gray-300 dark:text-gray-600 w-4 text-center">
                                                {i + 1}
                                            </span>
                                            <div className="flex-1">
                                                <TagPill tag={h.tag} count={h.count} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {trending.hotPosts.length > 0 && (
                            <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">
                                    Hot right now
                                </h2>
                                <div className="space-y-3">
                                    {trending.hotPosts.map((p) => (
                                        <PostCard key={p.id} post={p} rank={0} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {trending.hashtags.length === 0 && trending.hotPosts.length === 0 && (
                            <Empty
                                title="Quiet in here"
                                body={`Nothing is trending in the last ${WINDOWS.find((w) => w.id === windowKey)?.label || "week"}.`}
                            />
                        )}
                    </>
                )}

                {/* ── Tags ───────────────────────────────────────────────── */}
                {!loading && tab === "tags" && (
                    <>
                        {trending.hashtags.length > 0 ? (
                            <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-2">
                                {trending.hashtags.map((h) => (
                                    <TagPill key={h.tag} tag={h.tag} count={h.count} />
                                ))}
                            </section>
                        ) : (
                            <Empty title="No tags yet" body="No posts carry a hashtag yet." />
                        )}
                    </>
                )}

                {/* ── Categories ─────────────────────────────────────────── */}
                {!loading && tab === "categories" && (
                    <div className="grid grid-cols-2 gap-3">
                        {CATEGORIES.map((c) => (
                            <Link
                                key={c.href}
                                href={c.href}
                                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all"
                            >
                                <div className="text-2xl mb-2" aria-hidden="true">{c.emoji}</div>
                                <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{c.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.blurb}</div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function Empty({ title, body }) {
    return (
        <div className="text-center py-16 text-gray-400 text-sm">
            <p className="font-semibold text-gray-500 dark:text-gray-400">{title}</p>
            <p className="mt-1">{body}</p>
        </div>
    );
}
