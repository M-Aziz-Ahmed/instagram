const mongoose = require("mongoose");

const systemLogSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        enum: ["frontend", "database", "server", "games", "users", "chats", "auth", "moderation", "system"],
        index: true,
    },
    level: {
        type: String,
        enum: ["info", "warn", "error", "debug"],
        default: "info",
        index: true,
    },
    action: {
        type: String,
        required: true,
        index: true,
    },
    message: {
        type: String,
        default: "",
    },
    username: {
        type: String,
        default: null,
        index: true,
    },
    ip: {
        type: String,
        default: null,
    },
    userAgent: {
        type: String,
        default: null,
    },
    method: {
        type: String,
        default: null,
    },
    path: {
        type: String,
        default: null,
    },
    statusCode: {
        type: Number,
        default: null,
    },
    duration: {
        type: Number,
        default: null,
    },
    meta: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },
    gameId: {
        type: String,
        default: null,
        index: true,
    },
    gameType: {
        type: String,
        default: null,
    },
    targetUser: {
        type: String,
        default: null,
    },
    room: {
        type: String,
        default: null,
    },
}, {
    timestamps: true,
});

systemLogSchema.index({ createdAt: -1 });
systemLogSchema.index({ category: 1, createdAt: -1 });
systemLogSchema.index({ username: 1, createdAt: -1 });
systemLogSchema.index({ action: 1, createdAt: -1 });
systemLogSchema.index({ level: 1, createdAt: -1 });
systemLogSchema.index({ gameId: 1 });

// Auto-delete logs after 30 days
systemLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.models.SystemLog || mongoose.model("SystemLog", systemLogSchema);
