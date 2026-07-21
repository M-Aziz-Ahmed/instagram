const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    recipient:  { type: String, required: true },
    type:       { type: String, enum: ["like", "love", "laugh", "fire", "sad", "angry", "comment", "reply", "mention", "repost", "follow", "follow_request", "follow_accept", "message", "live"], required: true },
    fromUser:   { type: String, required: true },
    fromColor:  { type: String, default: "#3b82f6" },
    fromAvatarUrl: { type: String, default: "" },
    postId:     { type: String, default: "" },
    commentId:  { type: String, default: "" },
    text:       { type: String, default: "" },
    postText:   { type: String, default: "" },
    postImageUrl: { type: String, default: "" },
    read:       { type: Boolean, default: false },
    createdAt:  { type: Date, default: Date.now },
});

notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
