const mongoose = require("mongoose");

const groupMessageSchema = new mongoose.Schema({
    groupId:   { type: mongoose.Schema.Types.ObjectId, ref: "GroupChat", required: true },
    sender:    { type: String, required: true },
    text:      { type: String, default: "" },
    imageUrl:  { type: String, default: "" },
    audioUrl:  { type: String, default: "" },
    color:     { type: String, default: "#3b82f6" },
    replyTo: {
        sender:  { type: String, default: null },
        text:    { type: String, default: "" },
        messageId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    reactions: {
        like:  { type: [String], default: [] },
        love:  { type: [String], default: [] },
        laugh: { type: [String], default: [] },
        fire:  { type: [String], default: [] },
        sad:   { type: [String], default: [] },
        angry: { type: [String], default: [] },
    },
    readBy:    { type: [String], default: [] },
    // Per-user, so starring is personal inside a shared conversation.
    starredBy: { type: [String], default: [] },
    editedAt:  { type: Date, default: null },
    // `mentions` was being assigned by routes/groups.js on every message edit
    // but was never declared here, so strict mode dropped it and group mentions
    // never existed. Declared now; `post.js` already has the same field.
    mentions:  { type: [String], default: [] },
    // Group-wide pin, shown in a strip at the top of the thread. Unlike a DM
    // this is a property of the message, not of a viewer, so a boolean is right.
    pinned:    { type: Boolean, default: false },
    pinnedBy:  { type: String, default: "" },
    // Per-user saved, and read-then-unread-again.
    bookmarkedBy:    { type: [String], default: [] },
    markedUnreadBy: { type: [String], default: [] },
    // Sender-requested expiry. A TTL index on this is what deletes the document;
    // the group setting only controls whether a sender may set it.
    expiresAt: { type: Date, default: null },
    kind: { type: String, enum: ["text", "image", "video", "audio", "file", "location", "poll", "contact", "code"], default: "text" },
    attachments: [{
        url:      { type: String, default: "" },
        name:     { type: String, default: "" },
        mimeType: { type: String, default: "" },
        size:     { type: Number, default: 0 },
    }],
    videoUrl:  { type: String, default: "" },
    location: {
        lat:   { type: Number, default: null },
        lng:   { type: Number, default: null },
        label: { type: String, default: "" },
    },
    poll: {
        question: { type: String, default: "" },
        options: [{
            text:  { type: String, default: "" },
            votes: { type: [String], default: [] },
        }],
        votes: { type: [String], default: [] },
    },
    contact: {
        username:    { type: String, default: "" },
        displayName: { type: String, default: "" },
        avatarUrl:   { type: String, default: "" },
    },

    // Soft delete. DMs blank the text and set `deleted`; groups used to hard
    // delete the row, which made an edit-in-progress message simply vanish
    // mid-render and left the sender with no way to tell it apart from a network
    // failure.
    deleted:   { type: Boolean, default: false },
    linkPreview: {
        type: {
            title:       { type: String, default: "" },
            description: { type: String, default: "" },
            image:       { type: String, default: "" },
            url:         { type: String, default: "" },
            domain:      { type: String, default: "" },
            siteName:    { type: String, default: "" },
            favicon:     { type: String, default: "" },
        },
        default: null,
    },
    timeStamp: { type: Date, default: Date.now },
});

groupMessageSchema.index({ groupId: 1, timeStamp: -1 });
groupMessageSchema.index({ groupId: 1, readBy: 1 });
groupMessageSchema.index({ starredBy: 1, timeStamp: -1 });
groupMessageSchema.index({ bookmarkedBy: 1, timeStamp: -1 });
groupMessageSchema.index({ groupId: 1, pinned: -1 });
// Makes sender-requested group expiry actually delete the document. A null
// `expiresAt` is never expired, so the index is safe for the whole collection.
groupMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Model-level content-filter backstop. Group chat had no text moderation, so any
 * member could post unfiltered content into a room. The check lives on the model
 * so it cannot be bypassed by a route that forgets it; routes still check first
 * to return a clean 400.
 */
// Async pre-save hooks must NOT take a `next` callback: Mongoose (Kareem) skips
// `next` for async middleware, so calling it threw `TypeError: next is not a
// function` on every GroupMessage.create. Throwing rejects the save instead.
groupMessageSchema.pre("save", async function enforceContentFilter() {
    if (this.skipContentFilter) return;
    if (this.deleted) return;
    const { checkText } = require("../lib/textFilter");
    const result = await checkText(this.text, "group");
    if (result.blocked) {
        const err = new Error("Message contains content that is not allowed");
        err.statusCode = 400;
        err.filtered = true;
        err.matchedTerms = result.matches;
        throw err;
    }
});

module.exports = mongoose.models.GroupMessage || mongoose.model("GroupMessage", groupMessageSchema);
