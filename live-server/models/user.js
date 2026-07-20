const mongoose = require("mongoose");
require("./role");

const userSchema = new mongoose.Schema({
    email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
    username:    { type: String, default: "", trim: true },
    bio:         { type: String, default: "" },
    avatarColor: { type: String, default: "#3b82f6" },
    avatarUrl:   { type: String, default: "" },
    isVerified:  { type: Boolean, default: false },
    isAdmin:     { type: Boolean, default: false },
    liveStreamAllowed: { type: Boolean, default: false },
    voiceChatBanned:   { type: Boolean, default: false },
    voiceChatBannedUntil: { type: Date, default: null },
    voiceChatBannedReason: { type: String, default: "" },
    roles:       [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }],
    followers:   [{ type: String, default: [] }],
    following:   [{ type: String, default: [] }],
    bookmarks:   [{ type: String, default: [] }],
    closeFriends: [{ type: String, default: [] }],
    mutedWords:   [{ type: String, default: [] }],
    language:     { type: String, default: "en" },
    autoTranslate: { type: Boolean, default: false },
    lastActive:   { type: Date, default: Date.now },
    isOnline:     { type: Boolean, default: false },
    inviteCode:   { type: String, default: null },
    referredBy:   { type: String, default: null },
    inviteCount:  { type: Number, default: 0 },
    createdAt:   { type: Date, default: Date.now },
    chessGames:  { type: [{
        gameId:       { type: String, required: true },
        opponent:     { type: String, default: "" },
        playerColor:  { type: String, enum: ["w", "b"], required: true },
        result:       { type: String, enum: ["1-0", "0-1", "1/2-1/2", "*"], default: "*" },
        resultReason: { type: String, default: "" },
        mode:         { type: String, enum: ["multiplayer", "ai"], default: "multiplayer" },
        moves:        { type: Number, default: 0 },
        timeControl:  { type: String, default: "" },
        playedAt:     { type: Date, default: Date.now },
        gameStats:    { type: mongoose.Schema.Types.Mixed, default: {} },
    }], default: [] },
});

userSchema.index({ username: 1 }, { sparse: true });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
