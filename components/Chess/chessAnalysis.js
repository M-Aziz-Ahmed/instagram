"use client";

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

function fenToBoard(fen) {
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
    return { board, turn: parts[1] };
}

function getPieceValue(type) {
    return PIECE_VALUES[type] || 0;
}

function evaluateBoard(fen) {
    const { board } = fenToBoard(fen);
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p) {
                const val = getPieceValue(p.type);
                score += p.color === "w" ? val : -val;
            }
        }
    }
    return score;
}

function applyMoveToFen(fen, from, to, promotion) {
    const { board } = fenToBoard(fen);
    const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
    const fromCol = FILES.indexOf(from[0]);
    const fromRow = RANKS.indexOf(from[1]);
    const toCol = FILES.indexOf(to[0]);
    const toRow = RANKS.indexOf(to[1]);
    if (fromRow < 0 || fromCol < 0 || toRow < 0 || toCol < 0) return null;

    const piece = board[fromRow][fromCol];
    if (!piece) return null;

    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = null;

    if (piece.type === "p" && (toRow === 0 || toRow === 7)) {
        board[toRow][toCol] = { type: promotion || "q", color: piece.color };
    }

    if (piece.type === "k" && Math.abs(fromCol - toCol) === 2) {
        if (toCol === 6) {
            board[toRow][5] = board[toRow][7];
            board[toRow][7] = null;
        } else if (toCol === 2) {
            board[toRow][3] = board[toRow][0];
            board[toRow][0] = null;
        }
    }

    if (piece.type === "p" && fromCol !== toCol && !board[toRow][toCol]) {
        board[fromRow][toCol] = null;
    }

    const newRows = board.map((row) => {
        let s = "";
        let empty = 0;
        for (const p of row) {
            if (p) {
                if (empty > 0) { s += empty; empty = 0; }
                s += p.color === "w" ? p.type.toUpperCase() : p.type;
            } else {
                empty++;
            }
        }
        if (empty > 0) s += empty;
        return s;
    });

    const nextTurn = fen.split(" ")[1] === "w" ? "b" : "w";
    return newRows.join("/") + ` ${nextTurn} - - 0 1`;
}

function getMaterialBalance(fen) {
    const { board } = fenToBoard(fen);
    let balance = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p) {
                const val = getPieceValue(p.type);
                balance += p.color === "w" ? val : -val;
            }
        }
    }
    return balance;
}

function isCheckmateInFen(fen) {
    const parts = fen.split(" ");
    return parts[0].toLowerCase().includes("k") === false;
}

function generatePseudoMoves(fen) {
    const { board, turn } = fenToBoard(fen);
    const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
    const moves = [];

    const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
    const canCapture = (r, c) => board[r][c] && board[r][c].color !== turn;
    const isEmpty = (r, c) => !board[r][c];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p || p.color !== turn) continue;
            const from = FILES[c] + RANKS[r];

            const addMove = (tr, tc) => {
                if (inBounds(tr, tc) && (isEmpty(tr, tc) || canCapture(tr, tc))) {
                    const to = FILES[tc] + RANKS[tr];
                    if (p.type === "p" && (tr === 0 || tr === 7)) {
                        ["q", "r", "b", "n"].forEach((promo) => {
                            moves.push({ from, to, promotion: promo });
                        });
                    } else {
                        moves.push({ from, to });
                    }
                }
            };

            const addSliding = (dr, dc) => {
                let nr = r + dr, nc = c + dc;
                while (inBounds(nr, nc)) {
                    if (isEmpty(nr, nc)) {
                        moves.push({ from, to: FILES[nc] + RANKS[nr] });
                    } else if (canCapture(nr, nc)) {
                        moves.push({ from, to: FILES[nc] + RANKS[nr] });
                        break;
                    } else break;
                    nr += dr; nc += dc;
                }
            };

            if (p.type === "p") {
                const dir = turn === "w" ? -1 : 1;
                const startRow = turn === "w" ? 6 : 1;
                if (inBounds(r + dir, c) && isEmpty(r + dir, c)) {
                    addMove(r + dir, c);
                    if (r === startRow && isEmpty(r + 2 * dir, c)) {
                        moves.push({ from, to: FILES[c] + RANKS[r + 2 * dir] });
                    }
                }
                if (inBounds(r + dir, c - 1) && canCapture(r + dir, c - 1)) addMove(r + dir, c - 1);
                if (inBounds(r + dir, c + 1) && canCapture(r + dir, c + 1)) addMove(r + dir, c + 1);
            } else if (p.type === "n") {
                [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => addMove(r + dr, c + dc));
            } else if (p.type === "b") {
                addSliding(-1, -1); addSliding(-1, 1); addSliding(1, -1); addSliding(1, 1);
            } else if (p.type === "r") {
                addSliding(-1, 0); addSliding(1, 0); addSliding(0, -1); addSliding(0, 1);
            } else if (p.type === "q") {
                addSliding(-1, -1); addSliding(-1, 1); addSliding(1, -1); addSliding(1, 1);
                addSliding(-1, 0); addSliding(1, 0); addSliding(0, -1); addSliding(0, 1);
            } else if (p.type === "k") {
                [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr, dc]) => addMove(r + dr, c + dc));
            }
        }
    }

    return moves;
}

