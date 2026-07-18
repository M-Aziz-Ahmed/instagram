"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useUser } from "@/context/UserContext";
import { io } from "socket.io-client";
import ChessBoard from "./ChessBoard";
import ChessTimer from "./ChessTimer";
import ChessMoveHistory from "./ChessMoveHistory";
import ChessChat from "./ChessChat";
import ChessReviewPanel from "./ChessReviewPanel";
import { playMoveSound, playCaptureSound, playCheckSound, playCheckmateSound, playCastleSound, playPromotionSound, playClickSound, setSoundEnabled } from "./chessSounds";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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

    const FILES = ["a","b","c","d","e","f","g","h"];
    const RANKS = ["8","7","6","5","4","3","2","1"];
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

function detectPromotion(fen, from, to, playerColor) {
    const board = parseFEN(fen).board;
    const FILES = ["a","b","c","d","e","f","g","h"];
    const RANKS = ["8","7","6","5","4","3","2","1"];
    const fromCol = FILES.indexOf(from[0]);
    const fromRow = RANKS.indexOf(from[1]);
    const piece = board[fromRow]?.[fromCol];
    if (!piece || piece.type !== "p") return false;
    const toRow = RANKS.indexOf(to[1]);
    if (playerColor === "w" && toRow === 0) return true;
    if (playerColor === "b" && toRow === 7) return true;
    return false;
}

