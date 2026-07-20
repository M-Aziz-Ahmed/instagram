"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import GameProfileHistory from "@/components/Games/GameProfileHistory";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

const AI_LEVELS = [
    { label: "Beginner", level: 1, desc: "Random-ish" },
    { label: "Easy", level: 2, desc: "Casual" },
    { label: "Medium", level: 3, desc: "Thinks ahead" },
    { label: "Hard", level: 4, desc: "Strong" },
    { label: "Expert", level: 5, desc: "Very strong" },
    { label: "Master", level: 6, desc: "Deep search" },
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

export default function Connect4LobbyClient() {
    const { user } = useUser();
    const router = useRouter();
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [mode, setMode] = useState("multiplayer");
    const [aiLevel, setAiLevel] = useState(AI_LEVELS[2]);
    const [creating, setCreating] = useState(false);
    const [myGames, setMyGames] = useState([]);

    const fetchGames = useCallback(async () => {
        try {
            const res = await fetch(`${LIVE_SERVER}/api/connect4/games?status=waiting`);
            if (res.ok) {
                const data = await res.json();
                setGames(data.games || []);
            }
        } catch (e) {}
        setLoading(false);
    }, []);

    const fetchMyGames = useCallback(async () => {
        if (!user?.username) return;
        try {
            const res = await fetch(`${LIVE_SERVER}/api/connect4/games?status=active&username=${encodeURIComponent(user.username)}`);
            if (res.ok) {
                const data = await res.json();
                setMyGames(data.games || []);
            }
        } catch (e) {}
    }, [user?.username]);

    useEffect(() => {
        fetchGames();
        fetchMyGames();
        const id = setInterval(() => { fetchGames(); fetchMyGames(); }, 10000);
        return () => clearInterval(id);
    }, [fetchGames, fetchMyGames]);

    const handleCreate = async () => {
        if (!user) return;
        setCreating(true);
        try {
            const res = await fetch(`${LIVE_SERVER}/api/connect4/games`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    avatarUrl: user.avatarUrl || "",
                    avatarColor: user.avatarColor || "#ef4444",
                    mode,
                    aiDifficulty: mode === "ai" ? aiLevel.level : 3,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                router.push(`/connect4/game/${data.game._id}`);
            }
        } catch (e) {}
        setCreating(false);
    };

    const handleJoin = async (gameId) => {
        if (!user) return;
        try {
            const res = await fetch(`${LIVE_SERVER}/api/connect4/games/${gameId}/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    avatarUrl: user.avatarUrl || "",
                    avatarColor: user.avatarColor || "#eab308",
                }),
            });
            if (res.ok) router.push(`/connect4/game/${gameId}`);
        } catch (e) {}
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Connect Four</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Drop discs, connect four to win</p>
                </div>
                <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors">
                    {showCreate ? "Cancel" : "New Game"}
                </button>
            </div>

            {showCreate && (
                <div className="mb-6 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Create Game</h2>
                    <div className="mb-3">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Mode</label>
                        <div className="flex gap-2">
                            <button onClick={() => setMode("multiplayer")} className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${mode === "multiplayer" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"}`}>vs Player</button>
                            <button onClick={() => setMode("ai")} className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${mode === "ai" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"}`}>vs Computer</button>
                        </div>
                    </div>
                    {mode === "ai" && (
                        <div className="mb-4">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Difficulty</label>
                            <div className="grid grid-cols-3 gap-2">
                                {AI_LEVELS.map((level) => (
                                    <button key={level.level} onClick={() => setAiLevel(level)} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${aiLevel.level === level.level ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"}`}>
                                        <div>{level.label}</div>
                                        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{level.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <button onClick={handleCreate} disabled={creating} className="w-full px-4 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors">
                        {creating ? "Creating..." : mode === "ai" ? "Start vs Computer" : "Create Game"}
                    </button>
                </div>
            )}

            {myGames.length > 0 && (
                <div className="mb-6">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Your Active Games</h2>
                    <div className="space-y-2">
                        {myGames.map((game) => {
                            const opponent = game.red.username === user?.username ? game.yellow : game.red;
                            return (
                                <Link key={game._id} href={`/connect4/game/${game._id}`} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: opponent.avatarColor || "#64748b" }}>
                                        {opponent.avatarUrl ? <img src={opponent.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" /> : (opponent.username?.[0] || "?").toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">vs {opponent.username || "Anonymous"}</p>
                                            <StatusBadge status={game.status} />
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{game.turn === "r" ? "Red" : "Yellow"} to move</p>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

            <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Open Games</h2>
                {loading ? (
                    <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : games.filter(g => g._id && g.red?.username !== user?.username).length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-4xl mb-3">🔴</div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">No open games</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Create one and wait for an opponent!</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {games.filter(g => g._id && g.red?.username !== user?.username).map((game) => (
                            <div key={game._id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: game.red.avatarColor || "#ef4444" }}>
                                    {game.red.avatarUrl ? <img src={game.red.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" /> : (game.red.username?.[0] || "?").toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{game.red.username || "Anonymous"}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Playing as Red</p>
                                </div>
                                <button onClick={() => handleJoin(game._id)} className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors shrink-0">Join</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {user?.username && (
                <div className="mt-8 border-t border-gray-200 dark:border-gray-800 pt-6">
                    <GameProfileHistory username={user.username} game="connect4" title="Connect Four Games" />
                </div>
            )}
        </div>
    );
}
