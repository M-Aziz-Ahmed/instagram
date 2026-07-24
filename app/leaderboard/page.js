"use client";

import { useState, useEffect, useMemo } from "react";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

const PERIODS = [
    { id: "all", label: "All Time" },
    { id: "month", label: "This Month" },
    { id: "week", label: "This Week" },
];

const METRICS = [
    { id: "likes", label: "Most Liked", icon: "❤️" },
    { id: "views", label: "Most Viewed", icon: "👁️" },
    { id: "comments", label: "Most Active", icon: "💬" },
];

const ACHIEVEMENT_ICONS = {
    first_post: "🎉", posts_10: "🔊", posts_50: "💪", posts_100: "💯",
    streak_3: "🔥", streak_7: "⚔️", streak_30: "🏆",
    liked_10: "❤️", liked_100: "😍", comment_10: "💬",
    views_1000: "👁️", views_10000: "🌟", bookmarked_10: "🔖", repost_5: "🔄",
};

export default function LeaderboardPage() {
    const { user } = useUser();
    const [period, setPeriod] = useState("all");
    const [metric, setMetric] = useState("likes");
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/leaderboard?period=${period}&metric=${metric}&limit=20`)
            .then((r) => r.json())
            .then((d) => { setData(Array.isArray(d) ? d : []); setLoading(false); })
            .catch(() => { setData([]); setLoading(false); });
    }, [period, metric]);

    const myRank = useMemo(() => {
        if (!user?.username) return -1;
        return data.findIndex((d) => d.username === user.username) + 1;
    }, [data, user]);

    const getMedal = (i) => {
        if (i === 0) return "🥇";
        if (i === 1) return "🥈";
        if (i === 2) return "🥉";
        return `#${i + 1}`;
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
            <div className="max-w-2xl mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Leaderboard</h1>
                    {myRank > 0 && (
                        <span className="text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full font-medium">
                            Your rank: #{myRank}
                        </span>
                    )}
                </div>

                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                    {PERIODS.map((p) => (
                        <button key={p.id} onClick={() => setPeriod(p.id)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${period === p.id ? "bg-blue-500 text-white" : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                            {p.label}
                        </button>
                    ))}
                </div>

                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                    {METRICS.map((m) => (
                        <button key={m.id} onClick={() => setMetric(m.id)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${metric === m.id ? "bg-purple-500 text-white" : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                            <span>{m.icon}</span> {m.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : data.length === 0 ? (
                    <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
                        <p className="text-gray-400 dark:text-gray-500 text-sm">No data yet</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {data.map((item, i) => (
                            <Link key={item.username} href={`/profile/${item.username}`}
                                className={`flex items-center gap-3 p-4 rounded-2xl border transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/50 ${i < 3 ? "bg-white dark:bg-gray-900 border-yellow-200 dark:border-yellow-800/30 shadow-sm" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"}`}>
                                <span className={`w-10 text-center font-bold text-lg ${i < 3 ? "" : "text-gray-400 dark:text-gray-500 text-sm"}`}>
                                    {getMedal(i)}
                                </span>
                                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                                    style={{ backgroundColor: item.avatarColor || "#3b82f6" }}>
                                    {item.username?.[0]?.toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{item.username}</span>
                                        {item.isVerified && <span className="text-blue-500 text-xs">✓</span>}
                                        {item.isAdmin && <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded font-medium">Admin</span>}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                                        {item.postingStreak > 0 && <span>🔥 {item.postingStreak}d streak</span>}
                                        {item.achievements?.length > 0 && <span>{item.achievements.length} badges</span>}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="font-bold text-sm text-gray-900 dark:text-gray-100">
                                        {metric === "likes" && `${item.totalLikes?.toLocaleString() || 0} ❤️`}
                                        {metric === "views" && `${item.totalViews?.toLocaleString() || 0} 👁️`}
                                        {metric === "comments" && `${item.totalComments?.toLocaleString() || 0} 💬`}
                                    </p>
                                    {item.totalPosts && (
                                        <p className="text-xs text-gray-400 dark:text-gray-500">{item.totalPosts} posts</p>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