function scoreMove(fen, move) {
    const newFen = applyMoveToFen(fen, move.from, move.to, move.promotion);
    if (!newFen) return -Infinity;
    const score = evaluateBoard(newFen);
    const material = getMaterialBalance(newFen);
    return score * (fen.split(" ")[1] === "w" ? 1 : -1) + material * 10;
}

function findBestMoves(fen) {
    const moves = generatePseudoMoves(fen);
    if (moves.length === 0) return [];

    const scored = moves.map((m) => ({ ...m, score: scoreMove(fen, m) }));
    scored.sort((a, b) => b.score - a.score);
    return scored;
}

function getCentipawnLoss(bestScore, moveScore) {
    return bestScore - moveScore;
}

export function classifyMove(fen, move, playerColor) {
    const turn = fen.split(" ")[1];
    if (turn !== playerColor) return null;

    const bestMoves = findBestMoves(fen);
    if (bestMoves.length === 0) return { label: "good", color: "#6b7280", description: "Only move available" };

    const bestScore = bestMoves[0].score;
    const moveScoreEntry = bestMoves.find(
        (m) => m.from === move.from && m.to === move.to && (m.promotion || "q") === (move.promotion || "q")
    );

    if (!moveScoreEntry) {
        return { label: "blunder", color: "#ef4444", description: "Missed the best continuation" };
    }

    const moveScore = moveScoreEntry.score;
    const cpLoss = getCentipawnLoss(bestScore, moveScore);
    const isTopMove = moveScoreEntry === bestMoves[0];
    const bestMoveIsCheckmate = bestScore > 9000;

    if (move.promotion && isTopMove) {
        return { label: "brilliant", color: "#f59e0b", description: "Perfect promotion!" };
    }

    if (bestMoveIsCheckmate && !isTopMove) {
        const checkmateMoves = bestMoves.filter((m) => m.score > 9000);
        const moveIsCheckmate = checkmateMoves.some((m) => m.from === move.from && m.to === move.to);
        if (!moveIsCheckmate && checkmateMoves.length > 0) {
            return { label: "miss", color: "#ef4444", description: "Checkmate was available!" };
        }
        if (moveIsCheckmate) {
            return { label: "excellent", color: "#22c55e", description: "Forced checkmate!" };
        }
    }

    if (isTopMove) {
        const isCapture = move.to && boardHasPiece(fen, move.to);
        if (isCapture) {
            return { label: "excellent", color: "#22c55e", description: "Best move - excellent capture!" };
        }
        if (moveScore > 300) {
            return { label: "brilliant", color: "#f59e0b", description: "Brilliant move!" };
        }
        return { label: "excellent", color: "#22c55e", description: "Best move!" };
    }

    if (cpLoss <= 50) {
        return { label: "excellent", color: "#22c55e", description: "Very close to the best move" };
    }
    if (cpLoss <= 100) {
        return { label: "good", color: "#6b7280", description: "A solid move" };
    }
    if (cpLoss <= 200) {
        return { label: "inaccuracy", color: "#f97316", description: "Could have been better" };
    }
    if (cpLoss <= 500) {
        return { label: "mistake", color: "#ef4444", description: "Not the best choice" };
    }
    return { label: "blunder", color: "#dc2626", description: "Serious mistake" };
}

function boardHasPiece(fen, square) {
    const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
    const col = FILES.indexOf(square[0]);
    const row = RANKS.indexOf(square[1]);
    const { board } = fenToBoard(fen);
    return board[row]?.[col] !== null;
}

export function analyseGameMoves(moves, playerColor) {
    if (!moves || moves.length === 0) return { moves: [], stats: {} };

    let currentFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const analysed = [];

    for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        const turn = currentFen.split(" ")[1];
        const classification = classifyMove(currentFen, m, turn);
        analysed.push({
            moveNumber: Math.floor(i / 2) + 1,
            color: turn,
            san: m.san,
            from: m.from,
            to: m.to,
            classification: classification || { label: "good", color: "#6b7280", description: "" },
        });
        const nextFen = applyMoveToFen(currentFen, m.from, m.to, m.promotion);
        if (nextFen) currentFen = nextFen;
    }

    const playerMoves = analysed.filter((m) => m.color === playerColor);

    const stats = {
        brilliant: playerMoves.filter((m) => m.classification.label === "brilliant").length,
        excellent: playerMoves.filter((m) => m.classification.label === "excellent").length,
        good: playerMoves.filter((m) => m.classification.label === "good").length,
        inaccuracy: playerMoves.filter((m) => m.classification.label === "inaccuracy").length,
        mistake: playerMoves.filter((m) => m.classification.label === "mistake").length,
        blunder: playerMoves.filter((m) => m.classification.label === "blunder").length,
        miss: playerMoves.filter((m) => m.classification.label === "miss").length,
        total: playerMoves.length,
    };

    return { moves: analysed, stats };
}

