const mongoose = require("mongoose");

const flairSchema = new mongoose.Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true, maxlength: 30 },
        color: { type: String, default: "#3b82f6" },
        emoji: { type: String, default: "" },
    },
    { _id: false }
);

const ruleSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, maxlength: 100 },
        description: { type: String, default: "", maxlength: 500 },
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

const voiceChannelSchema = new mongoose.Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true, maxlength: 50 },
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
    rules: [ruleSchema],
    flairs: [flairSchema],
    voiceChannels: [voiceChannelSchema],
    settings: {
        whoCanPost: { type: String, enum: ["everyone", "members"], default: "members" },
        whoCanInvite: { type: String, enum: ["owner", "admin", "member"], default: "member" },
        isPublic: { type: Boolean, default: true },
        requirePostFlair: { type: Boolean, default: false },
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
