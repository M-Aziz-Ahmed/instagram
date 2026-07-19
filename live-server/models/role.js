const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema({
    name:      { type: String, required: true, trim: true },
    badge:     { type: String, default: "⭐" },
    color:     { type: String, default: "#6b7280" },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Role || mongoose.model("Role", roleSchema);
