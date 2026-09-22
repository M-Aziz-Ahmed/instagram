"use client";

import { useState } from "react";
import { useToast } from "@/context/ToastContext";
import { useAdminData, PanelCard, Stat, Spinner, ErrBox, RefreshBtn, fmtDate } from "./power";

export default function InvitesPanel() {
    const { showToast } = useToast();
    const { data, loading, error, reload } = useAdminData("/api/admin/invites");
    const [username, setUsername] = useState("");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [busyId, setBusyId] = useState(null);

    const issue = async () => {
        if (!username.trim()) { showToast("Username required", "error"); return; }
        setBusy(true);
        try {
            const res = await fetch("/api/admin/invites/issue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: username.trim(), code: code.trim() || undefined }),
            });
            const json = await res.json();
            if (res.ok) { showToast(`${json.username} → code ${json.code}`, "success"); setUsername(""); setCode(""); reload(); }
            else showToast(json.error || "Failed", "error");
        } catch { showToast("Network error", "error"); } finally { setBusy(false); }
    };

    const revoke = async (id, who) => {
        if (!confirm(`Revoke ${who}'s invite code?`)) return;
        setBusyId(id);
        try {
            await fetch(`/api/admin/invites/${id}/revoke`, { method: "POST" });
            showToast("Code revoked", "success");
            reload();
        } catch { showToast("Network error", "error"); } finally { setBusyId(null); }
    };

    const stats = data?.stats;
    const referrers = data?.topReferrers || [];
    const list = data?.list || [];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Codes issued" value={stats ? stats.withCodes : "…"} />
                <Stat label="Codes used" value={stats ? stats.codesUsed : "…"} accent="text-green-500" />
                <Stat label="Top referrers" value={stats ? stats.topReferrersTotal : "…"} />
                <Stat label="Total invites given" value={data ? referrers.reduce((n, r) => n + (r.count || 0), 0) : "…"} accent="text-blue-500" />
            </div>

            <PanelCard title="Issue an invite code" subtitle="Sets (or replaces) a user's personal referral code">
                <div className="flex flex-wrap gap-2">
                    <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40}
                        placeholder="Username *" className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400" />
                    <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={24}
                        placeholder="Custom code (optional)" className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400" />
                    <button onClick={issue} disabled={busy}
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-black dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-80 disabled:opacity-50 transition-opacity">
                        {busy ? "Issuing…" : "Issue"}
                    </button>
                </div>
            </PanelCard>

            <PanelCard title="Top referrers" subtitle="Users whose code brought in the most signups" right={<RefreshBtn onClick={reload} />}>
                {loading && !data ? (
                    <div className="flex justify-center py-12"><Spinner /></div>
                ) : error ? (
                    <ErrBox error={error} onReload={reload} />
                ) : referrers.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No referral activity yet.</p>
                ) : (
                    <div className="space-y-1.5">
                        {referrers.slice(0, 10).map((r) => (
                            <div key={r.id} className="flex items-center gap-2 text-sm">
                                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{r.code || "—"}</span>
                                <span className="font-semibold text-gray-900 dark:text-gray-100 flex-1">{r.username}</span>
                                <span className="text-xs text-green-600 dark:text-green-400 font-bold">{r.count} invited</span>
                            </div>
                        ))}
                    </div>
                )}
            </PanelCard>

            <PanelCard title={`Active codes (${list.length})`} subtitle="All users currently holding a referral code">
                {list.length === 0 && !loading ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No codes issued.</p>
                ) : (
                    <div className="overflow-x-auto -mx-4 px-4">
                        <table className="w-full text-left text-xs min-w-[520px]">
                            <thead>
                                <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                    <th className="py-2 pr-3 font-semibold">User</th>
                                    <th className="py-2 pr-3 font-semibold">Code</th>
                                    <th className="py-2 pr-3 font-semibold">Times used</th>
                                    <th className="py-2 pr-3 font-semibold">Issued</th>
                                    <th className="py-2 font-semibold">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map((u) => (
                                    <tr key={u.id} className="border-b border-gray-100 dark:border-gray-800">
                                        <td className="py-2 pr-3 font-semibold text-gray-900 dark:text-gray-100">{u.username}</td>
                                        <td className="py-2 pr-3 font-mono text-gray-600 dark:text-gray-300">{u.code}</td>
                                        <td className="py-2 pr-3 text-gray-600 dark:text-gray-300">{u.count}</td>
                                        <td className="py-2 pr-3 text-gray-400 dark:text-gray-500 whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                                        <td className="py-2">
                                            <button onClick={() => revoke(u.id, u.username)} disabled={busyId === u.id}
                                                className="text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-50">
                                                Revoke
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </PanelCard>
        </div>
    );
}