export function findTurningPoints(moves, playerColor) {
    if (!moves || moves.length < 4) return [];

    let currentFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const evals = [{ fen: currentFen, eval: 0, moveIndex: -1 }];

    for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        const nextFen = applyMoveToFen(currentFen, m.from, m.to, m.promotion);
        if (nextFen) {
            const evalScore = evaluateBoard(nextFen) * (nextFen.split(" ")[1] === "w" ? 1 : -1);
            evals.push({ fen: nextFen, eval: evalScore, moveIndex: i });
            currentFen = nextFen;
        }
    }

    const turningPoints = [];
    for (let i = 1; i < evals.length; i++) {
        const prevEval = evals[i - 1].eval;
        const currEval = evals[i].eval;
        const swing = Math.abs(currEval - prevEval);
        const moveIdx = evals[i].moveIndex;
        const move = moves[moveIdx];
        const isPlayerMove = move && ((moveIdx % 2 === 0 && playerColor === "w") || (moveIdx % 2 === 1 && playerColor === "b"));

        if (swing >= 200) {
            turningPoints.push({
                moveIndex: moveIdx,
                moveNumber: Math.floor(moveIdx / 2) + 1,
                color: moveIdx % 2 === 0 ? "w" : "b",
                san: move?.san || "",
                from: move?.from || "",
                to: move?.to || "",
                fenBefore: evals[i - 1].fen,
                fenAfter: evals[i].fen,
                evalBefore: prevEval,
                evalAfter: currEval,
                swing,
                isPlayerMove,
                isBlunder: (currEval - prevEval) * (moveIdx % 2 === 0 ? -1 : 1) < -200,
            });
        }
    }

    turningPoints.sort((a, b) => b.swing - a.swing);
    return turningPoints.slice(0, 5);
}

export function findBestMovesAtPosition(fen, count = 3) {
    const bestMoves = findBestMoves(fen);
    return bestMoves.slice(0, count).map((m) => {
        const newFen = applyMoveToFen(fen, m.from, m.to, m.promotion);
        return {
            from: m.from,
            to: m.to,
            promotion: m.promotion,
            score: m.score,
            evalAfter: newFen ? evaluateBoard(newFen) * (newFen.split(" ")[1] === "w" ? 1 : -1) : 0,
        };
    });
}

export function generateGameSummary(moves, playerColor, playerName, opponentName) {
    if (!moves || moves.length === 0) return null;

    const analysis = analyseGameMoves(moves, playerColor);
    const turningPoints = findTurningPoints(moves, playerColor);

    const playerMoves = analysis.moves.filter((m) => m.color === playerColor);
    const blunders = playerMoves.filter((m) => m.classification.label === "blunder" || m.classification.label === "miss");
    const brilliant = playerMoves.filter((m) => m.classification.label === "brilliant");
    const accuracy = analysis.stats.total > 0
        ? Math.round(((analysis.stats.brilliant + analysis.stats.excellent + analysis.stats.good) / analysis.stats.total) * 100)
        : 0;

    let biggestBlunder = null;
    if (blunders.length > 0) {
        const worstLoss = blunders.reduce((worst, m) => {
            const loss = m.classification.label === "blunder" ? 1000 : 500;
            return loss > worst.loss ? { move: m, loss } : worst;
        }, { move: null, loss: 0 });
        biggestBlunder = worstLoss.move;
    }

    let bestMove = null;
    if (brilliant.length > 0) {
        bestMove = brilliant[0];
    } else {
        const excellent = playerMoves.filter((m) => m.classification.label === "excellent");
        if (excellent.length > 0) bestMove = excellent[0];
    }

    const playerTurn = turningPoints.find((tp) => tp.isPlayerMove);
    const opponentTurn = turningPoints.find((tp) => !tp.isPlayerMove);

    const summary = [];
    if (accuracy >= 90) {
        summary.push(`${playerName} played an excellent game with ${accuracy}% accuracy.`);
    } else if (accuracy >= 70) {
        summary.push(`${playerName} played a solid game with ${accuracy}% accuracy.`);
    } else {
        summary.push(`${playerName} played with ${accuracy}% accuracy.`);
    }

    if (turningPoints.length > 0) {
        const tp = turningPoints[0];
        if (tp.isPlayerMove) {
            summary.push(`The turning point was move ${tp.moveNumber} (${tp.san}), where ${playerName} made a critical ${tp.isBlunder ? "blunder" : "move"} that shifted the evaluation significantly.`);
        } else {
            summary.push(`The turning point was move ${tp.moveNumber} (${tp.san}), when ${opponentName} made a critical ${tp.isBlunder ? "blunder" : "move"}.`);
        }
    }

    if (biggestBlunder) {
        summary.push(`The biggest mistake was ${biggestBlunder.san} on move ${biggestBlunder.moveNumber}.`);
    }

    return {
        accuracy,
        turningPoints,
        biggestBlunder,
        bestMove,
        stats: analysis.stats,
        summary: summary.join(" "),
        playerName,
        opponentName,
    };
}
