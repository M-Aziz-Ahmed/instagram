"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useUser } from "@/context/UserContext";
import { io } from "socket.io-client";
import HangmanFigure from "./HangmanFigure";
import { playMoveSound, playCaptureSound, playCheckmateSound } from "@/components/Chess/chessSounds";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;
const MAX_WRONG = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function HangmanGameClient({ gameId }) {
    const { user } = useUser();
    const socketRef = useRef(null);
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showGameOver, setShowGameOver] = useState(false);
    const reportedRef = useRef(false);

    const gameOver = game?.status && game.status !== "active";

    const guessedSet = useMemo(() => new Set(game?.guessed || []), [game?.guessed]);

    useEffect(() => {
        if (!LIVE_SERVER || !user?.username) return;
        const s = io(LIVE_SERVER, { query: { username: user.username }, transports: ["polling", "websocket"], withCredentials: true });
        socketRef.current = s;
        s.emit("hangman:join-game", { gameId });
        s.on("hangman:update", (data) => {
            if (data.status === "win") playCheckmateSound();
            else if (data.correct) playCaptureSound();
            else playMoveSound();
            setGame((prev) => prev ? { ...prev, guessed: data.guessed, wrong: data.wrong, status: data.status, result: data.result, resultReason: data.resultReason, winner: data.winner, moveCount: data.moveCount, wordLength: data.wordLength ?? prev.wordLength, masked: data.masked ?? prev.masked, word: data.word !== undefined ? data.word : prev.word } : prev);
        });
        s.on("hangman:error", ({ message }) => { setError(message); setTimeout(() => setError(null), 2000); });
        return () => { s.emit("hangman:leave-game", { gameId }); s.disconnect(); };
    }, [gameId, user?.username]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${LIVE_SERVER}/api/hangman/games/${gameId}`);
                if (res.ok) {
                    const data = await res.json();
                    setGame(data.game);
                } else setError("Game not found");
            } catch { setError("Failed to load game"); }
            setLoading(false);
        })();
    }, [gameId]);

    useEffect(() => { if (gameOver) setShowGameOver(true); }, [gameOver]);

    useEffect(() => {
        if (!gameOver || !game || !user?.username || reportedRef.current) return;
        reportedRef.current = true;
        const outcome = game.status === "win" ? "win" : "loss";
        fetch("/api/games/history", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user.username, game: "hangman", gameId, opponent: "Computer", outcome, resultReason: game.resultReason || "", mode: "ai", moves: game.moveCount || 0 }),
        }).catch(() => {});
    }, [gameOver, game?.status, user?.username, gameId]);

    const handleGuess = useCallback((letter) => {
        if (!socketRef.current || gameOver || guessedSet.has(letter)) return;
        socketRef.current.emit("hangman:guess", { gameId, letter });
    }, [gameId, gameOver, guessedSet]);

    useEffect(() => {
        const onKey = (e) => {
            const l = e.key.toUpperCase();
            if (/^[A-Z]$/.test(l)) handleGuess(l);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [handleGuess]);

    if (loading) return <div className="flex items-center justify-center h-96"><div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;
    if (error && !game) return <div className="flex flex-col items-center justify-center h-96 gap-2"><p className="text-sm">{error}</p><a href="/hangman" className="text-xs text-purple-500 hover:underline">Back to lobby</a></div>;
    if (!game) return null;

    const wrong = game.wrong || 0;
    const won = game.status === "win";
    const maskedChars = (game.masked || "").split("|");
    const wordChars = (game.word || "").split("");

    return (
        <div className="w-full max-w-lg mx-auto px-4 py-6">
            <div className="text-center mb-2">
                <span className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">{game.category}</span>
            </div>

            <div className="flex flex-col items-center">
                <HangmanFigure wrong={wrong} />
                <p className="text-xs text-gray-500 mt-1">{MAX_WRONG - wrong} guesses left</p>
            </div>

            <div className="flex flex-wrap justify-center gap-2 my-6">
                {(game.status !== "active" ? wordChars : maskedChars).map((ch, i) => {
                    const revealed = game.status !== "active" ? true : !!ch;
                    const missed = game.status === "loss" && !guessedSet.has(wordChars[i]);
                    return (
                        <div key={i} className={`w-7 border-b-2 border-gray-400 text-center text-2xl font-bold pb-1 ${missed ? "text-red-500" : "text-gray-900 dark:text-gray-100"}`}>
                            {revealed ? ch : ""}
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-7 sm:grid-cols-9 gap-1.5 max-w-md mx-auto">
                {ALPHABET.map((l) => {
                    const used = guessedSet.has(l);
                    return (
                        <button
                            key={l}
                            onClick={() => handleGuess(l)}
                            disabled={used || gameOver}
                            className={`aspect-square rounded-md text-sm font-semibold transition-colors ${
                                used
                                    ? "bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                                    : "bg-purple-500 text-white hover:bg-purple-600"
                            } disabled:opacity-50`}
                        >
                            {l}
                        </button>
                    );
                })}
            </div>

            {error && <div className="mt-4 text-center"><p className="text-xs text-red-500">{error}</p></div>}

            {showGameOver && gameOver && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-700 text-center">
                        <div className="text-5xl mb-2">{won ? "\uD83C\uDF89" : "\uD83D\uDC80"}</div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{won ? "You solved it!" : "Out of guesses"}</h2>
                        <p className="text-sm text-gray-500 mb-4">The word was <span className="font-bold text-gray-900 dark:text-gray-100">{game.word}</span></p>
                        <div className="flex flex-col gap-2">
                            <a href="/hangman" className="px-6 py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-xl text-sm">Play Again</a>
                            <button onClick={() => setShowGameOver(false)} className="px-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
