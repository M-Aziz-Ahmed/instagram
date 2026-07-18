"use client";

import { useRef, useEffect } from "react";

export default function ChessMoveHistory({ moves, currentMoveIndex, onMoveClick, orientation }) {
    const listRef = useRef(null);
    const lastMoveRef = useRef(null);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [moves?.length]);

    useEffect(() => {
        if (lastMoveRef.current && listRef.current) {
            lastMoveRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }, [moves?.length]);

    const pairs = [];
    for (let i = 0; i < moves.length; i += 2) {
        pairs.push({
            number: Math.floor(i / 2) + 1,
            white: moves[i] || null,
            black: moves[i + 1] || null,
            whiteIdx: i,
            blackIdx: i + 1 < moves.length ? i + 1 : -1,
        });
    }

    const lastPair = pairs.length > 0 ? pairs[pairs.length - 1] : null;
    const isLatestWhite = lastPair && lastPair.black === null;
    const latestIdx = moves.length - 1;

    return (
        <div className="flex flex-col h-full">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Moves</h3>
                {moves?.length > 0 && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">{Math.ceil(moves.length / 2)}</span>
                )}
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto px-1 py-1">
                {pairs.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
                        <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <p className="text-xs">No moves yet</p>
                    </div>
                )}
                {pairs.map((pair) => {
                    const isWhiteLatest = currentMoveIndex < 0 && latestIdx === pair.whiteIdx;
                    const isBlackLatest = currentMoveIndex < 0 && latestIdx === pair.blackIdx;
                    const isHighlighted = isWhiteLatest || isBlackLatest;

                    return (
                        <div
                            key={pair.number}
                            ref={isHighlighted ? lastMoveRef : null}
                            className="flex items-center text-xs font-mono group hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded px-1"
                        >
                            <span className="w-7 text-right pr-1.5 text-gray-400 dark:text-gray-500 shrink-0 select-none text-[10px]">
                                {pair.number}.
                            </span>
                            <button
                                onClick={() => pair.white && onMoveClick?.(pair.whiteIdx)}
                                className={`flex-1 px-1.5 py-[3px] rounded text-left transition-colors ${
                                    currentMoveIndex === pair.whiteIdx
                                        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold"
                                        : isWhiteLatest
                                        ? "bg-yellow-50 dark:bg-yellow-900/20 text-gray-900 dark:text-gray-100 font-medium"
                                        : "text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                                }`}
                            >
                                {pair.white?.san || ""}
                            </button>
                            <button
                                onClick={() => pair.black && onMoveClick?.(pair.blackIdx)}
                                className={`flex-1 px-1.5 py-[3px] rounded text-left transition-colors ${
                                    currentMoveIndex === pair.blackIdx
                                        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold"
                                        : isBlackLatest
                                        ? "bg-yellow-50 dark:bg-yellow-900/20 text-gray-900 dark:text-gray-100 font-medium"
                                        : "text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                                }`}
                            >
                                {pair.black?.san || ""}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
