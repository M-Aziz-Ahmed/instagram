const { ROWS, COLS, cloneBoard, dropRow, getPlayableColumns, findWin, isBoardFull } = require("./connect4Logic");

const CENTER = 3;

function otherColor(color) {
    return color === "r" ? "y" : "r";
}

function scoreWindow(window, aiColor) {
    const oppColor = otherColor(aiColor);
    let ai = 0, opp = 0, empty = 0;
    for (const cell of window) {
        if (cell === aiColor) ai++;
        else if (cell === oppColor) opp++;
        else empty++;
    }
    if (ai === 4) return 100000;
    if (opp === 4) return -100000;
    let score = 0;
    if (ai === 3 && empty === 1) score += 100;
    else if (ai === 2 && empty === 2) score += 10;
    if (opp === 3 && empty === 1) score -= 120;
    else if (opp === 2 && empty === 2) score -= 10;
    return score;
}

function evaluateBoard(board, aiColor) {
    let score = 0;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] === aiColor && c === CENTER) score += 6;
        }
    }

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            score += scoreWindow([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]], aiColor);
        }
    }
    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS - 3; r++) {
            score += scoreWindow([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]], aiColor);
        }
    }
    for (let r = 0; r < ROWS - 3; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            score += scoreWindow([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]], aiColor);
        }
    }
    for (let r = 3; r < ROWS; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            score += scoreWindow([board[r][c], board[r - 1][c + 1], board[r - 2][c + 2], board[r - 3][c + 3]], aiColor);
        }
    }
    return score;
}

function dropInto(board, col, color) {
    const row = dropRow(board, col);
    if (row === -1) return null;
    const next = cloneBoard(board);
    next[row][col] = color;
    return { board: next, row };
}

function minimax(board, depth, alpha, beta, maximizing, aiColor) {
    const validCols = getPlayableColumns(board);
    const ordered = validCols.slice().sort((a, b) => Math.abs(a - CENTER) - Math.abs(b - CENTER));

    for (const col of validCols) {
        const row = dropRow(board, col);
        const color = maximizing ? aiColor : otherColor(aiColor);
        const test = cloneBoard(board);
        test[row][col] = color;
        if (findWin(test, row, col)) {
            const terminalScore = (maximizing ? 100000 : -100000) - (maximizing ? -depth : depth);
            return { col, score: terminalScore };
        }
    }

    if (isBoardFull(board)) return { col: null, score: 0 };
    if (depth === 0) return { col: null, score: evaluateBoard(board, aiColor) };

    if (maximizing) {
        let best = { col: ordered[0], score: -Infinity };
        for (const col of ordered) {
            const drop = dropInto(board, col, aiColor);
            if (!drop) continue;
            const result = minimax(drop.board, depth - 1, alpha, beta, false, aiColor);
            if (result.score > best.score) best = { col, score: result.score };
            alpha = Math.max(alpha, best.score);
            if (alpha >= beta) break;
        }
        return best;
    } else {
        let best = { col: ordered[0], score: Infinity };
        for (const col of ordered) {
            const drop = dropInto(board, col, otherColor(aiColor));
            if (!drop) continue;
            const result = minimax(drop.board, depth - 1, alpha, beta, true, aiColor);
            if (result.score < best.score) best = { col, score: result.score };
            beta = Math.min(beta, best.score);
            if (alpha >= beta) break;
        }
        return best;
    }
}

function getAIMove(board, aiColor, difficulty) {
    const validCols = getPlayableColumns(board);
    if (validCols.length === 0) return null;

    const clamped = Math.min(Math.max(difficulty || 3, 1), 6);

    if (clamped === 1) {
        for (const col of validCols) {
            const row = dropRow(board, col);
            const test = cloneBoard(board);
            test[row][col] = aiColor;
            if (findWin(test, row, col)) return col;
        }
        return validCols[Math.floor(Math.random() * validCols.length)];
    }

    const depthMap = { 2: 2, 3: 4, 4: 5, 5: 6, 6: 8 };
    const depth = depthMap[clamped] || 4;

    if (Math.random() < (clamped === 2 ? 0.25 : clamped === 3 ? 0.1 : 0)) {
        return validCols[Math.floor(Math.random() * validCols.length)];
    }

    const result = minimax(board, depth, -Infinity, Infinity, true, aiColor);
    return result.col != null ? result.col : validCols[Math.floor(Math.random() * validCols.length)];
}

module.exports = { getAIMove };
