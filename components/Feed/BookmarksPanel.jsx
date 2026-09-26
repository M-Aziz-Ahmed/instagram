"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import PostCard from "@/components/Feed/PostCard";
import { PostSkeleton } from "@/components/shared/Skeleton";

/**
 * Saved posts only, with no page chrome.
 *
 * The shell (auth gate, header, tabs) lives in `SavedClient`, which is what
 * `/me/saved` renders.
 */
export default function BookmarksPanel() {
    const { user } = useUser();
    const ids = user?.bookmarks;

    // One state object so "no bookmarks yet" and "still loading" cannot drift
    // apart, and so the effect never has to set a flag synchronously.
    const [state, setState] = useState({ posts: [], loading: true });

    const load = useCallback(async () => {
        if (!ids?.length) return [];
        const res = await fetch(`/api/posts/bookmarks?ids=${encodeURIComponent(ids.join(","))}`);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    }, [ids]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const posts = await load();
                if (!cancelled) setState({ posts, loading: false });
            } catch {
                if (!cancelled) setState({ posts: [], loading: false });
            }
        })();

        return () => { cancelled = true; };
    }, [load]);

    // Handed to PostCard so un-bookmarking a post drops it from the list
    // without a full remount.
    const refresh = useCallback(() => {
        (async () => {
            try {
                const posts = await load();
                setState({ posts, loading: false });
            } catch { /* keep what we have */ }
        })();
    }, [load]);

    if (state.loading) {
        return (
            <div>
                <PostSkeleton />
                <PostSkeleton />
                <PostSkeleton />
            </div>
        );
    }

    if (state.posts.length === 0) {
        return (
            <div className="flex flex-col items-center py-20 text-gray-400 dark:text-gray-500 select-none">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3 opacity-40">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                </svg>
                <p className="text-sm">No saved posts yet.</p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Tap the bookmark icon on any post to keep it here.
                </p>
            </div>
        );
    }

    return (
        <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            {state.posts.map((p) => (
                <PostCard
                    key={p._id}
                    post={p}
                    onDelete={refresh}
                    onHashtag={(tag) => { window.location.href = `/?tag=${tag}`; }}
                />
            ))}
        </div>
    );
}
