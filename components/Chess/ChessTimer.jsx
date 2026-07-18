"use client";

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
            className={`flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all duration-300 ${
                isActive
                    ? isCritical
                        ? "bg-red-50 dark:bg-red-900/20 ring-1 sm:ring-2 ring-red-500/60"
                        : "bg-green-50 dark:bg-green-900/20 ring-1 sm:ring-2 ring-green-500/50"
                    : "bg-gray-50 dark:bg-gray-800/50"
            }`}
        >
            <div
                className="w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm shrink-0 shadow-sm ring-1 sm:ring-2 ring-white dark:ring-gray-900"
                style={{ backgroundColor: player?.avatarColor || "#3b82f6" }}
            >
                {player?.avatarUrl ? (
                    <img src={player.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                ) : (
                    player?.username?.[0]?.toUpperCase() || "?"
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 truncate">{label}</div>
                <div className={`text-sm sm:text-base font-mono font-bold tracking-wider ${
                    isCritical
                        ? "text-red-500"
                        : isWarning
                        ? "text-yellow-600 dark:text-yellow-400"
                        : isActive
                        ? "text-gray-900 dark:text-white"
                        : "text-gray-600 dark:text-gray-400"
                }`}>
                    {timeStr}
                </div>
            </div>
            {isActive && (
                <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 ${isCritical ? "bg-red-500 animate-pulse" : "bg-green-500 animate-pulse"}`} />
            )}
        </div>
    );
}

export default ChessTimer;
export { formatTime };
