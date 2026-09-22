"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Fetch admin data with the lint-safe deferred-setState pattern.
 * Refetches every `refresh` ms (0 = none). `deps` force a reload when changed.
 */
export function useAdminData(url, opts = {}) {
    const { refresh = 0, initial = null } = opts;
    const [data, setData] = useState(initial);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                setData(null);
                setError(`HTTP ${res.status}`);
                return;
            }
            const json = await res.json();
            setData(json);
            setError(null);
        } catch (e) {
            setError(e?.message || "Network error");
        } finally {
            setLoading(false);
        }
    }, [url]);

    useEffect(() => {
        let alive = true;
        const run = () => {
            if (!alive) return;
            setLoading(true);
            load().then(() => {});
        };
        const t = setTimeout(run, 0);
        if (refresh > 0) {
            const id = setInterval(run, refresh);
            return () => { alive = false; clearTimeout(t); clearInterval(id); };
        }
        return () => { alive = false; clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url, refresh]);

    return { data, loading, error, reload: load };
}

export function Spinner() {
    return <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />;
}

export function PanelCard({ title, subtitle, children, right }) {
    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-3">
                <div>
                    <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{title}</h3>
                    {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
                </div>
                {right}
            </div>
            <div className="px-4 sm:px-5 py-4">{children}</div>
        </div>
    );
}

export function Stat({ label, value, sub, accent }) {
    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 px-4 py-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
            <p className={`text-lg font-bold mt-0.5 ${accent || "text-gray-900 dark:text-gray-100"}`}>{value}</p>
            {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
        </div>
    );
}

export function ErrBox({ error, onReload }) {
    if (!error) return null;
    return (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-red-600 dark:text-red-400">Failed to load: {error}</p>
            {onReload && <button onClick={onReload} className="text-xs font-semibold text-red-600 dark:text-red-400">Retry</button>}
        </div>
    );
}

export function RefreshBtn({ onClick }) {
    return (
        <button onClick={onClick} className="text-xs font-semibold text-blue-500 hover:text-blue-600" title="Refresh">
            Refresh
        </button>
    );
}

export function fmtDate(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
}

export function fmtBytes(n) {
    if (n == null) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(1)} ${units[i]}`;
}

export function fmtAgo(v) {
    if (!v) return "—";
    const diff = Date.now() - new Date(v).getTime();
    if (diff < 0) return "now";
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}