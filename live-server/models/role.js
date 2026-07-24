const mongoose = require("mongoose");

const VALID_PERMISSIONS = [
    "create_post",
    "delete_own_post",
    "delete_any_post",
    "create_comment",
    "delete_own_comment",
    "delete_any_comment",
    "react",
    "bookmark",
    "repost",
    "manage_users",
    "manage_roles",
    "moderate_posts",
    "manage_content_filter",
    "use_voice_chat",
    "use_live_stream",
    "access_entertainment",
];

const roleSchema = new mongoose.Schema({
    name:        { type: String, required: true, trim: true },
    badge:       { type: String, default: "⭐" },
    color:       { type: String, default: "#6b7280" },
    permissions: [{ type: String, enum: VALID_PERMISSIONS }],
    createdAt:   { type: Date, default: Date.now },
});

module.exports = mongoose.models.Role || mongoose.model("Role", roleSchema);
module.exports.VALID_PERMISSIONS = VALID_PERMISSIONS;
