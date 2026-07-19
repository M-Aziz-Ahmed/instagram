const mongoose = require("mongoose");

const typingSchema = new mongoose.Schema({
    username:  { type: String, required: true, unique: true },
    typingTo:  { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now, expires: 15 },
});

typingSchema.index({ typingTo: 1 });

module.exports = mongoose.models.Typing || mongoose.model("Typing", typingSchema);
