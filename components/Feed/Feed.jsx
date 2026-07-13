"use client";

import { useCallback, useEffect, useState } from "react";
import PostCard from "./PostCard";

export default function Feed({ refreshTrigger, activeTag, onHashtag, onAuthError, feedType, username }) {
    const [posts, setPosts]     = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchPosts = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (activeTag) params.set("tag", activeTag);
            if (feedType === "following" && username) {
                params.set("feed", "following");
                params.set("username", username);
            }
            const url = `/api/posts${params.toString() ? `?${params}` : ""}`;
            const res = await fetch(url, { cache: "no-store" });
            if (res.status === 401) {
                onAuthError?.();
                return;
            }
            if (res.ok) {
                const data = await res.json();
                setPosts(data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [activeTag, onAuthError, feedType, username]);

    useEffect(() => {
        setLoading(true);
        fetchPosts();
    }, [fetchPosts, refreshTrigger]);

    useEffect(() => {
        const id = setInterval(fetchPosts, 10000);
        return () => clearInterval(id);
    }, [fetchPosts]);

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
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
            {posts.map((post) => (
                <PostCard
                    key={post._id}
                    post={post}
                    onDeleted={fetchPosts}
                    onHashtag={onHashtag}
                />
            ))}
        </div>
    );
}
