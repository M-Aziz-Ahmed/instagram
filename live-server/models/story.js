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

/**
 * Stories expire after 24h but are the most public surface in the app, and both
 * their text and their image were completely unmoderated. Text is checked here as
 * a model-level backstop. The image is screened by the upload route (see
 * lib/mediaModeration.js) because that needs network I/O plus asset rollback,
 * which does not belong in a document hook.
 */
storySchema.pre("save", async function enforceContentFilter(next) {
    try {
        if (this.skipContentFilter) return next();
        const { checkText } = require("../lib/textFilter");
        const result = await checkText(this.text, "story");
        if (result.blocked) {
            const err = new Error("Story contains content that is not allowed");
            err.statusCode = 400;
            err.filtered = true;
            err.matchedTerms = result.matches;
            return next(err);
        }
        return next();
    } catch (err) {
        return next(err);
    }
});

module.exports = mongoose.models.Story || mongoose.model("Story", storySchema);
