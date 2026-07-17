let engine = null;
let ready = false;
let bestMoveCallback = null;

self.onmessage = function(e) {
    const { type, fen, depth, id } = e.data;

    if (type === "init") {
        initEngine();
    } else if (type === "evaluate") {
        evaluatePosition(fen, depth || 15, id);
    } else if (type === "stop") {
        if (engine) {
            engine.postMessage("stop");
        }
    }
};

function initEngine() {
    if (engine) return;

    try {
        importScripts("https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js");
        engine = self.STOCKFISH;
        if (!engine) {
            self.postMessage({ type: "error", message: "Stockfish not available, using fallback AI" });
            self.postMessage({ type: "ready" });
            return;
        }

        engine.onmessage = function(line) {
            if (typeof line !== "string") return;

            if (line === "uciok") {
                ready = true;
                self.postMessage({ type: "ready" });
            } else if (line === "readyok") {
                self.postMessage({ type: "ready" });
            } else if (line.startsWith("bestmove")) {
                const move = line.split(" ")[1];
                self.postMessage({ type: "bestmove", move });
            }
        };

        engine.postMessage("uci");
    } catch (err) {
        self.postMessage({ type: "error", message: "Failed to load Stockfish: " + err.message });
        self.postMessage({ type: "ready" });
    }
}

function evaluatePosition(fen, depth, id) {
    if (engine && ready) {
        engine.postMessage("stop");
        engine.postMessage("position fen " + fen);
        engine.postMessage("go depth " + depth);
        bestMoveCallback = null;
        return;
    }

    const move = getFallbackMove(fen);
    self.postMessage({ type: "bestmove", move, id });
}

function getFallbackMove(fen) {
    const parts = fen.split(" ");
    const boardStr = parts[0];
    const activeColor = parts[1];

    const rows = boardStr.split("/");
    const FILES = ["a","b","c","d","e","f","g","h"];
    const RANKS = ["8","7","6","5","4","3","2","1"];

    const board = [];
    for (let r = 0; r < 8; r++) {
        const row = [];
        for (const ch of rows[r]) {
            if (/\d/.test(ch)) {
                for (let i = 0; i < parseInt(ch); i++) row.push(null);
            } else {
                row.push({ type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? "w" : "b" });
            }
        }
        board.push(row);
    }

    const allMoves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (!piece || piece.color !== activeColor) continue;
            const moves = getPieceMoves(board, r, c, piece, parts[2], parts[3]);
            for (const [mr, mc] of moves) {
                const isCapture = board[mr][mc] !== null;
                const isPromo = (piece.type === "p" && (mr === 0 || mr === 7));
                const score = (isCapture ? 10 : 0) + (isPromo ? 9 : 0) + (piece.type === "q" ? 5 : piece.type === "r" ? 4 : piece.type === "b" ? 3 : piece.type === "n" ? 3 : 0);
                allMoves.push({ from: [r, c], to: [mr, mc], score, promo: isPromo });
            }
        }
    }

    if (allMoves.length === 0) return "0000";

    allMoves.sort((a, b) => b.score - a.score);
    const topMoves = allMoves.filter(m => m.score >= allMoves[0].score - 2);
    const chosen = topMoves[Math.floor(Math.random() * topMoves.length)];

    const from = FILES[chosen.from[1]] + RANKS[chosen.from[0]];
    const to = FILES[chosen.to[1]] + RANKS[chosen.to[0]];
    return from + to + (chosen.promo ? "q" : "");
}

function getPieceMoves(board, r, c, piece, castling, enPassant) {
    const moves = [];
    const inBounds = (rr, cc) => rr >= 0 && rr < 8 && cc >= 0 && cc < 8;
    const isEmpty = (rr, cc) => !board[rr][cc];
    const isEnemy = (rr, cc) => board[rr][cc] && board[rr][cc].color !== piece.color;

    const addIfValid = (rr, cc) => {
        if (inBounds(rr, cc) && (isEmpty(rr, cc) || isEnemy(rr, cc))) moves.push([rr, cc]);
    };

    const addSliding = (dr, dc) => {
        let rr = r + dr, cc = c + dc;
        while (inBounds(rr, cc)) {
            if (isEmpty(rr, cc)) { moves.push([rr, cc]); }
            else if (isEnemy(rr, cc)) { moves.push([rr, cc]); break; }
            else break;
            rr += dr; cc += dc;
        }
    };

    if (piece.type === "p") {
        const dir = piece.color === "w" ? -1 : 1;
        const startRow = piece.color === "w" ? 6 : 1;
        if (inBounds(r + dir, c) && isEmpty(r + dir, c)) {
            moves.push([r + dir, c]);
            if (r === startRow && isEmpty(r + 2 * dir, c)) moves.push([r + 2 * dir, c]);
        }
        if (inBounds(r + dir, c - 1) && isEnemy(r + dir, c - 1)) moves.push([r + dir, c - 1]);
        if (inBounds(r + dir, c + 1) && isEnemy(r + dir, c + 1)) moves.push([r + dir, c + 1]);
    } else if (piece.type === "n") {
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) addIfValid(r + dr, c + dc);
    } else if (piece.type === "b") {
        addSliding(-1,-1); addSliding(-1,1); addSliding(1,-1); addSliding(1,1);
    } else if (piece.type === "r") {
        addSliding(-1,0); addSliding(1,0); addSliding(0,-1); addSliding(0,1);
    } else if (piece.type === "q") {
        addSliding(-1,-1); addSliding(-1,1); addSliding(1,-1); addSliding(1,1);
        addSliding(-1,0); addSliding(1,0); addSliding(0,-1); addSliding(0,1);
    } else if (piece.type === "k") {
        for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) addIfValid(r + dr, c + dc);
    }

    return moves;
}
