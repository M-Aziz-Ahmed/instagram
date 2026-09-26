"use client";

import useAnalytics from "@/components/Admin/useAnalytics";
import { AreaChart, DonutChart, StatCard } from "@/components/Admin/charts";
import Globe from "@/components/Admin/Globe";

const GROWTH_KEYS = [
    { field: "users", label: "New users", color: "#10b981" },
    { field: "events", label: "Tracked events", color: "#1cb0f6" },
    { field: "active", label: "Active users", color: "#8b5cf6" },
];

export default function AdminDashboard() {
    const { overview, growth, devices, locations, loading } = useAnalytics();

    if (loading || !overview) {
        return (
            <div className="flex justify-center py-24">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-[#58cc02] rounded-full animate-spin" />
            </div>
        );
    }

    const o = overview;
    const growthData = growth?.series || [];
    const globeCountries = (locations?.countries || [])
        .filter((c) => c.lat != null && c.lon != null)
        .map((c) => ({ code: c.code, name: c.name, count: c.count, lat: c.lat, lon: c.lon }));
    const globeRegions = (locations?.regions || [])
        .filter((c) => c.lat != null && c.lon != null)
        .map((c) => ({ code: c.code, name: c.name, country: c.country, count: c.count, lat: c.lat, lon: c.lon }));
    const globeCities = (locations?.cities || [])
        .filter((c) => c.lat != null && c.lon != null)
        .map((c) => ({ code: c.code, name: c.city || c.name, region: c.region, country: c.country, count: c.count, lat: c.lat, lon: c.lon }));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">Dashboard</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Live overview of your app as of{" "}
                    {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}.
                </p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <StatCard label="Total users" value={o.totals?.users?.toLocaleString()} icon="👥" hint="all time" />
                <StatCard label="New today" value={o.today?.newUsers?.toLocaleString()} delta={o.today?.newUsersDelta} icon="🌱" hint="vs yesterday" />
                <StatCard label="Posts today" value={o.today?.posts?.toLocaleString()} delta={o.today?.postsDelta} icon="📝" hint="vs yesterday" />
                <StatCard label="Events today" value={o.today?.events?.toLocaleString()} delta={o.today?.eventsDelta} icon="📈" hint="page views + actions" />
                <StatCard label="Active 24h" value={o.active24h?.toLocaleString()} icon="⚡" hint="unique logged-in users" />
            </div>

            {/* Growth chart */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                        <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">Growth — last 30 days</h3>
                        <p className="text-xs text-gray-400 mt-0.5">New users, tracked events and active users per day</p>
                    </div>
                    <div className="flex gap-3">
                        {GROWTH_KEYS.map((k) => (
                            <span key={k.field} className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: k.color }} />
                                {k.label}
                            </span>
                        ))}
                    </div>
                </div>
                <AreaChart data={growthData} keys={GROWTH_KEYS} height={230} />
            </div>

            {/* Devices + locations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-1">Devices — last {devices?.days || 30} days</h3>
                    <p className="text-xs text-gray-400 mb-4">Where visitors are browsing from</p>
                    <DonutChart data={(devices?.type || []).map((t) => ({ label: t.label, count: t.count }))} />
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-1">Top countries</h3>
                    <p className="text-xs text-gray-400 mb-4">Events by visitor country</p>
                    {!locations?.countries?.length ? (
                        <p className="text-sm text-gray-400 text-center py-8">No location data yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {locations.countries.slice(0, 6).map((c, i) => {
                                const max = locations.countries[0]?.count || 1;
                                return (
                                    <div key={c.code} className="flex items-center gap-3">
                                        <span className="w-5 text-xs font-bold text-gray-400">{i + 1}</span>
                                        <span className="w-40 truncate text-sm font-medium text-gray-800 dark:text-gray-200">{c.name || c.code}</span>
                                        <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                            <div className="h-full bg-[#58cc02] rounded-full" style={{ width: `${(c.count / max) * 100}%` }} />
                                        </div>
                                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 tabular-nums">{c.count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Globe */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">Where your users are 🌍</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Live usage map — {globeCountries.length} countries · {globeRegions.length} states/regions · {globeCities.length} cities/towns · {locations?.totalLocated || 0} located events</p>
                    </div>
                </div>
                <div className="mx-auto" style={{ maxWidth: 640 }}>
                    <Globe countries={globeCountries} regions={globeRegions} cities={globeCities} width={640} height={440} />
                </div>
            </div>
        </div>
    );
}