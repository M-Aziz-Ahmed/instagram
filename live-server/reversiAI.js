const { SIZE, other, getLegalMoves, applyMove, countPieces } = require("./reversiLogic");

const CORNERS = [[0, 0], [0, 7], [7, 0], [7, 7]];
const CORNER_ADJ = [
    [0, 1], [1, 0], [1, 1],
    [0, 6], [1, 7], [1, 6],
    [6, 0], [7, 1], [6, 1],
    [6, 7], [7, 6], [6, 6],
];

function positionalScore(board, aiColor) {
    let score = 0;
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const p = board[r][c];
            if (!p) continue;
            let val = 1;
            if (CORNERS.some(([cr, cc]) => cr === r && cc === c)) val = 25;
            else if (CORNER_ADJ.some(([ar, ac]) => ar === r && ac === c)) val = -12;
            else if (r === 0 || r === 7 || c === 0 || c === 7) val = 5;
            score += p === aiColor ? val : -val;
        }
    }
    return score;
}

function evaluate(board, aiColor) {
    const { b, w } = countPieces(board);
    const discScore = (aiColor === "b" ? b - w : w - b) * 10;
    const pos = positionalScore(board, aiColor);
    return discScore + pos;
}

function minimax(board, depth, alpha, beta, current, aiColor) {
    const moves = getLegalMoves(board, current);
    if (depth === 0) return { score: evaluate(board, aiColor), move: null };
    if (moves.length === 0) {
        const oppMoves = getLegalMoves(board, other(current));
        if (oppMoves.length === 0) {
            const { b, w } = countPieces(board);
            const diff = aiColor === "b" ? b - w : w - b;
            return { score: diff > 0 ? 10000 : diff < 0 ? -10000 : 0, move: null };
        }
        const { score } = minimax(board, depth - 1, alpha, beta, other(current), aiColor);
        return { score, move: null };
    }

    const maximizing = current === aiColor;
    let best = { score: maximizing ? -Infinity : Infinity, move: moves[0] };

    for (const move of moves) {
        const applied = applyMove(board, move, current);
        if (!applied) continue;
        const { score } = minimax(applied.board, depth - 1, alpha, beta, other(current), aiColor);
        if (maximizing) {
            if (score > best.score) best = { score, move };
            alpha = Math.max(alpha, best.score);
        } else {
            if (score < best.score) best = { score, move };
            beta = Math.min(beta, best.score);
        }
        if (beta <= alpha) break;
    }
    return best;
}

function getAIMove(board, aiColor, difficulty) {
    const moves = getLegalMoves(board, aiColor);
    if (moves.length === 0) return null;

    const clamped = Math.min(Math.max(difficulty || 3, 1), 6);

    if (clamped === 1) {
        return moves[Math.floor(Math.random() * moves.length)];
    }

    const depthMap = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };
    const depth = depthMap[clamped] || 2;

    if (clamped < 6 && Math.random() < (clamped === 2 ? 0.25 : clamped === 3 ? 0.1 : 0)) {
        return moves[Math.floor(Math.random() * moves.length)];
    }

    const { move } = minimax(board, depth, -Infinity, Infinity, aiColor, aiColor);
    return move || moves[Math.floor(Math.random() * moves.length)];
}

module.exports = { getAIMove };
