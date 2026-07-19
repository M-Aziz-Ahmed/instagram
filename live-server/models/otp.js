const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
    email:     { type: String, required: true, lowercase: true },
    code:      { type: String, required: true },
    expiresAt: { type: Date, required: true },
    used:      { type: Boolean, default: false },
});

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.OTP || mongoose.model("OTP", otpSchema);
