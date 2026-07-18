"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import PostCard from "@/components/Feed/PostCard";
import { PostSkeleton } from "@/components/shared/Skeleton";
import { useSidebar } from "@/context/SidebarContext";
import Link from "next/link";

export default function BookmarksClient() {
    const { user, ready } = useUser();
    const router = useRouter();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const { openSidebar } = useSidebar();

    const fetchBookmarks = useCallback(async () => {
        if (!user?.bookmarks?.length) { setLoading(false); return; }
        try {
            const ids = user.bookmarks.join(",");
            const res = await fetch(`/api/posts/bookmarks?ids=${encodeURIComponent(ids)}`);
            if (res.ok) setPosts(await res.json());
        } catch { /* silent */ }
        setLoading(false);
    }, [user?.bookmarks]);

    useEffect(() => { fetchBookmarks(); }, [fetchBookmarks]);

    if (!ready) {
        return (
            <div className="flex h-dvh items-center justify-center">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="min-h-dvh bg-white dark:bg-gray-950">
                <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                    <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
                        <button
                            onClick={openSidebar}
                            aria-label="Open menu"
                            className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                            </svg>
                        </button>
                        <span className="font-bold text-base text-gray-900 dark:text-gray-100">Bookmarks</span>
                    </div>
                </header>
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500 select-none px-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3 opacity-40">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                    </svg>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sign in to see your bookmarks</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Save posts to read them later</p>
                    <Link
                        href="/login"
                        className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold px-5 py-2.5 rounded-full transition-colors"
                    >
                        Sign In
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950">
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
                    <button
                        onClick={openSidebar}
                        aria-label="Open menu"
                        className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                    </button>
                    <span className="font-bold text-base text-gray-900 dark:text-gray-100">Bookmarks</span>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 py-6">
                {loading ? (
                    <div>
                        <PostSkeleton />
                        <PostSkeleton />
                        <PostSkeleton />
                    </div>
                ) : posts.length === 0 ? (
                    <div className="flex flex-col items-center py-20 text-gray-400 dark:text-gray-500 select-none">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3 opacity-40">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                        </svg>
                        <p className="text-sm">No saved posts yet.</p>
                    </div>
                ) : (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                        {posts.map((p) => (
                            <PostCard
                                key={p._id}
                                post={p}
                                onDelete={fetchBookmarks}
                                onHashtag={(tag) => { window.location.href = `/?tag=${tag}`; }}
                            />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
