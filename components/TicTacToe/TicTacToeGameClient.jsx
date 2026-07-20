"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useUser } from "@/context/UserContext";
import { io } from "socket.io-client";
import ChessChat from "@/components/Chess/ChessChat";
import { playMoveSound, playCheckmateSound, setSoundEnabled } from "@/components/Chess/chessSounds";
import { useGameReplay } from "@/components/Games/useGameReplay";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

function Mark({ mark, players, small }) {
    if (!mark) return null;
    const color = mark === "x" ? (players?.x?.avatarColor || "#3b82f6") : (players?.o?.avatarColor || "#ef4444");
    const size = small ? "w-5 h-5" : "w-2/3 h-2/3";
    if (mark === "x") {
        return (
            <svg viewBox="0 0 24 24" className={size} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round">
                <path d="M5 5l14 14M19 5L5 19" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" className={size} fill="none" stroke={color} strokeWidth="3">
            <circle cx="12" cy="12" r="8" />
        </svg>
    );
}

function PlayerBar({ player, mark, active, players }) {
    return (
        <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${active ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
            <div className="w-7 h-7"><Mark mark={mark} players={players} small /></div>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: player?.avatarColor || "#64748b" }}>
                {player?.avatarUrl ? <img src={player.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" /> : (player?.username?.[0] || "?").toUpperCase()}
            </div>
            <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{player?.username || "Waiting"}</p>
                {active && <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">To move</p>}
            </div>
        </div>
    );
}

export default function TicTacToeGameClient({ gameId }) {
    const { user } = useUser();
    const { creating, playAgain } = useGameReplay("tictactoe");
    const socketRef = useRef(null);
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [soundOn, setSoundOn] = useState(true);
    const [showGameOver, setShowGameOver] = useState(false);
    const reportedRef = useRef(false);

    const myMark = useMemo(() => {
        if (!game || !user?.username) return null;
        if (game.x.username === user.username) return "x";
        if (game.o.username === user.username) return "o";
        return null;
    }, [game, user]);

    const isMyTurn = game?.turn === myMark;
    const gameOver = game?.status && game.status !== "active" && game.status !== "waiting";
    const canPlay = !gameOver && game?.status === "active" && isMyTurn;

    const toggleSound = () => {
        const next = !soundOn;
        setSoundOn(next);
        setSoundEnabled(next);
    };

    useEffect(() => {
        if (!LIVE_SERVER || !user?.username) return;
        const s = io(LIVE_SERVER, { query: { username: user.username }, transports: ["polling", "websocket"], withCredentials: true });
        socketRef.current = s;
        s.emit("tictactoe:join-game", { gameId });

        s.on("tictactoe:move", (data) => {
            if (data.status === "win") playCheckmateSound();
            else playMoveSound();
            setGame((prev) => prev ? { ...prev, board: data.board, turn: data.turn, status: data.status, result: data.result, resultReason: data.resultReason, winner: data.winner, winningLine: data.winningLine, moveCount: data.moveCount } : prev);
        });
        s.on("tictactoe:chat", (msg) => setChatMessages((prev) => [...prev, msg]));
        s.on("tictactoe:game-over", (data) => setGame((prev) => prev ? { ...prev, status: data.status, result: data.result, resultReason: data.resultReason, winner: data.winner } : prev));
        s.on("tictactoe:error", ({ message }) => { setError(message); setTimeout(() => setError(null), 2500); });

        return () => { s.emit("tictactoe:leave-game", { gameId }); s.disconnect(); };
    }, [gameId, user?.username]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${LIVE_SERVER}/api/tictactoe/games/${gameId}`);
                if (res.ok) {
                    const data = await res.json();
                    setGame(data.game);
                    setChatMessages(data.game.chat || []);
                } else setError("Game not found");
            } catch { setError("Failed to load game"); }
            setLoading(false);
        })();
    }, [gameId]);

    useEffect(() => { if (gameOver) setShowGameOver(true); }, [gameOver]);

    useEffect(() => {
        if (!gameOver || !game || !user?.username || !myMark || reportedRef.current) return;
        reportedRef.current = true;
        let outcome = "draw";
        if (game.status === "win" || game.status === "resigned") outcome = game.winner === user.username ? "win" : "loss";
        const opponent = myMark === "x" ? game.o?.username : game.x?.username;
        fetch("/api/games/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user.username, game: "tictactoe", gameId, opponent: opponent || (game.mode === "ai" ? "Computer" : ""), outcome, resultReason: game.resultReason || "", mode: game.mode || "multiplayer", moves: game.moveCount || 0 }),
        }).catch(() => {});
    }, [gameOver, game?.status, game?.winner, myMark, user?.username, gameId]);

    const handleCellClick = useCallback((cell) => {
        if (!socketRef.current || !canPlay || game?.board?.[cell]) return;
        socketRef.current.emit("tictactoe:make-move", { gameId, cell });
    }, [gameId, canPlay, game?.board]);

    const handleSendChat = useCallback((text) => {
        socketRef.current?.emit("tictactoe:chat", { gameId, text, color: user?.avatarColor || "#3b82f6", avatarUrl: user?.avatarUrl || "" });
    }, [gameId, user]);

    const handleResign = () => {
        if (!confirm("Resign this game?")) return;
        socketRef.current?.emit("tictactoe:resign", { gameId });
    };

    const resultText = () => {
        if (!gameOver || !game) return "";
        if (game.status === "draw") return "Draw!";
        if (game.status === "resigned") return `${game.winner} won by resignation`;
        if (game.status === "win") return `${game.winner} wins!`;
        return "Game over";
    };

    if (loading) return <div className="flex items-center justify-center h-96"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
    if (error && !game) return <div className="flex flex-col items-center justify-center h-96 gap-2"><p className="text-sm">{error}</p><a href="/tictactoe" className="text-xs text-blue-500 hover:underline">Back to lobby</a></div>;
    if (!game) return null;

    const players = { x: game.x, o: game.o };
    const winSet = new Set(game.winningLine || []);

    return (
        <div className="w-full max-w-3xl mx-auto px-3 py-4">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="w-full lg:flex-1 max-w-md mx-auto">
                    <div className="flex items-center justify-between mb-3">
                        <PlayerBar player={game.x} mark="x" active={game.turn === "x" && !gameOver} players={players} />
                        <button onClick={toggleSound} className="p-1.5 rounded text-gray-400 hover:text-gray-600" title={soundOn ? "Mute" : "Unmute"}>
                            {soundOn ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>}
                        </button>
                        <PlayerBar player={game.o} mark="o" active={game.turn === "o" && !gameOver} players={players} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-gray-200 dark:bg-gray-800 p-2 rounded-2xl aspect-square">
                        {game.board.map((cell, i) => (
                            <button
                                key={i}
                                onClick={() => handleCellClick(i)}
                                disabled={!canPlay || !!cell}
                                className={`flex items-center justify-center rounded-xl bg-white dark:bg-gray-900 transition-colors ${winSet.has(i) ? "ring-2 ring-green-500" : ""} ${canPlay && !cell ? "hover:bg-blue-50 dark:hover:bg-gray-800 cursor-pointer" : ""}`}
                            >
                                <Mark mark={cell} players={players} />
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center justify-between mt-3 px-1">
                        <div className="text-xs font-medium">
                            {game.status === "waiting" ? <span className="text-blue-500">Waiting for opponent...</span>
                                : gameOver ? <span className="text-gray-500">{resultText()}</span>
                                : canPlay ? <span className="text-green-600 dark:text-green-400">Your turn</span>
                                : <span className="text-gray-400">Opponent's turn</span>}
                        </div>
                        {game.status === "active" && myMark && (
                            <button onClick={handleResign} className="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md">Resign</button>
                        )}
                    </div>
                    {error && <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-md text-center"><p className="text-xs text-red-500">{error}</p></div>}
                </div>

                <div className="w-full lg:w-64 shrink-0">
                    <div className="h-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                        <ChessChat chat={chatMessages} onSendMessage={handleSendChat} username={user?.username} />
                    </div>
                </div>
            </div>

            {showGameOver && gameOver && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-700 text-center">
                        <div className="text-5xl mb-2">{game.status === "draw" ? "\uD83E\uDD1D" : game.winner === user?.username ? "\uD83C\uDFC6" : "\uD83D\uDE1E"}</div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{resultText()}</h2>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => playAgain("/api/tictactoe/games", { mode: game.mode, aiDifficulty: game.aiDifficulty })} disabled={creating} className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl text-sm">{creating ? "Starting..." : "Play Again"}</button>
                            <a href="/tictactoe" className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl text-sm">Back to Lobby</a>
                            <button onClick={() => setShowGameOver(false)} className="px-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
