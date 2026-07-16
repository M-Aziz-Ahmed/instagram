import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema({
    username:  { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    avatarUrl: { type: String, default: "" },
    text:      { type: String, required: true },
    replyTo:   { type: { username: String, text: String }, default: null },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });

const signalSchema = new mongoose.Schema({
    from:    { type: String, required: true },
    to:      { type: String, default: "" },
    type:    { type: String, required: true },
    data:    { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: 300 },
}, { _id: false });

const liveStreamSchema = new mongoose.Schema({
    host:        { type: String, required: true, index: true },
    title:       { type: String, default: "" },
    status:      { type: String, enum: ["live", "ended"], default: "live" },
    viewers:     { type: [String], default: [] },
    maxViewers:  { type: Number, default: 0 },
    signals:     { type: [signalSchema], default: [] },
    chat:        { type: [chatMessageSchema], default: [] },
    startedAt:   { type: Date, default: Date.now },
    endedAt:     { type: Date, default: null },
}, { timestamps: true });

liveStreamSchema.index({ status: 1, startedAt: -1 });

export default mongoose.models.LiveStream || mongoose.model("LiveStream", liveStreamSchema);
