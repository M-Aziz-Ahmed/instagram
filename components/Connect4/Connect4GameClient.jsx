"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useUser } from "@/context/UserContext";
import { io } from "socket.io-client";
import Connect4Board from "./Connect4Board";
import ChessChat from "@/components/Chess/ChessChat";
import { playMoveSound, playCaptureSound, playCheckmateSound, setSoundEnabled } from "@/components/Chess/chessSounds";
import { useGameReplay } from "@/components/Games/useGameReplay";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

function PlayerBar({ player, color, active, label }) {
    const dot = color === "r" ? "#ef4444" : "#eab308";
    return (
        <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${active ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dot }} />
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: player?.avatarColor || "#64748b" }}>
                {player?.avatarUrl ? (
                    <img src={player.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                ) : (
                    (player?.username?.[0] || "?").toUpperCase()
                )}
            </div>
            <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{player?.username || label}</p>
                {active && <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">To move</p>}
            </div>
        </div>
    );
}

export default function Connect4GameClient({ gameId }) {
    const { user } = useUser();
    const { creating, playAgain } = useGameReplay("connect4");
    const socketRef = useRef(null);
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [lastMove, setLastMove] = useState(null);
    const [soundOn, setSoundOn] = useState(true);
    const [showGameOver, setShowGameOver] = useState(false);
    const [mobileTab, setMobileTab] = useState("info");
    const reportedRef = useRef(false);

    const myColor = useMemo(() => {
        if (!game || !user?.username) return null;
        if (game.red.username === user.username) return "r";
        if (game.yellow.username === user.username) return "y";
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
        if (!LIVE_SERVER || !user?.username) return;
        const s = io(LIVE_SERVER, {
            query: { username: user.username },
            transports: ["polling", "websocket"],
            upgrade: true,
            reconnectionAttempts: 30,
            timeout: 30000,
            withCredentials: true,
        });
        socketRef.current = s;
        s.emit("connect4:join-game", { gameId });

        s.on("connect4:move", (data) => {
            if (data.status === "win") playCheckmateSound();
            else playMoveSound();
            setGame((prev) => prev ? {
                ...prev,
                board: data.board,
                turn: data.turn,
                status: data.status,
                result: data.result,
                resultReason: data.resultReason,
                winner: data.winner,
                winningCells: data.winningCells,
                moves: data.moves,
            } : prev);
            if (data.move) setLastMove(data.move);
        });

        s.on("connect4:chat", (msg) => setChatMessages((prev) => [...prev, msg]));

        s.on("connect4:game-over", (data) => {
            setGame((prev) => prev ? { ...prev, status: data.status, result: data.result, resultReason: data.resultReason, winner: data.winner } : prev);
        });

        s.on("connect4:error", ({ message }) => {
            setError(message);
            setTimeout(() => setError(null), 2500);
        });

        return () => {
            s.emit("connect4:leave-game", { gameId });
            s.disconnect();
        };
    }, [gameId, user?.username]);

    useEffect(() => {
        async function fetchGame() {
            try {
                const res = await fetch(`${LIVE_SERVER}/api/connect4/games/${gameId}`);
                if (res.ok) {
                    const data = await res.json();
                    setGame(data.game);
                    setChatMessages(data.game.chat || []);
                    if (data.game.moves?.length > 0) {
                        setLastMove(data.game.moves[data.game.moves.length - 1]);
                    }
                } else {
                    setError("Game not found");
                }
            } catch (e) {
                setError("Failed to load game");
            }
            setLoading(false);
        }
        fetchGame();
    }, [gameId]);

    useEffect(() => {
        if (gameOver) setShowGameOver(true);
    }, [gameOver]);

    useEffect(() => {
        if (!gameOver || !game || !user?.username || !myColor || reportedRef.current) return;
        reportedRef.current = true;
        let outcome = "draw";
        if (game.status === "win" || game.status === "resigned") {
            outcome = game.winner === user.username ? "win" : "loss";
        }
        const opponent = myColor === "r" ? game.yellow?.username : game.red?.username;
        fetch("/api/games/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: user.username,
                game: "connect4",
                gameId,
                opponent: opponent || (game.mode === "ai" ? "Computer" : ""),
                outcome,
                resultReason: game.resultReason || "",
                mode: game.mode || "multiplayer",
                moves: game.moves?.length || 0,
            }),
        }).catch(() => {});
    }, [gameOver, game?.status, game?.winner, myColor, user?.username, gameId]);

    const handleDrop = useCallback((column) => {
        if (!socketRef.current || !canPlay) return;
        socketRef.current.emit("connect4:make-move", { gameId, column });
    }, [gameId, canPlay]);

    const handleSendChat = useCallback((text) => {
        if (!socketRef.current || !user) return;
        socketRef.current.emit("connect4:chat", {
            gameId,
            text,
            color: user.avatarColor || "#3b82f6",
            avatarUrl: user.avatarUrl || "",
        });
    }, [gameId, user]);

    const handleResign = () => {
        if (!confirm("Resign this game?")) return;
        socketRef.current?.emit("connect4:resign", { gameId });
    };

    const resultText = () => {
        if (!gameOver || !game) return "";
        if (game.status === "draw") return "Draw - board full";
        if (game.status === "resigned") return `${game.winner} won by resignation`;
        if (game.status === "win") return `${game.winner} wins!`;
        return "Game over";
    };

    const resultIcon = () => {
        if (!game) return "";
        if (game.status === "draw") return "\uD83E\uDD1D";
        return game.winner === user?.username ? "\uD83C\uDFC6" : "\uD83D\uDE1E";
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error && !game) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-2">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{error}</p>
                <a href="/connect4" className="text-xs text-blue-500 hover:underline">Back to lobby</a>
            </div>
        );
    }

    if (!game) return null;

    const players = { red: game.red, yellow: game.yellow };
    const isWaiting = game.status === "waiting";

    return (
        <div className="w-full max-w-4xl mx-auto px-3 py-4">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="w-full lg:flex-1">
                    <div className="flex items-center justify-between mb-2">
                        <PlayerBar player={game.red} color="r" active={game.turn === "r" && !gameOver} label="Red" />
                        <button onClick={toggleSound} className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title={soundOn ? "Mute" : "Unmute"}>
                            {soundOn ? (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                            )}
                        </button>
                        <PlayerBar player={game.yellow} color="y" active={game.turn === "y" && !gameOver} label="Yellow" />
                    </div>

                    <Connect4Board
                        board={game.board}
                        turn={game.turn}
                        myColor={myColor}
                        onDrop={handleDrop}
                        canPlay={canPlay}
                        winningCells={game.winningCells}
                        lastMove={lastMove}
                        players={players}
                    />

                    <div className="flex items-center justify-between mt-3 px-1">
                        <div className="text-xs font-medium">
                            {isWaiting ? (
                                <span className="text-blue-500">Waiting for opponent...</span>
                            ) : gameOver ? (
                                <span className="text-gray-500">{resultText()}</span>
                            ) : canPlay ? (
                                <span className="text-green-600 dark:text-green-400">Your turn - pick a column</span>
                            ) : (
                                <span className="text-gray-400">Opponent's turn</span>
                            )}
                        </div>
                        {game.status === "active" && myColor && (
                            <button onClick={handleResign} className="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors">
                                Resign
                            </button>
                        )}
                    </div>

                    {error && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-md text-center">
                            <p className="text-xs text-red-500">{error}</p>
                        </div>
                    )}
                </div>

                <div className="w-full lg:w-72 shrink-0">
                    <div className="flex lg:hidden border-b border-gray-200 dark:border-gray-700 mb-2">
                        <button onClick={() => setMobileTab("info")} className={`flex-1 py-2 text-xs font-semibold ${mobileTab === "info" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400"}`}>Info</button>
                        <button onClick={() => setMobileTab("chat")} className={`flex-1 py-2 text-xs font-semibold ${mobileTab === "chat" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400"}`}>Chat {chatMessages.length > 0 && `(${chatMessages.length})`}</button>
                    </div>
                    <div className={`${mobileTab === "chat" ? "block" : "hidden"} lg:block h-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden`}>
                        <ChessChat chat={chatMessages} onSendMessage={handleSendChat} username={user?.username} />
                    </div>
                    <div className={`${mobileTab === "info" ? "block" : "hidden"} lg:block mt-0 lg:mt-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl`}>
                        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2">How to play</h3>
                        <ul className="text-[11px] text-gray-500 dark:text-gray-400 space-y-1 list-disc list-inside">
                            <li>Drop discs into a column.</li>
                            <li>First to connect 4 in a row wins - horizontal, vertical, or diagonal.</li>
                            <li>Red always moves first.</li>
                        </ul>
                        {game.mode === "ai" && (
                            <p className="mt-2 text-[11px] text-purple-500 font-medium">Playing vs Computer</p>
                        )}
                    </div>
                </div>
            </div>

            {showGameOver && gameOver && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-700 text-center">
                        <div className="text-5xl mb-2">{resultIcon()}</div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{resultText()}</h2>
                        <p className="text-xs text-gray-400 mb-4">{game.moves?.length || 0} discs played</p>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => playAgain("/api/connect4/games", { mode: game.mode, aiDifficulty: game.aiDifficulty })} disabled={creating} className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl text-sm">{creating ? "Starting..." : "Play Again"}</button>
                            <a href="/connect4" className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl text-sm">Back to Lobby</a>
                            <button onClick={() => setShowGameOver(false)} className="px-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Stay & Review</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
