"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CATEGORIES = [
    { id: "all", label: "All Logs", icon: "📋" },
    { id: "frontend", label: "Frontend", icon: "🖥️" },
    { id: "database", label: "Database", icon: "🗄️" },
    { id: "server", label: "Live Server", icon: "⚡" },
    { id: "games", label: "Games", icon: "🎮" },
    { id: "users", label: "Users", icon: "👤" },
    { id: "chats", label: "Chats", icon: "💬" },
    { id: "auth", label: "Auth", icon: "🔐" },
    { id: "moderation", label: "Moderation", icon: "🛡️" },
    { id: "system", label: "System", icon: "⚙️" },
];

const LEVELS = [
    { id: "", label: "All Levels" },
    { id: "info", label: "Info", color: "text-blue-500" },
    { id: "warn", label: "Warn", color: "text-yellow-500" },
    { id: "error", label: "Error", color: "text-red-500" },
    { id: "debug", label: "Debug", color: "text-gray-500" },
];

const QUICK_TIMES = [
    { label: "Last 1h", value: "1h" },
    { label: "Last 6h", value: "6h" },
    { label: "Last 24h", value: "24h" },
    { label: "Last 7d", value: "7d" },
    { label: "All time", value: "all" },
];

function getTimeSince(value) {
    if (value === "all") return null;
    const now = new Date();
    const num = parseInt(value);
    if (value.endsWith("h")) now.setHours(now.getHours() - num);
    else if (value.endsWith("d")) now.setDate(now.getDate() - num);
    return now.toISOString();
}

const levelColor = (l) => {
    if (l === "error") return "text-red-500 bg-red-500/10";
    if (l === "warn") return "text-yellow-500 bg-yellow-500/10";
    if (l === "debug") return "text-gray-500 bg-gray-500/10";
    return "text-blue-500 bg-blue-500/10";
};

const categoryColor = (c) => {
    const map = {
        frontend: "text-cyan-500 bg-cyan-500/10",
        database: "text-purple-500 bg-purple-500/10",
        server: "text-green-500 bg-green-500/10",
        games: "text-orange-500 bg-orange-500/10",
        users: "text-blue-500 bg-blue-500/10",
        chats: "text-pink-500 bg-pink-500/10",
        auth: "text-yellow-500 bg-yellow-500/10",
        moderation: "text-red-500 bg-red-500/10",
        system: "text-gray-500 bg-gray-500/10",
    };
    return map[c] || "text-gray-500 bg-gray-500/10";
};

