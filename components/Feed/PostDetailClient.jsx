"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import PostCard from "./PostCard";
import { PostSkeleton } from "@/components/shared/Skeleton";

export default function PostDetailClient({ postId }) {
    const { user, ready } = useUser();
    const router = useRouter();
    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!postId) return;
        let cancelled = false;
        fetch(`/api/posts/${postId}`)
            .then((res) => {
                if (!res.ok) throw new Error("Post not found");
                return res.json();
            })
            .then((data) => { if (!cancelled) { setPost(data); setLoading(false); } })
            .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
        return () => { cancelled = true; };
    }, [postId]);

    if (loading) {
        return (
            <div className="min-h-dvh bg-white dark:bg-gray-950">
                <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                    <div className="max-w-2xl mx-auto px-4 h-12 sm:h-14 flex items-center gap-3">
                        <button
                            onClick={() => router.back()}
                            aria-label="Go back"
                            className="p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <span className="font-bold text-sm text-gray-900 dark:text-gray-100">Post</span>
                    </div>
                </header>
                <main className="max-w-2xl mx-auto">
                    <PostSkeleton />
                </main>
            </div>
        );
    }

    if (error || !post) {
        return (
            <div className="min-h-dvh bg-white dark:bg-gray-950 flex flex-col items-center justify-center gap-4 p-6">
                <p className="text-gray-500 dark:text-gray-400 text-sm">{error || "Post not found"}</p>
                <button
                    onClick={() => router.push("/")}
                    className="text-sm font-semibold text-blue-500 hover:text-blue-600 dark:hover:text-blue-400"
                >
                    Go to feed
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950">
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-2xl mx-auto px-4 h-12 sm:h-14 flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        aria-label="Go back"
                        className="p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100">Post</span>
                </div>
            </header>

            <main className="max-w-2xl mx-auto">
                <PostCard post={post} />
            </main>
        </div>
    );
}
