"use client";

import { useMemo } from "react";
import { analyseGameMoves } from "./chessAnalysis";

const LABEL_CONFIG = {
    brilliant:  { label: "Brilliant",  color: "text-amber-500",  bg: "bg-amber-100 dark:bg-amber-900/30",  dot: "bg-amber-500",  icon: "\u2728" },
    excellent:  { label: "Excellent",  color: "text-green-500",  bg: "bg-green-100 dark:bg-green-900/30",  dot: "bg-green-500",  icon: "\u2705" },
    good:       { label: "Good",       color: "text-gray-500",   bg: "bg-gray-100 dark:bg-gray-800",       dot: "bg-gray-400",   icon: "\u25C9" },
    inaccuracy: { label: "Inaccuracy", color: "text-orange-500", bg: "bg-orange-100 dark:bg-orange-900/30", dot: "bg-orange-500", icon: "\u26A0\uFE0F" },
    mistake:    { label: "Mistake",    color: "text-red-500",    bg: "bg-red-100 dark:bg-red-900/30",      dot: "bg-red-500",    icon: "\u274C" },
    blunder:    { label: "Blunder",    color: "text-red-600",    bg: "bg-red-100 dark:bg-red-900/30",      dot: "bg-red-600",    icon: "\uD83D\uDCA5" },
    miss:       { label: "Miss",       color: "text-red-500",    bg: "bg-red-100 dark:bg-red-900/30",      dot: "bg-red-500",    icon: "\uD83D\uDE35" },
};

export default function ChessReviewPanel({ moves, playerColor, playerName, opponentName, result, resultReason }) {
    const analysis = useMemo(() => {
        return analyseGameMoves(moves, playerColor);
    }, [moves, playerColor]);

    const playerMoves = analysis.moves.filter((m) => m.color === playerColor);
    const accuracy = analysis.stats.total > 0
        ? Math.round(
            ((analysis.stats.brilliant + analysis.stats.excellent + analysis.stats.good) / analysis.stats.total) * 100
          )
        : 0;

    const statBars = [
        { key: "brilliant", ...LABEL_CONFIG.brilliant, count: analysis.stats.brilliant },
        { key: "excellent", ...LABEL_CONFIG.excellent, count: analysis.stats.excellent },
        { key: "good",      ...LABEL_CONFIG.good,      count: analysis.stats.good },
        { key: "inaccuracy",...LABEL_CONFIG.inaccuracy, count: analysis.stats.inaccuracy },
        { key: "mistake",   ...LABEL_CONFIG.mistake,   count: analysis.stats.mistake },
        { key: "blunder",   ...LABEL_CONFIG.blunder,   count: analysis.stats.blunder },
        { key: "miss",      ...LABEL_CONFIG.miss,      count: analysis.stats.miss },
    ];

    const maxCount = Math.max(...statBars.map((s) => s.count), 1);

    const resultColor = !result
        ? "text-gray-500"
        : result === "1-0" && playerColor === "w"
        ? "text-green-500"
        : result === "0-1" && playerColor === "b"
        ? "text-green-500"
        : result === "1/2-1/2"
        ? "text-amber-500"
        : "text-red-500";

    const resultEmoji = !result
        ? ""
        : result === "1-0" && playerColor === "w"
        ? "\uD83C\uDFC6"
        : result === "0-1" && playerColor === "b"
        ? "\uD83C\uDFC6"
        : result === "1/2-1/2"
        ? "\uD83E\uDD1D"
        : "\uD83D\uDE1E";

    return (
        <div className="w-full max-w-sm mx-auto">
            {/* Result header */}
            <div className={`text-center mb-4 ${resultColor}`}>
                <div className="text-3xl mb-1">{resultEmoji}</div>
                <div className="font-bold text-lg">
                    {playerName} vs {opponentName}
                </div>
                <div className="text-sm opacity-80">
                    {result === "1-0" ? "1 - 0" : result === "0-1" ? "0 - 1" : result === "1/2-1/2" ? "1/2 - 1/2" : result}
                    {resultReason ? ` (${resultReason})` : ""}
                </div>
            </div>

            {/* Accuracy ring */}
            <div className="flex justify-center mb-4">
                <div className="relative w-20 h-20">
                    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8"
                            className="text-gray-200 dark:text-gray-700" />
                        <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8"
                            strokeDasharray={`${(accuracy / 100) * 264} 264`}
                            strokeLinecap="round"
                            className={`${accuracy >= 80 ? "text-green-500" : accuracy >= 60 ? "text-amber-500" : "text-red-500"}`} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold text-gray-800 dark:text-white">{accuracy}%</span>
                    </div>
                </div>
            </div>
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 -mt-2 mb-4">Accuracy</p>

            {/* Stats bars */}
            <div className="space-y-1.5">
                {statBars.map((stat) => (
                    <div key={stat.key} className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full shrink-0 {stat.dot}" />
                        <span className={`w-16 shrink-0 font-medium ${stat.color}`}>{stat.label}</span>
                        <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${stat.dot.replace("bg-", "bg-")}`}
                                style={{
                                    width: `${(stat.count / maxCount) * 100}%`,
                                    minWidth: stat.count > 0 ? "4px" : "0",
                                    backgroundColor: stat.count > 0 ? undefined : "transparent",
                                }}
                            />
                        </div>
                        <span className="w-5 text-right font-medium text-gray-700 dark:text-gray-300">{stat.count}</span>
                    </div>
                ))}
            </div>

            {/* Per-move breakdown */}
            {playerMoves.length > 0 && (
                <div className="mt-4">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Move Breakdown</h4>
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {playerMoves.map((m, i) => {
                            const cfg = LABEL_CONFIG[m.classification.label] || LABEL_CONFIG.good;
                            return (
                                <div key={i} className="flex items-center gap-1.5 text-xs py-0.5 px-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <span className="w-6 text-gray-400 text-[10px] text-right shrink-0">{m.moveNumber}.</span>
                                    <span className={`w-0.5 h-3 rounded-full shrink-0 ${cfg.dot}`} />
                                    <span className={`${cfg.color} font-medium w-14 shrink-0`}>{cfg.icon} {cfg.label}</span>
                                    <span className="font-mono text-gray-700 dark:text-gray-300">{m.san}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
