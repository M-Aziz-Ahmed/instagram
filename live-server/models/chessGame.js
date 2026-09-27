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

const spectatorSchema = new mongoose.Schema({
    username:   { type: String, required: true },
    avatarUrl:  { type: String, default: "" },
    avatarColor: { type: String, default: "#3b82f6" },
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
    challengeFor:  { type: String, default: "" },
    spectators:    { type: [spectatorSchema], default: [] },
    createdAt:     { type: Date, default: Date.now },
}, { timestamps: true });

chessGameSchema.index({ status: 1, createdAt: -1 });
chessGameSchema.index({ "white.username": 1 });
chessGameSchema.index({ "black.username": 1 });
chessGameSchema.index({ invitedBy: 1 });
chessGameSchema.index({ challengeFor: 1 });

// ── Retention ──────────────────────────────────────────────────
//
// CHESS_GAME_TTL_DAYS controls how long a game document survives. The default is
// 1 day, which is exactly what this index did before it was configurable, so an
// operator who sets nothing sees no change at all.
//
// The trade-off, and why this is an env var rather than a decision made here:
// the TTL is measured from `createdAt`, so it answers "how long do we keep
// unfinished and finished games alike". That is why every link from
// `ChessProfileHistory` to `/chess/game/:id` 404s a day after the game was
// created: the profile history row outlives the document it points at. Raising
// the TTL keeps those links working; lowering it (or setting 0) is the lever for
// bounding storage. Both sides of that are a data-retention decision about the
// owner's users' data - how much of a finished game history to keep, and for how
// long - and not something a default in this file should decide silently.
//
// `0` disables expiry entirely. A blank, non-numeric or negative value falls
// back to the default, so neither a typo nor an env file with
// `CHESS_GAME_TTL_DAYS=` left empty can quietly turn "keep for a year" into
// "keep forever".
const CHESS_GAME_TTL_DAYS = (() => {
    const raw = String(process.env.CHESS_GAME_TTL_DAYS ?? "").trim();
    if (raw === "") return 1;
    const days = Number(raw);
    if (days === 0) return 0;
    if (!Number.isFinite(days) || days <= 0) return 1;
    return days;
})();

if (CHESS_GAME_TTL_DAYS > 0) {
    // A finished game is still removed on the same clock, because the index can
    // only watch one field. Cheap to express properly - a partial TTL index on
    // `finishedAt` would need a field written on every terminal state, and every
    // terminal state is set in at least six places (move, time-sync, resign,
    // accept-draw, the disconnect handler, and the REST twin of the move
    // handler), so a missed write would silently make a game immortal. Left as a
    // documented consequence of the single-field TTL rather than a new field.
    chessGameSchema.index({ createdAt: 1 }, { expireAfterSeconds: CHESS_GAME_TTL_DAYS * 86400 });
}

module.exports = mongoose.models.ChessGame || mongoose.model("ChessGame", chessGameSchema);