export default function AdminLogsPanel() {
    const [category, setCategory] = useState("all");
    const [level, setLevel] = useState("");
    const [search, setSearch] = useState("");
    const [username, setUsername] = useState("");
    const [timeRange, setTimeRange] = useState("24h");
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [selectedLog, setSelectedLog] = useState(null);
    const [showStats, setShowStats] = useState(false);
    const logContainerRef = useRef(null);
    const searchTimeout = useRef(null);

    const fetchLogs = useCallback(async (pageNum = 1) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (category !== "all") params.set("category", category);
            if (level) params.set("level", level);
            if (search) params.set("search", search);
            if (username) params.set("username", username);
            const since = getTimeSince(timeRange);
            if (since) params.set("since", since);
            params.set("page", String(pageNum));
            params.set("limit", "150");
            params.set("sort", "desc");

            const res = await fetch(`/api/admin/system-logs?${params}`);
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs || []);
                setTotal(data.total || 0);
                setTotalPages(data.totalPages || 1);
                setPage(data.page || 1);
            }
        } catch {}
        setLoading(false);
    }, [category, level, search, username, timeRange]);

    const fetchStats = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            const since = getTimeSince(timeRange);
            if (since) params.set("since", since);
            const res = await fetch(`/api/admin/system-logs/stats?${params}`);
            if (res.ok) setStats(await res.json());
        } catch {}
    }, [timeRange]);

    useEffect(() => { fetchLogs(1); }, [fetchLogs]);
    useEffect(() => { fetchStats(); }, [fetchStats]);

    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(() => { fetchLogs(page); fetchStats(); }, 5000);
        return () => clearInterval(id);
    }, [autoRefresh, fetchLogs, fetchStats, page]);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = 0;
        }
    }, [logs]);

    const handleSearch = (val) => {
        setSearch(val);
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => fetchLogs(1), 300);
    };

    const handleUsernameSearch = (val) => {
        setUsername(val);
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => fetchLogs(1), 300);
    };

    const purgeLogs = async () => {
        if (!confirm("Delete all logs older than 30 days?")) return;
        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            await fetch(`/api/admin/system-logs?olderThan=${thirtyDaysAgo}`, { method: "DELETE" });
            fetchLogs(page);
            fetchStats();
        } catch {}
    };

    return (
        <div className="space-y-4">
            {/* Stats Overview */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                        <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Logs</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.total?.toLocaleString() || 0}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                        <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Errors</p>
                        <p className="text-xl font-bold text-red-500 mt-1">{stats.byLevel?.error?.toLocaleString() || 0}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                        <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Warnings</p>
                        <p className="text-xl font-bold text-yellow-500 mt-1">{stats.byLevel?.warn?.toLocaleString() || 0}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                        <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Categories</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {Object.entries(stats.byCategory || {}).slice(0, 5).map(([cat, count]) => (
                                <span key={cat} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${categoryColor(cat)}`}>
                                    {cat} ({count})
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Main Log Panel */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {/* Category Tabs */}
                <div className="border-b border-gray-100 dark:border-gray-800 overflow-x-auto">
                    <div className="flex gap-0 min-w-max">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => { setCategory(cat.id); setPage(1); }}
                                className={`px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${category === cat.id ? "text-gray-900 dark:text-gray-100 border-b-2 border-gray-900 dark:border-gray-100" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}
                            >
                                {cat.icon} {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Filters */}
                <div className="p-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => handleSearch(e.target.value)}
                            placeholder="Search logs..."
                            className="flex-1 min-w-[150px] px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-black dark:focus:border-gray-500"
                        />
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => handleUsernameSearch(e.target.value)}
                            placeholder="Filter by user..."
                            className="w-32 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-black dark:focus:border-gray-500"
                        />
                        <select
                            value={level}
                            onChange={(e) => { setLevel(e.target.value); setPage(1); }}
                            className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-700 dark:text-gray-300 outline-none"
                        >
                            {LEVELS.map((l) => (
                                <option key={l.id} value={l.id}>{l.label}</option>
                            ))}
                        </select>
                        <div className="flex gap-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-0.5">
                            {QUICK_TIMES.map((t) => (
                                <button
                                    key={t.value}
                                    onClick={() => { setTimeRange(t.value); setPage(1); }}
                                    className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${timeRange === t.value ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <div
                                className={`w-8 h-4.5 rounded-full relative transition-colors cursor-pointer ${autoRefresh ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`}
                                onClick={() => setAutoRefresh(!autoRefresh)}
                            >
                                <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[1px] transition-transform shadow-sm ${autoRefresh ? "translate-x-[14px]" : "translate-x-[1px]"}`} />
                            </div>
                            <span className="text-[10px] text-gray-500 dark:text-gray-400">Live</span>
                        </label>
                        <button onClick={() => { fetchLogs(page); fetchStats(); }} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" title="Refresh">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                            </svg>
                        </button>
                        <button onClick={purgeLogs} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Purge old logs (30+ days)">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Log Entries */}
                <div ref={logContainerRef} className="h-[550px] overflow-y-auto overflow-x-auto">
                    {loading && logs.length === 0 ? (
                        <div className="flex justify-center py-16">
                            <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="py-16 text-center text-sm text-gray-400 dark:text-gray-600">
                            No logs found.
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                            {logs.map((log, i) => (
                                <div
                                    key={log._id || i}
                                    onClick={() => setSelectedLog(selectedLog?._id === log._id ? null : log)}
                                    className={`px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${selectedLog?._id === log._id ? "bg-gray-100 dark:bg-gray-800/50" : ""}`}
                                >
                                    <div className="flex items-start gap-2">
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 mt-0.5 font-mono w-[70px]">
                                            {new Date(log.createdAt).toLocaleTimeString()}
                                        </span>
                                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${levelColor(log.level)}`}>
                                            {log.level}
                                        </span>
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${categoryColor(log.category)}`}>
                                            {log.category}
                                        </span>
                                        <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 shrink-0">
                                            {log.action}
                                        </span>
                                        <span className="text-[11px] text-gray-600 dark:text-gray-400 flex-1 min-w-0 truncate">
                                            {log.message}
                                        </span>
                                        {log.username && (
                                            <span className="text-[10px] text-blue-500 dark:text-blue-400 shrink-0">
                                                @{log.username}
                                            </span>
                                        )}
                                        {log.statusCode && (
                                            <span className={`text-[10px] font-mono shrink-0 ${log.statusCode >= 500 ? "text-red-500" : log.statusCode >= 400 ? "text-yellow-500" : "text-green-500"}`}>
                                                {log.statusCode}
                                            </span>
                                        )}
                                        {log.duration != null && (
                                            <span className="text-[10px] text-gray-400 shrink-0">
                                                {log.duration}ms
                                            </span>
                                        )}
                                    </div>

                                    {/* Expanded Detail */}
                                    {selectedLog?._id === log._id && (
                                        <div className="mt-2 ml-[70px] bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 text-[11px] space-y-1">
                                            {log.method && <div><span className="text-gray-500">Method:</span> <span className="font-mono">{log.method}</span></div>}
                                            {log.path && <div><span className="text-gray-500">Path:</span> <span className="font-mono">{log.path}</span></div>}
                                            {log.ip && <div><span className="text-gray-500">IP:</span> <span className="font-mono">{log.ip}</span></div>}
                                            {log.gameId && <div><span className="text-gray-500">Game ID:</span> <span className="font-mono">{log.gameId}</span></div>}
                                            {log.gameType && <div><span className="text-gray-500">Game Type:</span> <span className="font-mono">{log.gameType}</span></div>}
                                            {log.targetUser && <div><span className="text-gray-500">Target:</span> <span className="font-mono">@{log.targetUser}</span></div>}
                                            {log.room && <div><span className="text-gray-500">Room:</span> <span className="font-mono">{log.room}</span></div>}
                                            {log.userAgent && <div className="break-all"><span className="text-gray-500">UA:</span> <span className="font-mono text-[10px]">{log.userAgent}</span></div>}
                                            {log.meta && Object.keys(log.meta).length > 0 && (
                                                <div><span className="text-gray-500">Meta:</span> <pre className="font-mono text-[10px] whitespace-pre-wrap mt-0.5">{JSON.stringify(log.meta, null, 2)}</pre></div>
                                            )}
                                            <div><span className="text-gray-500">Time:</span> {new Date(log.createdAt).toLocaleString()}</div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pagination */}
                <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-800/30">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        {total.toLocaleString()} entries · Page {page} of {totalPages}
                    </span>
                    <div className="flex gap-1">
                        <button
                            onClick={() => { if (page > 1) fetchLogs(page - 1); }}
                            disabled={page <= 1}
                            className="px-2.5 py-1 text-[10px] font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            Prev
                        </button>
                        <button
                            onClick={() => { if (page < totalPages) fetchLogs(page + 1); }}
                            disabled={page >= totalPages}
                            className="px-2.5 py-1 text-[10px] font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {/* Recent Errors */}
            {stats?.recentErrors?.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-red-200 dark:border-red-800/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-red-100 dark:border-red-800/50 bg-red-50 dark:bg-red-900/10">
                        <h3 className="text-xs font-semibold text-red-700 dark:text-red-400">Recent Errors</h3>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[200px] overflow-y-auto">
                        {stats.recentErrors.map((err, i) => (
                            <div key={err._id || i} className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-gray-400 font-mono shrink-0">{new Date(err.createdAt).toLocaleTimeString()}</span>
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${categoryColor(err.category)}`}>{err.category}</span>
                                    <span className="text-[10px] text-gray-600 dark:text-gray-400 truncate flex-1">{err.message}</span>
                                    {err.username && <span className="text-[10px] text-blue-500 shrink-0">@{err.username}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
