const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
    username: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    avatarColor: { type: String, default: "#3b82f6" },
});

const reversiGameSchema = new mongoose.Schema({
    black: playerSchema,
    white: playerSchema,
    board: { type: [[String]], default: undefined },
    turn: { type: String, default: "b" },
    status: { type: String, default: "waiting" },
    mode: { type: String, default: "multiplayer" },
    aiDifficulty: { type: Number, default: 3 },
    invitedBy: { type: String, default: "" },
    winner: { type: String, default: "" },
    result: { type: String, default: "*" },
    resultReason: { type: String, default: "" },
    moveCount: { type: Number, default: 0 },
    lastMove: { type: Object, default: null },
    chat: { type: [Object], default: [] },
}, { timestamps: true });

function initialBoard() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    board[3][3] = "w";
    board[3][4] = "b";
    board[4][3] = "b";
    board[4][4] = "w";
    return board;
}

reversiGameSchema.pre("save", function () {
    if (!this.board || this.board.length === 0) this.board = initialBoard();
});

module.exports = mongoose.model("ReversiGame", reversiGameSchema);
