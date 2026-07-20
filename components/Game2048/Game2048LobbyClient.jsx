"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const SIZE = 4;

function emptyBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function cloneBoard(board) {
    return board.map((row) => row.slice());
}

function spawnTile(board) {
    const empties = [];
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (board[r][c] === 0) empties.push([r, c]);
        }
    }
    if (empties.length === 0) return false;
    const [r, c] = empties[Math.floor(Math.random() * empties.length)];
    board[r][c] = Math.random() < 0.9 ? 2 : 4;
    return true;
}

function slideRowLeft(row) {
    const filtered = row.filter((v) => v !== 0);
    const merged = [];
    let gained = 0;
    for (let i = 0; i < filtered.length; i++) {
        if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
            const val = filtered[i] * 2;
            merged.push(val);
            gained += val;
            i++;
        } else {
            merged.push(filtered[i]);
        }
    }
    while (merged.length < SIZE) merged.push(0);
    return { row: merged, gained };
}

function transpose(board) {
    const result = emptyBoard();
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            result[c][r] = board[r][c];
        }
    }
    return result;
}

function reverseRows(board) {
    return board.map((row) => row.slice().reverse());
}

function boardsEqual(a, b) {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (a[r][c] !== b[r][c]) return false;
        }
    }
    return true;
}

function moveBoard(board, direction) {
    let working = cloneBoard(board);
    let gained = 0;

    const applyLeft = (b) => {
        let total = 0;
        const out = b.map((row) => {
            const res = slideRowLeft(row);
            total += res.gained;
            return res.row;
        });
        return { board: out, gained: total };
    };

    if (direction === "left") {
        const res = applyLeft(working);
        working = res.board;
        gained = res.gained;
    } else if (direction === "right") {
        working = reverseRows(working);
        const res = applyLeft(working);
        working = res.board;
        gained = res.gained;
        working = reverseRows(working);
    } else if (direction === "up") {
        working = transpose(working);
        const res = applyLeft(working);
        working = res.board;
        gained = res.gained;
        working = transpose(working);
    } else if (direction === "down") {
        working = transpose(working);
        working = reverseRows(working);
        const res = applyLeft(working);
        working = res.board;
        gained = res.gained;
        working = reverseRows(working);
        working = transpose(working);
    }

    const moved = !boardsEqual(working, board);
    return { board: working, gained, moved };
}

function hasMoves(board) {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (board[r][c] === 0) return true;
            if (c + 1 < SIZE && board[r][c] === board[r][c + 1]) return true;
            if (r + 1 < SIZE && board[r][c] === board[r + 1][c]) return true;
        }
    }
    return false;
}

function hasWon(board) {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (board[r][c] === 2048) return true;
        }
    }
    return false;
}

function tileColor(value) {
    const map = {
        2: "bg-amber-50 text-amber-900",
        4: "bg-amber-200 text-amber-900",
        8: "bg-orange-400 text-white",
        16: "bg-orange-500 text-white",
        32: "bg-red-400 text-white",
        64: "bg-red-500 text-white",
        128: "bg-yellow-400 text-white",
        256: "bg-yellow-300 text-yellow-900",
        512: "bg-lime-400 text-lime-900",
        1024: "bg-green-400 text-white",
        2048: "bg-emerald-500 text-white",
    };
    return map[value] || "bg-indigo-600 text-white";
}

function tileSize(value) {
    if (value >= 1024) return "text-xl sm:text-2xl";
    if (value >= 128) return "text-2xl sm:text-3xl";
    return "text-3xl sm:text-4xl";
}

