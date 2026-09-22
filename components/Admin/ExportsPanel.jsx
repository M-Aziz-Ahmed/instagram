"use client";

import { useState } from "react";
import { useToast } from "@/context/ToastContext";
import { PanelCard } from "./power";

const EXPORTS = [
    { key: "users", label: "Users", desc: "All users — emails, invites, flags (full dump)" },
    { key: "posts", label: "Posts", desc: "Latest 2,000 posts — sender, text, likes, comments, status" },
    { key: "events", label: "Analytics events", desc: "Latest 5,000 events — path, country, city, device" },
    { key: "growth", label: "Daily growth", desc: "Users / posts / events per day for the last 90 days" },
    { key: "locations", label: "Locations", desc: "Country + city visit tallies for the last 30 days" },
];

function fmtBytes(n) {
    if (n == null) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(1)} ${units[i]}`;
}

export default function ExportsPanel() {
    const { showToast } = useToast();
    const [busy, setBusy] = useState(null);
    const [preview, setPreview] = useState(null);

    // Direct anchor navigation forwards cookies, so browser downloads the CSV.
    const download = async (key) => {
        setBusy(key);
        try {
            const res = await fetch(`/api/admin/exports/${key}?limit=50`, { headers: {} });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            const rows = text.split("\r\n").filter(Boolean).slice(0, 5);
            const header = rows[0] ? rows[0].split(",").length : 0;
            setPreview({ key, rows, header, size: text.length });
        } catch {
            showToast("Preview failed — auth or server error", "error");
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="space-y-6">
            <PanelCard title="CSV exports" subtitle="Comma-separated dumps, downloaded straight from the server">
                <div className="grid sm:grid-cols-2 gap-3">
                    {EXPORTS.map((e) => (
                        <div key={e.key} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-green-600 dark:text-green-400">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{e.label}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{e.desc}</p>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                                <button onClick={() => download(e.key)} disabled={busy === e.key}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
                                    {busy === e.key ? "…" : "Preview"}
                                </button>
                                <a href={`/api/admin/exports/${e.key}`}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-black dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-80 transition-opacity">
                                    Download
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3">
                    Need a bigger or custom dump? Requests are limited by the export size guards (posts/events capped server-side).
                </p>
            </PanelCard>

            {preview && (
                <PanelCard title={`Preview — ${preview.key}.csv`} subtitle={`${preview.header} columns · first 5 rows`}>
                    <pre className="text-[11px] leading-relaxed text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto">{preview.rows.join("\n")}</pre>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">{fmtBytes(preview.size)} total for the previewed slice</p>
                </PanelCard>
            )}
        </div>
    );
}