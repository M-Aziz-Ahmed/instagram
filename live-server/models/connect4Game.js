const mongoose = require("mongoose");

const moveSchema = new mongoose.Schema({
    column:    { type: Number, required: true },
    row:       { type: Number, required: true },
    color:     { type: String, enum: ["r", "y"], required: true },
    timestamp: { type: Date, default: Date.now },
}, { _id: false });

const chatMsgSchema = new mongoose.Schema({
    username:  { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    avatarUrl: { type: String, default: "" },
    text:      { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });

const EMPTY_BOARD = () => Array.from({ length: 6 }, () => Array(7).fill(null));

const connect4GameSchema = new mongoose.Schema({
    red: {
        username:    { type: String, default: "" },
        avatarUrl:   { type: String, default: "" },
        avatarColor: { type: String, default: "#ef4444" },
    },
    yellow: {
        username:    { type: String, default: "" },
        avatarUrl:   { type: String, default: "" },
        avatarColor: { type: String, default: "#eab308" },
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
    aiDifficulty: { type: Number, min: 1, max: 6, default: 3 },
    board:        { type: [[String]], default: EMPTY_BOARD },
    turn:         { type: String, enum: ["r", "y"], default: "r" },
    moves:        { type: [moveSchema], default: [] },
    result:       { type: String, default: "*" },
    resultReason: { type: String, default: "" },
    winner:       { type: String, default: "" },
    winningCells: { type: [[Number]], default: [] },
    chat:         { type: [chatMsgSchema], default: [] },
    invitedBy:    { type: String, default: "" },
    createdAt:    { type: Date, default: Date.now },
}, { timestamps: true });

connect4GameSchema.index({ status: 1, createdAt: -1 });
connect4GameSchema.index({ "red.username": 1 });
connect4GameSchema.index({ "yellow.username": 1 });
connect4GameSchema.index({ invitedBy: 1 });
connect4GameSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.models.Connect4Game || mongoose.model("Connect4Game", connect4GameSchema);
