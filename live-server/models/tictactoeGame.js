const mongoose = require("mongoose");

const chatMsgSchema = new mongoose.Schema({
    username:  { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    avatarUrl: { type: String, default: "" },
    text:      { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });

const tictactoeGameSchema = new mongoose.Schema({
    x: {
        username:    { type: String, default: "" },
        avatarUrl:   { type: String, default: "" },
        avatarColor: { type: String, default: "#3b82f6" },
    },
    o: {
        username:    { type: String, default: "" },
        avatarUrl:   { type: String, default: "" },
        avatarColor: { type: String, default: "#ef4444" },
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
    aiDifficulty: { type: Number, min: 1, max: 3, default: 3 },
    board:        { type: [String], default: () => Array(9).fill(null) },
    turn:         { type: String, enum: ["x", "o"], default: "x" },
    moveCount:    { type: Number, default: 0 },
    result:       { type: String, default: "*" },
    resultReason: { type: String, default: "" },
    winner:       { type: String, default: "" },
    winningLine:  { type: [Number], default: [] },
    chat:         { type: [chatMsgSchema], default: [] },
    invitedBy:    { type: String, default: "" },
    createdAt:    { type: Date, default: Date.now },
}, { timestamps: true });

tictactoeGameSchema.index({ status: 1, createdAt: -1 });
tictactoeGameSchema.index({ "x.username": 1 });
tictactoeGameSchema.index({ "o.username": 1 });
tictactoeGameSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.models.TictactoeGame || mongoose.model("TictactoeGame", tictactoeGameSchema);
