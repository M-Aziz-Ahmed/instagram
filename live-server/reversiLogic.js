const SIZE = 8;

const DIRS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
];

function cloneBoard(board) {
    return board.map((row) => row.slice());
}

function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function other(color) {
    return color === "b" ? "w" : "b";
}

function getFlips(board, r, c, color) {
    if (board[r][c]) return [];
    const opp = other(color);
    const flips = [];
    for (const [dr, dc] of DIRS) {
        const line = [];
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc) && board[nr][nc] === opp) {
            line.push([nr, nc]);
            nr += dr;
            nc += dc;
        }
        if (line.length > 0 && inBounds(nr, nc) && board[nr][nc] === color) {
            for (const sq of line) flips.push(sq);
        }
    }
    return flips;
}

function getLegalMoves(board, color) {
    const moves = [];
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const flips = getFlips(board, r, c, color);
            if (flips.length > 0) moves.push({ r, c, flips });
        }
    }
    return moves;
}

function hasAnyMove(board, color) {
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
            if (getFlips(board, r, c, color).length > 0) return true;
    return false;
}

function countPieces(board) {
    let b = 0, w = 0;
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
            if (board[r][c] === "b") b++;
            else if (board[r][c] === "w") w++;
        }
    return { b, w };
}

function applyMove(board, move, color) {
    if (!move || !board[move.r][move.c]) return null;
    const flips = getFlips(board, move.r, move.c, color);
    if (flips.length === 0) return null;
    const next = cloneBoard(board);
    next[move.r][move.c] = color;
    for (const [fr, fc] of flips) next[fr][fc] = color;
    return { board: next, flips };
}

function getWinner(board) {
    const { b, w } = countPieces(board);
    if (b > w) return "b";
    if (w > b) return "w";
    return "draw";
}

module.exports = {
    SIZE,
    initialBoard,
    other,
    getFlips,
    getLegalMoves,
    hasAnyMove,
    countPieces,
    applyMove,
    getWinner,
};
