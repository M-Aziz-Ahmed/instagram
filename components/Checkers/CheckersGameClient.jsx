"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useUser } from "@/context/UserContext";
import { io } from "socket.io-client";
import CheckersBoard from "./CheckersBoard";
import ChessChat from "@/components/Chess/ChessChat";
import { playMoveSound, playCaptureSound, playCheckmateSound, setSoundEnabled } from "@/components/Chess/chessSounds";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

function PlayerBar({ player, color, active }) {
    const dot = color === "r" ? (player?.avatarColor || "#ef4444") : (player?.avatarColor || "#1f2937");
    return (
        <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${active ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dot }} />
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

export default function CheckersGameClient({ gameId }) {
    const { user } = useUser();
    const socketRef = useRef(null);
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [soundOn, setSoundOn] = useState(true);
    const [showGameOver, setShowGameOver] = useState(false);
    const [flipped, setFlipped] = useState(false);
    const reportedRef = useRef(false);
    const flipInitRef = useRef(false);

    const myColor = useMemo(() => {
        if (!game || !user?.username) return null;
        if (game.red.username === user.username) return "r";
        if (game.black.username === user.username) return "b";
        return null;
    }, [game, user]);

    const isMyTurn = game?.turn === myColor;
    const gameOver = game?.status && game.status !== "active" && game.status !== "waiting";
    const canPlay = !gameOver && game?.status === "active" && isMyTurn;

    const toggleSound = () => {
        const next = !soundOn;
        setSoundOn(next);
        setSoundEnabled(next);
    };

    useEffect(() => {
        if (myColor && !flipInitRef.current) {
            setFlipped(myColor === "b");
            flipInitRef.current = true;
        }
    }, [myColor]);

    useEffect(() => {
        if (!LIVE_SERVER || !user?.username) return;
        const s = io(LIVE_SERVER, { query: { username: user.username }, transports: ["polling", "websocket"], withCredentials: true });
        socketRef.current = s;
        s.emit("checkers:join-game", { gameId });

        s.on("checkers:move", (data) => {
            if (data.status === "win") playCheckmateSound();
            else if (data.lastMove?.captures?.length) playCaptureSound();
            else playMoveSound();
            setGame((prev) => prev ? { ...prev, board: data.board, turn: data.turn, lastMove: data.lastMove, status: data.status, result: data.result, resultReason: data.resultReason, winner: data.winner, moveCount: data.moveCount } : prev);
        });
        s.on("checkers:chat", (msg) => setChatMessages((prev) => [...prev, msg]));
        s.on("checkers:game-over", (data) => setGame((prev) => prev ? { ...prev, status: data.status, result: data.result, resultReason: data.resultReason, winner: data.winner } : prev));
        s.on("checkers:error", ({ message }) => { setError(message); setTimeout(() => setError(null), 2500); });

        return () => { s.emit("checkers:leave-game", { gameId }); s.disconnect(); };
    }, [gameId, user?.username]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${LIVE_SERVER}/api/checkers/games/${gameId}`);
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
        if (!gameOver || !game || !user?.username || !myColor || reportedRef.current) return;
        reportedRef.current = true;
        let outcome = "draw";
        if (game.status === "win" || game.status === "resigned") outcome = game.winner === user.username ? "win" : "loss";
        const opponent = myColor === "r" ? game.black?.username : game.red?.username;
        fetch("/api/games/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user.username, game: "checkers", gameId, opponent: opponent || (game.mode === "ai" ? "Computer" : ""), outcome, resultReason: game.resultReason || "", mode: game.mode || "multiplayer", moves: game.moveCount || 0 }),
        }).catch(() => {});
    }, [gameOver, game?.status, game?.winner, myColor, user?.username, gameId]);

    const handleMove = useCallback((path) => {
        if (!socketRef.current || !canPlay) return;
        socketRef.current.emit("checkers:make-move", { gameId, path });
    }, [gameId, canPlay]);

    const handleSendChat = useCallback((text) => {
        socketRef.current?.emit("checkers:chat", { gameId, text, color: user?.avatarColor || "#3b82f6", avatarUrl: user?.avatarUrl || "" });
    }, [gameId, user]);

    const handleResign = () => {
        if (!confirm("Resign this game?")) return;
        socketRef.current?.emit("checkers:resign", { gameId });
    };

    const resultText = () => {
        if (!gameOver || !game) return "";
        if (game.status === "draw") return "Draw!";
        if (game.status === "resigned") return `${game.winner} won by resignation`;
        if (game.status === "win") return `${game.winner} wins!`;
        return "Game over";
    };

    if (loading) return <div className="flex items-center justify-center h-96"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
    if (error && !game) return <div className="flex flex-col items-center justify-center h-96 gap-2"><p className="text-sm">{error}</p><a href="/checkers" className="text-xs text-blue-500 hover:underline">Back to lobby</a></div>;
    if (!game) return null;

    const players = { red: game.red, black: game.black };

    return (
        <div className="w-full max-w-4xl mx-auto px-3 py-4">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="w-full lg:flex-1">
                    <div className="flex items-center justify-between mb-2">
                        <PlayerBar player={game.red} color="r" active={game.turn === "r" && !gameOver} />
                        <div className="flex items-center gap-1">
                            <button onClick={() => setFlipped(!flipped)} className="p-1.5 rounded text-gray-400 hover:text-gray-600" title="Flip board">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.598a.75.75 0 0 0-.75.75v3.634a.75.75 0 0 0 1.5 0v-2.033l.312.311a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V3.59a.75.75 0 0 0-1.5 0V5.37l-.312-.311A7 7 0 0 0 .885 8.249a.75.75 0 1 0 1.45.388A5.5 5.5 0 0 1 11.506 6.17l.312.311h-2.432a.75.75 0 0 0 0 1.5h3.634a.75.75 0 0 0 .53-.22Z" clipRule="evenodd" /></svg>
                            </button>
                            <button onClick={toggleSound} className="p-1.5 rounded text-gray-400 hover:text-gray-600" title={soundOn ? "Mute" : "Unmute"}>
                                {soundOn ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>}
                            </button>
                        </div>
                        <PlayerBar player={game.black} color="b" active={game.turn === "b" && !gameOver} />
                    </div>

                    <CheckersBoard
                        board={game.board}
                        myColor={myColor}
                        canPlay={canPlay}
                        onMove={handleMove}
                        lastMove={game.lastMove}
                        flipped={flipped}
                        players={players}
                    />

                    <div className="flex items-center justify-between mt-3 px-1">
                        <div className="text-xs font-medium">
                            {game.status === "waiting" ? <span className="text-blue-500">Waiting for opponent...</span>
                                : gameOver ? <span className="text-gray-500">{resultText()}</span>
                                : canPlay ? <span className="text-green-600 dark:text-green-400">Your turn - captures are mandatory</span>
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
                            <li>Move diagonally on dark squares.</li>
                            <li>Jump over an opponent to capture. Captures are mandatory.</li>
                            <li>Reach the far row to become a King (moves both ways).</li>
                            <li>Win by capturing all pieces or blocking all moves.</li>
                        </ul>
                    </div>
                </div>
            </div>

            {showGameOver && gameOver && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-700 text-center">
                        <div className="text-5xl mb-2">{game.status === "draw" ? "\uD83E\uDD1D" : game.winner === user?.username ? "\uD83C\uDFC6" : "\uD83D\uDE1E"}</div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{resultText()}</h2>
                        <div className="flex flex-col gap-2">
                            <a href="/checkers" className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl text-sm">Back to Lobby</a>
                            <button onClick={() => setShowGameOver(false)} className="px-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
