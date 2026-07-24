const mongoose = require("mongoose");

const contentFilterSchema = new mongoose.Schema({
    toxicWords:     [{ type: String, default: [] }],
    nudityKeywords: [{ type: String, default: [] }],
    blockNudity:    { type: Boolean, default: true },
    blurToxicWords: { type: Boolean, default: true },
    updatedAt:      { type: Date, default: Date.now },
});

module.exports = mongoose.models.ContentFilter || mongoose.model("ContentFilter", contentFilterSchema);
