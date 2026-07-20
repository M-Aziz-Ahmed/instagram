const { SIZE, applyShot, allShots } = require("./battleshipLogic");

function cloneBoard(board) {
    return {
        grid: board.grid.map((row) => row.slice()),
        placements: board.placements,
        shots: board.shots.map((row) => row.slice()),
    };
}

function getAIMove(board, difficulty) {
    const open = allShots(board);
    if (open.length === 0) return null;

    const clamped = Math.min(Math.max(difficulty || 3, 1), 6);

    if (clamped === 1) {
        return open[Math.floor(Math.random() * open.length)];
    }

    if (clamped <= 3) {
        const remaining = shipsRemaining(board);
        const total = SIZE * SIZE;
        const prob = clamped === 2 ? 0.5 : 0.25;
        if (Math.random() < prob) return open[Math.floor(Math.random() * open.length)];
        const cells = open.filter(([r, c]) => (r + c) % 2 === 0 || (r % 2 === 0 && c % 2 === 0));
        const pool = cells.length ? cells : open;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    return hunt(board);
}

function shipsRemaining(board) {
    let count = 0;
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
            if (board.grid[r][c] === "S") count++;
    return count;
}

function hunt(board) {
    const open = allShots(board);
    const hits = [];
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
            if (board.shots[r][c] === "H") hits.push([r, c]);

    if (hits.length > 0) {
        const adj = [];
        const seen = new Set();
        for (const [hr, hc] of hits) {
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nr = hr + dr, nc = hc + dc;
                if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
                if (board.shots[nr][nc] !== null) continue;
                const key = nr + "-" + nc;
                if (seen.has(key)) continue;
                seen.add(key);
                adj.push([nr, nc]);
            }
        }
        if (adj.length > 0) return adj[Math.floor(Math.random() * adj.length)];
    }

    const parity = [];
    const rest = [];
    for (const [r, c] of open) {
        if ((r % 2 === 0 && c % 2 === 0) || (r % 2 === 1 && c % 2 === 1)) parity.push([r, c]);
        else rest.push([r, c]);
    }
    const pool = parity.length ? parity : open;
    return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = { getAIMove, cloneBoard };
