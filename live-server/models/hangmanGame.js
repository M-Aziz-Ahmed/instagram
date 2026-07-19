const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
    username: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    avatarColor: { type: String, default: "#3b82f6" },
});

const hangmanGameSchema = new mongoose.Schema({
    player: playerSchema,
    word: { type: String, default: "" },
    category: { type: String, default: "" },
    guessed: { type: [String], default: [] },
    wrong: { type: Number, default: 0 },
    turn: { type: String, default: "player" },
    status: { type: String, default: "active" },
    mode: { type: String, default: "ai" },
    aiDifficulty: { type: Number, default: 3 },
    invitedBy: { type: String, default: "" },
    winner: { type: String, default: "" },
    result: { type: String, default: "*" },
    resultReason: { type: String, default: "" },
    moveCount: { type: Number, default: 0 },
    chat: { type: [Object], default: [] },
}, { timestamps: true });

const WORDS = [
    { word: "JAVASCRIPT", category: "Programming" },
    { word: "ELEPHANT", category: "Animals" },
    { word: "MOUNTAIN", category: "Nature" },
    { word: "GUITAR", category: "Music" },
    { word: "PIRATE", category: "Movies" },
    { word: "RAINBOW", category: "Nature" },
    { word: "COMPUTER", category: "Tech" },
    { word: "DOLPHIN", category: "Animals" },
    { word: "LIBRARY", category: "Places" },
    { word: "ROCKET", category: "Science" },
    { word: "UMBRELLA", category: "Objects" },
    { word: "PENGUIN", category: "Animals" },
    { word: "CASTLE", category: "Places" },
    { word: "PLANET", category: "Science" },
    { word: "WIZARD", category: "Fantasy" },
    { word: "GARDEN", category: "Nature" },
    { word: "KEYBOARD", category: "Tech" },
    { word: "VOLCANO", category: "Nature" },
    { word: "TREASURE", category: "Fantasy" },
    { word: "GALAXY", category: "Science" },
];

function pickWord(difficulty) {
    const list = WORDS;
    const pick = list[Math.floor(Math.random() * list.length)];
    return pick;
}

hangmanGameSchema.pre("save", function (next) {
    if (!this.word) {
        const w = pickWord(this.aiDifficulty);
        this.word = w.word;
        this.category = w.category;
    }
    next();
});

hangmanGameSchema.statics.WORDS = WORDS;

module.exports = mongoose.model("HangmanGame", hangmanGameSchema);
