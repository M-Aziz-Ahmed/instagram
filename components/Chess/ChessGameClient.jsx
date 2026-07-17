"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useUser } from "@/context/UserContext";
import { io } from "socket.io-client";
import ChessBoard from "./ChessBoard";
import ChessTimer from "./ChessTimer";
import ChessMoveHistory from "./ChessMoveHistory";
import ChessChat from "./ChessChat";
import useStockfish from "./useStockfish";
import { playMoveSound, playCaptureSound, playCheckSound, playCheckmateSound, playGameStartSound } from "./chessSounds";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

function parseFEN(fen) {
    if (!fen) return { board: [], turn: "w", castling: "", enPassant: "" };
    const parts = fen.split(" ");
    const rows = parts[0].split("/");
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
    return { board, turn: parts[1], castling: parts[2], enPassant: parts[3] };
}

function getLegalMovesFromFEN(fen, square) {
    if (!fen || !square) return [];
    const parts = fen.split(" ");
    const activeColor = parts[1];
    const castling = parts[2];
    const enPassant = parts[3];

    const board = [];
    const rows = parts[0].split("/");
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

    const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
    const col = FILES.indexOf(square[0]);
    const row = RANKS.indexOf(square[1]);
    const piece = board[row]?.[col];
    if (!piece || piece.color !== activeColor) return [];

    const moves = [];
    const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
    const canCapture = (r, c) => board[r][c] && board[r][c].color !== activeColor;
    const isEmpty = (r, c) => !board[r][c];

    const addMove = (r, c) => {
        if (inBounds(r, c) && (isEmpty(r, c) || canCapture(r, c))) {
            moves.push(FILES[c] + RANKS[r]);
        }
    };

    const addSliding = (dr, dc) => {
        let r = row + dr, c = col + dc;
        while (inBounds(r, c)) {
            if (isEmpty(r, c)) {
                moves.push(FILES[c] + RANKS[r]);
            } else if (canCapture(r, c)) {
                moves.push(FILES[c] + RANKS[r]);
                break;
            } else break;
            r += dr; c += dc;
        }
    };

    if (piece.type === "p") {
        const dir = activeColor === "w" ? -1 : 1;
        const startRow = activeColor === "w" ? 6 : 1;
        if (inBounds(row + dir, col) && isEmpty(row + dir, col)) {
            moves.push(FILES[col] + RANKS[row + dir]);
            if (row === startRow && isEmpty(row + 2 * dir, col)) {
                moves.push(FILES[col] + RANKS[row + 2 * dir]);
            }
        }
        if (inBounds(row + dir, col - 1) && canCapture(row + dir, col - 1)) {
            moves.push(FILES[col - 1] + RANKS[row + dir]);
        }
        if (inBounds(row + dir, col + 1) && canCapture(row + dir, col + 1)) {
            moves.push(FILES[col + 1] + RANKS[row + dir]);
        }
        if (enPassant !== "-") {
            const epCol = FILES.indexOf(enPassant[0]);
            const epRow = RANKS.indexOf(enPassant[1]);
            if (epRow === row + dir && Math.abs(epCol - col) === 1) {
                moves.push(FILES[epCol] + RANKS[epRow]);
            }
        }
    } else if (piece.type === "n") {
        const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of knightMoves) addMove(row + dr, col + dc);
    } else if (piece.type === "b") {
        addSliding(-1, -1); addSliding(-1, 1); addSliding(1, -1); addSliding(1, 1);
    } else if (piece.type === "r") {
        addSliding(-1, 0); addSliding(1, 0); addSliding(0, -1); addSliding(0, 1);
    } else if (piece.type === "q") {
        addSliding(-1, -1); addSliding(-1, 1); addSliding(1, -1); addSliding(1, 1);
        addSliding(-1, 0); addSliding(1, 0); addSliding(0, -1); addSliding(0, 1);
    } else if (piece.type === "k") {
        const kingMoves = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (const [dr, dc] of kingMoves) addMove(row + dr, col + dc);
        if (square === (activeColor === "w" ? "e1" : "e8")) {
            const baseRow = activeColor === "w" ? 7 : 0;
            if (castling.includes(activeColor === "w" ? "K" : "k") && isEmpty(baseRow, 5) && isEmpty(baseRow, 6)) {
                moves.push("g" + RANKS[baseRow]);
            }
            if (castling.includes(activeColor === "w" ? "Q" : "q") && isEmpty(baseRow, 3) && isEmpty(baseRow, 2) && isEmpty(baseRow, 1)) {
                moves.push("c" + RANKS[baseRow]);
            }
        }
    }

    return moves;
}

