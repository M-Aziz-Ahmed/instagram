import mongoose from "mongoose";

const signalSchema = new mongoose.Schema({
    from:    { type: String, required: true },
    to:      { type: String, default: "" },
    type:    { type: String, required: true },
    data:    { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: 300 },
}, { _id: false });

const liveStreamSchema = new mongoose.Schema({
    host:       { type: String, required: true, index: true },
    title:      { type: String, default: "" },
    status:     { type: String, enum: ["live", "ended"], default: "live" },
    viewers:    { type: [String], default: [] },
    maxViewers: { type: Number, default: 0 },
    signals:    { type: [signalSchema], default: [] },
    startedAt:  { type: Date, default: Date.now },
    endedAt:    { type: Date, default: null },
}, { timestamps: true });

liveStreamSchema.index({ status: 1, startedAt: -1 });

export default mongoose.models.LiveStream || mongoose.model("LiveStream", liveStreamSchema);
