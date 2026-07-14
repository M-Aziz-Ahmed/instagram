import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
    recipient:  { type: String, required: true },   // username who receives it
    type:       { type: String, enum: ["like", "love", "laugh", "fire", "sad", "angry", "comment", "reply", "mention", "repost", "follow", "message"], required: true },
    fromUser:   { type: String, required: true },   // who triggered it
    fromColor:  { type: String, default: "#3b82f6" },
    fromAvatarUrl: { type: String, default: "" },
    postId:     { type: String, default: "" },
    commentId:  { type: String, default: "" },
    text:       { type: String, default: "" },       // comment text or context
    read:       { type: Boolean, default: false },
    createdAt:  { type: Date, default: Date.now },
});

// Index for fast per-user queries
notificationSchema.index({ recipient: 1, createdAt: -1 });

const Notification = mongoose.models.Notification
    || mongoose.model("Notification", notificationSchema);

export default Notification;
