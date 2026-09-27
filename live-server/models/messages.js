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

module.exports = mongoose.models.Message || mongoose.model("Message", messagesSchema);
