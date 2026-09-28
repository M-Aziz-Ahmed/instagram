const mongoose = require("mongoose");

const messagesSchema = new mongoose.Schema({
    text:      { type: String, default: "" },
    imageUrl:  { type: String, default: "" },
    audioUrl:  { type: String, default: "" },
    sender:    { type: String, required: true },
    recipient: { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    replyTo:   { type: { sender: String, text: String }, default: null },
    // Set when a message was re-sent to a third party. Mirrors replyTo so the
    // bubble renderer can treat them the same way: the original is quoted as
    // provenance, and the forwarded content is the message's own body.
    forwardedFrom: { type: { sender: String, text: String }, default: null },
    reactions: {
        like:  { type: [String], default: [] },
        love:  { type: [String], default: [] },
        laugh: { type: [String], default: [] },
        fire:  { type: [String], default: [] },
        sad:   { type: [String], default: [] },
        angry: { type: [String], default: [] },
    },
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
    editedAt: { type: Date, default: null },
    // `readAt` was being written by routes/messages.js on mark-read but was
    // never declared here. The schema is strict, so mongoose dropped it on every
    // save and the "when did they read it" timestamp was silently lost.
    readAt:   { type: Date, default: null },
    // Pinned to the top of the thread. Per-user, not per-conversation: everyone
    // in a DM sees the same pin, so a single boolean is right. The counterpart
    // is a pinned-MESSAGE list, not a conversation-level flag.
    pinned:   { type: Boolean, default: false },
    // Saved/bookmarked, per user. Distinct from `starredBy`: star is a quick
    // "important" flag, bookmark is "I will come back to this".
    bookmarkedBy: { type: [String], default: [] },
    // Marks a read message as unread again. Cleared as soon as the recipient
    // re-reads, so a read/unread flip is a single reversible field.
    markedUnreadBy: { type: [String], default: [] },
    // Set when the user asked for this message to be removed after a delay.
    // A TTL index on this field is what actually deletes the document; the timer
    // only controls whether the sender can set it.
    expiresAt: { type: Date, default: null },
    // Delivery transport, so the renderer can show a distinct icon per kind.
    // Kept denormalised alongside the fields themselves rather than inferred,
    // because "audioUrl set" cannot distinguish a voice note from a file.
    kind: {
        type: String,
        // "greeting" is an ordinary text DM that arrived through an invite code.
        // It is a separate kind so the invite route can count greetings per
        // inviter (abuse budget) and so the UI can style an opening message
        // differently. It is not a different delivery path: every moderation,
        // block and notification rule applies to it exactly as to "text".
        enum: ["text", "image", "video", "audio", "file", "location", "poll", "contact", "code", "greeting"],
        default: "text",
    },
    // Non-image/video attachments. Declared here so it is not dropped.
    attachments: [{
        url:      { type: String, default: "" },
        name:     { type: String, default: "" },
        mimeType: { type: String, default: "" },
        size:     { type: Number, default: 0 },
    }],
    videoUrl:  { type: String, default: "" },
    // Present on location messages. Stored as a plain object rather than a
    // GeoJSON Point because it is never queried by proximity.
    location: {
        lat:    { type: Number, default: null },
        lng:    { type: Number, default: null },
        label:  { type: String, default: "" },
    },
    // Polls in DMs. Shape matches the post poll so PollCard can be reused.
    poll: {
        question: { type: String, default: "" },
        options: [{
            text:  { type: String, default: "" },
            votes: { type: [String], default: [] },
        }],
        votes: { type: [String], default: [] },
    },
    // A shared contact card. Never contains the sender's own account data —
    // the client fills the card from a public profile fetch.
    contact: {
        username:   { type: String, default: "" },
        displayName:{ type: String, default: "" },
        avatarUrl:  { type: String, default: "" },
    },
    // Messages the reader has starred, for jumping back to them. A plain
    // username array so "is this starred" is a single `includes`, and so two
    // people starring the same message never collide.
    starredBy: { type: [String], default: [] },
    deleted:  { type: Boolean, default: false },
    timeStamp: { type: Date, default: Date.now },
    isRead:    { type: Boolean, default: false },
    delivered: { type: Boolean, default: false },
});

messagesSchema.index({ sender: 1, recipient: 1, timeStamp: -1 });
messagesSchema.index({ recipient: 1, isRead: 1 });
messagesSchema.index({ sender: 1, timeStamp: -1 });
messagesSchema.index({ recipient: 1, timeStamp: -1 });
// Backs "my starred messages" without a collection scan.
messagesSchema.index({ starredBy: 1, timeStamp: -1 });
// Same for bookmarks, and for the pinned-message strip.
messagesSchema.index({ bookmarkedBy: 1, timeStamp: -1 });
messagesSchema.index({ sender: 1, recipient: 1, pinned: -1 });
/**
 * Mongo removes a document once `expiresAt` is in the past, which is what makes
 * disappearing messages actually disappear. Documents with a null `expiresAt`
 * are never expired, so this is safe for the whole collection.
 * Follows the existing pattern on post.js.
 */
messagesSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Defence in depth for the content filter.
 *
 * DMs had NO text moderation at all — not on the send route, not on the three
 * forward paths, nothing. Rather than patch each of those call sites and hope
 * the next one added remembers, the check lives on the model, so every write
 * path is covered including ones that do not exist yet.
 *
 * Route handlers still check first, so the user gets a clean 400 with the
 * matched term; this hook is the backstop that makes the filter unbypassable.
 *
 * The error carries `statusCode` so a route's generic `catch` can surface 400
 * rather than 500. `skipContentFilter: true` is the documented escape hatch for
 * trusted server-to-server writes.
 */
// Async pre-save hooks must NOT take a `next` callback: Mongoose (Kareem) skips
// `next` for async middleware, so calling it threw `TypeError: next is not a
// function` on every `Message.create`. Throwing rejects the save instead.
messagesSchema.pre("save", async function enforceContentFilter() {
    if (this.skipContentFilter) return;
    // A soft-deleted message keeps its original text for the tombstone, so
    // re-checking it would block a delete.
    if (this.deleted) return;
    const { checkText } = require("../lib/textFilter");
    const result = await checkText(this.text, "dm");
    if (result.blocked) {
        const err = new Error("Message contains content that is not allowed");
        err.statusCode = 400;
        err.filtered = true;
        err.matchedTerms = result.matches;
        throw err;
    }
});

module.exports = mongoose.models.Message || mongoose.model("Message", messagesSchema);
