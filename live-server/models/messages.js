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
messagesSchema.pre("save", async function enforceContentFilter(next) {
    try {
        if (this.skipContentFilter) return next();
        // A soft-deleted message keeps its original text for the tombstone, so
        // re-checking it would block a delete.
        if (this.deleted) return next();
        const { checkText } = require("../lib/textFilter");
        const result = await checkText(this.text, "dm");
        if (result.blocked) {
            const err = new Error("Message contains content that is not allowed");
            err.statusCode = 400;
            err.filtered = true;
            err.matchedTerms = result.matches;
            return next(err);
        }
        return next();
    } catch (err) {
        return next(err);
    }
});

module.exports = mongoose.models.Message || mongoose.model("Message", messagesSchema);
