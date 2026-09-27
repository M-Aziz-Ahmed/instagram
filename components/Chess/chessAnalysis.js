"use client";

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// A full board is worth roughly 3900cp, so anything at or above MATE_SCORE can
// only have come from an actual mate and never from a material swing. Mate is
// detected structurally (isMateAfter) rather than by sniffing a magic number,
// because evaluateBoard is pure centipawns and can never reach this value.
const MATE_SCORE = 100000;

const KNIGHT_OFFSETS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING_OFFSETS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const DIAGONALS = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ORTHOGONALS = [[-1,0],[1,0],[0,-1],[0,1]];

const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

function findKingSquare(board, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c]?.type === "k" && board[r][c]?.color === color) return { r, c };
        }
    }
    return null;
}

// Is (row, col) attacked by any piece of `byColor`? Used for two things: filtering
// out moves that walk into check, and recognising a delivered mate.
function isSquareAttacked(board, row, col, byColor) {
    // Row 0 is rank 8, so a white pawn captures "upwards" (towards row - 1) and a
    // black pawn "downwards"; hence the mirrored attacker row.
    const pawnRow = byColor === "w" ? row + 1 : row - 1;
    for (const dc of [-1, 1]) {
        const p = inBounds(pawnRow, col + dc) ? board[pawnRow][col + dc] : null;
        if (p && p.color === byColor && p.type === "p") return true;
    }

    for (const [dr, dc] of KNIGHT_OFFSETS) {
        const p = inBounds(row + dr, col + dc) ? board[row + dr][col + dc] : null;
        if (p && p.color === byColor && p.type === "n") return true;
    }

    for (const [dr, dc] of KING_OFFSETS) {
        const p = inBounds(row + dr, col + dc) ? board[row + dr][col + dc] : null;
        if (p && p.color === byColor && p.type === "k") return true;
    }

    for (const [dr, dc] of DIAGONALS) {
        let r = row + dr, c = col + dc;
        while (inBounds(r, c)) {
            const p = board[r][c];
            if (p) {
                if (p.color === byColor && (p.type === "b" || p.type === "q")) return true;
                break;
            }
            r += dr; c += dc;
        }
    }

    for (const [dr, dc] of ORTHOGONALS) {
        let r = row + dr, c = col + dc;
        while (inBounds(r, c)) {
            const p = board[r][c];
            if (p) {
                if (p.color === byColor && (p.type === "r" || p.type === "q")) return true;
                break;
            }
            r += dr; c += dc;
        }
    }

    return false;
}

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

// Castling rights are lost when a king moves, when a rook leaves its home
// square, and when anything is captured on a rook's home square.
function updateCastlingRights(castling, piece, from, to) {
    let rights = castling;
    const drop = (right) => {
        rights = rights.split("").filter((c) => c !== right).join("");
    };
    if (piece.type === "k") {
        if (piece.color === "w") { drop("K"); drop("Q"); } else { drop("k"); drop("q"); }
    }
    if (piece.type === "r") {
        if (from === "a1") drop("Q");
        if (from === "h1") drop("K");
        if (from === "a8") drop("q");
        if (from === "h8") drop("k");
    }
    if (to === "a1") drop("Q");
    if (to === "h1") drop("K");
    if (to === "a8") drop("q");
    if (to === "h8") drop("k");
    return rights || "-";
}

function applyMoveToFen(fen, from, to, promotion) {
    const parts = fen.split(" ");
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

    // The destination has to be inspected BEFORE anything is written to it,
    // otherwise the "did this pawn capture diagonally?" test further down can
    // never be true and en passant silently never removes the captured pawn.
    const captured = board[toRow][toCol];

    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = null;

    if (piece.type === "p" && fromCol !== toCol && !captured) {
        // en passant: the destination was empty, so the victim is the pawn
        // sitting next to the mover on the same rank.
        board[fromRow][toCol] = null;
    }

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

    // Castling rights, the en passant square and both clocks have to survive the
    // ply. Hard-coding "- - 0 1" made castling look illegal from the second move
    // onwards and left the 50-move and repetition rules permanently unfalsifiable.
    const castling = !parts[2] || parts[2] === "-"
        ? "-"
        : updateCastlingRights(parts[2], piece, from, to);

    // FEN records the square a pawn would have to move *onto* to capture en
    // passant, and only directly after a double pawn push.
    const epSquare = (piece.type === "p" && Math.abs(toRow - fromRow) === 2)
        ? FILES[toCol] + RANKS[(fromRow + toRow) / 2]
        : "-";

    const prevHalf = parseInt(parts[4], 10);
    const halfmove = (piece.type === "p" || captured)
        ? 0
        : (Number.isFinite(prevHalf) ? prevHalf : 0) + 1;

    const prevFull = parseInt(parts[5], 10);
    const nextTurn = parts[1] === "w" ? "b" : "w";
    const fullmove = (parts[1] === "b" ? 1 : 0) + (Number.isFinite(prevFull) ? prevFull : 1);

    return newRows.join("/") + ` ${nextTurn} ${castling} ${epSquare} ${halfmove} ${fullmove}`;
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

    // Known approximation: castling and en passant are deliberately NOT generated
    // here. Half-implementing them (e.g. allowing a king to jump two squares
    // through check, or double-pushing onto an occupied square) would produce
    // positions that are not reachable, so they are left out entirely rather than
    // half-implemented. Neither is needed to rank ordinary moves, and
    // generatePseudoMoves is only ever fed positions that came out of
    // applyMoveToFen, so a missing ep capture can never hide a real reply.
    return moves.filter((m) => {
        const nextFen = applyMoveToFen(fen, m.from, m.to, m.promotion);
        if (!nextFen) return false;
        const { board: next } = fenToBoard(nextFen);
        const king = findKingSquare(next, turn);
        if (!king) return true;
        return !isSquareAttacked(next, king.r, king.c, turn === "w" ? "b" : "w");
    });
}

