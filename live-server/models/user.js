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
    pinHash:     { type: String, default: null },
    pinChangedAt: { type: Date, default: null },
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
    // Accounts the user has muted (soft) or blocked (hard). Kept as lowercase
    // usernames so lookups stay case-insensitive.
    mutedUsers:   [{ type: String, default: [] }],
    blockedUsers: [{ type: String, default: [] }],
    // Last time this user explicitly confirmed they are 18+. Consumed by
    // middleware/adultGate.js, which re-asks every 30 days. Only ever written
    // by POST /api/adult-gate/confirm.
    adultConfirmedAt: { type: Date, default: null },
    language:     { type: String, default: "en" },
    autoTranslate: { type: Boolean, default: false },
    lastActive:   { type: Date, default: Date.now },
    isOnline:     { type: Boolean, default: false },
    inviteCode:   { type: String, default: null },
    referredBy:   { type: String, default: null },
    inviteCount:  { type: Number, default: 0 },
    isPrivate: { type: Boolean, default: false },
    pendingFollowRequests: [{ type: String, default: [] }],
    suspended:       { type: Boolean, default: false },
    suspendedUntil:  { type: Date, default: null },
    suspendedReason: { type: String, default: "" },
    postingStreak:   { type: Number, default: 0 },
    lastPostDate:    { type: String, default: "" },
    longestStreak:   { type: Number, default: 0 },
    achievements:    [{ type: String, default: [] }],
    // ── Economy ────────────────────────────────────────────────────────────
    // Gems are the in-app currency. There is no payment provider wired up, so
    // today they are only ever credited by admins or by in-app rewards; the
    // balance is still authoritative and every change is written to the
    // GemTransaction ledger, so adding a real payment provider later only has
    // to call creditGems() at the point of capture.
    gems:            { type: Number, default: 0, min: 0 },
    proUntil:        { type: Date, default: null },
    defaultTheme:    { type: String, enum: ["default", "sunset", "ocean", "forest", "neon", "midnight", "rose", "gold"], default: "default" },
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
