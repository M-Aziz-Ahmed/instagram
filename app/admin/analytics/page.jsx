"use client";

import { useEffect, useState } from "react";
import useAnalytics from "@/components/Admin/useAnalytics";
import { AreaChart, BarChart, DonutChart, StatCard } from "@/components/Admin/charts";
import Globe from "@/components/Admin/Globe";

const GROWTH_KEYS = [
    { field: "users", label: "New users", color: "#10b981" },
    { field: "posts", label: "Posts", color: "#f43f5e" },
    { field: "events", label: "Tracked events", color: "#1cb0f6" },
    { field: "active", label: "Active users", color: "#8b5cf6" },
];

const RANGES = {
    day: [
        { label: "7 days", days: 7 },
        { label: "30 days", days: 30 },
        { label: "90 days", days: 90 },
    ],
    week: [
        { label: "1 month", days: 30 },
        { label: "3 months", days: 90 },
        { label: "6 months", days: 180 },
    ],
    month: [
        { label: "6 months", days: 180 },
        { label: "12 months", days: 365 },
    ],
    year: [{ label: "3 years", days: 365 * 3 }],
};

export default function AdminAnalytics() {
    const [granularity, setGranularity] = useState("day");
    const [days, setDays] = useState(30);
    const { growth, devices, locations, loading } = useAnalytics({ granularity, days });

    const applyGranularity = (g) => {
        setGranularity(g);
        setDays(RANGES[g][0]?.days || 30);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">Analytics</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Growth, devices and locations — view by day, week, month or year.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-1">
                        {["day", "week", "month", "year"].map((g) => (
                            <button
                                key={g}
                                onClick={() => applyGranularity(g)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${granularity === g ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                            >
                                {g}
                            </button>
                        ))}
                    </div>
                    <div className="flex bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-1">
                        {(RANGES[granularity] || []).map((r) => (
                            <button
                                key={r.days}
                                onClick={() => setDays(r.days)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${days === r.days ? "bg-[#1cb0f6] text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading || !growth ? (
                <div className="flex justify-center py-24">
                    <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-[#58cc02] rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    {/* Period total stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <StatCard label="New users" value={growth.totals?.users?.toLocaleString()} icon="🌱" hint={`${growth.series?.length || 0} ${granularity}(s)`} />
                        <StatCard label="Posts" value={growth.totals?.posts?.toLocaleString()} icon="📝" hint="created in period" />
                        <StatCard label="Events" value={growth.totals?.events?.toLocaleString()} icon="📈" hint="tracked in period" />
                    </div>

                    {/* Growth chart */}
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                            <div>
                                <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">
                                    Growth — {granularity === "year" ? "3 years" : `${days} ${granularity === "week" ? "days (weekly buckets)" : granularity === "day" ? "days" : "months"}`}
                                </h3>
                                <p className="text-xs text-gray-400 mt-0.5">New users, posts, tracked events and active users per {granularity}</p>
                            </div>
                            <div className="flex gap-3 flex-wrap">
                                {GROWTH_KEYS.map((k) => (
                                    <span key={k.field} className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: k.color }} />
                                        {k.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <AreaChart data={growth.series} keys={GROWTH_KEYS} height={280} />
                    </div>

                    {/* Devices + locations */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                            <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-1">Device types</h3>
                            <p className="text-xs text-gray-400 mb-4">Last {devices?.days || 30} days · {devices?.tracked || 0} events</p>
                            <DonutChart data={(devices?.type || []).map((t) => ({ label: t.label, count: t.count }))} />
                        </div>
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                            <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-1">Operating systems</h3>
                            <p className="text-xs text-gray-400 mb-4">Breakdown by OS</p>
                            <BarChart data={(devices?.os || []).map((o) => ({ label: o.label, value: o.count }))} color="#ce82ff" height={170} />
                            <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mt-5 mb-1">Browsers</h3>
                            <BarChart data={(devices?.browser || []).map((b) => ({ label: b.label, value: b.count }))} color="#1cb0f6" height={150} />
                        </div>
                    </div>

                    {/* Globe + country list */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                            <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-1">Users around the globe</h3>
                            <p className="text-xs text-gray-400 mb-2">Rotate, zoom, hover the dots to see country-level events</p>
                            <Globe
                                countries={(locations?.countries || []).filter((c) => c.lat != null && c.lon != null).map((c) => ({ code: c.code, name: c.name, count: c.count, lat: c.lat, lon: c.lon }))}
                                cities={(locations?.cities || []).filter((c) => c.lat != null && c.lon != null).map((c) => ({ code: c.code, name: c.city || c.name, country: c.country, count: c.count, lat: c.lat, lon: c.lon }))}
                                width={640}
                                height={430}
                            />
                        </div>
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                            <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-1">By country</h3>
                            <p className="text-xs text-gray-400 mb-4">{locations?.totalLocated || 0} located events</p>
                            {!(locations?.countries?.length) ? (
                                <p className="text-sm text-gray-400 text-center py-8">No location data yet.</p>
                            ) : (
                                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                                    {locations.countries.map((c, i) => (
                                        <div key={c.code} className="flex items-center gap-3">
                                        <span className="w-5 shrink-0 text-xs font-bold text-gray-400">{i + 1}</span>
                                        <span className="flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-200">{c.name || c.code}</span>
                                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 tabular-nums">{c.count}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <ContentOverview />
                </>
            )}
        </div>
    );
}

/* Top content leaderboards — reuses the existing /api/admin/analytics rollup. */
function ContentOverview() {
    const [data, setData] = useState(null);
    useEffect(() => {
        fetch("/api/admin/analytics").then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
    }, []);

    if (!data) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
                { title: "Top posters", rows: data.topPosters, unit: "posts", color: "text-blue-500" },
                { title: "Top likers", rows: data.topLikers, unit: "likes", color: "text-pink-500" },
                { title: "Top hashtags", rows: data.topHashtags, unit: "posts", color: "text-orange-500", tag: true },
            ].map((sec) => (
                <div key={sec.title} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-4">{sec.title}</h3>
                    {!sec.rows?.length ? (
                        <p className="text-sm text-gray-400 text-center py-4">No data</p>
                    ) : (
                        <div className="space-y-2">
                            {sec.rows.slice(0, 8).map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <span className="flex items-center gap-2 min-w-0">
                                        <span className="w-5 shrink-0 text-xs font-bold text-gray-400">{i + 1}</span>
                                        <span className={`text-sm font-medium truncate ${sec.tag ? "text-orange-500" : "text-gray-900 dark:text-gray-100"}`}>
                                            {sec.tag ? `#${item.tag}` : item.username}
                                        </span>
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{item.count} {sec.unit}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}