const mongoose = require("mongoose");

const storyReplySchema = new mongoose.Schema({
    fromUser:  { type: String, required: true },
    text:      { type: String, default: "" },
    read:      { type: Boolean, default: false },
    timeStamp: { type: Date, default: Date.now },
}, { _id: true });

const storySchema = new mongoose.Schema({
    sender:    { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    avatarUrl: { type: String, default: "" },
    imageUrl:  { type: String, default: "" },
    text:      { type: String, default: "" },
    bgColor:   { type: String, default: "#1a1a2e" },
    views:     [{ type: String, default: [] }],
    replies:   { type: [storyReplySchema], default: [] },
    createdAt: { type: Date, default: Date.now, expires: 86400 },
});

storySchema.index({ sender: 1, createdAt: -1 });
storySchema.index({ createdAt: -1 });

module.exports = mongoose.models.Story || mongoose.model("Story", storySchema);
