"use client";

import { useMemo, useState } from "react";

function formatTime(seconds) {
    if (seconds == null || seconds < 0) return "0:00";
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
}

function ChessTimer({ time, isActive, isLow, label, player, onClick }) {
    const timeStr = formatTime(time);
    const isCritical = time != null && time < 30;
    const isWarning = time != null && time < 120 && time >= 30;

    return (
        <div
            onClick={onClick}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                isActive
                    ? "bg-green-50 dark:bg-green-900/20 ring-2 ring-green-500/50"
                    : "bg-gray-50 dark:bg-gray-800/50"
            } ${isCritical ? "ring-2 ring-red-500 animate-pulse" : ""} ${isWarning && !isCritical ? "ring-1 ring-yellow-500/50" : ""}`}
        >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: player?.avatarColor || "#3b82f6" }}>
                {player?.avatarUrl ? (
                    <img src={player.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                ) : (
                    player?.username?.[0]?.toUpperCase() || "?"
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</div>
                <div className={`text-sm font-mono font-bold ${isCritical ? "text-red-500" : isWarning ? "text-yellow-600 dark:text-yellow-400" : "text-gray-900 dark:text-gray-100"}`}>
                    {timeStr}
                </div>
            </div>
        </div>
    );
}

export default ChessTimer;
export { formatTime };
