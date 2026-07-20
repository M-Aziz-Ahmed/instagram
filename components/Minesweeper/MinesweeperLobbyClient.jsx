"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const LEVELS = {
    easy: { rows: 9, cols: 9, mines: 10, label: "Easy" },
    medium: { rows: 16, cols: 16, mines: 40, label: "Medium" },
    hard: { rows: 16, cols: 30, mines: 99, label: "Hard" },
};

const CELL = {
    HIDDEN: 0,
    REVEALED: 1,
    FLAGGED: 2,
};

function createBoard(rows, cols, mines, safeR, safeC) {
    const grid = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => ({
            mine: false,
            adjacent: 0,
            state: CELL.HIDDEN,
        }))
    );

    let placed = 0;
    while (placed < mines) {
        const r = Math.floor(Math.random() * rows);
        const c = Math.floor(Math.random() * cols);
        if (grid[r][c].mine) continue;
        if (safeR !== undefined && Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
        grid[r][c].mine = true;
        placed++;
    }

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c].mine) continue;
            let count = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].mine) count++;
                }
            }
            grid[r][c].adjacent = count;
        }
    }

    return grid;
}

function floodReveal(grid, startR, startC) {
    const rows = grid.length;
    const cols = grid[0].length;
    const stack = [[startR, startC]];
    const newGrid = grid.map((row) => row.map((cell) => ({ ...cell })));

    while (stack.length) {
        const [r, c] = stack.pop();
        const cell = newGrid[r][c];
        if (cell.state !== CELL.HIDDEN) continue;
        cell.state = CELL.REVEALED;
        if (cell.adjacent === 0 && !cell.mine) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && newGrid[nr][nc].state === CELL.HIDDEN) {
                        stack.push([nr, nc]);
                    }
                }
            }
        }
    }

    return newGrid;
}

function revealAllMines(grid) {
    return grid.map((row) => row.map((cell) => (cell.mine ? { ...cell, state: CELL.REVEALED } : { ...cell })));
}

function countFlags(grid) {
    return grid.reduce(
        (acc, row) => acc + row.filter((cell) => cell.state === CELL.FLAGGED).length,
        0
    );
}

function checkWin(grid, totalMines) {
    const revealed = grid.reduce(
        (acc, row) => acc + row.filter((cell) => cell.state === CELL.REVEALED).length,
        0
    );
    const total = grid.length * grid[0].length;
    return revealed === total - totalMines;
}

