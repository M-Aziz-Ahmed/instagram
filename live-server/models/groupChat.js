const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema({
    username:   { type: String, required: true },
    avatarUrl:  { type: String, default: "" },
    color:      { type: String, default: "#3b82f6" },
    role:       { type: String, enum: ["admin", "member"], default: "member" },
    joinedAt:   { type: Date, default: Date.now },
}, { _id: false });

const groupChatSchema = new mongoose.Schema({
    name:        { type: String, required: true, trim: true, maxlength: 50 },
    description: { type: String, default: "", maxlength: 200 },
    avatarUrl:   { type: String, default: "" },
    creator:     { type: String, required: true },
    members:     { type: [memberSchema], default: [] },
    lastMessage: {
        text:     { type: String, default: "" },
        sender:   { type: String, default: "" },
        imageUrl: { type: String, default: "" },
        timeStamp:{ type: Date, default: Date.now },
    },
    permissions: {
        whoCanSend:  { type: String, enum: ["all", "admin"], default: "all" },
        whoCanAdd:   { type: String, enum: ["all", "admin"], default: "all" },
        whoCanPin:   { type: String, enum: ["all", "admin"], default: "all" },
        whoCanDeleteMessages: { type: String, enum: ["all", "admin"], default: "all" },
    },
    // DEAD FIELD until now: `pinned` existed here but no route set it and no
    // client read it. Pinned MESSAGES now live on GroupMessage; this group-level
    // flag is a "pin this group to the top of the list" control, which is a
    // different thing and needs its own key.
    pinned:     { type: Boolean, default: false },
    pinnedBy:   { type: String, default: "" },
    mutedBy:    { type: [String], default: [] },
    // Shown as a banner above the thread. Only admins may set or clear it.
    announcement: {
        text:      { type: String, default: "" },
        setBy:     { type: String, default: "" },
        setAt:     { type: Date, default: null },
    },
    // Seconds a member must wait between messages. 0 = off. Enforced server-side
    // on send, and the client hides the composer when the user is in cooldown.
    slowModeSeconds: { type: Number, default: 0, min: 0, max: 86400 },
    // Refuses new members once reached. 0 = unlimited.
    maxMembers: { type: Number, default: 0, min: 0, max: 1000 },
    // Shareable join token. Regenerable, and rotatable, so a leaked link can be
    // invalidated. Scoped to this group, not the user's referral code.
    inviteCode: { type: String, default: "" },
    // When true, joining requires an admin to approve. Members can still leave
    // and read; they just cannot post.
    approvalRequired: { type: Boolean, default: false },
    // Admins leave here when they no longer want the role. A member who leaves
    // is removed. A non-empty list means nobody can post, which is intentional:
    // a read-only archive is a real state for a finished group.
    leftAt: { type: Date, default: null },
    createdAt:  { type: Date, default: Date.now },
    updatedAt:  { type: Date, default: Date.now },
});

groupChatSchema.index({ "members.username": 1 });
groupChatSchema.index({ updatedAt: -1 });
// Backs joining by invite link. Sparse so the thousands of groups that have not
// generated one are excluded from the unique index entirely.
groupChatSchema.index({ inviteCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.GroupChat || mongoose.model("GroupChat", groupChatSchema);
