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
    // The in-app browser proxies arbitrary third-party sites through this
    // server. That makes it an abuse and ad-fraud liability, so it is opt-in
    // per role rather than available to everyone by default. Admins bypass
    // all permission checks (see middleware/auth.js requirePermission).
    "use_browser",
    // Adult content carries age-verification and geo-blocking duties under
    // GDPR Art. 8 / the UK's Age Appropriate Design Code, and it will be
    // rejected outright by the mainstream ad networks. Off by default.
    "view_adult",
    // Direct video upload is the most expensive capability the site has - it
    // burns Cloudinary storage and egress that never comes back, so it is not
    // open to everyone. Anyone without this can still post video as a link to
    // YouTube/Facebook/Instagram/TikTok/Reddit, which costs nothing and still
    // renders in the feed and in /reels. See lib/videoLinks.js.
    // Deliberately NOT in the "normal" seed role.
    "upload_video",
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
