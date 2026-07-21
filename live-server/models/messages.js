const mongoose = require("mongoose");

const messagesSchema = new mongoose.Schema({
    text:      { type: String, default: "" },
    imageUrl:  { type: String, default: "" },
    audioUrl:  { type: String, default: "" },
    sender:    { type: String, required: true },
    recipient: { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    replyTo:   { type: { sender: String, text: String }, default: null },
    reactions: {
        like:  { type: [String], default: [] },
        love:  { type: [String], default: [] },
        laugh: { type: [String], default: [] },
        fire:  { type: [String], default: [] },
        sad:   { type: [String], default: [] },
        angry: { type: [String], default: [] },
    },
    editedAt: { type: Date, default: null },
    deleted:  { type: Boolean, default: false },
    timeStamp: { type: Date, default: Date.now },
    isRead:    { type: Boolean, default: false },
    delivered: { type: Boolean, default: false },
});

messagesSchema.index({ sender: 1, recipient: 1, timeStamp: -1 });
messagesSchema.index({ recipient: 1, isRead: 1 });
messagesSchema.index({ sender: 1, timeStamp: -1 });
messagesSchema.index({ recipient: 1, timeStamp: -1 });

module.exports = mongoose.models.Message || mongoose.model("Message", messagesSchema);
