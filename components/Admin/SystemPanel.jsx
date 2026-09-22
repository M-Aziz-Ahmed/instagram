"use client";

import { useState } from "react";
import { useToast } from "@/context/ToastContext";
import { useAdminData, PanelCard, Stat, Spinner, ErrBox, RefreshBtn, fmtBytes } from "./power";

const MB = (v) => fmtBytes(v);

export default function SystemPanel() {
    const { showToast } = useToast();
    const { data, loading, error, reload } = useAdminData("/api/admin/system", { refresh: 30000 });
    const [busy, setBusy] = useState(null);

    const post = async (path) => {
        setBusy(path);
        try {
            const res = await fetch(path, { method: "POST" });
            const json = await res.json();
            if (res.ok) showToast(json.message || json.note || "OK", "success");
            else showToast(json.error || "Failed", "error");
            reload();
        } catch {
            showToast("Network error", "error");
        } finally {
            setBusy(null);
        }
    };

    if (loading && !data) return <div className="flex justify-center py-16"><Spinner /></div>;
    if (error && !data) return <ErrBox error={error} onReload={reload} />;
    if (!data) return null;

    const { counts = {}, mongo = {}, memory = {} } = data;
    const memPct = memory.heapTotal ? Math.round((memory.heapUsed / memory.heapTotal) * 100) : null;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Uptime" value={data.uptime ? `${Math.floor(data.uptime / 3600)}h` : "—"} sub={data.uptime ? `${Math.floor((data.uptime % 3600) / 60)}m` : ""} />
                <Stat
                    label="MongoDB"
                    value={mongo.state === "connected" ? "Connected" : "Disconnected"}
                    sub={mongo.host ? `${mongo.host}/${mongo.name}` : "no host info"}
                    accent={mongo.state === "connected" ? "text-green-500" : "text-red-500"}
                />
                <Stat label="DB latency" value={mongo.latency != null ? `${mongo.latency}ms` : "—"} />
                <Stat label="Node / env" value={data.node || "—"} sub={`${data.platform || ""} · v${data.version || "?"}`} />
            </div>

            <PanelCard
                title="Counts"
                subtitle="Latest totals across collections"
                right={<RefreshBtn onClick={reload} />}
            >
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <Stat label="Users" value={counts.users ?? "—"} />
                    <Stat label="Posts" value={counts.posts ?? "—"} />
                    <Stat label="Open reports" value={counts.reportsOpen ?? "—"} accent="text-red-500" />
                    <Stat label="Events (24h)" value={counts.events24h ?? "—"} />
                    <Stat label="Active announcements" value={counts.announcementsActive ?? "—"} accent="text-blue-500" />
                </div>
            </PanelCard>

            <PanelCard title="Memory" subtitle="Node.js process memory (RSS / heap)">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Stat label="RSS" value={MB(memory.rss)} />
                    <Stat label="Heap used" value={MB(memory.heapUsed)} />
                    <Stat label="Heap total" value={MB(memory.heapTotal)} />
                    <Stat label="Heap %" value={memPct != null ? `${memPct}%` : "—"} />
                </div>
            </PanelCard>

            <PanelCard title="Actions" subtitle="Diagnostics and maintenance">
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => post("/api/admin/system/ping")} disabled={busy}
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-black dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-80 disabled:opacity-50 transition-opacity">
                        {busy === "/api/admin/system/ping" ? "Pinging…" : "Ping DB"}
                    </button>
                    <button onClick={() => post("/api/admin/system/cache-clear")} disabled={busy}
                        className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
                        {busy === "/api/admin/system/cache-clear" ? "Clearing…" : "Clear cache"}
                    </button>
                    <button onClick={() => {
                        if (confirm("Restart the server? This may take ~30s to come back.")) post("/api/admin/system/restart");
                    }} disabled={busy}
                        className="px-4 py-2 rounded-lg text-sm font-semibold border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors">
                        {busy === "/api/admin/system/restart" ? "Restarting…" : "Restart server"}
                    </button>
                </div>
            </PanelCard>
        </div>
    );
}