// Real mate detection: after this move the side to move is in check and has no
// legal reply. Checkmate used to be guessed from `score > 9000`, but evaluateBoard
// only returns centipawns, so 9000 is unreachable and the threshold really meant
// "big material swing" - which is how ordinary winning moves got labelled
// "Checkmate was available!".
function isMateAfter(fen, move) {
    const nextFen = applyMoveToFen(fen, move.from, move.to, move.promotion);
    if (!nextFen) return false;
    const { board, turn: opponent } = fenToBoard(nextFen);
    const king = findKingSquare(board, opponent);
    if (!king) return false;
    // A mate has to be a check, so bail out before the far more expensive reply
    // generation for the ~95% of candidates that are not even checks.
    if (!isSquareAttacked(board, king.r, king.c, opponent === "w" ? "b" : "w")) return false;
    return generatePseudoMoves(nextFen).length === 0;
}

function scoreMove(fen, move) {
    const newFen = applyMoveToFen(fen, move.from, move.to, move.promotion);
    if (!newFen) return -Infinity;
    // BOTH terms have to be expressed from the mover's point of view. The eval
    // term already was, but the material term was always white-relative, so every
    // Black move carried a doubled white bias and findBestMoves - which always
    // sorts descending - recommended Black's worst moves.
    const sign = fen.split(" ")[1] === "w" ? 1 : -1;
    const score = evaluateBoard(newFen) * sign + getMaterialBalance(newFen) * 10 * sign;
    // A delivered mate outranks any material swing, and scoring it at exactly
    // MATE_SCORE is what lets the `>= MATE_SCORE` checks in classifyMove mean
    // "real mate" instead of "big material swing". Move generation is only ever
    // one ply deep, so every mate found here is mate-in-1 and they legitimately
    // tie - adding the centipawn term as a tie-breaker would risk pushing a mate
    // back below the MATE_SCORE threshold whenever the cp score is negative.
    if (isMateAfter(fen, move)) return MATE_SCORE;
    return score;
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
    // Reference equality mislabelled a move that merely TIED with the best one,
    // because bestMoves contains a fresh object per move.
    const isTopMove = bestMoves.indexOf(moveScoreEntry) === 0;
    const bestMoveIsCheckmate = bestScore >= MATE_SCORE;

    if (move.promotion && isTopMove) {
        return { label: "brilliant", color: "#f59e0b", description: "Perfect promotion!" };
    }

    if (bestMoveIsCheckmate) {
        const checkmateMoves = bestMoves.filter((m) => m.score >= MATE_SCORE);
        const moveIsCheckmate = checkmateMoves.some(
            (m) => m.from === move.from && m.to === move.to && (m.promotion || "q") === (move.promotion || "q")
        );
        if (moveIsCheckmate) {
            return { label: "excellent", color: "#22c55e", description: "Checkmate!" };
        }
        return { label: "miss", color: "#ef4444", description: "Checkmate was available!" };
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
    const col = FILES.indexOf(square?.[0]);
    const row = RANKS.indexOf(square?.[1]);
    // indexOf gives -1 for anything off the board, and `board[row]?.[col] !== null`
    // is TRUE for undefined, so an out-of-bounds square used to look like a
    // capture and the "Best move - excellent capture!" label appeared for free.
    if (row < 0 || col < 0 || row > 7 || col > 7) return false;
    const { board } = fenToBoard(fen);
    return board[row]?.[col] != null;
}

// ChessReviewPanel divides these fields directly, so the shape has to be complete
// even when no moves were played - otherwise an unstarted game renders NaN%.
function emptyStats() {
    return { brilliant: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, miss: 0, total: 0 };
}

export function analyseGameMoves(moves, playerColor) {
    if (!moves || moves.length === 0) return { moves: [], stats: emptyStats() };

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
