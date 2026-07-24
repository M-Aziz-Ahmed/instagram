const mongoose = require("mongoose");

const botSchema = new mongoose.Schema({
    name:         { type: String, required: true, trim: true },
    username:     { type: String, required: true, unique: true, trim: true, lowercase: true },
    bio:          { type: String, default: "" },
    avatarUrl:    { type: String, default: "" },
    avatarColor:  { type: String, default: "#10b981" },
    topics:       [{ type: String, trim: true }],
    style:        { type: String, enum: ["casual", "professional", "funny", "news", "hype"], default: "casual" },
    active:       { type: Boolean, default: true },
    postsPerDay:  { type: Number, default: 1, min: 1, max: 10 },
    postTimes:    [{ type: String, default: ["09:00"] }],
    lastPostedAt: { type: Date, default: null },
    totalPosts:   { type: Number, default: 0 },
    createdBy:    { type: String, required: true },
    createdAt:    { type: Date, default: Date.now },
});

botSchema.index({ active: 1 });
botSchema.index({ username: 1 });

module.exports = mongoose.models.Bot || mongoose.model("Bot", botSchema);
