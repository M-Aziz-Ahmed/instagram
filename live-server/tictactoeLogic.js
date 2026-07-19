const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];

function checkWinner(board) {
    for (const line of LINES) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return { winner: board[a], line };
        }
    }
    return null;
}

function isFull(board) {
    return board.every((c) => c);
}

function availableMoves(board) {
    const moves = [];
    for (let i = 0; i < 9; i++) if (!board[i]) moves.push(i);
    return moves;
}

module.exports = { LINES, checkWinner, isFull, availableMoves };
