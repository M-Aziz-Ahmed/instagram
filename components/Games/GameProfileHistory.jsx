"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const RESULT_CONFIG = {
    win:  { label: "Win",  color: "text-green-500",  bg: "bg-green-100 dark:bg-green-900/30" },
    loss: { label: "Loss", color: "text-red-500",    bg: "bg-red-100 dark:bg-red-900/30" },
    draw: { label: "Draw", color: "text-amber-500",  bg: "bg-amber-100 dark:bg-amber-900/30" },
};

const GAME_PATHS = {
    connect4: "/connect4/game",
    tictactoe: "/tictactoe/game",
    checkers: "/checkers/game",
};

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function GameProfileHistory({ username, game, title }) {
    const [games, setGames] = useState([]);
    const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0, draws: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!username) return;
        let cancelled = false;
        (async () => {
            try {
                const q = new URLSearchParams({ username });
                if (game) q.set("game", game);
                const res = await fetch(`/api/games/history?${q.toString()}`);
                if (res.ok) {
                    const data = await res.json();
                    if (!cancelled) {
                        setGames(data.games || []);
                        setStats(data.stats || { total: 0, wins: 0, losses: 0, draws: 0 });
                    }
                }
            } catch { /* silent */ }
            if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [username, game]);

    if (loading) {
        return (
            <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    if (games.length === 0) return null;

    const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

    return (
        <div className="mt-8">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-4">
                {title || "Game History"}
            </h3>

            <div className="flex items-center gap-4 mb-4 px-1">
                <div className="text-center">
                    <div className="font-bold text-lg text-gray-900 dark:text-gray-100">{stats.total}</div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">Games</div>
                </div>
                <div className="text-center">
                    <div className="font-bold text-lg text-green-500">{stats.wins}</div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">Wins</div>
                </div>
                <div className="text-center">
                    <div className="font-bold text-lg text-red-500">{stats.losses}</div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">Losses</div>
                </div>
                <div className="text-center">
                    <div className="font-bold text-lg text-amber-500">{stats.draws}</div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">Draws</div>
                </div>
                <div className="text-center">
                    <div className="font-bold text-lg text-gray-900 dark:text-gray-100">{winRate}%</div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">Win Rate</div>
                </div>
            </div>

            {stats.total > 0 && (
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${winRate}%` }} />
                </div>
            )}

            <div className="space-y-1">
                {games.map((g) => {
                    const cfg = RESULT_CONFIG[g.outcome] || RESULT_CONFIG.draw;
                    const isAI = g.mode === "ai";
                    const basePath = GAME_PATHS[g.game] || "#";
                    return (
                        <Link
                            key={`${g.game}-${g.gameId}`}
                            href={`${basePath}/${g.gameId}`}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">vs {g.opponent || "Unknown"}</span>
                                    {isAI && <span className="text-[10px] text-purple-500 font-semibold uppercase shrink-0">AI</span>}
                                </div>
                                {g.resultReason && (
                                    <span className="text-[11px] text-gray-400 dark:text-gray-500 block truncate">{g.resultReason}</span>
                                )}
                            </div>
                            <div className="text-right shrink-0">
                                <div className="text-[11px] text-gray-400 dark:text-gray-500">{g.moves > 0 ? `${g.moves} moves` : ""}</div>
                                <div className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(g.playedAt)}</div>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
