const SIZE = 8;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function other(color) {
    return color === "b" ? "w" : "b";
}

function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

export function getFlips(board, r, c, color) {
    if (!board[r] || board[r][c]) return [];
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

export function getLegalMoves(board, color) {
    const moves = [];
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
            if (getFlips(board, r, c, color).length > 0) moves.push([r, c]);
    return moves;
}

export function countPieces(board) {
    let b = 0, w = 0;
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
            if (board[r]?.[c] === "b") b++;
            else if (board[r]?.[c] === "w") w++;
        }
    return { b, w };
}
