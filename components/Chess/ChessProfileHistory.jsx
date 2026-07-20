"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m${s > 0 ? ` ${s}s` : ""}` : `${s}s`;
}

const RESULT_CONFIG = {
    win:  { label: "Win",  color: "text-green-500",  bg: "bg-green-100 dark:bg-green-900/30" },
    loss: { label: "Loss", color: "text-red-500",    bg: "bg-red-100 dark:bg-red-900/30" },
    draw: { label: "Draw", color: "text-amber-500",  bg: "bg-amber-100 dark:bg-amber-900/30" },
};

function getResult(game, username) {
    if (game.result === "1/2-1/2") return "draw";
    const won =
        (game.result === "1-0" && game.playerColor === "w") ||
        (game.result === "0-1" && game.playerColor === "b");
    return won ? "win" : "loss";
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;

    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ChessProfileHistory({ username }) {
    const [games, setGames] = useState([]);
    const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0, draws: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!username) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/chess/history?username=${encodeURIComponent(username)}`);
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
    }, [username]);

    if (loading) {
        return (
            <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    if (games.length === 0) {
        return null;
    }

    const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

    return (
        <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354.348.01.652.273.624.624v0c-.014.357-.189.677-.401.96-.221.29-.349.634-.349 1.003 0 1.036 1.007 1.875 2.25 1.875s2.25-.84 2.25-1.875c0-.369-.128-.713-.349-1.003-.215-.283-.401-.604-.401-.959v0a.64.64 0 01.657-.643 48.39 48.39 0 004.163-.3 48.75 48.75 0 00-.315-4.907.656.656 0 01.658-.663v0c.355 0 .676.186.959.401.29.221.634.349 1.003.349 1.036 0 1.875-1.007 1.875-2.25s-.84-2.25-1.875-2.25c-.369 0-.713.128-1.003.349-.283.215-.604.401-.959.401v0c-.31 0-.555-.26-.532-.57a48.039 48.039 0 01.642-5.056 48.172 48.172 0 00-4.616-.354.643.643 0 01-.624-.624v0Z" />
                </svg>
                <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Chess Games</h3>
            </div>

            {/* Stats summary */}
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

            {/* Win rate bar */}
            {stats.total > 0 && (
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${winRate}%` }} />
                </div>
            )}

            {/* Game list */}
            <div className="space-y-1">
                {games.map((game) => {
                    const result = getResult(game, username);
                    const cfg = RESULT_CONFIG[result];
                    const isAI = game.mode === "ai";

                    return (
                        <Link
                            key={game.gameId}
                            href={`/chess/game/${game.gameId}`}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${cfg.bg} ${cfg.color}`}>
                                {cfg.label}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                        vs {game.opponent || "Unknown"}
                                    </span>
                                    {isAI && (
                                        <span className="text-[10px] text-purple-500 font-semibold uppercase shrink-0">AI</span>
                                    )}
                                </div>
                                {game.resultReason && (
                                    <span className="text-[11px] text-gray-400 dark:text-gray-500 block truncate">
                                        {game.resultReason}
                                    </span>
                                )}
                            </div>
                            <div className="text-right shrink-0">
                                <div className="text-[11px] text-gray-400 dark:text-gray-500">
                                    {game.moves > 0 ? `${game.moves} moves` : ""}
                                </div>
                                <div className="text-[10px] text-gray-400 dark:text-gray-500">
                                    {formatDate(game.playedAt)}
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
