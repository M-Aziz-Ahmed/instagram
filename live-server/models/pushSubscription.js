const mongoose = require("mongoose");

const pushSubscriptionSchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    username:  { type: String, required: true, index: true },
    endpoint:  { type: String, required: true },
    keys: {
        p256dh: { type: String, required: true },
        auth:   { type: String, required: true },
    },
    userAgent: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
});

pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

module.exports = mongoose.models.PushSubscription || mongoose.model("PushSubscription", pushSubscriptionSchema);
