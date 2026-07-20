"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useUser } from "@/context/UserContext";
import { io } from "socket.io-client";
import ReversiBoard from "./ReversiBoard";
import { countPieces } from "./reversiClientLogic";
import ChessChat from "@/components/Chess/ChessChat";
import { playMoveSound, playCaptureSound, playCheckmateSound, setSoundEnabled } from "@/components/Chess/chessSounds";
import { useGameReplay } from "@/components/Games/useGameReplay";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

function PlayerBar({ player, color, active, count }) {
    return (
        <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${active ? "bg-emerald-50 dark:bg-emerald-900/20" : ""}`}>
            <span className="w-4 h-4 rounded-full shrink-0 border border-gray-300" style={{ backgroundColor: color === "b" ? "#111827" : "#f9fafb" }} />
            <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{player?.username || "Waiting"}</p>
                {active && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">To move</p>}
            </div>
            <span className="ml-auto text-sm font-bold text-gray-700 dark:text-gray-300">{count}</span>
        </div>
    );
}

export default function ReversiGameClient({ gameId }) {
    const { user } = useUser();
    const { creating, playAgain } = useGameReplay("reversi");
    const socketRef = useRef(null);
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [soundOn, setSoundOn] = useState(true);
    const [showGameOver, setShowGameOver] = useState(false);
    const reportedRef = useRef(false);

    const myColor = useMemo(() => {
        if (!game || !user?.username) return null;
        if (game.black.username === user.username) return "b";
        if (game.white.username === user.username) return "w";
        return null;
    }, [game, user]);

    const isMyTurn = game?.turn === myColor;
    const gameOver = game?.status && game.status !== "active" && game.status !== "waiting";
    const canPlay = !gameOver && game?.status === "active" && isMyTurn;

    const counts = useMemo(() => (game ? countPieces(game.board) : { b: 0, w: 0 }), [game]);

    const toggleSound = () => { const n = !soundOn; setSoundOn(n); setSoundEnabled(n); };

    useEffect(() => {
        if (!LIVE_SERVER || !user?.username) return;
        const s = io(LIVE_SERVER, { query: { username: user.username }, transports: ["polling", "websocket"], withCredentials: true });
        socketRef.current = s;
        s.emit("reversi:join-game", { gameId });
        s.on("reversi:move", (data) => {
            if (data.status === "win" || data.status === "draw") playCheckmateSound();
            else if (data.lastMove?.flips?.length) playCaptureSound();
            else playMoveSound();
            setGame((prev) => prev ? { ...prev, board: data.board, turn: data.turn, lastMove: data.lastMove, status: data.status, result: data.result, resultReason: data.resultReason, winner: data.winner, moveCount: data.moveCount } : prev);
        });
        s.on("reversi:chat", (msg) => setChatMessages((prev) => [...prev, msg]));
        s.on("reversi:game-over", (data) => setGame((prev) => prev ? { ...prev, status: data.status, result: data.result, resultReason: data.resultReason, winner: data.winner } : prev));
        s.on("reversi:error", ({ message }) => { setError(message); setTimeout(() => setError(null), 2500); });
        return () => { s.emit("reversi:leave-game", { gameId }); s.disconnect(); };
    }, [gameId, user?.username]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${LIVE_SERVER}/api/reversi/games/${gameId}`);
                if (res.ok) { const data = await res.json(); setGame(data.game); setChatMessages(data.game.chat || []); }
                else setError("Game not found");
            } catch { setError("Failed to load game"); }
            setLoading(false);
        })();
    }, [gameId]);

    useEffect(() => { if (gameOver) setShowGameOver(true); }, [gameOver]);

    useEffect(() => {
        if (!gameOver || !game || !user?.username || !myColor || reportedRef.current) return;
        reportedRef.current = true;
        let outcome = "draw";
        if (game.status === "win" || game.status === "resigned") outcome = game.winner === user.username ? "win" : "loss";
        const opponent = myColor === "b" ? game.white?.username : game.black?.username;
        fetch("/api/games/history", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user.username, game: "reversi", gameId, opponent: opponent || (game.mode === "ai" ? "Computer" : ""), outcome, resultReason: game.resultReason || "", mode: game.mode || "multiplayer", moves: game.moveCount || 0 }),
        }).catch(() => {});
    }, [gameOver, game?.status, game?.winner, myColor, user?.username, gameId]);

    const handleMove = useCallback((r, c) => {
        if (!socketRef.current || !canPlay) return;
        socketRef.current.emit("reversi:make-move", { gameId, r, c });
    }, [gameId, canPlay]);

    const handleSendChat = useCallback((text) => {
        socketRef.current?.emit("reversi:chat", { gameId, text, color: user?.avatarColor || "#3b82f6", avatarUrl: user?.avatarUrl || "" });
    }, [gameId, user]);

    const handleResign = () => { if (confirm("Resign this game?")) socketRef.current?.emit("reversi:resign", { gameId }); };

    const resultText = () => {
        if (!gameOver || !game) return "";
        if (game.status === "draw") return "Draw!";
        if (game.status === "resigned") return `${game.winner} won by resignation`;
        if (game.status === "win") return `${game.winner} wins!`;
        return "Game over";
    };

    if (loading) return <div className="flex items-center justify-center h-96"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;
    if (error && !game) return <div className="flex flex-col items-center justify-center h-96 gap-2"><p className="text-sm">{error}</p><a href="/reversi" className="text-xs text-emerald-500 hover:underline">Back to lobby</a></div>;
    if (!game) return null;

    return (
        <div className="w-full max-w-4xl mx-auto px-3 py-4">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="w-full lg:flex-1">
                    <div className="flex items-center justify-between mb-2 gap-2">
                        <PlayerBar player={game.black} color="b" active={game.turn === "b" && !gameOver} count={counts.b} />
                        <button onClick={toggleSound} className="p-1.5 rounded text-gray-400 hover:text-gray-600 shrink-0" title={soundOn ? "Mute" : "Unmute"}>
                            {soundOn ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>}
                        </button>
                        <PlayerBar player={game.white} color="w" active={game.turn === "w" && !gameOver} count={counts.w} />
                    </div>

                    <ReversiBoard board={game.board} myColor={myColor} canPlay={canPlay} onMove={handleMove} lastMove={game.lastMove} />

                    <div className="flex items-center justify-between mt-3 px-1">
                        <div className="text-xs font-medium">
                            {game.status === "waiting" ? <span className="text-emerald-500">Waiting for opponent...</span>
                                : gameOver ? <span className="text-gray-500">{resultText()}</span>
                                : canPlay ? <span className="text-emerald-600 dark:text-emerald-400">Your turn</span>
                                : <span className="text-gray-400">Opponent's turn</span>}
                        </div>
                        {game.status === "active" && myColor && (
                            <button onClick={handleResign} className="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md">Resign</button>
                        )}
                    </div>
                    {error && <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-md text-center"><p className="text-xs text-red-500">{error}</p></div>}
                </div>

                <div className="w-full lg:w-64 shrink-0">
                    <div className="h-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                        <ChessChat chat={chatMessages} onSendMessage={handleSendChat} username={user?.username} />
                    </div>
                    <div className="mt-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2">How to play</h3>
                        <ul className="text-[11px] text-gray-500 dark:text-gray-400 space-y-1 list-disc list-inside">
                            <li>Place a disc to trap opponent discs between yours.</li>
                            <li>Trapped discs flip to your color.</li>
                            <li>Every move must flip at least one disc.</li>
                            <li>Most discs when the board fills up wins.</li>
                        </ul>
                    </div>
                </div>
            </div>

            {showGameOver && gameOver && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-700 text-center">
                        <div className="text-5xl mb-2">{game.status === "draw" ? "\uD83E\uDD1D" : game.winner === user?.username ? "\uD83C\uDFC6" : "\uD83D\uDE1E"}</div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{resultText()}</h2>
                        <p className="text-sm text-gray-500 mb-4">Black {counts.b} &ndash; {counts.w} White</p>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => playAgain("/api/reversi/games", { mode: game.mode, aiDifficulty: game.aiDifficulty })} disabled={creating} className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl text-sm">{creating ? "Starting..." : "Play Again"}</button>
                            <a href="/reversi" className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl text-sm">Back to Lobby</a>
                            <button onClick={() => setShowGameOver(false)} className="px-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
