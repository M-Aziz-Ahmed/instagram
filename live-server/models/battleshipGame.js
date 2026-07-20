const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
    username: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    avatarColor: { type: String, default: "#3b82f6" },
});

const battleshipGameSchema = new mongoose.Schema({
    p1: playerSchema,
    p2: playerSchema,
    boards: { type: Object, default: undefined },
    turn: { type: String, default: "p1" },
    status: { type: String, default: "waiting" },
    mode: { type: String, default: "multiplayer" },
    aiDifficulty: { type: Number, default: 3 },
    invitedBy: { type: String, default: "" },
    winner: { type: String, default: "" },
    result: { type: String, default: "*" },
    resultReason: { type: String, default: "" },
    moveCount: { type: Number, default: 0 },
    lastShot: { type: Object, default: null },
    chat: { type: [Object], default: [] },
}, { timestamps: true });

const SHIPS = [
    { name: "Carrier", size: 5 },
    { name: "Battleship", size: 4 },
    { name: "Cruiser", size: 3 },
    { name: "Submarine", size: 3 },
    { name: "Destroyer", size: 2 },
];

function randomBoard() {
    const grid = Array.from({ length: 10 }, () => Array(10).fill("~"));
    const placements = {};
    for (const ship of SHIPS) {
        let placed = false;
        while (!placed) {
            const horizontal = Math.random() < 0.5;
            const maxR = horizontal ? 10 : 10 - ship.size;
            const maxC = horizontal ? 10 - ship.size : 10;
            const r = Math.floor(Math.random() * maxR);
            const c = Math.floor(Math.random() * maxC);
            const cells = [];
            let ok = true;
            for (let i = 0; i < ship.size; i++) {
                const rr = horizontal ? r : r + i;
                const cc = horizontal ? c + i : c;
                if (grid[rr][cc] !== "~") { ok = false; break; }
                cells.push([rr, cc]);
            }
            if (!ok) continue;
            for (const [rr, cc] of cells) grid[rr][cc] = "S";
            placements[ship.name] = cells;
            placed = true;
        }
    }
    return { grid, placements, shots: Array.from({ length: 10 }, () => Array(10).fill(null)) };
}

function initialBoards() {
    return { p1: randomBoard(), p2: randomBoard() };
}

battleshipGameSchema.pre("save", function () {
    if (!this.boards || !this.boards.p1) this.boards = initialBoards();
});

module.exports = mongoose.model("BattleshipGame", battleshipGameSchema);
