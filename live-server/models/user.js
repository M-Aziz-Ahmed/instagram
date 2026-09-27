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
    // Explicit per-person grant for direct video upload, for trusted users who
    // should not need a whole role. Never set to false to *revoke* - a role
    // grant or isAdmin still allows uploading. See lib/videoUpload.js.
    videoUploadAllowed: { type: Boolean, default: false },
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
    // Conversations set aside. Kept as "<username>" for DMs, lowercased, so a
    // lookup stays case-insensitive. Archived threads are hidden from the list
    // but keep receiving messages, so nothing is ever silently lost.
    archivedChats: [{ type: String, default: [] }],
    // Muted conversations: hidden from the list and excluded from the unread
    // badge, but still delivered. Distinct from mutedUsers, which is about a
    // person rather than a thread.
    mutedChats: [{ type: String, default: [] }],
    // Pinned conversations, floated to the top of the list. Same shape as the
    // two arrays above, on purpose: there is no Conversation model in this app
    // (the DM list is an aggregate grouped by counterpart username), so
    // per-conversation state has to live on the user document. Introducing a
    // second source of truth for "which conversations exist" would be a much
    // larger change than adding the flag.
    pinnedChats: [{ type: String, default: [] }],
    // Richer per-conversation settings that do not fit a flag. A Map keyed by
    // the LOWERCASE counterpart username, so casing never splits a thread in two.
    // Absent key = all defaults, which is why every consumer must treat a
    // missing entry as "not configured" rather than assuming the field exists.
    chatPreferences: {
        type: Map,
        of: {
            // What the other person is called locally. Never affects routing.
            nickname:     { type: String, default: "" },
            // "off" | "mentions" | "all"
            notify:       { type: String, enum: ["off", "mentions", "all"], default: "all" },
            sound:        { type: String, enum: ["default", "none"], default: "default" },
            // Hours after which new messages in this thread are hidden until
            // the user reopens it. 0 = off.
            autoDeleteHours: { type: Number, default: 0, min: 0, max: 8760 },
            // 0 = off. Days after which a message in this thread is removed.
            disappearingDays: { type: Number, default: 0, min: 0, max: 365 },
            // Unread messages in this thread are not counted in the global badge.
            excludeFromBadge: { type: Boolean, default: false },
        },
        default: () => ({}),
    },
    // Night hours, during which nothing pops a notification. Stored in UTC to
    // match how every other timestamp in this app is handled.
    quietHours: {
        enabled:   { type: Boolean, default: false },
        startHour: { type: Number, default: 22, min: 0, max: 23 },
        endHour:   { type: Number, default: 8, min: 0, max: 23 },
    },
    // When false, push payloads carry "New message" instead of the body.
    notificationPreviews: { type: Boolean, default: true },
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
    // Shadowban: the account works normally for the owner, but its content is
    // invisible to everyone else. It has to be a declared field — mongoose is
    // `strict: true`, so an undeclared `isShadowbanned` was silently dropped on
    // save while the admin route still returned `ok: true` from the just-assigned
    // in-memory value, making the toggle look like it worked.
    isShadowbanned:  { type: Boolean, default: false },
    shadowbanReason: { type: String, default: "" },
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
