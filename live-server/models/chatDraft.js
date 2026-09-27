const mongoose = require("mongoose");

/**
 * Per-conversation message draft.
 *
 * The existing `draft.js` model is ONE draft per account (unique index on
 * `userId`), which is fine for the composer's single global draft but useless
 * for chat: a draft has to belong to a specific thread, or opening a second
 * conversation overwrites the first one's unsent text.
 *
 * Compound unique index on (userId, scope) where `scope` is the lowercase
 * counterpart username, or `"group:<id>"` for a group. One row per thread.
 */
const chatDraftSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        // Lowercase counterpart username, or `group:<hex id>`.
        scope:   { type: String, required: true, maxlength: 80 },
        text:    { type: String, default: "" },
        // Attachment URLs already uploaded but not yet sent, so closing the tab
        // mid-send does not orphan a Cloudinary asset with no message.
        imageUrl:  { type: String, default: "" },
        audioUrl:  { type: String, default: "" },
        videoUrl:  { type: String, default: "" },
        attachments: { type: mongoose.Schema.Types.Mixed, default: null },
        replyTo: { type: mongoose.Schema.Types.Mixed, default: null },
        // A draft of a location or poll message is a JSON blob, not a URL, so it
        // needs somewhere to live. Without these a location or poll draft was
        // silently dropped on reload and the user lost what they had composed.
        location: { type: mongoose.Schema.Types.Mixed, default: null },
        poll:     { type: mongoose.Schema.Types.Mixed, default: null },
        // "text" | "code" — code mode wraps the stored text in a fence, so this
        // is what stops a restored code draft being sent as plain prose.
        kind: { type: String, enum: ["text", "code"], default: "text" },
        updatedAt: { type: Date, default: Date.now },
    },
    { minimize: false }
);

chatDraftSchema.index({ userId: 1, scope: 1 }, { unique: true });

module.exports = mongoose.models.ChatDraft || mongoose.model("ChatDraft", chatDraftSchema);
