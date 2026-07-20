"use client";

import { useMemo, useState } from "react";

const ROWS = 6;
const COLS = 7;

function colorHex(cell, players) {
    if (cell === "r") return players?.red?.avatarColor || "#ef4444";
    if (cell === "y") return players?.yellow?.avatarColor || "#eab308";
    return "transparent";
}

export default function Connect4Board({
    board,
    turn,
    myColor,
    onDrop,
    canPlay,
    winningCells,
    lastMove,
    players,
}) {
    const [hoverCol, setHoverCol] = useState(null);

    const winSet = useMemo(() => {
        const s = new Set();
        (winningCells || []).forEach(([r, c]) => s.add(`${r}-${c}`));
        return s;
    }, [winningCells]);

    const nextRowForCol = useMemo(() => {
        const map = {};
        for (let c = 0; c < COLS; c++) {
            map[c] = -1;
            for (let r = ROWS - 1; r >= 0; r--) {
                if (!board?.[r]?.[c]) { map[c] = r; break; }
            }
        }
        return map;
    }, [board]);

    const isColFull = (c) => nextRowForCol[c] === -1;

    const handleColClick = (c) => {
        if (!canPlay || isColFull(c)) return;
        onDrop?.(c);
    };

    return (
        <div className="select-none w-full max-w-[520px] mx-auto">
            <style>{`
                @keyframes c4drop {
                    0% { transform: translateY(-380%); }
                    70% { transform: translateY(4%); }
                    100% { transform: translateY(0); }
                }
                .c4-drop { animation: c4drop 0.35s cubic-bezier(0.34,1.2,0.64,1) both; }
                @keyframes c4win {
                    0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
                    50% { box-shadow: 0 0 0 4px rgba(255,255,255,0.9); }
                }
                .c4-win { animation: c4win 1s ease-in-out infinite; }
            `}</style>

            {/* Column drop indicators */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1 px-1.5 sm:px-2">
                {Array.from({ length: COLS }).map((_, c) => (
                    <button
                        key={c}
                        onClick={() => handleColClick(c)}
                        onMouseEnter={() => setHoverCol(c)}
                        onMouseLeave={() => setHoverCol(null)}
                        disabled={!canPlay || isColFull(c)}
                        className="aspect-square flex items-center justify-center rounded-full transition-opacity disabled:opacity-20"
                        aria-label={`Drop in column ${c + 1}`}
                    >
                        {canPlay && hoverCol === c && !isColFull(c) && (
                            <div
                                className="w-3/4 h-3/4 rounded-full opacity-70"
                                style={{ backgroundColor: colorHex(myColor, players) }}
                            />
                        )}
                    </button>
                ))}
            </div>

            <div
                className="rounded-xl sm:rounded-2xl p-1.5 sm:p-2 shadow-lg"
                style={{ background: "linear-gradient(160deg,#2563eb,#1d4ed8)" }}
            >
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                    {Array.from({ length: ROWS }).map((_, r) =>
                        Array.from({ length: COLS }).map((_, c) => {
                            const cell = board?.[r]?.[c] || null;
                            const isWin = winSet.has(`${r}-${c}`);
                            const isLast = lastMove && lastMove.row === r && lastMove.column === c;
                            return (
                                <div
                                    key={`${r}-${c}`}
                                    onClick={() => handleColClick(c)}
                                    onMouseEnter={() => setHoverCol(c)}
                                    onMouseLeave={() => setHoverCol(null)}
                                    className={`aspect-square rounded-full flex items-center justify-center ${canPlay && !isColFull(c) ? "cursor-pointer" : ""}`}
                                    style={{ backgroundColor: "rgba(255,255,255,0.12)", boxShadow: "inset 0 2px 6px rgba(0,0,0,0.35)" }}
                                >
                                    {cell && (
                                        <div
                                            className={`w-[86%] h-[86%] rounded-full ${isLast ? "c4-drop" : ""} ${isWin ? "c4-win" : ""}`}
                                            style={{
                                                backgroundColor: colorHex(cell, players),
                                                boxShadow: "inset 0 -3px 6px rgba(0,0,0,0.35), inset 0 2px 4px rgba(255,255,255,0.3)",
                                            }}
                                        />
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
