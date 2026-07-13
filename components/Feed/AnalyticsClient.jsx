"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

function StatCard({ label, value, icon }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
                    {icon}
                </div>
                <div>
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                </div>
            </div>
        </div>
    );
}

function MiniChart({ data, color = "#3b82f6" }) {
    const values = Object.values(data);
    const max = Math.max(...values, 1);
    
    return (
        <div className="flex items-end gap-1 h-16">
            {values.slice(-7).map((v, i) => (
                <div
                    key={i}
                    className="flex-1 rounded-t transition-all"
                    style={{
                        height: `${(v / max) * 100}%`,
                        backgroundColor: color,
                        opacity: 0.2 + (i / values.length) * 0.8,
                    }}
                />
            ))}
        </div>
    );
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AnalyticsClient() {
    const { user, ready } = useUser();
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!ready || !user) return;
        
        const fetchAnalytics = async () => {
            try {
                const res = await fetch(`/api/analytics?username=${user.username}`);
                if (!res.ok) throw new Error("Failed to fetch analytics");
                const data = await res.json();
                setAnalytics(data);
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        
        fetchAnalytics();
    }, [ready, user]);

    if (!ready || !user) {
        return (
            <div className="flex h-dvh items-center justify-center">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-dvh bg-gray-50">
                <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
                    <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
                        <Link href="/" className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                            </svg>
                        </Link>
                        <span className="font-bold text-base text-gray-900">Analytics</span>
                    </div>
                </header>
                <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-dvh bg-gray-50">
                <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
                    <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
                        <Link href="/" className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                            </svg>
                        </Link>
                        <span className="font-bold text-base text-gray-900">Analytics</span>
                    </div>
                </header>
                <div className="flex justify-center py-12">
                    <p className="text-red-500 text-sm">{error}</p>
                </div>
            </div>
        );
    }

    const { stats, charts, topPosts, topHashtags } = analytics;

    return (
        <div className="min-h-dvh bg-gray-50">
            <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
                <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
                    <Link href="/" className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </Link>
                    <span className="font-bold text-base text-gray-900">Analytics</span>
                </div>
            </header>

            <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                    <StatCard
                        label="Posts"
                        value={stats.totalPosts}
                        icon={
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" />
                            </svg>
                        }
                    />
                    <StatCard
                        label="Total Likes"
                        value={stats.totalLikes}
                        icon={
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                            </svg>
                        }
                    />
                    <StatCard
                        label="Comments"
                        value={stats.totalComments}
                        icon={
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
                            </svg>
                        }
                    />
                    <StatCard
                        label="Total Views"
                        value={stats.totalViews}
                        icon={
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            </svg>
                        }
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div className="bg-white rounded-2xl border border-gray-200 p-5">
                        <h3 className="font-bold text-sm text-gray-900 mb-4">Posts (Last 7 Days)</h3>
                        <MiniChart data={charts.postsByDay} color="#3b82f6" />
                        <div className="flex justify-between mt-2 overflow-hidden">
                            {Object.keys(charts.postsByDay).slice(-7).map((date, i, arr) => (
                                <span key={date} className={`text-[10px] text-gray-400 ${i === 0 || i === arr.length - 1 ? "" : "hidden sm:inline"}`}>{formatDate(date)}</span>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200 p-5">
                        <h3 className="font-bold text-sm text-gray-900 mb-4">Engagement Rate</h3>
                        <div className="flex items-center gap-3 sm:gap-4">
                            <div className="text-3xl sm:text-4xl font-bold text-gray-900 truncate">{stats.engagementRate}</div>
                            <div className="text-xs sm:text-sm text-gray-500">avg. interactions per post</div>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div className="text-lg font-semibold text-gray-900">{stats.totalLikes}</div>
                                <div className="text-xs text-gray-500">Likes</div>
                            </div>
                            <div>
                                <div className="text-lg font-semibold text-gray-900">{stats.totalComments}</div>
                                <div className="text-xs text-gray-500">Comments</div>
                            </div>
                            <div>
                                <div className="text-lg font-semibold text-gray-900">{stats.totalViews}</div>
                                <div className="text-xs text-gray-500">Views</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl border border-gray-200 p-5">
                        <h3 className="font-bold text-sm text-gray-900 mb-4">Top Posts</h3>
                        {topPosts.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-4">No posts yet</p>
                        ) : (
                            <div className="space-y-3">
                                {topPosts.map((post) => (
                                    <div
                                        key={post.id}
                                        className="p-3 rounded-xl hover:bg-gray-50 transition-colors"
                                    >
                                        <p className="text-sm text-gray-900 line-clamp-2">{post.text || "Image post"}</p>
                                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                                                </svg>
                                                {post.likes}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
                                                </svg>
                                                {post.comments}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                                </svg>
                                                {post.views}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200 p-5">
                        <h3 className="font-bold text-sm text-gray-900 mb-4">Top Hashtags</h3>
                        {topHashtags.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-4">No hashtags used yet</p>
                        ) : (
                            <div className="space-y-2">
                                {topHashtags.map((item) => (
                                    <div key={item.tag} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                                        <span className="text-sm font-medium text-blue-500">#{item.tag}</span>
                                        <span className="text-xs text-gray-500">{item.count} post{item.count !== 1 && "s"}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