export default function ChessGameClient({ gameId }) {
    const { user } = useUser();
    const socketRef = useRef(null);
    const [game, setGame] = useState(null);
    const [selectedSquare, setSelectedSquare] = useState(null);
    const [legalMoves, setLegalMoves] = useState([]);
    const [colorReady, setColorReady] = useState(false);
    const [isFlipped, setIsFlipped] = useState(false);
    const [lastMove, setLastMove] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [timers, setTimers] = useState({ white: 600, black: 600 });
    const [drawOffer, setDrawOffer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [soundOn, setSoundOn] = useState(true);
    const [promotionPending, setPromotionPending] = useState(null);
    const [pendingMove, setPendingMove] = useState(null);
    const [showGameOver, setShowGameOver] = useState(false);
    const [lastResultText, setLastResultText] = useState("");
    const [reviewIndex, setReviewIndex] = useState(null);
    const [mobileTab, setMobileTab] = useState("moves");
    const [moveAnimation, setMoveAnimation] = useState(null);
    const [aiThinking, setAiThinking] = useState(false);
    const timerRef = useRef(null);
    const gameRef = useRef(null);
    const reviewRef = useRef(null);

    gameRef.current = game;
    reviewRef.current = reviewIndex;

    const myColor = useMemo(() => {
        if (!game || !user?.username) return null;
        if (game.white.username === user.username) return "w";
        if (game.black.username === user.username) return "b";
        return null;
    }, [game, user]);

    const isMyTurn = game?.turn === myColor;
    const gameOver = game?.status && game.status !== "active" && game.status !== "waiting";
    const isReviewing = reviewIndex !== null;

    const fenHistory = useMemo(() => {
        if (!game?.moves || game.moves.length === 0) return [game?.fen || INITIAL_FEN];
        const history = [INITIAL_FEN];
        for (const move of game.moves) {
            if (move.fen) history.push(move.fen);
        }
        return history;
    }, [game?.moves, game?.fen]);

    const reviewFen = useMemo(() => {
        if (!isReviewing) return null;
        return fenHistory[reviewIndex] || INITIAL_FEN;
    }, [isReviewing, reviewIndex, fenHistory]);

    const reviewLastMove = useMemo(() => {
        if (!isReviewing || reviewIndex <= 0 || !game?.moves) return null;
        const moveIdx = reviewIndex - 1;
        if (moveIdx < game.moves.length) {
            return { from: game.moves[moveIdx].from, to: game.moves[moveIdx].to };
        }
        return null;
    }, [isReviewing, reviewIndex, game?.moves]);

    const reviewTurn = useMemo(() => {
        if (!reviewFen) return game?.turn;
        const parts = reviewFen.split(" ");
        return parts[1];
    }, [reviewFen, game?.turn]);

    const totalReviewPositions = fenHistory.length;
    const canGoBack = isReviewing && reviewIndex > 0;
    const canGoForward = isReviewing && reviewIndex < totalReviewPositions - 1;

    const toggleSound = () => {
        const next = !soundOn;
        setSoundOn(next);
        setSoundEnabled(next);
    };

    const exitReview = useCallback(() => {
        setReviewIndex(null);
    }, []);

    const goToStart = useCallback(() => {
        if (fenHistory.length > 0) setReviewIndex(0);
    }, [fenHistory]);

    const goBack = useCallback(() => {
        if (isReviewing && reviewIndex > 0) setReviewIndex(reviewIndex - 1);
    }, [isReviewing, reviewIndex]);

    const goForward = useCallback(() => {
        if (isReviewing && reviewIndex < fenHistory.length - 1) setReviewIndex(reviewIndex + 1);
    }, [isReviewing, reviewIndex, fenHistory]);

    const goToEnd = useCallback(() => {
        setReviewIndex(null);
    }, []);

    const goToMove = useCallback((moveIndex) => {
        setReviewIndex(moveIndex + 1);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                if (!isReviewing) {
                    if (fenHistory.length > 1) setReviewIndex(fenHistory.length - 2);
                } else if (reviewIndex > 0) {
                    setReviewIndex(reviewIndex - 1);
                }
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                if (isReviewing) {
                    if (reviewIndex < fenHistory.length - 1) {
                        setReviewIndex(reviewIndex + 1);
                    } else {
                        setReviewIndex(null);
                    }
                }
            } else if (e.key === "Home") {
                e.preventDefault();
                if (fenHistory.length > 0) setReviewIndex(0);
            } else if (e.key === "End") {
                e.preventDefault();
                setReviewIndex(null);
            } else if (e.key === "Escape") {
                setReviewIndex(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isReviewing, reviewIndex, fenHistory]);

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
                const isCastle = data.move.san?.includes("O-O") || data.move.san?.includes("0-0");
                const isPromotionMove = data.move.promotion;
                const isCheck = data.status === "active" && (data.fen?.includes(" K ") || data.fen?.includes(" k "));

                if (data.status === "checkmate") {
                    playCheckmateSound();
                } else if (isCastle) {
                    playCastleSound();
                } else if (isPromotionMove) {
                    playPromotionSound();
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
                setMoveAnimation({ from: data.move.from, to: data.move.to, notation: data.move.san, key: Date.now() });
                setTimeout(() => setMoveAnimation(null), 2000);
            }
            setSelectedSquare(null);
            setLegalMoves([]);
            setAiThinking(false);
            if (reviewRef.current !== null) setReviewIndex(null);
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
        if (myColor && !colorReady) {
            setIsFlipped(myColor === "b");
            setColorReady(true);
        }
    }, [myColor, colorReady]);

    useEffect(() => {
        if (!game || game.status !== "active") return;
        timerRef.current = setInterval(() => {
            const g = gameRef.current;
            if (!g || g.status !== "active") return;
            setTimers((prev) => {
                const next = { ...prev };
                if (g.turn === "w") {
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
    }, [game?.status, gameId]);

    useEffect(() => {
        if (!gameOver || !game || !user?.username) return;
        const result = getResultText();
        if (result !== lastResultText) {
            setLastResultText(result);
            setShowGameOver(true);

            const opponent = myColor === "w" ? game.black?.username : game.white?.username;
            const timeStr = game.timeControl
                ? `${Math.floor(game.timeControl.initial / 60)}min` + (game.timeControl.increment ? `|${game.timeControl.increment}` : "")
                : "";
            const gameStats = (() => {
                try {
                    const { analyseGameMoves } = require("./chessAnalysis");
                    return analyseGameMoves(game.moves, myColor).stats;
                } catch { return {}; }
            })();

            fetch("/api/chess/history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    gameId,
                    opponent: opponent || "Computer",
                    playerColor: myColor,
                    result: game.result,
                    resultReason: game.resultReason || "",
                    mode: game.mode || "multiplayer",
                    moves: game.moves?.length ? Math.ceil(game.moves.length / 2) : 0,
                    timeControl: timeStr,
                    gameStats,
                }),
            }).catch(() => {});
        }
    }, [game?.status, game?.winner, game?.result, game?.resultReason]);

    const handleMove = useCallback((from, to) => {
        if (!socketRef.current) return;
        if (detectPromotion(game?.fen, from, to, myColor)) {
            setPromotionPending(myColor);
            setPendingMove({ from, to });
            return;
        }
        socketRef.current.emit("chess:make-move", { gameId, from, to, promotion: "q" });
        setSelectedSquare(null);
        setLegalMoves([]);
        if (game?.mode === "ai") setAiThinking(true);
    }, [gameId, game?.fen, game?.mode, myColor]);

    const handlePromotionChoice = useCallback((pieceType) => {
        if (!pendingMove || !socketRef.current) return;
        socketRef.current.emit("chess:make-move", {
            gameId,
            from: pendingMove.from,
            to: pendingMove.to,
            promotion: pieceType,
        });
        setPromotionPending(null);
        setPendingMove(null);
        setSelectedSquare(null);
        setLegalMoves([]);
    }, [gameId, pendingMove]);

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
            playClickSound();
            setSelectedSquare(square);
            setLegalMoves(getLegalMovesFromFEN(game.fen, square));
        } else if (selectedSquare) {
            if (legalMoves.includes(square)) {
                handleMove(selectedSquare, square);
            } else if (clickedPiece && clickedPiece.color === myColor) {
                playClickSound();
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

    const getResultIcon = () => {
        if (!game) return null;
        const { status, winner } = game;
        if (status === "checkmate" || status === "resigned" || status === "timeout") {
            if (winner === user?.username) return "\uD83C\uDFC6";
            return "\uD83D\uDE1E";
        }
        return "\uD83E\uDD1D";
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs text-gray-400">Loading game...</p>
                </div>
            </div>
        );
    }

    if (error && !game) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">{error}</p>
                    <a href="/chess" className="text-xs text-blue-500 hover:underline">Back to lobby</a>
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
    const isAIMode = game.mode === "ai";
    const hasMoveReview = game.moves && game.moves.length > 0;

    return (
        <div className="w-full max-w-[2000px] mx-auto">
            <div className="flex flex-col lg:flex-row gap-2 lg:gap-4">
                {/* Board column */}
                <div className="w-full lg:flex-1 lg:max-w-[600px] xl:max-w-[700px] mx-auto lg:mx-0">
                    {/* Top status bar - compact */}
                    <div className="flex items-center justify-between mb-1 px-1">
                        <div className="flex items-center gap-1.5">
                            {isAIMode && (
                                <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                                    vs AI
                                </span>
                            )}
                            <span className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider rounded-full ${
                                game.status === "active"
                                    ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                                    : game.status === "waiting"
                                    ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
                                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                            }`}>
                                {game.status === "active" ? "Live" : game.status === "waiting" ? "Waiting" : "Finished"}
                            </span>
                        </div>
                        <button
                            onClick={toggleSound}
                            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            title={soundOn ? "Mute" : "Unmute"}
                        >
                            {soundOn ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                </svg>
                            ) : (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                </svg>
                            )}
                        </button>
                    </div>

                    <ChessTimer
                        time={timers[topColor]}
                        isActive={game.turn === topColor}
                        isLow={timers[topColor] < 30}
                        label={topPlayer?.username || "Waiting..."}
                        player={topPlayer}
                    />

                    <div className="my-1 sm:my-2">
                        <ChessBoard
                            fen={isReviewing ? reviewFen : game.fen}
                            turn={isReviewing ? reviewTurn : game.turn}
                            onMove={isReviewing ? undefined : handleMove}
                            selectedSquare={isReviewing ? null : selectedSquare}
                            onSquareClick={isReviewing ? undefined : handleSquareClick}
                            lastMove={isReviewing ? reviewLastMove : lastMove}
                            legalMoves={isReviewing ? [] : legalMoves}
                            playerColor={myColor}
                            isFlipped={isFlipped}
                            onFlip={() => setIsFlipped(!isFlipped)}
                            status={game.status}
                            promotionPending={promotionPending}
                            onPromotionChoice={handlePromotionChoice}
                            moveAnimation={isReviewing ? null : moveAnimation}
                        />
                    </div>

                    <ChessTimer
                        time={timers[bottomColor]}
                        isActive={game.turn === bottomColor}
                        isLow={timers[bottomColor] < 30}
                        label={bottomPlayer?.username || "Waiting..."}
                        player={bottomPlayer}
                    />

                    {/* Review bar - compact on mobile */}
                    {hasMoveReview && (
                        <div className="flex items-center justify-center gap-0.5 sm:gap-1 mt-1 sm:mt-2 px-1 sm:px-2 py-1 sm:py-1.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg sm:rounded-xl">
                            <button
                                onClick={goToStart}
                                disabled={!isReviewing && fenHistory.length <= 1}
                                className="p-1 sm:p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                title="Start"
                            >
                                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                                </svg>
                            </button>
                            <button
                                onClick={goBack}
                                disabled={!canGoBack}
                                className="p-1 sm:p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                title="Back"
                            >
                                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>

                            <div className="px-2 sm:px-3 text-[10px] sm:text-xs font-mono font-medium text-gray-600 dark:text-gray-300 min-w-[40px] sm:min-w-[60px] text-center select-none">
                                {isReviewing ? (
                                    <span>
                                        <span className="text-gray-400 dark:text-gray-500">
                                            {reviewIndex > 0 ? Math.ceil(reviewIndex / 2) : "Start"}
                                        </span>
                                        <span className="text-gray-300 dark:text-gray-600 mx-0.5">/</span>
                                        <span>{Math.ceil((totalReviewPositions - 1) / 2)}</span>
                                    </span>
                                ) : (
                                    <span className="text-green-600 dark:text-green-400">Live</span>
                                )}
                            </div>

                            <button
                                onClick={goForward}
                                disabled={!canGoForward}
                                className="p-1 sm:p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                title="Forward"
                            >
                                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                            <button
                                onClick={goToEnd}
                                disabled={!isReviewing}
                                className="p-1 sm:p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                title="End"
                            >
                                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                </svg>
                            </button>

                            {isReviewing && (
                                <button
                                    onClick={exitReview}
                                    className="ml-0.5 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-blue-500 hover:text-blue-600 bg-blue-50 dark:bg-blue-900/20 rounded-md transition-colors"
                                >
                                    Live
                                </button>
                            )}
                        </div>
                    )}

                    {/* Inline status + actions */}
                    <div className="flex items-center justify-between mt-1 sm:mt-2 px-1">
                        <div className="flex items-center gap-1">
                            {aiThinking && isAIMode && !gameOver && (
                                <div className="flex items-center gap-1.5">
                                    <div className="flex gap-0.5">
                                        <div className="w-1 h-1 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                        <div className="w-1 h-1 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                        <div className="w-1 h-1 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                    </div>
                                    <span className="text-[10px] sm:text-xs text-purple-600 dark:text-purple-400 font-semibold">AI is thinking...</span>
                                </div>
                            )}
                            {isMyTurn && !gameOver && game.status === "active" && !aiThinking && (
                                <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                    <span className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 font-semibold">Your turn</span>
                                </div>
                            )}
                            {game.status === "waiting" && (
                                <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                                    <span className="text-[10px] sm:text-xs text-blue-500 font-medium">Waiting for opponent</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-0.5">
                            {game.status === "active" && myColor && (
                                <>
                                    <button onClick={handleResign} className="px-2 py-1 text-[10px] sm:text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors">
                                        Resign
                                    </button>
                                    <span className="text-gray-300 dark:text-gray-700 text-xs">|</span>
                                    <button onClick={handleOfferDraw} className="px-2 py-1 text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors">
                                        Draw
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Draw offer banner */}
                    {drawOffer && drawOffer !== user?.username && (
                        <div className="mt-1 sm:mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center border border-yellow-200 dark:border-yellow-800/50">
                            <p className="text-[10px] sm:text-xs font-medium text-yellow-700 dark:text-yellow-300 mb-1.5">{drawOffer} offers a draw</p>
                            <div className="flex items-center justify-center gap-2">
                                <button onClick={handleAcceptDraw} className="px-3 py-1 text-[10px] sm:text-xs font-semibold text-white bg-green-500 rounded-md hover:bg-green-600 transition-colors">Accept</button>
                                <button onClick={handleDeclineDraw} className="px-3 py-1 text-[10px] sm:text-xs font-semibold text-white bg-gray-500 rounded-md hover:bg-gray-600 transition-colors">Decline</button>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mt-1 p-1.5 bg-red-50 dark:bg-red-900/20 rounded-md text-center">
                            <p className="text-[10px] sm:text-xs text-red-500">{error}</p>
                        </div>
                    )}
                </div>

                {/* Side panel - desktop: sidebar, mobile: tabbed panel */}
                <div className="w-full lg:w-64 xl:w-72 shrink-0">
                    {/* Mobile tab header */}
                    <div className="flex lg:hidden border-b border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => setMobileTab("moves")}
                            className={`flex-1 py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wide transition-colors ${
                                mobileTab === "moves"
                                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                                    : "text-gray-400 dark:text-gray-500"
                            }`}
                        >
                            Moves {game.moves?.length > 0 && <span className="text-gray-400 font-normal">({Math.ceil(game.moves.length / 2)})</span>}
                        </button>
                        <button
                            onClick={() => setMobileTab("chat")}
                            className={`flex-1 py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wide transition-colors ${
                                mobileTab === "chat"
                                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                                    : "text-gray-400 dark:text-gray-500"
                            }`}
                        >
                            Chat {chatMessages.length > 0 && <span className="text-gray-400 font-normal">({chatMessages.length})</span>}
                        </button>
                    </div>

                    {/* Desktop: stacked panels / Mobile: tab content */}
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-none lg:rounded-xl overflow-hidden shadow-sm">
                        {/* Mobile: show active tab */}
                        <div className="lg:hidden">
                            {mobileTab === "moves" ? (
                                <div className="h-[250px] sm:h-[300px]">
                                    <ChessMoveHistory
                                        moves={game.moves || []}
                                        currentMoveIndex={isReviewing ? reviewIndex - 1 : -1}
                                        onMoveClick={goToMove}
                                        orientation={myColor}
                                    />
                                </div>
                            ) : (
                                <div className="h-[250px] sm:h-[300px]">
                                    <ChessChat
                                        chat={chatMessages}
                                        onSendMessage={handleSendChat}
                                        username={user?.username}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Desktop: show both stacked */}
                        <div className="hidden lg:block">
                            <div className="h-64 xl:h-72 border-b border-gray-200 dark:border-gray-700">
                                <ChessMoveHistory
                                    moves={game.moves || []}
                                    currentMoveIndex={isReviewing ? reviewIndex - 1 : -1}
                                    onMoveClick={goToMove}
                                    orientation={myColor}
                                />
                            </div>
                            <div className="h-64 xl:h-72">
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

            {/* Game over modal */}
            {showGameOver && gameOver && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-700 animate-in overflow-y-auto max-h-[95vh]">
                        <div className="text-center mb-3">
                            <div className="text-4xl sm:text-5xl mb-2">{getResultIcon()}</div>
                            <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-1">{getResultText()}</h2>
                            {game.moves && (
                                <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500">{Math.ceil(game.moves.length / 2)} moves played</p>
                            )}
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
                            <ChessReviewPanel
                                moves={game.moves || []}
                                playerColor={myColor}
                                playerName={me?.username || user?.username || "Player"}
                                opponentName={opponent?.username || "Opponent"}
                                result={game.result}
                                resultReason={game.resultReason}
                            />
                        </div>

                        <div className="flex flex-col gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                            <a href="/chess" className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors shadow-md text-center text-sm">
                                Back to Lobby
                            </a>
                            <button
                                onClick={() => setShowGameOver(false)}
                                className="px-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                            >
                                Stay & Review
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
