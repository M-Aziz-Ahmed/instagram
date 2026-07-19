const ROWS = 6;
const COLS = 7;

function cloneBoard(board) {
    return board.map((row) => row.slice());
}

function dropRow(board, col) {
    if (col < 0 || col >= COLS) return -1;
    for (let r = ROWS - 1; r >= 0; r--) {
        if (!board[r][col]) return r;
    }
    return -1;
}

function isColumnPlayable(board, col) {
    return dropRow(board, col) !== -1;
}

function getPlayableColumns(board) {
    const cols = [];
    for (let c = 0; c < COLS; c++) {
        if (isColumnPlayable(board, c)) cols.push(c);
    }
    return cols;
}

function isBoardFull(board) {
    return getPlayableColumns(board).length === 0;
}

const DIRECTIONS = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
];

function findWin(board, row, col) {
    const color = board[row][col];
    if (!color) return null;
    for (const [dr, dc] of DIRECTIONS) {
        const cells = [[row, col]];
        for (const sign of [1, -1]) {
            let r = row + dr * sign;
            let c = col + dc * sign;
            while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === color) {
                cells.push([r, c]);
                r += dr * sign;
                c += dc * sign;
            }
        }
        if (cells.length >= 4) {
            return cells.slice(0, 4);
        }
    }
    return null;
}

function applyMove(board, col, color) {
    const row = dropRow(board, col);
    if (row === -1) return null;
    const next = cloneBoard(board);
    next[row][col] = color;
    const win = findWin(next, row, col);
    return { board: next, row, col, win };
}

module.exports = { ROWS, COLS, cloneBoard, dropRow, isColumnPlayable, getPlayableColumns, isBoardFull, findWin, applyMove };
