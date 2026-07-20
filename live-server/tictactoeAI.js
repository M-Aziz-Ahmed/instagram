const { checkWinner, isFull, availableMoves } = require("./tictactoeLogic");

function other(p) {
    return p === "x" ? "o" : "x";
}

function minimax(board, aiPlayer, current) {
    const result = checkWinner(board);
    if (result) {
        return { score: result.winner === aiPlayer ? 10 : -10, move: null };
    }
    if (isFull(board)) return { score: 0, move: null };

    const moves = availableMoves(board);
    let best = current === aiPlayer
        ? { score: -Infinity, move: null }
        : { score: Infinity, move: null };

    for (const m of moves) {
        board[m] = current;
        const { score } = minimax(board, aiPlayer, other(current));
        board[m] = null;
        if (current === aiPlayer) {
            if (score > best.score) best = { score, move: m };
        } else {
            if (score < best.score) best = { score, move: m };
        }
    }
    return best;
}

function getAIMove(board, aiPlayer, difficulty) {
    const moves = availableMoves(board);
    if (moves.length === 0) return null;

    const clamped = Math.min(Math.max(difficulty || 3, 1), 3);

    if (clamped === 1) {
        return moves[Math.floor(Math.random() * moves.length)];
    }

    if (clamped === 2 && Math.random() < 0.4) {
        return moves[Math.floor(Math.random() * moves.length)];
    }

    const b = board.slice();
    const { move } = minimax(b, aiPlayer, aiPlayer);
    return move != null ? move : moves[Math.floor(Math.random() * moves.length)];
}

module.exports = { getAIMove };
