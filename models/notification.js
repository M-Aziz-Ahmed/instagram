import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
    recipient:  { type: String, required: true },   // username who receives it
    type:       { type: String, enum: ["like", "comment", "mention"], required: true },
    fromUser:   { type: String, required: true },   // who triggered it
    fromColor:  { type: String, default: "#3b82f6" },
    postId:     { type: String, required: true },
    text:       { type: String, default: "" },       // comment text or hashtag context
    read:       { type: Boolean, default: false },
    createdAt:  { type: Date, default: Date.now },
});

// Index for fast per-user queries
notificationSchema.index({ recipient: 1, createdAt: -1 });

const Notification = mongoose.models.Notification
    || mongoose.model("Notification", notificationSchema);

export default Notification;
