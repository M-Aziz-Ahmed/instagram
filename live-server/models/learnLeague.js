const mongoose = require("mongoose");

const leagueMemberSchema = new mongoose.Schema({
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    username:     { type: String, default: "" },
    avatarColor:  { type: String, default: "#3b82f6" },
    avatarUrl:    { type: String, default: "" },
    xp:           { type: Number, default: 0 },
    lastActive:   { type: Date, default: Date.now },
}, { _id: false });

const learnLeagueSchema = new mongoose.Schema({
    season:   { type: String, required: true, index: true }, // YYYY-WW (Monday of week)
    tier:     { type: Number, default: 0, index: true },     // 0=Bronze … 9=Diamond
    members:  { type: [leagueMemberSchema], default: [] },
    status:   { type: String, enum: ["active", "complete"], default: "active", index: true },
    createdAt: { type: Date, default: Date.now },
    endedAt:  { type: Date, default: null },
});

learnLeagueSchema.index({ season: 1, tier: 1, status: 1 });

module.exports = mongoose.models.LearnLeague || mongoose.model("LearnLeague", learnLeagueSchema, "learnleagues");