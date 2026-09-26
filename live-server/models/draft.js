const mongoose = require("mongoose");

// One auto-saved compose draft per account.
//
// Attachments are deliberately NOT stored. The composer holds picked images as
// browser `File` objects and voice notes as blob URLs, neither of which can be
// reconstructed from anything the server has. Rather than silently dropping
// them, the draft records that they existed so the UI can tell the author to
// re-attach before publishing.
const draftSchema = new mongoose.Schema({
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text:     { type: String, default: "", maxlength: 500 },
    visibility:   { type: String, enum: ["public", "closeFriends"], default: "public" },
    expiresIn:    { type: Number, default: null },
    pollEnabled:  { type: Boolean, default: false },
    pollOptions:  { type: [String], default: [] },
    // Set when the abandoned draft had images, a GIF or a voice note attached.
    hadAttachments: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now, index: true },
});

// One draft per user: the composer is a single inline box, so the newest save
// replaces the previous one rather than accumulating a list nobody reads.
draftSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.models.Draft || mongoose.model("Draft", draftSchema);
