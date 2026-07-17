const mongoose = require("mongoose");

const moveSchema = new mongoose.Schema({
    from:       { type: String, required: true },
    to:         { type: String, required: true },
    san:        { type: String, required: true },
    fen:        { type: String, required: true },
    notation:   { type: String, default: "" },
    timestamp:  { type: Date, default: Date.now },
    thinkingMs: { type: Number, default: 0 },
}, { _id: false });

const chatMsgSchema = new mongoose.Schema({
    username:  { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    avatarUrl: { type: String, default: "" },
    text:      { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });

const chessGameSchema = new mongoose.Schema({
    white: {
        username:   { type: String, default: "" },
        avatarUrl:  { type: String, default: "" },
        avatarColor: { type: String, default: "#3b82f6" },
    },
    black: {
        username:   { type: String, default: "" },
        avatarUrl:  { type: String, default: "" },
        avatarColor: { type: String, default: "#3b82f6" },
    },
    status: {
        type: String,
        enum: ["waiting", "active", "checkmate", "stalemate", "draw", "resigned", "timeout", "abandoned"],
        default: "waiting",
    },
    mode: {
        type: String,
        enum: ["multiplayer", "ai"],
        default: "multiplayer",
    },
    aiDifficulty: { type: Number, min: 1, max: 20, default: 10 },
    fen:          { type: String, default: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
    pgn:          { type: String, default: "" },
    turn:         { type: String, enum: ["w", "b"], default: "w" },
    moves:        { type: [moveSchema], default: [] },
    result:       { type: String, enum: ["1-0", "0-1", "1/2-1/2", "*"], default: "*" },
    resultReason: { type: String, default: "" },
    timeControl: {
        initial:   { type: Number, default: 600 },
        increment: { type: Number, default: 0 },
    },
    timers: {
        white: { type: Number, default: 600 },
        black: { type: Number, default: 600 },
    },
    timerLastTick: { type: Date, default: null },
    winner:        { type: String, default: "" },
    chat:          { type: [chatMsgSchema], default: [] },
    invitedBy:     { type: String, default: "" },
    createdAt:     { type: Date, default: Date.now },
}, { timestamps: true });

chessGameSchema.index({ status: 1, createdAt: -1 });
chessGameSchema.index({ "white.username": 1 });
chessGameSchema.index({ "black.username": 1 });
chessGameSchema.index({ invitedBy: 1 });

chessGameSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.models.ChessGame || mongoose.model("ChessGame", chessGameSchema);
