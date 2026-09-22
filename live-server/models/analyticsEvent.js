const mongoose = require("mongoose");

// Lightweight telemetry row written by the client's /api/track beacon.
// Kept intentionally small and indexed for time-windowed aggregations so the
// admin dashboard can answer "users, devices and locations, by day/month/year".
const analyticsEventSchema = new mongoose.Schema({
    type:    { type: String, default: "page_view", index: true }, // page_view | login | signup | post_create | ...
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    sessionId: { type: String, default: "" },
    path:    { type: String, default: "" },
    referrer:{ type: String, default: "" },
    device: {
        type:    { type: String, enum: ["mobile", "tablet", "desktop", "bot", ""], default: "" },
        os:      { type: String, default: "" },
        browser: { type: String, default: "" },
    },
    location: {
        country:     { type: String, default: "" }, // "Pakistan"
        countryCode: { type: String, default: "", index: true }, // "PK"
        region:      { type: String, default: "" },
        city:        { type: String, default: "" },
        lat:         { type: Number, default: null },
        lon:         { type: Number, default: null },
        tz:          { type: String, default: "" },
    },
    createdAt: { type: Date, default: Date.now, index: true },
});

analyticsEventSchema.index({ createdAt: -1, type: 1 });
analyticsEventSchema.index({ "location.countryCode": 1, createdAt: -1 });

module.exports = mongoose.models.AnalyticsEvent || mongoose.model("AnalyticsEvent", analyticsEventSchema);