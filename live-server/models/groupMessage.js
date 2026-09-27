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
    // Group messages could not be edited at all, unlike DMs.
    editedAt:  { type: Date, default: null },
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

module.exports = mongoose.models.GroupMessage || mongoose.model("GroupMessage", groupMessageSchema);
