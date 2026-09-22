"use client";

import { useState } from "react";
import { useAdminData, PanelCard, Stat, Spinner, ErrBox, RefreshBtn, fmtDate } from "./power";

const DAYS = [7, 14, 30];

export default function SecurityPanel() {
    const [days, setDays] = useState(14);
    const [q, setQ] = useState("");
    const [action, setAction] = useState("");
    const dataHook = useAdminData(
        `/api/admin/audit?days=${days}${q ? `&q=${encodeURIComponent(q)}` : ""}${action ? `&action=${encodeURIComponent(action)}` : ""}`
    );
    const { data, loading, error, reload } = dataHook;

    const rows = data?.rows || [];
    const topIPs = data?.topIPs || [];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Audit window" value={`${days}d`} sub={`${data ? rows.length : "…"} events`} />
                <Stat label="Failed logins (window)" value={data ? data.failed : "…"} accent="text-red-500" />
                <Stat label="Top IPs tracked" value={topIPs.length} />
                <Stat label="Total actions shown" value={rows.length} />
            </div>

            <PanelCard
                title="Access & security audit"
                subtitle="Login attempts, admin actions and moderation events from SystemLog"
                right={<RefreshBtn onClick={reload} />}
            >
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                        {DAYS.map((d) => (
                            <button key={d} onClick={() => setDays(d)}
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${days === d ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
                                {d}d
                            </button>
                        ))}
                    </div>
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user / message…"
                        className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400" />
                    <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action (e.g. login_success)"
                        className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400" />
                </div>

                {error && <ErrBox error={error} onReload={reload} />}
                {loading && !data ? (
                    <div className="flex justify-center py-12"><Spinner /></div>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No matching events.</p>
                ) : (
                    <div className="overflow-x-auto -mx-4 px-4">
                        <table className="w-full text-left text-xs min-w-[720px]">
                            <thead>
                                <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                    <th className="py-2 pr-3 font-semibold">Time</th>
                                    <th className="py-2 pr-3 font-semibold">Level</th>
                                    <th className="py-2 pr-3 font-semibold">Action</th>
                                    <th className="py-2 pr-3 font-semibold">User</th>
                                    <th className="py-2 pr-3 font-semibold">IP</th>
                                    <th className="py-2 font-semibold">Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800 align-top">
                                        <td className="py-2 pr-3 whitespace-nowrap text-gray-500 dark:text-gray-400">{fmtDate(r.createdAt)}</td>
                                        <td className="py-2 pr-3">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${(r.level || "info") === "error" ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400" : (r.level || "info") === "warn" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}>
                                                {r.level || "info"}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-3 font-mono text-gray-700 dark:text-gray-300">{r.action || "—"}</td>
                                        <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{r.username || "—"}</td>
                                        <td className="py-2 pr-3 font-mono text-gray-500 dark:text-gray-400">{r.ip || "—"}</td>
                                        <td className="py-2 text-gray-600 dark:text-gray-400 max-w-[280px] truncate" title={r.message}>{r.message || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </PanelCard>

            {topIPs.length > 0 && (
                <PanelCard title="Most frequent IPs" subtitle="Possible abuse indicators — highest activity first">
                    <div className="space-y-1.5">
                        {topIPs.map((x) => (
                            <div key={x.ip} className="flex items-center gap-2 text-sm">
                                <span className="font-mono text-xs text-gray-700 dark:text-gray-300 flex-1">{x.ip}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">{x.count} events</span>
                                <span className="text-[11px] text-gray-400 dark:text-gray-500 w-28 text-right">{fmtDate(x.last)}</span>
                            </div>
                        ))}
                    </div>
                </PanelCard>
            )}
        </div>
    );
}