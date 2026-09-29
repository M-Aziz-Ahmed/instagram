"use client";

import { useEffect, useMemo, useState } from "react";
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
    // Drill-down selection. `null` is the countries level; otherwise a country
    // code, or a region code once a country has been opened.
    const [drill, setDrill] = useState(null);
    const activeCountry = drill && !drill.includes(":") ? drill : "";
    const activeRegion = drill && drill.includes(":") ? drill : "";
    const { growth, devices, locations, loading } = useAnalytics({ granularity, days, locationDays: days });

    const applyGranularity = (g) => {
        setGranularity(g);
        setDays(RANGES[g][0]?.days || 30);
    };

    // Changing the range closes the drill-down, because the place that was open
    // may not exist in the new period. Done in the handler rather than an effect
    // so it does not cost a second render pass on every load.
    const applyDays = (d) => {
        setDrill(null);
        setDays(d);
    };
    const openCountry = (code) => setDrill(code);
    const openRegion = (code) => setDrill(code);
    const closeDrill = () => setDrill(null);

    // Rows for the current level, derived from the one response the hook already
    // fetched rather than refetched per level, so the drill-down is instant.
    const regionRows = useMemo(
        () => (locations?.regions || []).filter((r) => r.countryCode === activeCountry),
        [locations, activeCountry],
    );
    const cityRows = useMemo(
        () => (locations?.cities || []).filter((c) => c.countryCode === activeCountry && c.code.startsWith(`${activeRegion}:`)),
        [locations, activeCountry, activeRegion],
    );
    const activeRegionLabel = useMemo(() => {
        if (!activeRegion) return undefined;
        const row = (locations?.regions || []).find((r) => r.code === activeRegion);
        const regionName = row?.name || activeRegion.split(":").slice(1).join(":");
        const countryName = (locations?.countries || []).find((c) => c.code === activeCountry)?.name || activeCountry;
        return [countryName, regionName].filter(Boolean).join(" · ");
    }, [locations, activeCountry, activeRegion]);

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
                                onClick={() => applyDays(r.days)}
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
                            <p className="text-xs text-gray-400 mb-2">Scroll or use +/− to drill from countries → states/regions → cities &amp; towns. Double-click to dive into a spot.</p>
                            <Globe
                                countries={(locations?.countries || []).filter((c) => c.lat != null && c.lon != null).map((c) => ({ code: c.code, name: c.name, count: c.count, lat: c.lat, lon: c.lon }))}
                                regions={(locations?.regions || []).filter((c) => c.lat != null && c.lon != null).map((c) => ({ code: c.code, name: c.name, country: c.country, count: c.count, lat: c.lat, lon: c.lon }))}
                                cities={(locations?.cities || []).filter((c) => c.lat != null && c.lon != null).map((c) => ({ code: c.code, name: c.city || c.name, region: c.region, country: c.country, count: c.count, lat: c.lat, lon: c.lon }))}
                                width={640}
                                height={430}
                            />
                        </div>
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                            <div className="flex items-center justify-between mb-1 gap-2">
                                <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">
                                    {activeRegion ? "Cities &amp; towns" : activeCountry ? "States / regions" : "By country"}
                                </h3>
                                {activeRegion || activeCountry ? (
                                    <button
                                        onClick={closeDrill}
                                        className="text-[11px] font-bold text-[#1cb0f6] hover:underline"
                                    >
                                        Back to countries
                                    </button>
                                ) : null}
                            </div>
                            <p className="text-xs text-gray-400 mb-4">
                                {locations?.totalLocated || 0} located events
                                {typeof locations?.locatedShare === "number" && locations.totalEvents > 0 ? (
                                    <span className="text-gray-400">
                                        {" "}· {locations.locatedShare}% of {locations.totalEvents.toLocaleString()} tracked
                                    </span>
                                ) : null}
                            </p>
                            {activeRegion || activeCountry ? (
                                <GeoList
                                    rows={(activeRegion ? cityRows : regionRows).slice(0, 60)}
                                    onPick={activeRegion ? undefined : openRegion}
                                    secondary={activeRegion ? activeRegionLabel : undefined}
                                    emptyLabel={activeRegion ? "No city-level data for this region." : "No region-level data for this country."}
                                />
                            ) : (
                                <>
                                    <GeoList
                                        rows={(locations?.countries || []).slice(0, 60)}
                                        onPick={openCountry}
                                        emptyLabel="No location data yet."
                                    />
                                    <GeoCoverage missing={locations?.unlocatedByType || []} />
                                </>
                            )}
                        </div>
                    </div>

                    <TopPosts days={days} />

                    <ContentOverview />
                </>
            )}
        </div>
    );
}

/* Country → region → city drill-down. The API already returns all three tiers
   (up to 400/1200/2000 rows); without this the region and city arrays were
   fetched on every load and then discarded, and the only way to read them was
   to zoom the canvas and estimate a dot's size. */
