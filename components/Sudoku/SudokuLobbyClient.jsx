"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

const SIZE = 9;
const BOX = 3;

const DIFFICULTIES = {
    Easy: 40,
    Medium: 50,
    Hard: 58,
};

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function canPlace(grid, row, col, num) {
    for (let i = 0; i < SIZE; i++) {
        if (grid[row][i] === num) return false;
        if (grid[i][col] === num) return false;
    }
    const br = Math.floor(row / BOX) * BOX;
    const bc = Math.floor(col / BOX) * BOX;
    for (let r = br; r < br + BOX; r++) {
        for (let c = bc; c < bc + BOX; c++) {
            if (grid[r][c] === num) return false;
        }
    }
    return true;
}

function fillGrid(grid) {
    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            if (grid[row][col] === 0) {
                const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
                for (const num of nums) {
                    if (canPlace(grid, row, col, num)) {
                        grid[row][col] = num;
                        if (fillGrid(grid)) return true;
                        grid[row][col] = 0;
                    }
                }
                return false;
            }
        }
    }
    return true;
}

function countSolutions(grid, limit) {
    let count = 0;
    function solve() {
        for (let row = 0; row < SIZE; row++) {
            for (let col = 0; col < SIZE; col++) {
                if (grid[row][col] === 0) {
                    for (let num = 1; num <= SIZE; num++) {
                        if (canPlace(grid, row, col, num)) {
                            grid[row][col] = num;
                            solve();
                            grid[row][col] = 0;
                            if (count >= limit) return;
                        }
                    }
                    return;
                }
            }
        }
        count++;
    }
    solve();
    return count;
}

function generatePuzzle(removeCount) {
    const solution = emptyGrid();
    fillGrid(solution);
    const puzzle = solution.map((r) => r.slice());

    const positions = shuffle(
        Array.from({ length: SIZE * SIZE }, (_, i) => i)
    );
    let removed = 0;
    for (const pos of positions) {
        if (removed >= removeCount) break;
        const row = Math.floor(pos / SIZE);
        const col = pos % SIZE;
        if (puzzle[row][col] === 0) continue;
        const backup = puzzle[row][col];
        puzzle[row][col] = 0;
        const copy = puzzle.map((r) => r.slice());
        if (countSolutions(copy, 2) !== 1) {
            puzzle[row][col] = backup;
        } else {
            removed++;
        }
    }
    return { puzzle, solution };
}

