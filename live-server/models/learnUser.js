const mongoose = require("mongoose");

const courseProgressSchema = new mongoose.Schema({
    crowns:   { type: Number, default: 0 },
    xp:       { type: Number, default: 0 },
    lessonsDone: [{ type: String, default: [] }],
    lessonCrowns: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const learnUserSchema = new mongoose.Schema({
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true, unique: true },
    username:      { type: String, default: "", index: true },
    xp:            { type: Number, default: 0, index: true },
    gems:          { type: Number, default: 100 },
    hearts:        { type: Number, default: 5 },
    heartsUpdatedAt: { type: Date, default: Date.now },
    dailyXp:       { type: Number, default: 0 },
    dailyGoal:     { type: Number, default: 20 },
    dailyDate:     { type: String, default: "" },
    streak:        { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    streakFreezes: { type: Number, default: 0 },
    streakLastDay: { type: String, default: "" },
    streakBrokenAt: { type: Date, default: null },
    currentCourse: { type: String, default: "spanish" },
    courseProgress: {
        type: Map,
        of: courseProgressSchema,
        default: {},
    },
    lessonsCompleted:  { type: Number, default: 0 },
    perfectLessons:    { type: Number, default: 0 },
    totalCorrect:      { type: Number, default: 0 },
    totalAnswered:     { type: Number, default: 0 },
    achievements:      [{ type: String, default: [] }],
    league: {
        season:   { type: String, default: "" },
        tier:     { type: Number, default: 0 },
        leagueId: { type: String, default: "" },
        xp:       { type: Number, default: 0 },
        rank:     { type: Number, default: -1 },
    },
    lastSeason: {
        season:   { type: String, default: "" },
        tier:     { type: Number, default: 0 },
        rank:     { type: Number, default: -1 },
    },
    comebackSent: [{ type: String, default: [] }],
    quests: [{
        id: { type: String, default: "" },
        desc: { type: String, default: "" },
        goal: { type: Number, default: 0 },
        target: { type: String, default: "" },
        progress: { type: Number, default: 0 },
        done: { type: Boolean, default: false },
        claimed: { type: Boolean, default: false },
    }],
}, { timestamps: true });

module.exports = mongoose.models.LearnUser || mongoose.model("LearnUser", learnUserSchema, "learnusers");