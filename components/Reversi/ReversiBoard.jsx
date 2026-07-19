"use client";

import { useMemo } from "react";
import { getLegalMoves } from "./reversiClientLogic";

const SIZE = 8;

export default function ReversiBoard({ board, myColor, canPlay, onMove, lastMove }) {
    const legal = useMemo(() => {
        if (!canPlay || !myColor) return new Set();
        return new Set(getLegalMoves(board, myColor).map(([r, c]) => `${r}-${c}`));
    }, [board, canPlay, myColor]);

    const flippedCells = useMemo(() => {
        const s = new Set();
        if (lastMove?.flips) for (const [r, c] of lastMove.flips) s.add(`${r}-${c}`);
        return s;
    }, [lastMove]);

    return (
        <div className="select-none w-full max-w-[520px] mx-auto">
            <div className="grid grid-cols-8 rounded-lg overflow-hidden shadow-lg border-2 border-emerald-900 bg-emerald-800" style={{ aspectRatio: "1", gap: "1px", padding: "1px" }}>
                {Array.from({ length: SIZE }).map((_, r) =>
                    Array.from({ length: SIZE }).map((_, c) => {
                        const piece = board[r]?.[c];
                        const isLegal = legal.has(`${r}-${c}`);
                        const isLast = lastMove && lastMove.r === r && lastMove.c === c;
                        const wasFlipped = flippedCells.has(`${r}-${c}`);
                        return (
                            <div
                                key={`${r}-${c}`}
                                onClick={() => isLegal && onMove?.(r, c)}
                                className="relative flex items-center justify-center bg-emerald-700"
                                style={{ cursor: isLegal ? "pointer" : "default" }}
                            >
                                {isLast && <div className="absolute inset-0" style={{ backgroundColor: "rgba(250,204,21,0.35)" }} />}
                                {piece && (
                                    <div
                                        className="w-[80%] h-[80%] rounded-full z-10"
                                        style={{
                                            backgroundColor: piece === "b" ? "#111827" : "#f9fafb",
                                            boxShadow: "inset 0 -3px 4px rgba(0,0,0,0.4), inset 0 2px 3px rgba(255,255,255,0.3)",
                                            border: piece === "w" ? "1px solid #d1d5db" : "1px solid #000",
                                            outline: wasFlipped ? "2px solid rgba(250,204,21,0.7)" : "none",
                                        }}
                                    />
                                )}
                                {isLegal && !piece && (
                                    <div className="w-1/3 h-1/3 rounded-full z-10" style={{ backgroundColor: myColor === "b" ? "rgba(17,24,39,0.4)" : "rgba(249,250,251,0.5)" }} />
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
