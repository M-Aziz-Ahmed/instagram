const SIZE = 8;

function cloneBoard(board) {
    return board.map((row) => row.slice());
}

function pieceColor(p) {
    if (!p) return null;
    return p.toLowerCase() === "r" ? "r" : "b";
}

function isKing(p) {
    return p === "R" || p === "B";
}

function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function moveDirections(piece) {
    const color = pieceColor(piece);
    if (isKing(piece)) {
        return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    }
    // red moves up (decreasing row), black moves down (increasing row)
    return color === "r" ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function getPieceCaptures(board, r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    const color = pieceColor(piece);
    const dirs = moveDirections(piece);
    const captures = [];
    for (const [dr, dc] of dirs) {
        const midR = r + dr, midC = c + dc;
        const endR = r + 2 * dr, endC = c + 2 * dc;
        if (!inBounds(endR, endC)) continue;
        const midPiece = board[midR][midC];
        if (midPiece && pieceColor(midPiece) !== color && !board[endR][endC]) {
            captures.push({ from: [r, c], to: [endR, endC], captured: [midR, midC] });
        }
    }
    return captures;
}

function getPieceSteps(board, r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    const dirs = moveDirections(piece);
    const steps = [];
    for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && !board[nr][nc]) {
            steps.push({ from: [r, c], to: [nr, nc], captured: null });
        }
    }
    return steps;
}

function applyStep(board, from, to, captured) {
    const next = cloneBoard(board);
    let piece = next[from[0]][from[1]];
    next[from[0]][from[1]] = null;
    if (captured) next[captured[0]][captured[1]] = null;
    // king promotion
    if (piece === "r" && to[0] === 0) piece = "R";
    if (piece === "b" && to[0] === SIZE - 1) piece = "B";
    next[to[0]][to[1]] = piece;
    return next;
}

function hasAnyCapture(board, color) {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (board[r][c] && pieceColor(board[r][c]) === color) {
                if (getPieceCaptures(board, r, c).length > 0) return true;
            }
        }
    }
    return false;
}

// Returns full move sequences (arrays of squares) that are legal for the color,
// enforcing mandatory captures and multi-jumps.
function getLegalMoves(board, color) {
    const mustCapture = hasAnyCapture(board, color);
    const results = [];

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (!board[r][c] || pieceColor(board[r][c]) !== color) continue;

            if (mustCapture) {
                const seqs = [];
                buildCaptureSequences(board, [r, c], [[r, c]], [], seqs);
                for (const seq of seqs) {
                    results.push(seq);
                }
            } else {
                for (const step of getPieceSteps(board, r, c)) {
                    results.push({ path: [[r, c], step.to], captures: [] });
                }
            }
        }
    }
    return results;
}

function buildCaptureSequences(board, pos, path, captures, out) {
    const [r, c] = pos;
    const caps = getPieceCaptures(board, r, c);
    if (caps.length === 0) {
        if (captures.length > 0) {
            out.push({ path: path.slice(), captures: captures.slice() });
        }
        return;
    }
    for (const cap of caps) {
        const next = applyStep(board, cap.from, cap.to, cap.captured);
        buildCaptureSequences(
            next,
            cap.to,
            path.concat([cap.to]),
            captures.concat([cap.captured]),
            out
        );
    }
}

// Apply a full move sequence (path of squares). Returns new board or null if illegal.
function applyMove(board, path, color) {
    const legal = getLegalMoves(board, color);
    const key = JSON.stringify(path);
    const match = legal.find((m) => JSON.stringify(m.path) === key);
    if (!match) return null;

    let b = cloneBoard(board);
    for (let i = 0; i < path.length - 1; i++) {
        const from = path[i];
        const to = path[i + 1];
        const dr = Math.sign(to[0] - from[0]);
        const dc = Math.sign(to[1] - from[1]);
        let captured = null;
        if (Math.abs(to[0] - from[0]) === 2) {
            captured = [from[0] + dr, from[1] + dc];
        }
        b = applyStep(b, from, to, captured);
    }
    return { board: b, captures: match.captures };
}

function countPieces(board) {
    let r = 0, b = 0;
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE; j++) {
            const p = board[i][j];
            if (!p) continue;
            if (pieceColor(p) === "r") r++;
            else b++;
        }
    }
    return { r, b };
}

function getWinner(board, colorToMove) {
    const { r, b } = countPieces(board);
    if (r === 0) return "b";
    if (b === 0) return "r";
    if (getLegalMoves(board, colorToMove).length === 0) {
        return colorToMove === "r" ? "b" : "r";
    }
    return null;
}

module.exports = {
    SIZE, cloneBoard, pieceColor, isKing, getLegalMoves, applyMove,
    hasAnyCapture, countPieces, getWinner,
};
