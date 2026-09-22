"use client";

import { useAdminData, PanelCard, Stat, Spinner, ErrBox, fmtAgo } from "./power";

const KIND_STYLE = {
    event: { label: "EVENT", cls: "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400" },
    signup: { label: "SIGNUP", cls: "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400" },
    post: { label: "POST", cls: "bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400" },
};

export default function LivePanel() {
    const { data, loading, error, reload } = useAdminData("/api/admin/live", { refresh: 5000 });

    const items = data?.items || [];
    const counters = data?.counters || {};

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Stat label="Open reports" value={data ? counters.openReports : "…"} accent="text-red-500" />
                <Stat label="Active announcements" value={data ? counters.activeAnnouncements : "…"} accent="text-blue-500" />
                <Stat label="Stream items" value={items.length} sub="refreshes every 5s" />
            </div>

            <PanelCard title="Live activity" subtitle="Newest analytics events, signups and posts as they happen">
                {loading && !data ? (
                    <div className="flex justify-center py-12"><Spinner /></div>
                ) : error ? (
                    <ErrBox error={error} onReload={reload} />
                ) : items.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">Nothing yet — activity will stream in.</p>
                ) : (
                    <ul className="space-y-2">
                        {items.map((it, i) => {
                            const style = KIND_STYLE[it.kind] || KIND_STYLE.event;
                            return (
                                <li key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${style.cls}`}>{style.label}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-gray-900 dark:text-gray-100 truncate">
                                            {it.who && <span className="font-semibold">{it.who}: </span>}
                                            {it.label}{it.detail ? ` · ${it.detail}` : ""}
                                        </p>
                                        {it.region && <p className="text-[10px] text-gray-400 dark:text-gray-500">{it.region}</p>}
                                    </div>
                                    <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">{fmtAgo(it.time)}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </PanelCard>
        </div>
    );
}