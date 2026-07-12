import mongoose from "mongoose";

const roleSchema = new mongoose.Schema({
    name:      { type: String, required: true, trim: true },  // e.g. "Moderator"
    badge:     { type: String, default: "⭐" },               // emoji shown next to username
    color:     { type: String, default: "#6b7280" },          // badge bg color (hex)
    createdAt: { type: Date, default: Date.now },
});

const Role = mongoose.models.Role || mongoose.model("Role", roleSchema);
export default Role;
