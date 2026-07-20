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
    timeStamp: { type: Date, default: Date.now },
});

groupMessageSchema.index({ groupId: 1, timeStamp: -1 });
groupMessageSchema.index({ groupId: 1, readBy: 1 });

module.exports = mongoose.models.GroupMessage || mongoose.model("GroupMessage", groupMessageSchema);
