"use client";

import { useRef, useEffect } from "react";

export default function ChessMoveHistory({ moves, currentMoveIndex, onMoveClick, orientation }) {
    const listRef = useRef(null);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [moves?.length]);

    const pairs = [];
    for (let i = 0; i < moves.length; i += 2) {
        pairs.push({
            number: Math.floor(i / 2) + 1,
            white: moves[i] || null,
            black: moves[i + 1] || null,
        });
    }

    return (
        <div className="flex flex-col h-full">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Moves</h3>
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-1">
                {pairs.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">No moves yet</p>
                )}
                {pairs.map((pair) => (
                    <div key={pair.number} className="flex items-center text-xs font-mono">
                        <span className="w-8 text-right pr-2 text-gray-400 dark:text-gray-500 shrink-0">{pair.number}.</span>
                        <button
                            onClick={() => pair.white && onMoveClick?.(moves.indexOf(pair.white))}
                            className={`px-2 py-0.5 rounded min-w-[48px] text-left ${
                                currentMoveIndex === moves.indexOf(pair.white)
                                    ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold"
                                    : "text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                        >
                            {pair.white?.san || ""}
                        </button>
                        <button
                            onClick={() => pair.black && onMoveClick?.(moves.indexOf(pair.black))}
                            className={`px-2 py-0.5 rounded min-w-[48px] text-left ${
                                currentMoveIndex === moves.indexOf(pair.black)
                                    ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold"
                                    : "text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                        >
                            {pair.black?.san || ""}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
