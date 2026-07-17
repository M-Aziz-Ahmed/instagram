"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import PostCard from "@/components/Feed/PostCard";
import { useSidebar } from "@/context/SidebarContext";

export default function BookmarksClient() {
    const { user, ready } = useUser();
    const router = useRouter();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const { openSidebar } = useSidebar();

    useEffect(() => {
        if (ready && !user) router.replace("/login");
    }, [ready, user, router]);

    const fetchBookmarks = useCallback(async () => {
        if (!user?.bookmarks?.length) { setLoading(false); return; }
        try {
            const results = await Promise.all(
                user.bookmarks.map((id) =>
                    fetch(`/api/posts/${id}`).then((r) => r.ok ? r.json() : null).catch(() => null)
                )
            );
            setPosts(results.filter(Boolean));
        } catch { /* silent */ }
        setLoading(false);
    }, [user?.bookmarks]);

    useEffect(() => { fetchBookmarks(); }, [fetchBookmarks]);

    if (!ready || !user) {
        return (
            <div className="flex h-dvh items-center justify-center">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
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
                    <div className="flex justify-center py-20">
                        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
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
                                onDeleted={fetchBookmarks}
                                onHashtag={(tag) => { window.location.href = `/?tag=${tag}`; }}
                            />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
