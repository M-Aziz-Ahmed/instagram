const { SIZE, pieceColor, isKing, getLegalMoves, applyMove, countPieces, getWinner } = require("./checkersLogic");

function other(c) {
    return c === "r" ? "b" : "r";
}

function evaluate(board, aiColor) {
    let score = 0;
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const p = board[r][c];
            if (!p) continue;
            const color = pieceColor(p);
            let val = isKing(p) ? 5 : 3;
            // advancement bonus for non-kings
            if (!isKing(p)) {
                val += color === "r" ? (7 - r) * 0.1 : r * 0.1;
            }
            // center control
            if (c >= 2 && c <= 5) val += 0.2;
            score += color === aiColor ? val : -val;
        }
    }
    return score;
}

function minimax(board, depth, alpha, beta, current, aiColor) {
    const winner = getWinner(board, current);
    if (winner) {
        return { score: winner === aiColor ? 1000 + depth : -1000 - depth, path: null };
    }
    if (depth === 0) {
        return { score: evaluate(board, aiColor), path: null };
    }

    const moves = getLegalMoves(board, current);
    if (moves.length === 0) {
        return { score: current === aiColor ? -1000 : 1000, path: null };
    }

    const maximizing = current === aiColor;
    let best = { score: maximizing ? -Infinity : Infinity, path: moves[0].path };

    for (const move of moves) {
        const applied = applyMove(board, move.path, current);
        if (!applied) continue;
        const { score } = minimax(applied.board, depth - 1, alpha, beta, other(current), aiColor);
        if (maximizing) {
            if (score > best.score) best = { score, path: move.path };
            alpha = Math.max(alpha, best.score);
        } else {
            if (score < best.score) best = { score, path: move.path };
            beta = Math.min(beta, best.score);
        }
        if (beta <= alpha) break;
    }
    return best;
}

function getAIMove(board, aiColor, difficulty) {
    const moves = getLegalMoves(board, aiColor);
    if (moves.length === 0) return null;

    const clamped = Math.min(Math.max(difficulty || 3, 1), 5);

    if (clamped === 1) {
        return moves[Math.floor(Math.random() * moves.length)].path;
    }
    if (clamped === 2 && Math.random() < 0.35) {
        return moves[Math.floor(Math.random() * moves.length)].path;
    }

    const depthMap = { 2: 2, 3: 4, 4: 6, 5: 8 };
    const depth = depthMap[clamped] || 4;

    const { path } = minimax(board, depth, -Infinity, Infinity, aiColor, aiColor);
    return path || moves[Math.floor(Math.random() * moves.length)].path;
}

module.exports = { getAIMove };