function getConflicts(grid) {
    const conflicts = new Set();
    for (let i = 0; i < SIZE; i++) {
        const rowSeen = new Map();
        const colSeen = new Map();
        for (let j = 0; j < SIZE; j++) {
            const rv = grid[i][j];
            const cv = grid[j][i];
            if (rv !== 0) {
                if (rowSeen.has(rv)) {
                    conflicts.add(`${i}-${j}`);
                    conflicts.add(`${i}-${rowSeen.get(rv)}`);
                } else {
                    rowSeen.set(rv, j);
                }
            }
            if (cv !== 0) {
                if (colSeen.has(cv)) {
                    conflicts.add(`${j}-${i}`);
                    conflicts.add(`${colSeen.get(cv)}-${i}`);
                } else {
                    colSeen.set(cv, j);
                }
            }
        }
    }
    for (let br = 0; br < SIZE; br += BOX) {
        for (let bc = 0; bc < SIZE; bc += BOX) {
            const seen = new Map();
            for (let r = br; r < br + BOX; r++) {
                for (let c = bc; c < bc + BOX; c++) {
                    const v = grid[r][c];
                    if (v !== 0) {
                        if (seen.has(v)) {
                            conflicts.add(`${r}-${c}`);
                            conflicts.add(`${seen.get(v)[0]}-${seen.get(v)[1]}`);
                        } else {
                            seen.set(v, [r, c]);
                        }
                    }
                }
            }
        }
    }
    return conflicts;
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function SudokuLobbyClient() {
    const [difficulty, setDifficulty] = useState("Medium");
    const [puzzle, setPuzzle] = useState([]);
    const [solution, setSolution] = useState([]);
    const [board, setBoard] = useState([]);
    const [given, setGiven] = useState([]);
    const [selected, setSelected] = useState(null);
    const [conflicts, setConflicts] = useState(new Set());
    const [mistakes, setMistakes] = useState(0);
    const [seconds, setSeconds] = useState(0);
    const [running, setRunning] = useState(false);
    const [won, setWon] = useState(false);
    const timerRef = useRef(null);

    const startGame = useCallback((diff) => {
        const { puzzle: p, solution: s } = generatePuzzle(DIFFICULTIES[diff]);
        setPuzzle(p);
        setSolution(s);
        setBoard(p.map((r) => r.slice()));
        setGiven(p.map((r) => r.map((v) => v !== 0)));
        setSelected(null);
        setConflicts(new Set());
        setMistakes(0);
        setSeconds(0);
        setWon(false);
        setRunning(true);
    }, []);

    useEffect(() => {
        startGame("Medium");
    }, [startGame]);

    useEffect(() => {
        if (!running) return;
        timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        return () => clearInterval(timerRef.current);
    }, [running]);

    useEffect(() => {
        setConflicts(getConflicts(board));
    }, [board]);

    const handleCellClick = (r, c) => {
        if (won) return;
        setSelected(`${r}-${c}`);
    };

    const setCellValue = (val) => {
        if (!selected || won) return;
        const [r, c] = selected.split("-").map(Number);
        if (given[r][c]) return;
        if (val !== 0 && val !== solution[r][c]) {
            setMistakes((m) => m + 1);
        }
        const next = board.map((row) => row.slice());
        next[r][c] = val;
        setBoard(next);
        if (val !== 0) checkWin(next);
    };

    const checkWin = (b) => {
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                if (b[r][c] !== solution[r][c]) return;
            }
        }
        setWon(true);
        setRunning(false);
    };

    const eraseCell = () => {
        if (!selected || won) return;
        const [r, c] = selected.split("-").map(Number);
        if (given[r][c]) return;
        const next = board.map((row) => row.slice());
        next[r][c] = 0;
        setBoard(next);
    };

    const solveBoard = () => {
        setBoard(solution.map((r) => r.slice()));
        setConflicts(new Set());
        setWon(true);
        setRunning(false);
    };

    useEffect(() => {
        const onKey = (e) => {
            if (e.key >= "1" && e.key <= "9") {
                setCellValue(Number(e.key));
            } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
                eraseCell();
            } else if (e.key.startsWith("Arrow") && selected) {
                const [r, c] = selected.split("-").map(Number);
                let nr = r;
                let nc = c;
                if (e.key === "ArrowUp") nr = (r + 8) % 9;
                if (e.key === "ArrowDown") nr = (r + 1) % 9;
                if (e.key === "ArrowLeft") nc = (c + 8) % 9;
                if (e.key === "ArrowRight") nc = (c + 1) % 9;
                setSelected(`${nr}-${nc}`);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selected]);

    const selectedVal = selected
        ? board[Number(selected.split("-")[0])][Number(selected.split("-")[1])]
        : 0;

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="mb-4">
                <Link
                    href="/games"
                    className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                    &larr; Back to Games
                </Link>
            </div>

            <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg">
                <h1 className="text-2xl font-bold">Sudoku</h1>
                <p className="text-sm text-emerald-50">Fill the grid so every row, column & 3×3 box has 1–9.</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 text-sm">
                    {Object.keys(DIFFICULTIES).map((d) => (
                        <button
                            key={d}
                            onClick={() => startGame(d)}
                            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                difficulty === d
                                    ? "bg-emerald-500 text-white"
                                    : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                        >
                            {d}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-4 text-sm font-mono text-gray-700 dark:text-gray-300">
                    <span>⏱ {formatTime(seconds)}</span>
                    <span className="text-red-500">✕ {mistakes}</span>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 mb-4">
                <div className="grid grid-cols-9 gap-0 aspect-square select-none">
                    {board.map((row, r) =>
                        row.map((val, c) => {
                            const key = `${r}-${c}`;
                            const isGiven = given[r][c];
                            const isSelected = selected === key;
                            const isConflict = conflicts.has(key);
                            const isSameVal =
                                selectedVal !== 0 && val === selectedVal && val !== 0;
                            const isPeer =
                                selected &&
                                (Number(selected.split("-")[0]) === r ||
                                    Number(selected.split("-")[1]) === c ||
                                    (Math.floor(Number(selected.split("-")[0]) / 3) === Math.floor(r / 3) &&
                                        Math.floor(Number(selected.split("-")[1]) / 3) === Math.floor(c / 3)));
                            const thickR = c % 3 === 0;
                            const thickB = r % 3 === 0;
                            return (
                                <button
                                    key={key}
                                    onClick={() => handleCellClick(r, c)}
                                    className={`flex items-center justify-center text-lg sm:text-xl font-semibold border-gray-300 dark:border-gray-700 transition-colors ${
                                        thickR ? "border-l-2" : "border-l"
                                    } ${thickB ? "border-t-2" : "border-t"} border-r border-b ${
                                        isGiven
                                            ? "text-gray-900 dark:text-gray-100 font-bold bg-gray-50 dark:bg-gray-800"
                                            : "text-emerald-600 dark:text-emerald-400 bg-white dark:bg-gray-900"
                                    } ${
                                        isSelected
                                            ? "bg-emerald-200 dark:bg-emerald-700"
                                            : isConflict
                                            ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                                            : isSameVal
                                            ? "bg-emerald-50 dark:bg-emerald-900/30"
                                            : isPeer
                                            ? "bg-emerald-50/60 dark:bg-emerald-900/20"
                                            : ""
                                    }`}
                                >
                                    {val !== 0 ? val : ""}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <button
                        key={n}
                        onClick={() => setCellValue(n)}
                        className="flex-1 min-w-[2.5rem] py-3 text-lg font-semibold rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200 active:bg-emerald-100 dark:active:bg-emerald-800 transition-colors"
                    >
                        {n}
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
                <button
                    onClick={eraseCell}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    Erase
                </button>
                <button
                    onClick={() => startGame(difficulty)}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-colors"
                >
                    New Game
                </button>
                <button
                    onClick={solveBoard}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    Solve
                </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                How to play: tap a cell, then a number (or use your keyboard). Conflicts turn red.
                Fewer mistakes = better score.
            </p>

            {won && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center shadow-2xl max-w-sm w-full">
                        <div className="text-5xl mb-3">{"\uD83C\uDF89"}</div>
                        <h2 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-2">
                            Solved!
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                            Time: {formatTime(seconds)}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Mistakes: {mistakes}
                        </p>
                        <button
                            onClick={() => startGame(difficulty)}
                            className="px-6 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                            Play Again
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