function GeoList({ rows, onPick, secondary, emptyLabel }) {
    if (!rows?.length) {
        return <p className="text-sm text-gray-400 text-center py-8">{emptyLabel}</p>;
    }
    const top = rows[0]?.count || 1;
    return (
        <div className="space-y-1 max-h-[340px] overflow-y-auto pr-1">
            {rows.map((r, i) => (
                <button
                    key={r.code || `${r.name}-${i}`}
                    onClick={onPick ? () => onPick(r.code) : undefined}
                    disabled={!onPick}
                    className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition-colors ${onPick ? "hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer" : "cursor-default"}`}
                >
                    <span className="w-5 shrink-0 text-xs font-bold text-gray-400">{i + 1}</span>
                    <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                            {r.name || r.code}
                        </span>
                        {secondary ? (
                            <span className="block truncate text-[11px] text-gray-400">{secondary}</span>
                        ) : null}
                        {/* Proportion bar, so a long tail of 1-event places is
                            still legible next to the leader. */}
                        <span className="block h-1 mt-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                            <span
                                className="block h-full rounded-full bg-[#1cb0f6]"
                                style={{ width: `${Math.max(3, Math.round(((r.count || 0) / top) * 100))}%` }}
                            />
                        </span>
                    </span>
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 tabular-nums shrink-0">
                        {(r.count || 0).toLocaleString()}
                    </span>
                    {onPick ? <span className="text-[10px] text-gray-300 dark:text-gray-600 shrink-0">›</span> : null}
                </button>
            ))}
        </div>
    );
}

/* "Where did the other events go?" The Events stat card counts every event;
   the globe only counts the ones geo could place. Naming the difference is the
   difference between a bug report and an answer. */
function GeoCoverage({ missing }) {
    if (!missing?.length) return null;
    const total = missing.reduce((s, m) => s + m.count, 0);
    return (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-2">
                Not placeable — {total.toLocaleString()} events with no resolved country
            </p>
            <div className="flex flex-wrap gap-1.5">
                {missing.map((m) => (
                    <span
                        key={m.type}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] font-semibold text-gray-500 dark:text-gray-400"
                    >
                        {m.type}
                        <span className="tabular-nums text-gray-400">{m.count.toLocaleString()}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

/* Site-wide top posts. Per-post events have been recorded all along, but the
   only thing that ever read them was the per-creator page, which can only see
   one author's own posts. */
const POST_SORTS = [
    { key: "impressions", label: "Impressions" },
    { key: "reach", label: "Reach" },
    { key: "clicks", label: "Clicks" },
    { key: "likes", label: "Likes" },
];

function TopPosts({ days }) {
    const [sort, setSort] = useState("impressions");
    // `null` until the first response, so the panel can distinguish "loading"
    // from "loaded and empty" without a separate flag that has to be reset in
    // an effect.
    const [data, setData] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let live = true;
        const q = `?days=${days || 30}&limit=10&sort=${encodeURIComponent(sort)}`;
        fetch(`/api/admin/analytics/posts${q}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
            .then((d) => { if (live) { setData(d); setFailed(false); } })
            .catch(() => { if (live) { setData(null); setFailed(true); } });
        return () => { live = false; };
    }, [days, sort]);

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">Top posts</h3>
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                    {POST_SORTS.map((s) => (
                        <button
                            key={s.key}
                            onClick={() => setSort(s.key)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${sort === s.key ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700"}`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>
            <p className="text-xs text-gray-400 mb-4">Last {days || 30} days · every post on the site</p>

            {!data && !failed ? (
                <div className="flex justify-center py-10">
                    <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-[#1cb0f6] rounded-full animate-spin" />
                </div>
            ) : failed ? (
                <p className="text-sm text-gray-400 text-center py-8">Could not load post analytics.</p>
            ) : !data.posts?.length ? (
                <p className="text-sm text-gray-400 text-center py-8">No post events in this period.</p>
            ) : (
                <div className="space-y-1.5">
                    {data.posts.map((p, i) => (
                        <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <span className="w-5 shrink-0 text-xs font-bold text-gray-400">{i + 1}</span>
                            <span className="flex-1 min-w-0">
                                <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {p.text || <span className="text-gray-400 italic">no caption</span>}
                                </span>
                                <span className="block truncate text-[11px] text-gray-400">
                                    @{p.sender}
                                    {p.isRemoved ? " · removed" : ""}
                                </span>
                            </span>
                            <span className="hidden sm:flex items-center gap-3 shrink-0 text-[11px] tabular-nums">
                                <span title="Impressions"><span className="text-gray-400">👁</span> {p.impressions.toLocaleString()}</span>
                                <span title="Reach (unique viewers)"><span className="text-gray-400">◎</span> {p.reach.toLocaleString()}</span>
                                <span title="Clicks"><span className="text-gray-400">✱</span> {p.clicks.toLocaleString()}</span>
                                <span title="CTR"><span className="text-gray-400">%</span> {p.clickThroughRate ?? "—"}</span>
                                <span title="Likes"><span className="text-gray-400">♥</span> {p.likes.toLocaleString()}</span>
                            </span>
                        </div>
                    ))}
                </div>
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