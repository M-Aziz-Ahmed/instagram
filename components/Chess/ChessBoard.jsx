"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { Chess } from "chess.js";
import ChessPiece from "./ChessPiece";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

function rcToSquare(row, col) {
    return FILES[col] + RANKS[row];
}

function parseFEN(fen) {
    // A missing FEN used to return `[]`, so `displayBoard.map(...)` emitted zero
    // squares and the user saw an empty area with no explanation at all. The
    // malformed-FEN branches below already return a valid empty board for the
    // same reason; a falsy FEN is just the most degenerate form of malformed and
    // should take the same path.
    if (!fen) return Array.from({ length: 8 }, () => Array(8).fill(null));
    const rows = fen.split(" ")[0].split("/");
    // A truncated or malformed FEN used to make `rows[r]` undefined for some r,
    // and `for (const ch of rows[r])` then threw inside render - which white-screened
    // the whole board. Hand back a valid, empty 8x8 board instead so the grid still
    // renders (the overlay already guards against a missing "k" in Chess).
    if (rows.length !== 8) {
        return Array.from({ length: 8 }, () => Array(8).fill(null));
    }
    const board = [];
    for (let r = 0; r < 8; r++) {
        const row = [];
        for (const ch of String(rows[r] ?? "")) {
            if (/[1-8]/.test(ch)) {
                // A rank may run over 8 squares with bad input ("9", or a run of
                // digits); never emit more cells than the grid has columns.
                for (let i = 0; i < parseInt(ch) && row.length < 8; i++) row.push(null);
            } else if (/[pnbrqkPNBRQK]/.test(ch)) {
                if (row.length < 8) {
                    row.push({ type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? "w" : "b" });
                }
            }
            // Any other character is junk and is ignored rather than turned into a
            // bogus piece type.
        }
        // Pad a short rank so every row still has 8 columns and the 8-column grid
        // stays aligned.
        while (row.length < 8) row.push(null);
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
    moveAnimation,
}) {
    const boardRef = useRef(null);
    const [dragging, setDragging] = useState(null);
    const [dragOver, setDragOver] = useState(null);
    // Touch has no HTML5 drag-and-drop and mobile is this app's primary target, so
    // the same source/target flow runs off touch events. Touch is implicitly
    // captured by the element the gesture started on, so the square the finger
    // actually ended up on has to be resolved with elementFromPoint rather than
    // read off the event target.
    const touchSourceRef = useRef(null);
    const dragLeaveTimerRef = useRef(null);

    const board = useMemo(() => parseFEN(fen), [fen]);
    const flipped = isFlipped;

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
        // NOTE: onSquareClick is deliberately NOT called here. In ChessGameClient it
        // TOGGLES the selection, so selecting an already-selected piece to drag it
        // would clear the selection on drag start and the drop would be dropped.
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
    }, [board, flipped, playerColor, isPlayerTurn, gameOver, displayToSquare]);

    const handleDragOver = useCallback((e, ri, ci) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        // A pending dragleave from crossing a child element is superseded by this
        // dragover on the same square.
        clearTimeout(dragLeaveTimerRef.current);
        setDragOver(displayToSquare(ri, ci));
    }, [displayToSquare]);

    // dragleave also fires every time the pointer crosses into a child of the
    // square (the piece, the legal-move marker, the check gradient), so clearing
    // the highlight synchronously made it flicker while dragging. Defer it and let
    // the dragover on the next square cancel the timer.
    const handleDragLeave = useCallback(() => {
        clearTimeout(dragLeaveTimerRef.current);
        dragLeaveTimerRef.current = setTimeout(() => setDragOver(null), 0);
    }, []);

    const handleDrop = useCallback((e, ri, ci) => {
        e.preventDefault();
        clearTimeout(dragLeaveTimerRef.current);
        setDragOver(null);
        if (gameOver) return;
        const targetSquare = displayToSquare(ri, ci);
        if (dragging && legalMoves?.includes(targetSquare)) {
            onMove?.(dragging.square, targetSquare);
        }
        setDragging(null);
    }, [dragging, legalMoves, onMove, gameOver, displayToSquare]);

    const handleDragEnd = useCallback(() => {
        clearTimeout(dragLeaveTimerRef.current);
        setDragging(null);
        setDragOver(null);
    }, []);

    const squareAtPoint = useCallback((clientX, clientY) => {
        const el = document.elementFromPoint(clientX, clientY);
        return el?.closest?.("[data-square]")?.getAttribute("data-square") || null;
    }, []);

    // Touch equivalent of drag start: remember the source but do NOT hide the piece
    // yet, otherwise a plain tap would blank it out for the length of the gesture.
    // The drag is only "promoted" once the finger actually moves to another square,
    // which also leaves tap-to-select (onClick) working exactly as before.
    const handleTouchStart = useCallback((e, ri, ci) => {
        if (gameOver || !isPlayerTurn) return;
        const realRow = flipped ? 7 - ri : ri;
        const realCol = flipped ? 7 - ci : ci;
        const piece = board[realRow]?.[realCol];
        if (!piece || piece.color !== playerColor) return;
        touchSourceRef.current = { ri, ci, square: displayToSquare(ri, ci) };
    }, [board, flipped, playerColor, isPlayerTurn, gameOver, displayToSquare]);

    const handleTouchMove = useCallback((e) => {
        const t = e.touches?.[0];
        const source = touchSourceRef.current;
        if (!t || !source) return;
        const square = squareAtPoint(t.clientX, t.clientY);
        if (!square) return;
        if (square !== source.square) setDragging(source);
        setDragOver(square === source.square ? null : square);
    }, [squareAtPoint]);

    const handleTouchEnd = useCallback((e) => {
        const t = e.changedTouches?.[0];
        const source = touchSourceRef.current;
        touchSourceRef.current = null;
        const square = t ? squareAtPoint(t.clientX, t.clientY) : null;
        if (source && square && square !== source.square && legalMoves?.includes(square)) {
            onMove?.(source.square, square);
        }
        setDragging(null);
        setDragOver(null);
    }, [squareAtPoint, legalMoves, onMove]);

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
        try {
            const chess = new Chess(fen);
            if (chess.inCheck()) {
                return findKingSquare(chess.turn());
            }
        } catch {
            return null;
        }
        return null;
    }, [fen, findKingSquare]);

    const isPromotion = promotionPending;

    return (
        <div className="relative select-none">
            <style>{`
                @keyframes moveFlash {
                    0% { box-shadow: inset 0 0 0 3px rgba(255,255,0,0.8); }
                    50% { box-shadow: inset 0 0 0 3px rgba(255,255,0,0.4); }
                    100% { box-shadow: inset 0 0 0 3px rgba(255,255,0,0); }
                }
                .move-flash { animation: moveFlash 1.2s ease-out forwards; }
                @keyframes moveToast {
                    0% { opacity: 0; transform: translateY(6px); }
                    15% { opacity: 1; transform: translateY(0); }
                    80% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-6px); }
                }
                .move-toast { animation: moveToast 2s ease-in-out forwards; }
            `}</style>
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

                {/* `flex-1 min-w-0` is load-bearing, not cosmetic.

                    This element is a flex item of the `.flex` row above, and it
                    has no width of its own. Its only child is the 8x8 grid, which
                    asks for `width: 100%`. That percentage has to resolve
                    against a definite parent width — and here it did not, so the
                    chain became circular (grid 100% -> this div's width -> the
                    grid's max-content width) and collapsed to 0. `aspect-ratio: 1`
                    then made the height 0 too, and the user got a completely blank
                    page: all 64 squares and all 32 pieces were in the DOM, just
                    inside a 0x0 box.

                    The regression came from the piece size changing from a
                    definite `60`px to a percentage: that 60px was the only
                    definite length anywhere in the subtree, so it was the only
                    thing giving the board an intrinsic width. The sibling boards
                    (Checkers, Reversi) survive the same percentage technique
                    because they sit inside a `w-full max-w-[520px]` wrapper;
                    this one did not.

                    `flex-1` gives the box a real width from the flex parent (which
                    descends from a definite `w-full` / `lg:max-w-[700px]`), and
                    `min-w-0` stops the flex `min-width: auto` automatic minimum
                    from re-introducing a floor from the unsized inner <svg>. */}
                <div ref={boardRef} className="relative flex-1 min-w-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>
                    <div className="grid grid-cols-8 grid-rows-8" style={{ aspectRatio: "1", width: "100%" }}>
                        {displayBoard.map((row, ri) =>
                            row.map((piece, ci) => {
                                const square = displayToSquare(ri, ci);
                                const isLight = (ri + ci) % 2 === 0;
                                const isSelected = selectedSquare === square;
                                const isLegalMove = legalMoves?.includes(square);
                                const isLastMoveFrom = lastMove?.from === square;
                                const isLastMoveTo = lastMove?.to === square;
                                const isRecentMove = moveAnimation && isLastMoveTo;
                                const isDragOverTarget = dragOver === square;
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
                                        data-square={square}
                                        className={`relative flex items-center justify-center ${isRecentMove ? "move-flash" : ""}`}
                                        style={{
                                            backgroundColor: bgColor,
                                            cursor: "pointer",
                                        }}
                                        onClick={() => handleClick(ri, ci)}
                                        onDragOver={(e) => handleDragOver(e, ri, ci)}
                                        onDrop={(e) => handleDrop(e, ri, ci)}
                                        onDragLeave={handleDragLeave}
                                        onTouchStart={(e) => handleTouchStart(e, ri, ci)}
                                        onTouchMove={handleTouchMove}
                                        onTouchEnd={handleTouchEnd}
                                        onTouchCancel={handleTouchEnd}
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
                                                // The grid is fluid (aspectRatio 1), so a fixed 60px piece
                                                // under-filled wide cells and overflowed the cell at 320px
                                                // (~40px cells). ChessPiece renders its size straight into
                                                // style width/height, so a percentage fills the cell; the
                                                // wrapper has to fill the cell first for that % to resolve.
                                                className="w-full h-full z-20 transition-transform duration-75 ease-out"
                                                draggable={isPlayerTurn && piece.color === playerColor}
                                                onDragStart={(e) => handleDragStart(e, ri, ci)}
                                                onDragEnd={handleDragEnd}
                                                style={{ willChange: "transform" }}
                                            >
                                                <ChessPiece piece={piece} size="100%" />
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
            {moveAnimation && moveAnimation.notation && (
                <div className="absolute top-1 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                    <div className="move-toast px-2.5 py-1 bg-black/70 text-white text-xs font-mono font-bold rounded-md shadow-lg backdrop-blur-sm">
                        {moveAnimation.notation}
                    </div>
                </div>
            )}
        </div>
    );
}
