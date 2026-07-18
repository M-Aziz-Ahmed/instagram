"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import ChessPiece from "./ChessPiece";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

function rcToSquare(row, col) {
    return FILES[col] + RANKS[row];
}

function parseFEN(fen) {
    if (!fen) return [];
    const rows = fen.split(" ")[0].split("/");
    const board = [];
    for (let r = 0; r < 8; r++) {
        const row = [];
        for (const ch of rows[r]) {
            if (/\d/.test(ch)) {
                for (let i = 0; i < parseInt(ch); i++) row.push(null);
            } else {
                row.push({ type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? "w" : "b" });
            }
        }
        board.push(row);
    }
    return board;
}



export default function ChessBoard({
    fen,
    turn,
    onMove,
    selectedSquare,
    onSquareClick,
    lastMove,
    legalMoves,
    playerColor,
    isFlipped,
    onFlip,
    status,
    promotionPending,
    onPromotionChoice,
}) {
    const boardRef = useRef(null);
    const [dragging, setDragging] = useState(null);
    const [dragOver, setDragOver] = useState(null);

    const board = useMemo(() => parseFEN(fen), [fen]);
    const whitePerspective = (playerColor || "w") === "w";
    const flipped = isFlipped ? whitePerspective : !whitePerspective;

    const displayBoard = useMemo(() => {
        if (!flipped) return board;
        return [...board].reverse().map(row => [...row].reverse());
    }, [board, flipped]);

    const displayFiles = useMemo(() => flipped ? [...FILES].reverse() : FILES, [flipped]);
    const displayRanks = useMemo(() => flipped ? [...RANKS].reverse() : RANKS, [flipped]);

    const isPlayerTurn = turn === playerColor;
    const gameOver = status && status !== "active" && status !== "waiting";

    const displayToSquare = useCallback((ri, ci) => {
        const realRow = flipped ? 7 - ri : ri;
        const realCol = flipped ? 7 - ci : ci;
        return rcToSquare(realRow, realCol);
    }, [flipped]);

    const handleClick = useCallback((ri, ci) => {
        if (gameOver) return;
        const square = displayToSquare(ri, ci);
        onSquareClick?.(square);
    }, [gameOver, displayToSquare, onSquareClick]);

    const handleDragStart = useCallback((e, ri, ci) => {
        if (gameOver || !isPlayerTurn) return;
        const square = displayToSquare(ri, ci);
        const realRow = flipped ? 7 - ri : ri;
        const realCol = flipped ? 7 - ci : ci;
        const piece = board[realRow]?.[realCol];
        if (!piece || piece.color !== playerColor) return;
        setDragging({ ri, ci, square });
        onSquareClick?.(square);
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            const cellSize = boardRef.current ? boardRef.current.offsetWidth / 8 : 60;
            const ghost = document.createElement("div");
            ghost.style.width = cellSize + "px";
            ghost.style.height = cellSize + "px";
            ghost.style.opacity = "0.01";
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 0, 0);
            setTimeout(() => document.body.removeChild(ghost), 0);
        }
    }, [board, flipped, playerColor, isPlayerTurn, gameOver, onSquareClick, displayToSquare]);

    const handleDragOver = useCallback((e, ri, ci) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver({ ri, ci });
    }, []);

    const handleDrop = useCallback((e, ri, ci) => {
        e.preventDefault();
        setDragOver(null);
        if (gameOver) return;
        const targetSquare = displayToSquare(ri, ci);
        if (dragging && legalMoves?.includes(targetSquare)) {
            onMove?.(dragging.square, targetSquare);
        }
        setDragging(null);
    }, [dragging, legalMoves, onMove, gameOver, displayToSquare]);

    const handleDragEnd = useCallback(() => {
        setDragging(null);
        setDragOver(null);
    }, []);

    const findKingSquare = useCallback((kingColor) => {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (board[r][c]?.type === "k" && board[r][c]?.color === kingColor) {
                    return rcToSquare(r, c);
                }
            }
        }
        return null;
    }, [board]);

    const inCheckKingSquare = useMemo(() => {
        if (!fen) return null;
        const parts = fen.split(" ");
        const activeTurn = parts[1];
        if (parts.includes("+")) return findKingSquare(activeTurn === "w" ? "b" : "w");
        return null;
    }, [fen, findKingSquare]);

    const isPromotion = promotionPending;

    return (
        <div className="relative select-none">
            <div className="flex">
                <div className="flex flex-col">
                    {displayRanks.map((rank) => (
                        <div
                            key={rank}
                            className="flex items-center justify-center text-[9px] sm:text-[11px] font-bold"
                            style={{
                                width: 14,
                                color: displayRanks.indexOf(rank) % 2 === 0 ? "#8b7355" : "#a39279",
                            }}
                        >
                            {rank}
                        </div>
                    ))}
                </div>

                <div ref={boardRef} className="relative" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>
                    <div className="grid grid-cols-8 grid-rows-8" style={{ aspectRatio: "1", width: "100%" }}>
                        {displayBoard.map((row, ri) =>
                            row.map((piece, ci) => {
                                const square = displayToSquare(ri, ci);
                                const isLight = (ri + ci) % 2 === 0;
                                const isSelected = selectedSquare === square;
                                const isLegalMove = legalMoves?.includes(square);
                                const isLastMoveFrom = lastMove?.from === square;
                                const isLastMoveTo = lastMove?.to === square;
                                const isDragOverTarget = dragOver?.ri === ri && dragOver?.ci === ci;
                                const isDragSource = dragging?.ri === ri && dragging?.ci === ci;
                                const isKingInCheck = inCheckKingSquare === square && piece?.type === "k";

                                let bgColor;
                                if (isSelected) {
                                    bgColor = isLight ? "#f6f669" : "#baca2b";
                                } else if (isLastMoveFrom || isLastMoveTo) {
                                    bgColor = isLight ? "#cdd26a" : "#aaa23a";
                                } else if (isDragOverTarget && dragging) {
                                    bgColor = isLight ? "#bbcb2b" : "#9bac3b";
                                } else {
                                    bgColor = isLight ? "#f0d9b5" : "#b58863";
                                }

                                return (
                                    <div
                                        key={`${ri}-${ci}`}
                                        className="relative flex items-center justify-center"
                                        style={{
                                            backgroundColor: bgColor,
                                            cursor: "pointer",
                                        }}
                                        onClick={() => handleClick(ri, ci)}
                                        onDragOver={(e) => handleDragOver(e, ri, ci)}
                                        onDrop={(e) => handleDrop(e, ri, ci)}
                                        onDragLeave={() => setDragOver(null)}
                                    >
                                        {isKingInCheck && (
                                            <div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{
                                                    background: "radial-gradient(circle, rgba(255,0,0,0.6) 0%, rgba(255,0,0,0.25) 40%, transparent 70%)",
                                                }}
                                            />
                                        )}

                                        {isLegalMove && !piece && !isDragSource && (
                                            <div
                                                className="absolute rounded-full pointer-events-none z-10"
                                                style={{
                                                    width: "26%",
                                                    height: "26%",
                                                    backgroundColor: "rgba(0,0,0,0.25)",
                                                }}
                                            />
                                        )}
                                        {isLegalMove && piece && !isDragSource && (
                                            <div
                                                className="absolute pointer-events-none z-10"
                                                style={{
                                                    inset: 3,
                                                    borderRadius: "50%",
                                                    border: "3px solid rgba(0,0,0,0.25)",
                                                }}
                                            />
                                        )}

                                        {piece && !isDragSource && (
                                            <div
                                                className="z-20 transition-transform duration-75 ease-out"
                                                draggable={isPlayerTurn && piece.color === playerColor}
                                                onDragStart={(e) => handleDragStart(e, ri, ci)}
                                                onDragEnd={handleDragEnd}
                                                style={{ willChange: "transform" }}
                                            >
                                                <ChessPiece piece={piece} size={60} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {isPromotion && (
                        <div
                            className="absolute inset-0 flex items-center justify-center z-50"
                            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
                        >
                            <div className="bg-white dark:bg-gray-800 rounded-xl p-2 sm:p-3 shadow-2xl border border-gray-200 dark:border-gray-700">
                                <p className="text-[10px] sm:text-xs text-center text-gray-500 dark:text-gray-400 mb-1.5 sm:mb-2 font-medium">Promote to:</p>
                                <div className="flex gap-0.5 sm:gap-1">
                                    {["q", "r", "b", "n"].map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => onPromotionChoice?.(type)}
                                            className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                        >
                                            <ChessPiece piece={{ type, color: promotionPending }} size={36} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex">
                <div className="w-3.5 sm:w-4" />
                <div className="flex-1 flex">
                    {displayFiles.map((file) => (
                        <div
                            key={file}
                            className="flex-1 text-center text-[9px] sm:text-[11px] font-bold"
                            style={{
                                color: displayFiles.indexOf(file) % 2 === 1 ? "#8b7355" : "#a39279",
                                paddingTop: 2,
                            }}
                        >
                            {file}
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-end mt-0.5">
                <button
                    onClick={onFlip}
                    className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Flip board"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                        <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.598a.75.75 0 0 0-.75.75v3.634a.75.75 0 0 0 1.5 0v-2.033l.312.311a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V3.59a.75.75 0 0 0-1.5 0V5.37l-.312-.311A7 7 0 0 0 .885 8.249a.75.75 0 1 0 1.45.388A5.5 5.5 0 0 1 11.506 6.17l.312.311h-2.432a.75.75 0 0 0 0 1.5h3.634a.75.75 0 0 0 .53-.22Z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
