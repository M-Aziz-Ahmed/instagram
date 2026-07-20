"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

function Avatar({ player }) {
    if (!player) return null;
    const color = player.avatarColor || "#3b82f6";
    if (player.avatarUrl) {
        return <img src={player.avatarUrl} alt={player.username} className="w-12 h-12 rounded-full object-cover" style={{ borderColor: color }} />;
    }
    return (
        <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
            style={{ backgroundColor: color }}
        >
            {player.username ? player.username.charAt(0).toUpperCase() : "?"}
        </div>
    );
}

export default function ReactionDuelGameClient({ gameId }) {
    const { user } = useUser();
    const router = useRouter();
    const socketRef = useRef(null);

    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [phase, setPhase] = useState("waiting"); // waiting | ready | go | finished
    const [readyList, setReadyList] = useState([]);
    const [goActive, setGoActive] = useState(false);
    const [myReacted, setMyReacted] = useState(false);
    const [result, setResult] = useState(null); // {winner, loser, resultReason, reactions}

    const myUsername = user?.username;

    useEffect(() => {
        if (!LIVE_SERVER || !myUsername) return;
        const s = io(LIVE_SERVER, {
            query: { username: myUsername },
            transports: ["polling", "websocket"],
            withCredentials: true,
        });
        socketRef.current = s;
        s.emit("reactionduel:join-game", { gameId });

        s.on("reactionduel:update", (data) => {
            if (data.phase) setPhase(data.phase);
            if (Array.isArray(data.ready)) setReadyList(data.ready);
            if (data.status === "finished" || data.phase === "finished") {
                setResult({
                    winner: data.winner,
                    loser: data.loser,
                    resultReason: data.resultReason,
                    reactions: data.reactions || [],
                });
                setGoActive(false);
                setPhase("finished");
            }
        });

        s.on("reactionduel:go", () => {
            setGoActive(true);
            setPhase("go");
        });

        s.on("reactionduel:rematch", ({ gameId: newId }) => {
            router.push(`/reactionduel/game/${newId}`);
        });

        return () => {
            s.emit("reactionduel:leave-game", { gameId });
            s.disconnect();
        };
    }, [gameId, myUsername, router]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${LIVE_SERVER}/api/reactionduel/games/${gameId}`);
                if (res.ok) {
                    const data = await res.json();
                    setGame(data.game);
                } else {
                    setError("Game not found");
                }
            } catch {
                setError("Failed to load game");
            }
            setLoading(false);
        })();
    }, [gameId]);

    const handleReady = useCallback(() => {
        if (!socketRef.current || phase === "finished") return;
        socketRef.current.emit("reactionduel:ready", { gameId });
    }, [gameId, phase]);

    const handleTap = useCallback(() => {
        if (!socketRef.current || !goActive || myReacted || phase === "finished") return;
        setMyReacted(true);
        socketRef.current.emit("reactionduel:react", { gameId });
    }, [gameId, goActive, myReacted, phase]);

    const handlePlayAgain = useCallback(async () => {
        try {
            await fetch(`${LIVE_SERVER}/api/reactionduel/games/${gameId}/rematch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
        } catch {}
    }, [gameId]);

    const handleBackToLobby = useCallback(() => {
        router.push("/reactionduel");
    }, [router]);

    if (loading) return (
        <div className="flex items-center justify-center h-96">
            <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );
    if (error && !game) return (
        <div className="flex flex-col items-center justify-center h-96 gap-2">
            <p className="text-sm">{error}</p>
            <button onClick={handleBackToLobby} className="text-xs text-pink-500 hover:underline">Back to lobby</button>
        </div>
    );
    if (!game) return null;

    const p1 = game.players ? game.players[0] : null;
    const p2 = game.players ? game.players[1] : null;
    const iAmReady = myUsername && readyList.includes(myUsername);
    const bothReady = readyList.length >= 2;
    const finished = phase === "finished";

    const PlayerCard = ({ player, label }) => {
        const ready = player && readyList.includes(player.username);
        return (
            <div className="flex-1 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-center">
                <div className="flex justify-center mb-2">
                    <Avatar player={player} />
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{player ? player.username : "Waiting..."}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                {player && (
                    <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${ready ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                        {ready ? "Ready" : "Not ready"}
                    </span>
                )}
            </div>
        );
    };

    return (
        <div className="w-full max-w-lg mx-auto px-4 py-6">
            <div className="text-center mb-4">
                <span className="text-xs font-medium text-pink-600 dark:text-pink-400 uppercase tracking-wide">Round {game.round || 1}</span>
            </div>

            <div className="flex gap-3 mb-6">
                <PlayerCard player={p1} label="Player 1" />
                <PlayerCard player={p2} label="Player 2" />
            </div>

            <div className="flex flex-col items-center justify-center mb-6">
                {!finished && (
                    <button
                        onClick={handleReady}
                        disabled={iAmReady || !myUsername}
                        className="px-8 py-3 bg-gradient-to-r from-pink-500 to-red-500 text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        {iAmReady ? (bothReady ? "Opponent readying..." : "Waiting for opponent...") : "Ready"}
                    </button>
                )}

                {!finished && bothReady && !goActive && phase !== "go" && (
                    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 animate-pulse">Get ready... GO coming!</p>
                )}

                {phase === "go" && !finished && (
                    <button
                        onClick={handleTap}
                        disabled={myReacted}
                        className="mt-2 w-56 h-56 rounded-full bg-gradient-to-r from-yellow-400 to-red-500 text-white text-3xl font-extrabold shadow-2xl active:scale-95 disabled:opacity-60 transition-transform"
                    >
                        {myReacted ? "TAPPED!" : "TAP!"}
                    </button>
                )}

                {phase !== "go" && !finished && (
                    <div className="mt-6 w-56 h-56 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm font-semibold text-center px-4">
                        {goActive ? "TAP!" : "Wait for GO"}
                    </div>
                )}
            </div>

            {error && <div className="mt-4 text-center"><p className="text-xs text-red-500">{error}</p></div>}

            {finished && result && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-700 text-center">
                        <div className="text-5xl mb-2">{result.resultReason === "False start" ? "\uD83D\uDEA8" : "\uD83C\uDFC6"}</div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                            {result.winner === myUsername ? "You win!" : result.winner ? `${result.winner} wins!` : "Duel over"}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{result.resultReason || ""}</p>
                        {result.loser && (
                            <p className="text-xs text-gray-400 mb-4">Loser: {result.loser}</p>
                        )}

                        {result.reactions && result.reactions.length > 0 && (
                            <div className="mb-4 text-left text-xs text-gray-600 dark:text-gray-300 space-y-1">
                                {result.reactions.map((r, i) => (
                                    <div key={i} className="flex justify-between">
                                        <span>{r.username}</span>
                                        <span>{r.t} ms</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handlePlayAgain}
                                className="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-red-500 text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity"
                            >
                                Play Again
                            </button>
                            <button
                                onClick={handleBackToLobby}
                                className="px-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            >
                                Back to Lobby
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
