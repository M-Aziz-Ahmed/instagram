"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import VideoPlayer from "@/components/shared/VideoPlayer";
import AdSlot from "@/components/shared/AdSlot";
import { timeAgo } from "@/utils/timeAgo";
import { trackImpression } from "@/utils/postAnalytics";

// Vertical, snap-scrolling video feed.
//
// Reels reuse the standard feed endpoint with `feed=reels` rather than a
// separate API, so block/mute exclusion, expiry and pagination are enforced in
// exactly one place. That also means the viewer's own username is required for
// the visibility filters to be applied, so an anonymous visitor is prompted to
// sign in rather than silently receiving an unfiltered feed.
export default function ReelsClient() {
    const { user, ready } = useUser();
    // Read the username into its own binding: referencing `user?.username`
    // inside the callbacks makes the compiler infer a dependency on the whole
    // `user` object, which it then refuses to reconcile with the explicit list.
    const username = user?.username;
    const [reels, setReels] = useState([]);
    const [status, setStatus] = useState("loading"); // "loading" | "ready" | "error"
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [before, setBefore] = useState(null);
    const seenRef = useRef(new Set());
    const sentinelRef = useRef(null);

    const load = useCallback(async (cursor, replace) => {
        const params = new URLSearchParams({ feed: "reels", limit: "8" });
        if (username) params.set("username", username);
        if (cursor) params.set("before", cursor);

        const res = await fetch(`/api/posts?${params}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load reels");
        const data = await res.json();

        const fresh = (data.posts || []).filter((p) => {
            const id = p._id?.toString();
            if (!id || seenRef.current.has(id)) return false;
            seenRef.current.add(id);
            return true;
        });

        if (replace) {
            setReels(fresh);
            // One impression per reel per session, matching how the feed counts
            // a post as seen.
            fresh.forEach((p) => trackImpression(p._id, p.sender));
        } else {
            setReels((prev) => [...prev, ...fresh]);
        }

        setHasMore(!!data.hasMore);
        setBefore(data.posts?.length ? data.posts[data.posts.length - 1].timeStamp : null);
    }, [username]);

    useEffect(() => {
        if (!ready || !username) return;

        let cancelled = false;
        (async () => {
            try {
                await load(null, true);
                if (!cancelled) setStatus("ready");
            } catch {
                if (!cancelled) setStatus("error");
            }
        })();
        return () => { cancelled = true; };
    }, [ready, username, load]);

    // Infinite scroll.
    useEffect(() => {
        if (!hasMore || status !== "ready" || loadingMore || !before) return;
        const el = sentinelRef.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return;
                setLoadingMore(true);
                load(before, false)
                    .catch(() => {})
                    .finally(() => setLoadingMore(false));
            },
            { rootMargin: "600px" }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, status, loadingMore, before, load]);

    if (ready && !user) {
        return (
            <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center bg-white dark:bg-gray-950">
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Reels</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                    Sign in to watch videos from people you follow.
                </p>
                <Link
                    href="/login"
                    className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                    Sign in
                </Link>
            </div>
        );
    }

    return (
        <div className="h-[calc(100dvh-4rem)] lg:h-dvh bg-black overflow-y-auto snap-y snap-mandatory scrollbar-hide">
            {status === "loading" ? (
                <div className="h-full flex items-center justify-center">
                    <div className="w-7 h-7 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
                </div>
            ) : status === "error" ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-sm text-gray-400">Couldn&apos;t load reels. Please try again.</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 text-sm font-medium text-white border border-gray-700 rounded-full hover:bg-gray-900 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            ) : reels.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
                    <h2 className="text-lg font-bold text-white">No videos yet</h2>
                    <p className="text-sm text-gray-400 max-w-sm">
                        Be the first to post a video. Open the composer and tap the video icon.
                    </p>
                    <Link
                        href="/social"
                        className="px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-gray-200 transition-colors"
                    >
                        Go to feed
                    </Link>
                </div>
            ) : (
                reels.map((reel) => (
                    <article
                        key={reel._id}
                        className="h-full w-full snap-start snap-always flex items-center justify-center relative"
                    >
                        <VideoPlayer
                            src={reel.videoUrl}
                            duration={reel.videoDuration}
                            width={reel.videoWidth}
                            height={reel.videoHeight}
                            mode="reel"
                            className="h-full w-full"
                        />

                        <div className="absolute left-0 right-0 bottom-0 p-4 pb-8 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none">
                            <div className="flex items-center gap-2 mb-1.5">
                                {reel.avatarUrl ? (
                                    <img src={reel.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                                ) : (
                                    <span
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                        style={{ backgroundColor: reel.color || "#3b82f6" }}
                                    >
                                        {reel.sender?.[0]?.toUpperCase()}
                                    </span>
                                )}
                                <Link
                                    href={`/profile/${reel.sender}`}
                                    className="text-sm font-semibold text-white hover:underline pointer-events-auto"
                                >
                                    {reel.sender}
                                </Link>
                                <span className="text-xs text-white/60">{timeAgo(reel.timeStamp)}</span>
                            </div>
                            {reel.text && (
                                <p className="text-sm text-white/90 line-clamp-2">{reel.text}</p>
                            )}
                        </div>

                        <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4 text-white">
                            <Link
                                href={`/post/${reel._id}`}
                                aria-label="Open post"
                                className="flex flex-col items-center gap-1"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                                </svg>
                                <span className="text-[10px]">{reel.comments?.length || 0}</span>
                            </Link>
                            <span className="flex flex-col items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                                </svg>
                                <span className="text-[10px]">{reel.likes?.length || 0}</span>
                            </span>
                        </div>
                    </article>
                ))
            )}

            {loadingMore && (
                <div className="h-16 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
                </div>
            )}
            <div ref={sentinelRef} className="h-1" aria-hidden="true" />

            {/* Deliberately after the last reel rather than between reels: the
                scroller snaps a full viewport per item, so an ad in the flow
                would break the snap rhythm and eat a whole screen of a video
                the user chose to watch. End of feed is the only spot here that
                costs nobody their playback. */}
            <AdSlot slot="reels" className="shrink-0" />
        </div>
    );
}
