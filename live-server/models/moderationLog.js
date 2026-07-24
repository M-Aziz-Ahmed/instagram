const mongoose = require("mongoose");

const moderationLogSchema = new mongoose.Schema({
    postId:       { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    action:       { type: String, enum: ["remove", "restore"], required: true },
    moderator:    { type: String, required: true },
    reason:       { type: String, default: "" },
    postOwner:    { type: String, default: "" },
    postPreview:  { type: String, default: "" },
    timeStamp:    { type: Date, default: Date.now },
});

moderationLogSchema.index({ timeStamp: -1 });

module.exports = mongoose.models.ModerationLog || mongoose.model("ModerationLog", moderationLogSchema);
