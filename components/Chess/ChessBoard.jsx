"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import ChessPiece from "./ChessPiece";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

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
                row.push({
                    type: ch.toLowerCase(),
                    color: ch === ch.toUpperCase() ? "w" : "b",
                });
            }
        }
        board.push(row);
    }
    return board;
}

function squareToRC(square) {
    const file = FILES.indexOf(square[0]);
    const rank = RANKS.indexOf(square[1]);
    return { row: rank, col: file };
}

function rcToSquare(row, col) {
    return FILES[col] + RANKS[row];
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
    orientation,
}) {
    const boardRef = useRef(null);
    const [dragging, setDragging] = useState(null);
    const [dragOver, setDragOver] = useState(null);

    const board = useMemo(() => parseFEN(fen), [fen]);
    const whitePerspective = (orientation || playerColor || "w") === "w";
    const flipped = isFlipped ? !whitePerspective : whitePerspective;

    const displayBoard = useMemo(() => {
        if (!flipped) return board;
        return [...board].reverse().map(row => [...row].reverse());
    }, [board, flipped]);

    const displayFiles = useMemo(() => flipped ? [...FILES].reverse() : FILES, [flipped]);
    const displayRanks = useMemo(() => flipped ? [...RANKS].reverse() : RANKS, [flipped]);

    const isPlayerTurn = turn === playerColor;
    const gameOver = status && status !== "active";

    const handleClick = useCallback((row, col) => {
        const square = rcToSquare(row, col);
        if (gameOver) return;
        if (selectedSquare) {
            if (legalMoves?.includes(square)) {
                onMove?.(selectedSquare, square);
            } else {
                onSquareClick?.(square);
            }
        } else {
            onSquareClick?.(square);
        }
    }, [selectedSquare, legalMoves, onMove, onSquareClick, gameOver]);

    const handleDragStart = useCallback((e, row, col) => {
        if (gameOver || !isPlayerTurn) return;
        const square = rcToSquare(row, col);
        const piece = board[row][col];
        if (!piece || piece.color !== playerColor) return;
        setDragging({ row, col, square });
        onSquareClick?.(square);
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            const ghost = document.createElement("div");
            ghost.style.width = "60px";
            ghost.style.height = "60px";
            ghost.style.opacity = "0.01";
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 0, 0);
            setTimeout(() => document.body.removeChild(ghost), 0);
        }
    }, [board, playerColor, isPlayerTurn, gameOver, onSquareClick]);

    const handleDragOver = useCallback((e, row, col) => {
        e.preventDefault();
        setDragOver({ row, col });
    }, []);

    const handleDrop = useCallback((e, row, col) => {
        e.preventDefault();
        setDragOver(null);
        setDragging(null);
        if (gameOver) return;
        const targetSquare = rcToSquare(row, col);
        if (dragging && legalMoves?.includes(targetSquare)) {
            onMove?.(dragging.square, targetSquare);
        }
    }, [dragging, legalMoves, onMove, gameOver]);

    const handleDragEnd = useCallback(() => {
        setDragging(null);
        setDragOver(null);
    }, []);

    const isInCheck = useMemo(() => {
        if (!fen) return false;
        const parts = fen.split(" ");
        return parts[1] === (playerColor === "w" ? "b" : "w") ? false : parts.includes("K") || parts.includes("k");
    }, [fen, playerColor]);

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

    const kingInCheckSquare = useMemo(() => {
        if (!fen) return null;
        const parts = fen.split(" ");
        const activeTurn = parts[1];
        if (parts.length > 2 && parts.includes("K")) return findKingSquare("w");
        if (parts.length > 2 && parts.includes("k")) return findKingSquare("b");
        const chess = board;
        const turnColor = activeTurn === "w" ? "w" : "b";
        if (turnColor !== playerColor) return null;
        return null;
    }, [fen, board, playerColor, findKingSquare]);

    const handleSquareMouseDown = useCallback((row, col, e) => {
        e.preventDefault();
        if (!gameOver && isPlayerTurn) {
            handleDragStart(e, row, col);
        }
    }, [handleDragStart, gameOver, isPlayerTurn]);

    return (
        <div className="relative select-none">
            <div className="flex items-center mb-1">
                <div className="flex-1" />
                <button
                    onClick={onFlip}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Flip board"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.598a.75.75 0 0 0-.75.75v3.634a.75.75 0 0 0 1.5 0v-2.033l.312.311a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V3.59a.75.75 0 0 0-1.5 0V5.37l-.312-.311A7 7 0 0 0 .885 8.249a.75.75 0 1 0 1.45.388A5.5 5.5 0 0 1 11.506 6.17l.312.311h-2.432a.75.75 0 0 0 0 1.5h3.634a.75.75 0 0 0 .53-.22Z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>

            <div className="flex">
                <div className="flex flex-col">
                    {displayRanks.map((rank, ri) => (
                        <div key={rank} className="w-4 h-[calc(100%/8)] flex items-center justify-center text-[10px] font-medium text-gray-400 dark:text-gray-500">
                            {rank}
                        </div>
                    ))}
                </div>

                <div ref={boardRef} className="relative border border-gray-800 dark:border-gray-600 rounded-sm overflow-hidden">
                    <div className="grid grid-cols-8 grid-rows-8" style={{ aspectRatio: "1" }}>
                        {displayBoard.map((row, ri) =>
                            row.map((piece, ci) => {
                                const realRow = flipped ? 7 - ri : ri;
                                const realCol = flipped ? 7 - ci : ci;
                                const square = rcToSquare(realRow, realCol);
                                const isLight = (ri + ci) % 2 === 0;
                                const isSelected = selectedSquare === square;
                                const isLegalMove = legalMoves?.includes(square);
                                const isLastMoveFrom = lastMove?.from === square;
                                const isLastMoveTo = lastMove?.to === square;
                                const isDragOverTarget = dragOver?.row === ri && dragOver?.col === ci;
                                const isDragSource = dragging?.row === ri && dragging?.col === ci;
                                const isCheckSquare = findKingSquare(turn) === square && (fen || "").includes(" K ") || (fen || "").includes(" k ");

                                return (
                                    <div
                                        key={`${ri}-${ci}`}
                                        className={`relative flex items-center justify-center cursor-pointer ${
                                            isLight
                                                ? isSelected || isLastMoveFrom || isLastMoveTo
                                                    ? "bg-yellow-300/70"
                                                    : isDragOverTarget
                                                    ? "bg-green-300/60"
                                                    : "bg-[#f0d9b5]"
                                                : isSelected || isLastMoveFrom || isLastMoveTo
                                                    ? "bg-yellow-500/70"
                                                    : isDragOverTarget
                                                    ? "bg-green-500/60"
                                                    : "bg-[#b58863]"
                                        } ${isCheckSquare && piece?.type === "k" && piece?.color === turn ? "ring-4 ring-red-500/80 ring-inset" : ""}`}
                                        onClick={() => handleClick(ri, ci)}
                                        onMouseDown={(e) => handleSquareMouseDown(ri, ci, e)}
                                        onDragOver={(e) => handleDragOver(e, ri, ci)}
                                        onDrop={(e) => handleDrop(e, ri, ci)}
                                    >
                                        {isLegalMove && !piece && !isDragSource && (
                                            <div className="absolute w-3 h-3 rounded-full bg-gray-500/40 dark:bg-gray-300/40 z-10" />
                                        )}
                                        {isLegalMove && piece && !isDragSource && (
                                            <div className="absolute inset-0 rounded-full border-4 border-gray-500/40 dark:border-gray-300/40 z-10 m-1" />
                                        )}
                                        {piece && !isDragSource && (
                                            <div
                                                className="z-20"
                                                draggable={isPlayerTurn && piece.color === playerColor}
                                                onDragStart={(e) => handleDragStart(e, ri, ci)}
                                                onDragEnd={handleDragEnd}
                                            >
                                                <ChessPiece piece={piece} size={60} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            <div className="flex">
                <div className="w-4" />
                <div className="flex-1 flex">
                    {displayFiles.map((file) => (
                        <div key={file} className="flex-1 text-center text-[10px] font-medium text-gray-400 dark:text-gray-500 py-0.5">
                            {file}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