export default function Game2048LobbyClient() {
    const [board, setBoard] = useState(emptyBoard);
    const [score, setScore] = useState(0);
    const [best, setBest] = useState(0);
    const [won, setWon] = useState(false);
    const [over, setOver] = useState(false);
    const [keepPlaying, setKeepPlaying] = useState(false);
    const boardRef = useRef(board);
    const touchStartRef = useRef(null);

    useEffect(() => {
        const stored = Number(localStorage.getItem("game2048_best") || 0);
        if (!isNaN(stored)) setBest(stored);
        resetGame();
    }, []);

    useEffect(() => {
        boardRef.current = board;
    }, [board]);

    const resetGame = useCallback(() => {
        const newBoard = emptyBoard();
        spawnTile(newBoard);
        spawnTile(newBoard);
        setBoard(newBoard);
        setScore(0);
        setWon(false);
        setOver(false);
        setKeepPlaying(false);
    }, []);

    const commitMove = useCallback((direction) => {
        setBoard((current) => {
            const { board: next, gained, moved } = moveBoard(current, direction);
            if (!moved) return current;

            let newScore = score;
            if (gained > 0) {
                newScore = score + gained;
                setScore(newScore);
                setBest((b) => {
                    const nb = Math.max(b, newScore);
                    if (nb !== b) {
                        try {
                            localStorage.setItem("game2048_best", String(nb));
                        } catch (e) {}
                    }
                    return nb;
                });
            }

            spawnTile(next);

            if (hasWon(next) && !won && !keepPlaying) {
                setWon(true);
            }
            if (!hasMoves(next)) {
                setOver(true);
            }
            return next;
        });
    }, [score, won, keepPlaying]);

    useEffect(() => {
        const handler = (e) => {
            const keys = {
                ArrowLeft: "left",
                ArrowRight: "right",
                ArrowUp: "up",
                ArrowDown: "down",
            };
            const dir = keys[e.key];
            if (!dir) return;
            if (over || won) return;
            e.preventDefault();
            commitMove(dir);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [commitMove, over, won]);

    const handleTouchStart = (e) => {
        const t = e.touches[0];
        touchStartRef.current = { x: t.clientX, y: t.clientY };
    };

    const handleTouchEnd = (e) => {
        if (!touchStartRef.current) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartRef.current.x;
        const dy = t.clientY - touchStartRef.current.y;
        touchStartRef.current = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        if (over || won) return;
        if (Math.abs(dx) > Math.abs(dy)) {
            commitMove(dx > 0 ? "right" : "left");
        } else {
            commitMove(dy > 0 ? "down" : "up");
        }
    };

    const cells = useMemo(
        () => board.flat(),
        [board]
    );

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="mb-4 flex items-center justify-between">
                <a
                    href="/games"
                    className="text-sm text-purple-600 dark:text-purple-400 hover:underline"
                >
                    &larr; Back to Games
                </a>
            </div>

            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-600 to-indigo-800 p-6 mb-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <span>🟪</span> 2048
                        </h1>
                        <p className="text-sm text-purple-100 mt-1">
                            Join the tiles and reach <strong>2048!</strong>
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <div className="bg-white/15 rounded-lg px-3 py-2 text-center">
                            <div className="text-[10px] uppercase tracking-wide text-purple-100">Score</div>
                            <div className="text-lg font-bold text-white">{score}</div>
                        </div>
                        <div className="bg-white/15 rounded-lg px-3 py-2 text-center">
                            <div className="text-[10px] uppercase tracking-wide text-purple-100">Best</div>
                            <div className="text-lg font-bold text-white">{best}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                <div
                    className="relative grid grid-cols-4 gap-2 bg-gray-100 dark:bg-gray-800 p-2 rounded-lg select-none touch-none"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    {cells.map((value, idx) => (
                        <div
                            key={idx}
                            className="aspect-square flex items-center justify-center rounded-md font-bold transition-colors"
                        >
                            {value !== 0 && (
                                <div
                                    className={`w-full h-full flex items-center justify-center rounded-md ${tileColor(
                                        value
                                    )} ${tileSize(value)}`}
                                >
                                    {value}
                                </div>
                            )}
                        </div>
                    ))}

                    {(won || over) && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 dark:bg-gray-900/90 rounded-lg">
                            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                                {won ? "🎉 You win!" : "Game Over"}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                {won
                                    ? "You reached the 2048 tile."
                                    : "No moves left. Try again!"}
                            </p>
                            <div className="flex gap-2">
                                {won && !keepPlaying && (
                                    <button
                                        onClick={() => setKeepPlaying(true)}
                                        className="px-4 py-2 bg-purple-500 text-white text-sm font-semibold rounded-lg hover:bg-purple-600 transition-colors"
                                    >
                                        Keep Playing
                                    </button>
                                )}
                                <button
                                    onClick={resetGame}
                                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
                                >
                                    New Game
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Use arrow keys or swipe to move tiles.
                    </p>
                    <button
                        onClick={resetGame}
                        className="px-4 py-2 bg-purple-500 text-white text-sm font-semibold rounded-lg hover:bg-purple-600 transition-colors"
                    >
                        New Game
                    </button>
                </div>
            </div>

            <div className="mt-4 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-500 dark:text-gray-400">
                <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">How to play</p>
                <p>
                    Press the arrow keys (or swipe on touch screens) to move every tile in one
                    direction. When two tiles with the same number touch, they merge into one with
                    their sum. A new tile (2 or 4) appears after each move. Reach the 2048 tile to
                    win — or keep going for a higher score!
                </p>
            </div>
        </div>
    );
}