export default function ChessGameClient({ gameId }) {
    const { user } = useUser();
    const socketRef = useRef(null);
    const [game, setGame] = useState(null);
    const [selectedSquare, setSelectedSquare] = useState(null);
    const [legalMoves, setLegalMoves] = useState([]);
    const [isFlipped, setIsFlipped] = useState(false);
    const [lastMove, setLastMove] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [timers, setTimers] = useState({ white: 600, black: 600 });
    const [drawOffer, setDrawOffer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const timerRef = useRef(null);
    const { ready: stockfishReady, evaluating, getBestMove } = useStockfish(15);

    const myColor = useMemo(() => {
        if (!game || !user?.username) return null;
        if (game.white.username === user.username) return "w";
        if (game.black.username === user.username) return "b";
        return null;
    }, [game, user]);

    const isMyTurn = game?.turn === myColor;
    const gameOver = game?.status && game.status !== "active" && game.status !== "waiting";

    useEffect(() => {
        if (!LIVE_SERVER || !user?.username) return;
        const s = io(LIVE_SERVER, {
            query: { username: user.username },
            transports: ["websocket", "polling"],
            reconnectionAttempts: 10,
        });
        socketRef.current = s;

        s.emit("chess:join-game", { gameId });

        s.on("chess:move", (data) => {
            if (data.move) {
                const isCapture = data.move.flags?.includes("c") || data.move.captured;
                const isCheck = data.status === "active" && (data.fen?.includes(" K ") || data.fen?.includes(" k "));
                if (data.status === "checkmate") {
                    playCheckmateSound();
                } else if (isCheck) {
                    playCheckSound();
                } else if (isCapture) {
                    playCaptureSound();
                } else {
                    playMoveSound();
                }
            }
            setGame((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    fen: data.fen,
                    turn: data.turn,
                    status: data.status,
                    result: data.result,
                    resultReason: data.resultReason,
                    winner: data.winner,
                    timers: data.timers,
                    moves: data.moves,
                    pgn: data.pgn,
                };
            });
            setTimers(data.timers);
            if (data.move) {
                setLastMove({ from: data.move.from, to: data.move.to });
            }
            setSelectedSquare(null);
            setLegalMoves([]);
        });

        s.on("chess:chat", (msg) => {
            setChatMessages((prev) => [...prev, msg]);
        });

        s.on("chess:game-over", (data) => {
            setGame((prev) => prev ? { ...prev, status: data.status, result: data.result, resultReason: data.resultReason, winner: data.winner } : prev);
        });

        s.on("chess:draw-offer", ({ from }) => {
            setDrawOffer(from);
        });

        s.on("chess:draw-declined", () => {
            setDrawOffer(null);
        });

        s.on("chess:time-sync", ({ timers: t }) => {
            setTimers(t);
        });

        s.on("chess:error", ({ message }) => {
            setError(message);
            setTimeout(() => setError(null), 3000);
        });

        return () => {
            s.emit("chess:leave-game", { gameId });
            s.disconnect();
        };
    }, [gameId, user?.username]);

    useEffect(() => {
        async function fetchGame() {
            try {
                const res = await fetch(`${LIVE_SERVER}/api/chess/games/${gameId}`);
                if (res.ok) {
                    const data = await res.json();
                    setGame(data.game);
                    setTimers(data.game.timers);
                    setChatMessages(data.game.chat || []);
                    if (data.game.moves?.length > 0) {
                        const last = data.game.moves[data.game.moves.length - 1];
                        setLastMove({ from: last.from, to: last.to });
                    }
                } else {
                    setError("Game not found");
                }
            } catch (e) {
                setError("Failed to load game");
            }
            setLoading(false);
        }
        fetchGame();
    }, [gameId]);

    useEffect(() => {
        if (game && !isFlipped && myColor === "b") {
            setIsFlipped(true);
        }
    }, [game, myColor]);

    useEffect(() => {
        timerRef.current = setInterval(() => {
            if (!game || game.status !== "active") return;
            setTimers((prev) => {
                const next = { ...prev };
                if (game.turn === "w") {
                    next.white = Math.max(0, next.white - 1);
                } else {
                    next.black = Math.max(0, next.black - 1);
                }
                if (next.white <= 0 || next.black <= 0) {
                    socketRef.current?.emit("chess:time-sync", { gameId });
                }
                return next;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [game?.status, game?.turn, gameId]);

    useEffect(() => {
        if (!game || game.status !== "active" || game.mode !== "ai") return;
        if (game.turn !== "b") return;
        if (!stockfishReady || evaluating) return;

        const timer = setTimeout(() => {
            getBestMove(game.fen, (move) => {
                if (move && move.length >= 4) {
                    const from = move.substring(0, 2);
                    const to = move.substring(2, 4);
                    socketRef.current?.emit("chess:make-move", {
                        gameId,
                        from,
                        to,
                        promotion: move.length > 4 ? move[4] : "q",
                    });
                }
            }, game.aiDifficulty >= 16 ? 18 : game.aiDifficulty >= 12 ? 15 : game.aiDifficulty >= 8 ? 12 : 8);
        }, 500);

        return () => clearTimeout(timer);
    }, [game?.turn, game?.status, game?.mode, game?.fen, stockfishReady, evaluating, gameId]);

    const handleMove = useCallback((from, to) => {
        if (!socketRef.current) return;
        socketRef.current.emit("chess:make-move", { gameId, from, to, promotion: "q" });
        setSelectedSquare(null);
        setLegalMoves([]);
    }, [gameId]);

    const handleSquareClick = useCallback((square) => {
        if (gameOver || !isMyTurn) return;
        if (!game?.fen) return;

        const boardData = parseFEN(game.fen).board;
        const FILES = ["a","b","c","d","e","f","g","h"];
        const RANKS = ["8","7","6","5","4","3","2","1"];
        const col = FILES.indexOf(square[0]);
        const row = RANKS.indexOf(square[1]);
        if (row < 0 || col < 0) return;
        const clickedPiece = boardData[row]?.[col];

        if (selectedSquare === square) {
            setSelectedSquare(null);
            setLegalMoves([]);
            return;
        }

        if (clickedPiece && clickedPiece.color === myColor) {
            setSelectedSquare(square);
            setLegalMoves(getLegalMovesFromFEN(game.fen, square));
        } else if (selectedSquare) {
            if (legalMoves.includes(square)) {
                handleMove(selectedSquare, square);
            } else if (clickedPiece && clickedPiece.color === myColor) {
                setSelectedSquare(square);
                setLegalMoves(getLegalMovesFromFEN(game.fen, square));
            } else {
                setSelectedSquare(null);
                setLegalMoves([]);
            }
        }
    }, [game, selectedSquare, legalMoves, isMyTurn, gameOver, myColor, handleMove]);

    const handleSendChat = useCallback((text) => {
        if (!socketRef.current || !user) return;
        socketRef.current.emit("chess:chat", {
            gameId,
            text,
            color: user.avatarColor || "#3b82f6",
            avatarUrl: user.avatarUrl || "",
        });
    }, [gameId, user]);

    const handleResign = () => {
        if (!confirm("Are you sure you want to resign?")) return;
        socketRef.current?.emit("chess:resign", { gameId });
    };

    const handleOfferDraw = () => {
        socketRef.current?.emit("chess:offer-draw", { gameId });
    };

    const handleAcceptDraw = () => {
        socketRef.current?.emit("chess:accept-draw", { gameId });
        setDrawOffer(null);
    };

    const handleDeclineDraw = () => {
        socketRef.current?.emit("chess:decline-draw", { gameId });
        setDrawOffer(null);
    };

    const getResultText = () => {
        if (!gameOver) return null;
        const { status, result, resultReason, winner } = game;
        if (status === "resigned") return `${winner} won by resignation`;
        if (status === "timeout") return `${winner} won on time`;
        if (status === "checkmate") return `Checkmate! ${winner} wins`;
        if (status === "stalemate") return "Stalemate - Draw";
        if (status === "draw") return `Draw - ${resultReason || "Agreement"}`;
        return `Game over: ${result}`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error && !game) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <p className="text-red-500 mb-2">{error}</p>
                    <a href="/chess" className="text-blue-500 hover:underline text-sm">Back to lobby</a>
                </div>
            </div>
        );
    }

    if (!game) return null;

    const opponent = myColor === "w" ? game.black : game.white;
    const me = myColor === "w" ? game.white : game.black;
    const topPlayer = isFlipped ? me : opponent;
    const bottomPlayer = isFlipped ? opponent : me;
    const topColor = isFlipped ? myColor : (myColor === "w" ? "b" : "w");
    const bottomColor = isFlipped ? (myColor === "w" ? "b" : "w") : myColor;

    return (
        <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 max-w-[560px] mx-auto w-full">
                    <ChessTimer
                        time={timers[topColor]}
                        isActive={game.turn === topColor}
                        isLow={timers[topColor] < 30}
                        label={topPlayer?.username || "Waiting..."}
                        player={topPlayer}
                    />

                    <div className="my-2">
                        <ChessBoard
                            fen={game.fen}
                            turn={game.turn}
                            onMove={handleMove}
                            selectedSquare={selectedSquare}
                            onSquareClick={handleSquareClick}
                            lastMove={lastMove}
                            legalMoves={legalMoves}
                            playerColor={myColor}
                            isFlipped={isFlipped}
                            onFlip={() => setIsFlipped(!isFlipped)}
                            status={game.status}
                            orientation={myColor}
                        />
                    </div>

                    <ChessTimer
                        time={timers[bottomColor]}
                        isActive={game.turn === bottomColor}
                        isLow={timers[bottomColor] < 30}
                        label={bottomPlayer?.username || "Waiting..."}
                        player={bottomPlayer}
                    />

                    {game.status === "waiting" && (
                        <div className="mt-3 text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Waiting for opponent...</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Share game link or wait for someone to join</p>
                        </div>
                    )}

                    {gameOver && (
                        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">{getResultText()}</p>
                            <a href="/chess" className="text-xs text-blue-500 hover:underline mt-1 inline-block">Back to lobby</a>
                        </div>
                    )}

                    {error && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-center">
                            <p className="text-xs text-red-500">{error}</p>
                        </div>
                    )}

                    {isMyTurn && !gameOver && game.status === "active" && (
                        <div className="mt-2 flex items-center justify-center gap-2">
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium animate-pulse">Your turn</span>
                        </div>
                    )}

                    <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
                        {game.status === "active" && myColor && (
                            <>
                                <button onClick={handleResign} className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                                    Resign
                                </button>
                                <button onClick={handleOfferDraw} className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
                                    Offer Draw
                                </button>
                            </>
                        )}
                    </div>

                    {drawOffer && drawOffer !== user?.username && (
                        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center">
                            <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">{drawOffer} offers a draw</p>
                            <div className="flex items-center justify-center gap-2">
                                <button onClick={handleAcceptDraw} className="px-3 py-1 text-xs font-medium text-white bg-green-500 rounded hover:bg-green-600 transition-colors">
                                    Accept
                                </button>
                                <button onClick={handleDeclineDraw} className="px-3 py-1 text-xs font-medium text-white bg-gray-500 rounded hover:bg-gray-600 transition-colors">
                                    Decline
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-full lg:w-72 shrink-0">
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                        <div className="h-64 lg:h-80 border-b border-gray-200 dark:border-gray-700">
                            <ChessMoveHistory
                                moves={game.moves || []}
                                currentMoveIndex={-1}
                                orientation={myColor}
                            />
                        </div>
                        <div className="h-64 lg:h-80">
                            <ChessChat
                                chat={chatMessages}
                                onSendMessage={handleSendChat}
                                username={user?.username}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
