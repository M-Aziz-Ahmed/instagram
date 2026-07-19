import mongoose from "mongoose";

const callSessionSchema = new mongoose.Schema({
    callId:     { type: String, required: true, unique: true },
    type:       { type: String, enum: ["1:1", "group"], default: "1:1" },
    groupId:    { type: mongoose.Schema.Types.ObjectId, ref: "GroupChat", default: null },
    caller:     { type: String, required: true },
    recipients: { type: [String], default: [] },
    callType:   { type: String, enum: ["audio", "video"], default: "audio" },
    status:     { type: String, enum: ["ringing", "active", "ended", "missed", "declined"], default: "ringing" },
    startedAt:  { type: Date, default: Date.now },
    endedAt:    { type: Date, default: null },
    duration:   { type: Number, default: 0 },
});

callSessionSchema.index({ status: 1, startedAt: -1 });
callSessionSchema.index({ "recipients": 1, status: 1 });

export default mongoose.models.CallSession || mongoose.model("CallSession", callSessionSchema);