export default function MinesweeperLobbyClient() {
    const [level, setLevel] = useState("easy");
    const [grid, setGrid] = useState([]);
    const [status, setStatus] = useState("playing"); // playing | won | lost
    const [flagMode, setFlagMode] = useState(false);
    const [time, setTime] = useState(0);
    const [firstClick, setFirstClick] = useState(true);
    const timerRef = useRef(null);
    const longPressRef = useRef(null);

    const cfg = LEVELS[level];

    const initialize = useCallback((lvl) => {
        const c = LEVELS[lvl];
        setGrid(createBoard(c.rows, c.cols, c.mines));
        setStatus("playing");
        setTime(0);
        setFirstClick(true);
        setFlagMode(false);
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    useEffect(() => {
        initialize(level);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [level, initialize]);

    useEffect(() => {
        if (status === "playing") {
            timerRef.current = setInterval(() => setTime((t) => t + 1), 1000);
        } else if (timerRef.current) {
            clearInterval(timerRef.current);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [status]);

    const handleReveal = useCallback(
        (r, c) => {
            if (status !== "playing") return;
            const cell = grid[r][c];
            if (cell.state === CELL.FLAGGED) return;

            let workingGrid = grid;
            let workingFirst = firstClick;

            if (firstClick) {
                workingGrid = createBoard(cfg.rows, cfg.cols, cfg.mines, r, c);
                workingFirst = false;
            }

            if (workingGrid[r][c].state === CELL.REVEALED) {
                setFirstClick(workingFirst);
                return;
            }

            if (workingGrid[r][c].mine) {
                const revealed = revealAllMines(workingGrid);
                setGrid(revealed);
                setStatus("lost");
                setFirstClick(workingFirst);
                return;
            }

            let newGrid = floodReveal(workingGrid, r, c);

            if (checkWin(newGrid, cfg.mines)) {
                newGrid = newGrid.map((row) =>
                    row.map((cell) => (cell.mine ? { ...cell, state: CELL.FLAGGED } : cell))
                );
                setGrid(newGrid);
                setStatus("won");
            } else {
                setGrid(newGrid);
            }
            setFirstClick(workingFirst);
        },
        [grid, status, firstClick, cfg]
    );

    const handleFlag = useCallback(
        (r, c) => {
            if (status !== "playing") return;
            const newGrid = grid.map((row) => row.map((cell) => ({ ...cell })));
            const cell = newGrid[r][c];
            if (cell.state === CELL.HIDDEN) {
                cell.state = CELL.FLAGGED;
            } else if (cell.state === CELL.FLAGGED) {
                cell.state = CELL.HIDDEN;
            } else {
                return;
            }
            setGrid(newGrid);
        },
        [grid, status]
    );

    const onCellClick = (r, c) => {
        if (flagMode) {
            handleFlag(r, c);
        } else {
            handleReveal(r, c);
        }
    };

    const onContextMenu = (e, r, c) => {
        e.preventDefault();
        handleFlag(r, c);
    };

    const onTouchStart = (r, c) => {
        longPressRef.current = setTimeout(() => {
            handleFlag(r, c);
            longPressRef.current = null;
        }, 450);
    };

    const onTouchEnd = () => {
        if (longPressRef.current) {
            clearTimeout(longPressRef.current);
            longPressRef.current = null;
        }
    };

    const flags = grid.length ? countFlags(grid) : 0;
    const minesLeft = cfg.mines - flags;

    const cellColor = (cell) => {
        if (cell.state === CELL.HIDDEN) return "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600";
        if (cell.state === CELL.FLAGGED) return "bg-gray-200 dark:bg-gray-700";
        return "bg-gray-100 dark:bg-gray-800";
    };

    const numberColor = (n) => {
        const colors = {
            1: "text-blue-600 dark:text-blue-400",
            2: "text-green-600 dark:text-green-400",
            3: "text-red-600 dark:text-red-400",
            4: "text-purple-600 dark:text-purple-400",
            5: "text-yellow-600 dark:text-yellow-500",
            6: "text-teal-600 dark:text-teal-400",
            7: "text-pink-600 dark:text-pink-400",
            8: "text-gray-600 dark:text-gray-400",
        };
        return colors[n] || "text-gray-900 dark:text-gray-100";
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="mb-6">
                <a
                    href="/games"
                    className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                    &larr; Back to Games
                </a>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">Minesweeper</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Reveal every safe cell without detonating a mine
                </p>
            </div>

            <div className="p-6 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-white mb-6">
                <h2 className="text-lg font-semibold">How to play</h2>
                <p className="text-sm text-white/90 mt-1">
                    Left-click a cell to reveal it. Numbers show how many mines are adjacent.
                    Right-click (or use Flag mode on touch) to mark a suspected mine. Reveal all
                    safe cells to win.
                </p>
            </div>

            <div className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl mb-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex gap-2">
                        {Object.entries(LEVELS).map(([key, val]) => (
                            <button
                                key={key}
                                onClick={() => setLevel(key)}
                                className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                                    level === key
                                        ? "bg-cyan-500 text-white"
                                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                                }`}
                            >
                                {val.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                        <span>{"\u{1F4A3}"} {minesLeft}</span>
                        <span>{"\u{23F1}"} {time}s</span>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 mb-4">
                    <button
                        onClick={() => setFlagMode((f) => !f)}
                        className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                            flagMode
                                ? "bg-blue-500 text-white"
                                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                    >
                        {flagMode ? "Flag Mode: ON" : "Flag Mode: OFF"}
                    </button>

                    <button
                        onClick={() => initialize(level)}
                        className="px-4 py-1.5 bg-cyan-500 text-white text-sm font-semibold rounded-lg hover:bg-cyan-600 transition-colors"
                    >
                        Restart
                    </button>
                </div>

                {status === "won" && (
                    <div className="mb-4 text-center text-green-600 dark:text-green-400 font-semibold">
                        {"\u{1F389}"} You won in {time}s!
                    </div>
                )}
                {status === "lost" && (
                    <div className="mb-4 text-center text-red-600 dark:text-red-400 font-semibold">
                        {"\u{1F4A5}"} Boom! Game over.
                    </div>
                )}

                <div className="overflow-x-auto">
                    <div
                        className="grid gap-0.5 mx-auto select-none"
                        style={{
                            gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))`,
                            width: "max-content",
                        }}
                    >
                        {grid.map((row, r) =>
                            row.map((cell, c) => (
                                <button
                                    key={`${r}-${c}`}
                                    onClick={() => onCellClick(r, c)}
                                    onContextMenu={(e) => onContextMenu(e, r, c)}
                                    onTouchStart={() => onTouchStart(r, c)}
                                    onTouchEnd={onTouchEnd}
                                    onTouchMove={onTouchEnd}
                                    className={`w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center text-sm font-bold rounded-sm transition-colors ${cellColor(
                                        cell
                                    )}`}
                                >
                                    {cell.state === CELL.FLAGGED
                                        ? "\u{1F6A9}"
                                        : cell.state === CELL.REVEALED
                                        ? cell.mine
                                            ? "\u{1F4A3}"
                                            : cell.adjacent > 0
                                            ? cell.adjacent
                                            : ""
                                        : ""}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
