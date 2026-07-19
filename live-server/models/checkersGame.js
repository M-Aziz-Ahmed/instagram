const mongoose = require("mongoose");

const chatMsgSchema = new mongoose.Schema({
    username:  { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    avatarUrl: { type: String, default: "" },
    text:      { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });

// board: 8x8 array of strings/null. Pieces: "r","R" (red/red-king), "b","B" (black/black-king)
function initialBoard() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) board[r][c] = "b";
        }
    }
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) board[r][c] = "r";
        }
    }
    return board;
}

const checkersGameSchema = new mongoose.Schema({
    red: {
        username:    { type: String, default: "" },
        avatarUrl:   { type: String, default: "" },
        avatarColor: { type: String, default: "#ef4444" },
    },
    black: {
        username:    { type: String, default: "" },
        avatarUrl:   { type: String, default: "" },
        avatarColor: { type: String, default: "#1f2937" },
    },
    status: {
        type: String,
        enum: ["waiting", "active", "win", "draw", "resigned", "abandoned"],
        default: "waiting",
    },
    mode: {
        type: String,
        enum: ["multiplayer", "ai"],
        default: "multiplayer",
    },
    aiDifficulty: { type: Number, min: 1, max: 5, default: 3 },
    board:        { type: [[String]], default: initialBoard },
    turn:         { type: String, enum: ["r", "b"], default: "r" },
    moveCount:    { type: Number, default: 0 },
    result:       { type: String, default: "*" },
    resultReason: { type: String, default: "" },
    winner:       { type: String, default: "" },
    lastMove:     { type: mongoose.Schema.Types.Mixed, default: null },
    chat:         { type: [chatMsgSchema], default: [] },
    invitedBy:    { type: String, default: "" },
    createdAt:    { type: Date, default: Date.now },
}, { timestamps: true });

checkersGameSchema.index({ status: 1, createdAt: -1 });
checkersGameSchema.index({ "red.username": 1 });
checkersGameSchema.index({ "black.username": 1 });
checkersGameSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.models.CheckersGame || mongoose.model("CheckersGame", checkersGameSchema);
