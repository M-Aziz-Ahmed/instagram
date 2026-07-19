const SIZE = 8;

function cloneBoard(board) {
    return board.map((row) => row.slice());
}

export function pieceColor(p) {
    if (!p) return null;
    return p.toLowerCase() === "r" ? "r" : "b";
}

export function isKing(p) {
    return p === "R" || p === "B";
}

function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function moveDirections(piece) {
    const color = pieceColor(piece);
    if (isKing(piece)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    return color === "r" ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function getPieceCaptures(board, r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    const color = pieceColor(piece);
    const captures = [];
    for (const [dr, dc] of moveDirections(piece)) {
        const midR = r + dr, midC = c + dc;
        const endR = r + 2 * dr, endC = c + 2 * dc;
        if (!inBounds(endR, endC)) continue;
        const midPiece = board[midR][midC];
        if (midPiece && pieceColor(midPiece) !== color && !board[endR][endC]) {
            captures.push({ to: [endR, endC], captured: [midR, midC] });
        }
    }
    return captures;
}

function getPieceSteps(board, r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    const steps = [];
    for (const [dr, dc] of moveDirections(piece)) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && !board[nr][nc]) steps.push({ to: [nr, nc] });
    }
    return steps;
}

function applyStep(board, from, to, captured) {
    const next = cloneBoard(board);
    let piece = next[from[0]][from[1]];
    next[from[0]][from[1]] = null;
    if (captured) next[captured[0]][captured[1]] = null;
    if (piece === "r" && to[0] === 0) piece = "R";
    if (piece === "b" && to[0] === SIZE - 1) piece = "B";
    next[to[0]][to[1]] = piece;
    return next;
}

function hasAnyCapture(board, color) {
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
            if (board[r][c] && pieceColor(board[r][c]) === color && getPieceCaptures(board, r, c).length > 0)
                return true;
    return false;
}

function buildCaptureSequences(board, pos, path, out) {
    const [r, c] = pos;
    const caps = getPieceCaptures(board, r, c);
    if (caps.length === 0) {
        if (path.length > 1) out.push(path.slice());
        return;
    }
    for (const cap of caps) {
        const next = applyStep(board, pos, cap.to, cap.captured);
        buildCaptureSequences(next, cap.to, path.concat([cap.to]), out);
    }
}

export function getLegalMoves(board, color) {
    const mustCapture = hasAnyCapture(board, color);
    const results = [];
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (!board[r][c] || pieceColor(board[r][c]) !== color) continue;
            if (mustCapture) {
                const seqs = [];
                buildCaptureSequences(board, [r, c], [[r, c]], seqs);
                for (const seq of seqs) results.push(seq);
            } else {
                for (const step of getPieceSteps(board, r, c)) results.push([[r, c], step.to]);
            }
        }
    }
    return results;
}
