const mongoose = require("mongoose");

// Lightweight telemetry row written by the client's /api/track beacon.
// Kept intentionally small and indexed for time-windowed aggregations so the
// admin dashboard can answer "users, devices and locations, by day/month/year".
const analyticsEventSchema = new mongoose.Schema({
    type:    { type: String, default: "page_view", index: true }, // page_view | login | signup | post_create | post_impression | post_click | ...
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    sessionId: { type: String, default: "" },
    // Set on per-post events so a creator can be shown when their content was
    // actually seen, not just a lifetime total bucketed onto the publish date.
    postId:  { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null, index: true },
    // Small free-form slot for the click target (hashtag name, link host, ...).
    // Kept short and string-only so it can never become a payload store.
    meta:    { type: String, default: "", maxlength: 120 },
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
// Per-post analytics rolls up one creator's posts over a time window, which is
// exactly this match+sort, so it needs its own index.
analyticsEventSchema.index({ postId: 1, createdAt: -1 });
analyticsEventSchema.index({ postId: 1, type: 1, createdAt: -1 });
analyticsEventSchema.index({ "location.countryCode": 1, createdAt: -1 });
// The admin globe rolls locations up with $group over the time window, so the
// match+sort it relies on has to be index-backed or it degrades into a
// collection scan as the events collection grows.
analyticsEventSchema.index({ createdAt: -1, "location.countryCode": 1, "location.region": 1, "location.city": 1 });

module.exports = mongoose.models.AnalyticsEvent || mongoose.model("AnalyticsEvent", analyticsEventSchema);