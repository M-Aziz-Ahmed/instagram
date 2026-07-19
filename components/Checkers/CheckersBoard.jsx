"use client";

import { useMemo, useState, useCallback } from "react";
import { getLegalMoves, pieceColor, isKing } from "./checkersClientLogic";

const SIZE = 8;

function sameSq(a, b) {
    return a && b && a[0] === b[0] && a[1] === b[1];
}

export default function CheckersBoard({ board, myColor, canPlay, onMove, lastMove, flipped, players }) {
    const [selected, setSelected] = useState(null);
    const [partialPath, setPartialPath] = useState([]);

    const legalMoves = useMemo(() => {
        if (!canPlay || !myColor) return [];
        return getLegalMoves(board, myColor);
    }, [board, canPlay, myColor]);

    const currentPath = useMemo(() => (selected ? [selected, ...partialPath] : []), [selected, partialPath]);

    const matchingMoves = useMemo(() => {
        if (currentPath.length === 0) return [];
        return legalMoves.filter((m) =>
            currentPath.every((sq, i) => m[i] && m[i][0] === sq[0] && m[i][1] === sq[1])
        );
    }, [legalMoves, currentPath]);

    const nextTargets = useMemo(() => {
        const idx = currentPath.length;
        const targets = [];
        for (const m of matchingMoves) {
            if (m[idx]) targets.push(m[idx]);
        }
        return targets;
    }, [matchingMoves, currentPath]);

    const selectableStarts = useMemo(() => {
        const set = new Set();
        for (const m of legalMoves) set.add(`${m[0][0]}-${m[0][1]}`);
        return set;
    }, [legalMoves]);

    const reset = useCallback(() => {
        setSelected(null);
        setPartialPath([]);
    }, []);

    const handleClick = useCallback((r, c) => {
        if (!canPlay) return;

        if (!selected) {
            if (selectableStarts.has(`${r}-${c}`)) setSelected([r, c]);
            return;
        }

        if (sameSq(selected, [r, c]) && partialPath.length === 0) {
            reset();
            return;
        }

        const target = nextTargets.find((t) => t[0] === r && t[1] === c);
        if (target) {
            const newPath = [...partialPath, target];
            const fullPath = [selected, ...newPath];
            const completed = matchingMoves.find((m) =>
                m.length === fullPath.length &&
                m.every((sq, i) => sq[0] === fullPath[i][0] && sq[1] === fullPath[i][1])
            );
            const hasLonger = matchingMoves.some((m) =>
                m.length > fullPath.length &&
                fullPath.every((sq, i) => m[i][0] === sq[0] && m[i][1] === sq[1])
            );
            if (completed && !hasLonger) {
                onMove?.(fullPath);
                reset();
            } else {
                setPartialPath(newPath);
            }
            return;
        }

        if (selectableStarts.has(`${r}-${c}`)) {
            setSelected([r, c]);
            setPartialPath([]);
        } else {
            reset();
        }
    }, [canPlay, selected, partialPath, nextTargets, matchingMoves, selectableStarts, onMove, reset]);

    const displayRows = flipped ? [...Array(SIZE).keys()].reverse() : [...Array(SIZE).keys()];
    const displayCols = flipped ? [...Array(SIZE).keys()].reverse() : [...Array(SIZE).keys()];

    const lastPath = lastMove?.path || [];
    const isInLastPath = (r, c) => lastPath.some((sq) => sq[0] === r && sq[1] === c);

    const redColor = players?.red?.avatarColor || "#ef4444";
    const blackColor = players?.black?.avatarColor || "#1f2937";

    return (
        <div className="select-none w-full max-w-[520px] mx-auto">
            <div className="grid grid-cols-8 rounded-lg overflow-hidden shadow-lg border-2 border-amber-900" style={{ aspectRatio: "1" }}>
                {displayRows.map((r) =>
                    displayCols.map((c) => {
                        const dark = (r + c) % 2 === 1;
                        const piece = board[r]?.[c];
                        const isSel = sameSq(selected, [r, c]);
                        const isTarget = nextTargets.some((t) => t[0] === r && t[1] === c);
                        const inPartial = partialPath.some((sq) => sq[0] === r && sq[1] === c);
                        const inLast = isInLastPath(r, c);
                        return (
                            <div
                                key={`${r}-${c}`}
                                onClick={() => handleClick(r, c)}
                                className="relative flex items-center justify-center"
                                style={{
                                    backgroundColor: dark ? "#8b5a2b" : "#f0d9b5",
                                    cursor: canPlay && (isTarget || selectableStarts.has(`${r}-${c}`) || isSel) ? "pointer" : "default",
                                }}
                            >
                                {inLast && <div className="absolute inset-0" style={{ backgroundColor: "rgba(255,255,0,0.25)" }} />}
                                {isSel && <div className="absolute inset-0 ring-2 ring-inset ring-blue-400" style={{ backgroundColor: "rgba(59,130,246,0.25)" }} />}
                                {inPartial && <div className="absolute inset-0" style={{ backgroundColor: "rgba(59,130,246,0.2)" }} />}
                                {isTarget && (
                                    <div className="absolute w-1/3 h-1/3 rounded-full z-10" style={{ backgroundColor: "rgba(34,197,94,0.6)" }} />
                                )}
                                {piece && (
                                    <div
                                        className="w-[74%] h-[74%] rounded-full flex items-center justify-center z-20"
                                        style={{
                                            backgroundColor: pieceColor(piece) === "r" ? redColor : blackColor,
                                            boxShadow: "inset 0 -3px 5px rgba(0,0,0,0.4), inset 0 2px 3px rgba(255,255,255,0.25)",
                                            border: "2px solid rgba(0,0,0,0.25)",
                                        }}
                                    >
                                        {isKing(piece) && (
                                            <svg viewBox="0 0 24 24" className="w-1/2 h-1/2" fill="#fde047">
                                                <path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm0 2h14v2H5v-2z" />
                                            </svg>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
