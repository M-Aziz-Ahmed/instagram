"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

function StatCard({ label, value, hint, icon }) {
    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
                    {hint ? <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p> : null}
                </div>
                <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 shrink-0">
                    {icon}
                </div>
            </div>
        </div>
    );
}

/**
 * Zero-filled daily series, oldest first. The server sends a gapless run of days
 * so the x-axis stays continuous instead of collapsing quiet stretches.
 */
function SeriesChart({ data, color }) {
    const entries = Object.entries(data || {});
    const max = Math.max(1, ...entries.map(([, v]) => v));
    const total = entries.reduce((s, [, v]) => s + v, 0);

    if (!entries.length) {
        return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No data yet</p>;
    }

    return (
        <div>
            <div className="flex items-end gap-[2px] h-24">
                {entries.map(([day, v]) => (
                    <div
                        key={day}
                        title={`${day}: ${v}`}
                        className="flex-1 rounded-t-sm transition-all min-h-[2px]"
                        style={{
                            height: `${Math.max(2, (v / max) * 100)}%`,
                            backgroundColor: color,
                            opacity: v > 0 ? 0.85 : 0.15,
                        }}
                    />
                ))}
            </div>
            <div className="flex justify-between mt-2">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {formatDate(entries[0][0])}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{total} in range</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {formatDate(entries[entries.length - 1][0])}
                </span>
            </div>
        </div>
    );
}

function formatDate(dateStr) {
    const date = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Header() {
    return (
        <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
            <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
                <Link
                    href="/social"
                    aria-label="Back to feed"
                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                </Link>
                <span className="font-bold text-base text-gray-900 dark:text-gray-100">Analytics</span>
            </div>
        </header>
    );
}

const SERIES = [
    { id: "impressionsByDay", label: "Impressions", color: "#3b63f6" },
    { id: "reachByDay", label: "Reach", color: "#10b981" },
    { id: "clicksByDay", label: "Clicks", color: "#f59e0b" },
];

export default function AnalyticsClient() {
    const { user, ready } = useUser();
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [series, setSeries] = useState("impressionsByDay");

    useEffect(() => {
        if (!ready || !user) return;

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/analytics?username=${encodeURIComponent(user.username)}`);
                if (res.status === 401 || res.status === 403) {
                    throw new Error("These numbers are only visible to you.");
                }
                if (!res.ok) throw new Error("Couldn't load your analytics. Try again.");
                const data = await res.json();
                if (!cancelled) setAnalytics(data);
            } catch (e) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [ready, user]);

    if (!ready) {
        return (
            <div className="flex h-dvh items-center justify-center bg-white dark:bg-gray-950">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-[var(--brand-500)] rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="min-h-dvh app-bg">
                <Header />
                <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sign in to see your analytics</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Your stats are private to your account</p>
                    <Link href="/login" className="btn-primary px-5 py-2.5 text-xs font-bold">Sign In</Link>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-dvh app-bg">
                <Header />
                <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-[var(--brand-500)] rounded-full animate-spin" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-dvh app-bg">
                <Header />
                <div className="flex justify-center py-12 px-4">
                    <p className="text-sm text-red-500 dark:text-red-400 text-center">{error}</p>
                </div>
            </div>
        );
    }

    const { stats, charts, topPosts, topHashtags } = analytics;
    const active = SERIES.find((s) => s.id === series) || SERIES[0];
    const windowDays = stats.windowDays || 28;
    const hasEvents = (stats.totalImpressions || 0) > 0 || (stats.totalClicks || 0) > 0;

    return (
        <div className="min-h-dvh app-bg">
            <Header />

            <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Last {windowDays} days
                    {hasEvents ? "" : " · no impressions recorded yet"}
                </p>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                    <StatCard
                        label="Impressions"
                        value={stats.totalImpressions}
                        hint="Times your posts were on screen"
                        icon={
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            </svg>
                        }
                    />
                    <StatCard
                        label="Reach"
                        value={stats.totalReach}
                        hint="Unique viewers"
                        icon={
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                            </svg>
                        }
                    />
                    <StatCard
                        label="Clicks"
                        value={stats.totalClicks}
                        hint={`${stats.clickThroughRate}% of impressions`}
                        icon={
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                            </svg>
                        }
                    />
                    <StatCard
                        label="Posts"
                        value={stats.totalPosts}
                        hint={`${stats.totalLikes} likes · ${stats.totalComments} comments`}
                        icon={
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" />
                            </svg>
                        }
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">{active.label}</h3>
                            <div className="flex gap-1 p-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                                {SERIES.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => setSeries(s.id)}
                                        aria-pressed={series === s.id}
                                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                                            series === s.id
                                                ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm"
                                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                        }`}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <SeriesChart data={charts[active.id]} color={active.color} />
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                        <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-4">All-time engagement</h3>
                        <div className="flex items-center gap-3 sm:gap-4">
                            <div className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100">{stats.engagementRate}</div>
                            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">avg. interactions per post</div>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.totalLikes}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Likes</div>
                            </div>
                            <div>
                                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.totalComments}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Comments</div>
                            </div>
                            <div>
                                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.totalViews}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Views</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                        <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-4">Top posts by impressions</h3>
                        {topPosts.length === 0 ? (
                            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                                {hasEvents ? "No impressions in this window yet" : "Share a post and it will show up here"}
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {topPosts.map((post) => (
                                    <Link
                                        key={post.id}
                                        href={`/post/${post.id}`}
                                        className="block p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                    >
                                        <p className="text-sm text-gray-900 dark:text-gray-100 line-clamp-2">{post.text || "Image post"}</p>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
                                            <span><span className="font-semibold text-gray-900 dark:text-gray-100">{post.impressions}</span> impressions</span>
                                            <span><span className="font-semibold text-gray-900 dark:text-gray-100">{post.reach}</span> reach</span>
                                            <span><span className="font-semibold text-gray-900 dark:text-gray-100">{post.clicks}</span> clicks</span>
                                            <span>{post.likes} likes</span>
                                            {post.clickThroughRate !== null && (
                                                <span className="text-[var(--brand-500)] font-medium">{post.clickThroughRate}% CTR</span>
                                            )}
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                        <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-4">Top hashtags</h3>
                        {topHashtags.length === 0 ? (
                            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No hashtags used yet</p>
                        ) : (
                            <div className="space-y-2">
                                {topHashtags.map((item) => (
                                    <Link
                                        key={item.tag}
                                        href={`/search?tag=${encodeURIComponent(item.tag)}`}
                                        className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                    >
                                        <span className="text-sm font-medium text-blue-500">#{item.tag}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{item.count} post{item.count !== 1 && "s"}</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
