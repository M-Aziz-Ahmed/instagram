const mongoose = require("mongoose");

const fcmTokenSchema = new mongoose.Schema({
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true, index: true },
    token:    { type: String, required: true },
    platform: { type: String, enum: ["android", "ios", "web"], default: "android" },
    createdAt: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now },
});

fcmTokenSchema.index({ token: 1 }, { unique: true });

module.exports = mongoose.models.FcmToken || mongoose.model("FcmToken", fcmTokenSchema);