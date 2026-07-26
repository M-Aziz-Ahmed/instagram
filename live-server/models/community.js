const mongoose = require("mongoose");

const channelSchema = new mongoose.Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true, maxlength: 50 },
        type: { type: String, enum: ["text", "voice", "announcement"], default: "text" },
        description: { type: String, default: "", maxlength: 200 },
        permissions: {
            whoCanJoin: { type: String, enum: ["everyone", "members", "admin-invite"], default: "members" },
            whoCanSpeak: { type: String, enum: ["everyone", "members", "admin-only"], default: "everyone" },
            whoCanPost: { type: String, enum: ["everyone", "members", "admin-only"], default: "members" },
        },
    },
    { _id: false }
);

const memberSchema = new mongoose.Schema(
    {
        username: { type: String, required: true },
        role: { type: String, enum: ["owner", "admin", "moderator", "member"], default: "member" },
        joinedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const communitySchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 100, trim: true },
    description: { type: String, default: "", maxlength: 500 },
    avatarUrl: { type: String, default: "" },
    bannerUrl: { type: String, default: "" },
    color: { type: String, default: "#3b82f6" },
    creator: { type: String, required: true },
    members: [memberSchema],
    channels: [channelSchema],
    settings: {
        whoCanCreateChannels: { type: String, enum: ["owner", "admin", "member"], default: "admin" },
        whoCanInvite: { type: String, enum: ["owner", "admin", "member"], default: "member" },
        whoCanManageVoice: { type: String, enum: ["owner", "admin", "member"], default: "admin" },
        isPublic: { type: Boolean, default: true },
    },
    inviteCode: { type: String, unique: true, sparse: true },
    memberCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

communitySchema.index({ name: "text", description: "text" });
communitySchema.index({ creator: 1 });
communitySchema.index({ inviteCode: 1 });
communitySchema.index({ memberCount: -1 });
communitySchema.index({ createdAt: -1 });

communitySchema.pre("save", function () {
    this.updatedAt = new Date();
});

module.exports = mongoose.model("Community", communitySchema);
