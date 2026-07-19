import mongoose from "mongoose";

const inviteSchema = new mongoose.Schema({
    code:      { type: String, required: true, unique: true, uppercase: true, trim: true },
    createdBy: { type: String, required: true, index: true },
    usedBy:    { type: String, default: null },
    usedAt:    { type: Date, default: null },
    maxUses:   { type: Number, default: 1 },
    useCount:  { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
    active:    { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
});

inviteSchema.index({ code: 1 });
inviteSchema.index({ active: 1, expiresAt: 1 });

const Invite = mongoose.models.Invite || mongoose.model("Invite", inviteSchema);
export default Invite;
