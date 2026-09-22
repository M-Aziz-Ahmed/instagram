const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
    targetType: { type: String, enum: ["post", "comment", "user", "profile"], default: "post" },
    targetId:   { type: String, default: "" },
    reason:     { type: String, default: "spam" },
    details:    { type: String, default: "" },
    reporter:   { type: String, default: "" },
    reporterHash: { type: String, default: "" },
    status:     { type: String, enum: ["open", "resolved", "dismissed"], default: "open", index: true },
    actionTaken: { type: String, default: "" },
    createdAt:  { type: Date, default: Date.now, index: true },
    resolvedAt: { type: Date, default: null },
}, { versionKey: false });

reportSchema.index({ targetType: 1, targetId: 1, status: 1 });
reportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.Report || mongoose.model("Report", reportSchema);