"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function TrendingSidebar() {
    const [trending, setTrending] = useState({ hashtags: [], hotPosts: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/trending")
            .then((r) => r.json())
            .then((d) => { setTrending(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    if (loading) return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex justify-center py-4">
                <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
        </div>
    );

    if (!trending.hashtags?.length && !trending.hotPosts?.length) return null;

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    🔥 What&apos;s Happening
                </h3>
            </div>

            {trending.hashtags?.length > 0 && (
                <div className="p-4">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Trending Tags</p>
                    <div className="space-y-2">
                        {trending.hashtags.slice(0, 5).map((h) => (
                            <Link key={h.tag} href={`/?tag=${h.tag}`}
                                className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                <span className="text-sm font-medium text-blue-500">#{h.tag}</span>
                                <span className="text-xs text-gray-400 dark:text-gray-500">{h.count} posts</span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {trending.hotPosts?.length > 0 && (
                <div className="p-4 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Hot Posts</p>
                    <div className="space-y-3">
                        {trending.hotPosts.slice(0, 3).map((p) => (
                            <Link key={p.id} href={`/?highlight=${p.id}`}
                                className="block p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                        style={{ backgroundColor: p.avatarColor || "#3b82f6" }}>
                                        {p.sender?.[0]?.toUpperCase()}
                                    </div>
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{p.sender}</span>
                                    {p.isVerified && <span className="text-blue-500 text-[10px]">✓</span>}
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{p.text}</p>
                                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                                    <span>❤️ {p.likeCount}</span>
                                    <span>💬 {p.commentCount}</span>
                                    <span>👁️ {p.viewCount}</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
