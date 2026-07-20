const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
    username: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    avatarColor: { type: String, default: "#3b82f6" },
});

const reactionSchema = new mongoose.Schema({
    username: { type: String, default: "" },
    t: { type: Number, default: 0 },
});

const reactionDuelGameSchema = new mongoose.Schema({
    players: {
        type: [playerSchema],
        default: [],
        validate: [arr => arr.length <= 2, "Too many players"],
    },
    status: {
        type: String,
        enum: ["waiting", "active", "finished"],
        default: "waiting",
    },
    winner: { type: String, default: "" },
    loser: { type: String, default: "" },
    resultReason: { type: String, default: "" },
    reactions: { type: [reactionSchema], default: [] },
    round: { type: Number, default: 1 },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("ReactionDuelGame", reactionDuelGameSchema);
