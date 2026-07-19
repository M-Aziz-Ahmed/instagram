const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema({
    username:   { type: String, required: true },
    avatarUrl:  { type: String, default: "" },
    color:      { type: String, default: "#3b82f6" },
    role:       { type: String, enum: ["admin", "member"], default: "member" },
    joinedAt:   { type: Date, default: Date.now },
}, { _id: false });

const groupChatSchema = new mongoose.Schema({
    name:        { type: String, required: true, trim: true, maxlength: 50 },
    description: { type: String, default: "", maxlength: 200 },
    avatarUrl:   { type: String, default: "" },
    creator:     { type: String, required: true },
    members:     { type: [memberSchema], default: [] },
    lastMessage: {
        text:     { type: String, default: "" },
        sender:   { type: String, default: "" },
        imageUrl: { type: String, default: "" },
        timeStamp:{ type: Date, default: Date.now },
    },
    permissions: {
        whoCanSend:  { type: String, enum: ["all", "admin"], default: "all" },
        whoCanAdd:   { type: String, enum: ["all", "admin"], default: "all" },
    },
    pinned:     { type: Boolean, default: false },
    mutedBy:    { type: [String], default: [] },
    createdAt:  { type: Date, default: Date.now },
    updatedAt:  { type: Date, default: Date.now },
});

groupChatSchema.index({ "members.username": 1 });
groupChatSchema.index({ updatedAt: -1 });

module.exports = mongoose.models.GroupChat || mongoose.model("GroupChat", groupChatSchema);
