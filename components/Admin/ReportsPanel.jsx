"use client";

import { useState } from "react";
import { useToast } from "@/context/ToastContext";
import { useAdminData, PanelCard, Stat, Spinner, ErrBox, fmtDate } from "./power";

const FILTERS = ["open", "resolved", "dismissed"];
const REASON_COLORS = {
    spam: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400",
    harassment: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400",
    nudity: "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-400",
    hate: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",
};

export default function ReportsPanel() {
    const { showToast } = useToast();
    const [status, setStatus] = useState("open");
    const [resolution, setResolution] = useState({});
    const [busyId, setBusyId] = useState(null);
    const list = useAdminData(`/api/admin/reports?status=${status}`);
    const stats = useAdminData("/api/admin/reports/stats");

    const act = async (id, action) => {
        setBusyId(id);
        try {
            const res = await fetch(`/api/admin/reports/${id}/${action}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actionTaken: resolution[id] || "" }),
            });
            const json = await res.json();
            if (res.ok) showToast(action === "resolve" ? "Resolved" : "Dismissed", "success");
            else showToast(json.error || "Failed", "error");
            list.reload();
            stats.reload();
        } catch { showToast("Network error", "error"); } finally { setBusyId(null); }
    };

    const s = stats.data;
    const items = list.data || [];
    const loading = list.loading && !list.data;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Open" value={s ? s.open : "…"} accent="text-red-500" />
                <Stat label="Resolved" value={s ? s.resolved : "…"} accent="text-green-500" />
                <Stat label="Dismissed" value={s ? s.dismissed : "…"} />
                <Stat label="Total" value={s ? s.total : "…"} />
            </div>

            {s?.byReason?.length > 0 && (
                <PanelCard title="Top reasons" subtitle="Distribution across all reports">
                    <div className="flex flex-wrap gap-2">
                        {s.byReason.map((r) => (
                            <span key={r.reason} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                                {r.reason} <b className="text-gray-900 dark:text-gray-100">{r.count}</b>
                            </span>
                        ))}
                    </div>
                </PanelCard>
            )}

            <PanelCard title={`Reports — ${status}`} subtitle="From the in-app report buttons">
                <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
                    {FILTERS.map((f) => (
                        <button key={f} onClick={() => setStatus(f)}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${status === f ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                            {f}
                        </button>
                    ))}
                </div>

                {errorBox(list, () => { list.reload(); stats.reload(); })}
                {loading ? (
                    <div className="flex justify-center py-12"><Spinner /></div>
                ) : items.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No {status} reports.</p>
                ) : (
                    <div className="space-y-3">
                        {items.map((r) => (
                            <div key={r.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${REASON_COLORS[r.reason] || "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}>{r.reason}</span>
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">{r.targetType}</span>
                                    <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">#{r.targetId}</span>
                                    <span className="text-[11px] text-gray-400 dark:text-gray-500 ml-auto">{fmtDate(r.createdAt)}</span>
                                </div>
                                {r.details && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5">{r.details}</p>}
                                {r.actionTaken && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">Action: {r.actionTaken}</p>}
                                <div className="flex items-center gap-2 mt-3">
                                    {status === "open" && (
                                        <>
                                            <input value={resolution[r.id] || ""} onChange={(e) => setResolution({ ...resolution, [r.id]: e.target.value })} maxLength={500}
                                                placeholder="Action taken (e.g. removed, warned…)"
                                                className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400" />
                                            <button onClick={() => act(r.id, "resolve")} disabled={busyId === r.id}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-black dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-80 disabled:opacity-50 transition-opacity">
                                                Resolve
                                            </button>
                                        </>
                                    )}
                                    {status !== "dismissed" && (
                                        <button onClick={() => act(r.id, "dismiss")} disabled={busyId === r.id}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
                                            Dismiss
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </PanelCard>
        </div>
    );

    function errorBox(res, onRetry) {
        if (!res.error) return null;
        return (
            <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-4 py-3 mb-4 flex items-center justify-between">
                <p className="text-sm text-red-600 dark:text-red-400">Failed to load: {res.error}</p>
                <button onClick={onRetry} className="text-xs font-semibold text-red-600 dark:text-red-400">Retry</button>
            </div>
        );
    }
}