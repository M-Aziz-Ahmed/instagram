"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ChessProfileHistory from "./ChessProfileHistory";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

const TIME_CONTROLS = [
    { label: "1 min", initial: 60, increment: 0, icon: "⚡" },
    { label: "3 min", initial: 180, increment: 0, icon: "🔥" },
    { label: "5 min", initial: 300, increment: 0, icon: "⏱" },
    { label: "10 min", initial: 600, increment: 0, icon: "🕐" },
    { label: "15 | 10", initial: 900, increment: 10, icon: "🕐" },
    { label: "30 min", initial: 1800, increment: 0, icon: "🐢" },
];

const AI_LEVELS = [
    { label: "Beginner", level: 1, desc: "Just learning" },
    { label: "Easy", level: 4, desc: "Casual play" },
    { label: "Medium", level: 8, desc: "Intermediate" },
    { label: "Hard", level: 12, desc: "Advanced" },
    { label: "Expert", level: 16, desc: "Expert level" },
    { label: "Master", level: 20, desc: "Stockfish max" },
];

function StatusBadge({ status }) {
    const colors = {
        waiting: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
        active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    };
    return (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors[status] || colors.waiting}`}>
            {status === "waiting" ? "Waiting" : "In Progress"}
        </span>
    );
}

export default function ChessLobbyClient() {
    const { user } = useUser();
    const router = useRouter();
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [selectedTime, setSelectedTime] = useState(TIME_CONTROLS[3]);
    const [mode, setMode] = useState("multiplayer");
    const [aiLevel, setAiLevel] = useState(AI_LEVELS[2]);
    const [creating, setCreating] = useState(false);
    const [myGames, setMyGames] = useState([]);

    const fetchGames = useCallback(async () => {
        try {
            const res = await fetch(`${LIVE_SERVER}/api/chess/games?status=waiting`);
            if (res.ok) {
                const data = await res.json();
                setGames(data.games || []);
            }
        } catch (e) {
            console.error("Failed to fetch games:", e);
        }
        setLoading(false);
    }, []);

    const fetchMyGames = useCallback(async () => {
        if (!user?.username) return;
        try {
            const res = await fetch(`${LIVE_SERVER}/api/chess/games?status=active&username=${encodeURIComponent(user.username)}`);
            if (res.ok) {
                const data = await res.json();
                setMyGames(data.games || []);
            }
        } catch (e) {}
    }, [user?.username]);

    useEffect(() => {
        fetchGames();
        fetchMyGames();
        const id = setInterval(() => {
            fetchGames();
            fetchMyGames();
        }, 10000);
        return () => clearInterval(id);
    }, [fetchGames, fetchMyGames]);

    const handleCreateGame = async () => {
        if (!user) return;
        setCreating(true);
        try {
            const res = await fetch(`${LIVE_SERVER}/api/chess/games`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    avatarUrl: user.avatarUrl || "",
                    avatarColor: user.avatarColor || "#3b82f6",
                    timeControl: { initial: selectedTime.initial, increment: selectedTime.increment },
                    mode,
                    aiDifficulty: mode === "ai" ? aiLevel.level : 10,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                router.push(`/chess/game/${data.game._id}`);
            }
        } catch (e) {
            console.error("Failed to create game:", e);
        }
        setCreating(false);
    };

    const handleJoinGame = async (gameId) => {
        if (!user) return;
        try {
            const res = await fetch(`${LIVE_SERVER}/api/chess/games/${gameId}/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    avatarUrl: user.avatarUrl || "",
                    avatarColor: user.avatarColor || "#3b82f6",
                }),
            });
            if (res.ok) {
                router.push(`/chess/game/${gameId}`);
            }
        } catch (e) {
            console.error("Failed to join game:", e);
        }
    };

    const formatTimeControl = (tc) => {
        if (tc.increment > 0) return `${tc.initial / 60} + ${tc.increment}`;
        if (tc.initial >= 3600) return `${tc.initial / 3600}h`;
        return `${tc.initial / 60} min`;
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Chess</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Play chess with friends or AI</p>
                </div>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
                >
                    {showCreate ? "Cancel" : "New Game"}
                </button>
            </div>

            {showCreate && (
                <div className="mb-6 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Create Game</h2>

                    <div className="mb-3">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Mode</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setMode("multiplayer")}
                                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                    mode === "multiplayer"
                                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                        : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300"
                                }`}
                            >
                                vs Player
                            </button>
                            <button
                                onClick={() => setMode("ai")}
                                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                    mode === "ai"
                                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                        : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300"
                                }`}
                            >
                                vs Computer
                            </button>
                        </div>
                    </div>

                    {mode === "ai" && (
                        <div className="mb-3">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Difficulty</label>
                            <div className="grid grid-cols-3 gap-2">
                                {AI_LEVELS.map((level) => (
                                    <button
                                        key={level.level}
                                        onClick={() => setAiLevel(level)}
                                        className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                                            aiLevel.level === level.level
                                                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                                : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300"
                                        }`}
                                    >
                                        <div>{level.label}</div>
                                        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{level.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mb-4">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Time Control</label>
                        <div className="grid grid-cols-3 gap-2">
                            {TIME_CONTROLS.map((tc) => (
                                <button
                                    key={tc.label}
                                    onClick={() => setSelectedTime(tc)}
                                    className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                                        selectedTime.label === tc.label
                                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                            : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300"
                                    }`}
                                >
                                    <span className="mr-1">{tc.icon}</span> {tc.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleCreateGame}
                        disabled={creating}
                        className="w-full px-4 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                    >
                        {creating ? "Creating..." : mode === "ai" ? "Start vs Computer" : "Create Game"}
                    </button>
                </div>
            )}

            {myGames.length > 0 && (
                <div className="mb-6">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Your Active Games</h2>
                    <div className="space-y-2">
                        {myGames.map((game) => {
                            const opponent = game.white.username === user?.username ? game.black : game.white;
                            return (
                                <Link
                                    key={game._id}
                                    href={`/chess/game/${game._id}`}
                                    className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                                >
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: opponent.avatarColor || "#3b82f6" }}>
                                        {opponent.avatarUrl ? (
                                            <img src={opponent.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                                        ) : (
                                            opponent.username?.[0]?.toUpperCase()
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                vs {opponent.username || "Anonymous"}
                                            </p>
                                            <StatusBadge status={game.status} />
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {formatTimeControl(game.timeControl)} · {game.turn === "w" ? "White" : "Black"} to move
                                        </p>
                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400">
                                        <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                                    </svg>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

            <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Open Games</h2>
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : games.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-4xl mb-3">♟️</div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">No open games</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Create one and wait for an opponent!</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {games.filter(g => g._id && g.white?.username !== user?.username).map((game) => (
                            <div
                                key={game._id}
                                className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                            >
                                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: game.white.avatarColor || "#3b82f6" }}>
                                    {game.white.avatarUrl ? (
                                        <img src={game.white.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                                    ) : (
                                        game.white.username?.[0]?.toUpperCase() || "?"
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                        {game.white.username || "Anonymous"}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {formatTimeControl(game.timeControl)} · Playing as White
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleJoinGame(game._id)}
                                    className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors shrink-0"
                                >
                                    Join
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {user?.username && (
                <div className="mt-8 border-t border-gray-200 dark:border-gray-800 pt-6">
                    <ChessProfileHistory username={user.username} />
                </div>
            )}
        </div>
    );
}
