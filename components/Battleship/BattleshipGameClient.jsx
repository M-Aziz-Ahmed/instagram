"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useUser } from "@/context/UserContext";
import { io } from "socket.io-client";
import BattleshipGrid from "./BattleshipGrid";
import ChessChat from "@/components/Chess/ChessChat";
import { playMoveSound, playCaptureSound, playCheckmateSound, setSoundEnabled } from "@/components/Chess/chessSounds";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

export default function BattleshipGameClient({ gameId }) {
    const { user } = useUser();
    const socketRef = useRef(null);
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [soundOn, setSoundOn] = useState(true);
    const [showGameOver, setShowGameOver] = useState(false);
    const reportedRef = useRef(false);

    const me = useMemo(() => {
        if (!game || !user?.username) return null;
        if (game.p1.username === user.username) return "p1";
        if (game.p2.username === user.username) return "p2";
        return null;
    }, [game, user]);

    const opp = me === "p1" ? "p2" : "p1";
    const isMyTurn = game?.turn === me;
    const gameOver = game?.status && game.status !== "active" && game.status !== "waiting";
    const canFire = !gameOver && game?.status === "active" && isMyTurn;

    const toggleSound = () => { const n = !soundOn; setSoundOn(n); setSoundEnabled(n); };

    useEffect(() => {
        if (!LIVE_SERVER || !user?.username) return;
        const s = io(LIVE_SERVER, { query: { username: user.username }, transports: ["polling", "websocket"], withCredentials: true });
        socketRef.current = s;
        s.emit("battleship:join-game", { gameId });
        s.on("battleship:shot", (data) => {
            if (data.status === "win") playCheckmateSound();
            else if (data.hit) playCaptureSound();
            else playMoveSound();
            setGame((prev) => {
                if (!prev) return prev;
                const boards = { ...prev.boards };
                boards.p1 = { ...boards.p1, shots: data.p1Shots };
                boards.p2 = { ...boards.p2, shots: data.p2Shots };
                return { ...prev, boards, turn: data.turn, status: data.status, result: data.result, resultReason: data.resultReason, winner: data.winner, moveCount: data.moveCount, lastShot: { by: data.target === "p2" ? "p1" : "p2", r: data.r, c: data.c, hit: data.hit } };
            });
        });
        s.on("battleship:chat", (msg) => setChatMessages((prev) => [...prev, msg]));
        s.on("battleship:game-over", (data) => setGame((prev) => prev ? { ...prev, status: data.status, result: data.result, resultReason: data.resultReason, winner: data.winner } : prev));
        s.on("battleship:error", ({ message }) => { setError(message); setTimeout(() => setError(null), 2500); });
        return () => { s.emit("battleship:leave-game", { gameId }); s.disconnect(); };
    }, [gameId, user?.username]);

    useEffect(() => {
        if (!user?.username) return;
        (async () => {
            try {
                const res = await fetch(`${LIVE_SERVER}/api/battleship/games/${gameId}?username=${encodeURIComponent(user.username)}`);
                if (res.ok) { const data = await res.json(); setGame(data.game); setChatMessages(data.game.chat || []); }
                else setError("Game not found");
            } catch { setError("Failed to load game"); }
            setLoading(false);
        })();
    }, [gameId, user?.username]);

    useEffect(() => { if (gameOver) setShowGameOver(true); }, [gameOver]);

    useEffect(() => {
        if (!gameOver || !game || !user?.username || !me || reportedRef.current) return;
        reportedRef.current = true;
        let outcome = "draw";
        if (game.status === "win" || game.status === "resigned") outcome = game.winner === user.username ? "win" : "loss";
        const opponent = me === "p1" ? game.p2?.username : game.p1?.username;
        fetch("/api/games/history", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user.username, game: "battleship", gameId, opponent: opponent || (game.mode === "ai" ? "Computer" : ""), outcome, resultReason: game.resultReason || "", mode: game.mode || "multiplayer", moves: game.moveCount || 0 }),
        }).catch(() => {});
    }, [gameOver, game?.status, game?.winner, me, user?.username, gameId]);

    const handleFire = useCallback((r, c) => {
        if (!socketRef.current || !canFire) return;
        socketRef.current.emit("battleship:fire", { gameId, r, c });
    }, [gameId, canFire]);

    const handleSendChat = useCallback((text) => {
        socketRef.current?.emit("battleship:chat", { gameId, text, color: user?.avatarColor || "#3b82f6", avatarUrl: user?.avatarUrl || "" });
    }, [gameId, user]);

    const handleResign = () => { if (confirm("Resign this game?")) socketRef.current?.emit("battleship:resign", { gameId }); };

    const resultText = () => {
        if (!gameOver || !game) return "";
        if (game.status === "resigned") return `${game.winner} won by resignation`;
        if (game.status === "win") return `${game.winner} wins!`;
        return "Game over";
    };

    if (loading) return <div className="flex items-center justify-center h-96"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
    if (error && !game) return <div className="flex flex-col items-center justify-center h-96 gap-2"><p className="text-sm">{error}</p><a href="/battleship" className="text-xs text-blue-500 hover:underline">Back to lobby</a></div>;
    if (!game || !me) return <div className="flex flex-col items-center justify-center h-96 gap-2"><p className="text-sm">Loading game...</p></div>;

    const myBoard = game.boards[me];
    const oppBoard = game.boards[opp];

    return (
        <div className="w-full max-w-4xl mx-auto px-3 py-4">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="w-full lg:flex-1">
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-medium">
                            {game.status === "waiting" ? <span className="text-blue-500">Waiting for opponent...</span>
                                : gameOver ? <span className="text-gray-500">{resultText()}</span>
                                : canFire ? <span className="text-green-600 dark:text-green-400">Your turn - fire!</span>
                                : <span className="text-gray-400">Opponent's turn</span>}
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={toggleSound} className="p-1.5 rounded text-gray-400 hover:text-gray-600" title={soundOn ? "Mute" : "Unmute"}>
                                {soundOn ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>}
                            </button>
                            {game.status === "active" && (
                                <button onClick={handleResign} className="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md">Resign</button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                            <BattleshipGrid title="Enemy Waters (fire here)" grid={oppBoard.grid} shots={oppBoard.shots} showShips={false} canFire={canFire} onFire={handleFire} />
                        </div>
                        <div className="p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                            <BattleshipGrid title="Your Fleet" grid={myBoard.grid} shots={myBoard.shots} showShips={true} canFire={false} />
                        </div>
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
                            <li>Fire at the enemy grid to find their 5 ships.</li>
                            <li>A hit lets you fire again; a miss ends your turn.</li>
                            <li>Sink the whole enemy fleet to win.</li>
                        </ul>
                    </div>
                </div>
            </div>

            {showGameOver && gameOver && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-700 text-center">
                        <div className="text-5xl mb-2">{game.winner === user?.username ? "\uD83C\uDFC6" : "\uD83D\uDE1E"}</div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{resultText()}</h2>
                        <div className="flex flex-col gap-2">
                            <a href="/battleship" className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl text-sm">Back to Lobby</a>
                            <button onClick={() => setShowGameOver(false)} className="px-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
