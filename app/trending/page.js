"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import Link from "next/link";
import UserBadges from "@/components/shared/UserBadges";

function timeAgo(date) {
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
}

function PostCard({ post }) {
    return (
        <Link href={`/post/${post.id}`} className="block bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ backgroundColor: post.avatarColor || "#3b82f6" }}>
                    {post.sender?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{post.sender}</span>
                        {post.isVerified && <span className="text-blue-500 text-xs">✓</span>}
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">· {timeAgo(post.timeStamp)}</span>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 mt-1 line-clamp-3 whitespace-pre-wrap break-words">{post.text}</p>
                    <div className="flex items-center gap-4 mt-2.5 text-[11px] text-gray-400 dark:text-gray-500">
                        <span>❤️ {post.likeCount || 0}</span>
                        <span>💬 {post.commentCount || 0}</span>
                        <span>👁 {post.viewCount || 0}</span>
                        {post.score > 0 && <span className="text-orange-500 font-semibold">🔥 {Math.round(post.score)}</span>}
                    </div>
                </div>
            </div>
        </Link>
    );
}

export default function TrendingPage() {
    const { user } = useUser();
    const [trending, setTrending] = useState({ hashtags: [], hotPosts: [] });
    const [todayPosts, setTodayPosts] = useState([]);
    const [activeTab, setActiveTab] = useState("trending");
    const [loading, setLoading] = useState(true);

    const fetchTrending = useCallback(async () => {
        try {
            const r = await fetch("/api/social/trending");
            if (r.ok) setTrending(await r.json());
        } catch {}
    }, []);

    const fetchTodayPosts = useCallback(async () => {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const r = await fetch("/api/posts?limit=30");
            if (r.ok) {
                const data = await r.json();
                const todayPosts = Array.isArray(data.posts) ? data.posts.filter(p => !p.isScheduled && new Date(p.timeStamp) >= today && !p.isRemoved) : [];
                setTodayPosts(todayPosts);
            }
        } catch {}
    }, []);

    useEffect(() => {
        Promise.all([fetchTrending(), fetchTodayPosts()]).then(() => setLoading(false));
    }, [fetchTrending, fetchTodayPosts]);

    if (loading) {
        return (
            <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-20 lg:pb-4">
            {/* Header */}
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-2xl mx-auto px-4 h-12 sm:h-14 flex items-center gap-3">
                    <Link href="/" className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </Link>
                    <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">What&apos;s Happening</h1>
                </div>
                {/* Tabs */}
                <div className="max-w-2xl mx-auto px-4 flex gap-1 border-b border-gray-100 dark:border-gray-800">
                    {[
                        { id: "trending", label: "🔥 Trending" },
                        { id: "today", label: "📅 Today" },
                        { id: "top", label: "🏆 Top Posts" },
                    ].map((tab) => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab.id ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </header>

            <div className="max-w-2xl mx-auto px-4 mt-4 space-y-4">
                {/* Trending Tab */}
                {activeTab === "trending" && (
                    <>
                        {/* Trending hashtags */}
                        {trending.hashtags.length > 0 && (
                            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Trending Hashtags</h2>
                                <div className="space-y-1">
                                    {trending.hashtags.map((h, i) => (
                                        <Link key={h.tag} href={`/?tag=${h.tag}`} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5">{i + 1}</span>
                                                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">#{h.tag}</span>
                                            </div>
                                            <span className="text-xs text-gray-400 dark:text-gray-500">{h.count} post{h.count !== 1 ? "s" : ""}</span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Hot posts */}
                        {trending.hotPosts.length > 0 && (
                            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Hot Right Now 🔥</h2>
                                <div className="space-y-3">
                                    {trending.hotPosts.map((p) => (
                                        <PostCard key={p.id} post={p} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {trending.hashtags.length === 0 && trending.hotPosts.length === 0 && (
                            <div className="text-center py-16 text-gray-400 text-sm">
                                Nothing trending yet. Start posting to see trends here!
                            </div>
                        )}
                    </>
                )}

                {/* Today Tab */}
                {activeTab === "today" && (
                    <>
                        {todayPosts.length > 0 ? (
                            <div className="space-y-3">
                                {todayPosts.map((p) => (
                                    <PostCard key={p._id} post={{
                                        id: p._id,
                                        sender: p.sender,
                                        text: p.text,
                                        likeCount: p.likes?.length || 0,
                                        commentCount: p.comments?.length || 0,
                                        viewCount: p.viewCount || 0,
                                        avatarColor: p.color || "#3b82f6",
                                        timeStamp: p.timeStamp,
                                    }} />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16 text-gray-400 text-sm">
                                No posts yet today. Be the first!
                            </div>
                        )}
                    </>
                )}

                {/* Top Posts Tab */}
                {activeTab === "top" && (
                    <>
                        {trending.hotPosts.length > 0 ? (
                            <div className="space-y-3">
                                {trending.hotPosts.map((p, i) => (
                                    <div key={p.id} className="relative">
                                        {i < 3 && (
                                            <div className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold z-10 shadow">
                                                {i + 1}
                                            </div>
                                        )}
                                        <PostCard post={p} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16 text-gray-400 text-sm">
                                No top posts yet. Keep engaging!
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
