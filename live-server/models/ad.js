const mongoose = require("mongoose");

// Semantic placement. Kept separate from `position`, which is a numeric sort
// weight - they used to be conflated, and because `position` is a Number the
// string placements ("banner", "sidebar", ...) could never match it, so every
// placement request silently returned zero ads.
const AD_SLOTS = [
    "feed",      // main social feed
    "reels",     // /reels
    "watch",     // movie & tv hub
    "manga",     // manga reader
    "education", // learn hub and course pages
    "sidebar",   // desktop side rail
];

const adSchema = new mongoose.Schema({
    title:       { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: "", maxlength: 300 },
    imageUrl:    { type: String, default: "" },
    linkUrl:     { type: String, default: "" },
    adType:      { type: String, enum: ["custom", "adsense", "adsterra"], default: "custom" },
    adsterraCode:{ type: String, default: "" },
    adsenseSlot: { type: String, default: "" },
    // Optional per-ad publisher id, for rotating between AdSense accounts.
    // Falls back to NEXT_PUBLIC_ADSENSE_CLIENT when empty.
    adsenseClient: { type: String, default: "" },
    // Explicit creative size for iframe creatives, e.g. "300x250" or "728x90".
    // Most networks default to 300x250, but native/push-bar units need their
    // real dimensions or the creative gets clipped to an empty box.
    adSize:      { type: String, default: "" },
    ctaText:     { type: String, default: "Learn More" },
    // Which surface this ad belongs on. Empty means "unassigned" and such ads
    // are never served, because a client asking for a specific placement must
    // not receive an ad that was never meant for it.
    slot:        { type: String, enum: [...AD_SLOTS, ""], default: "" },
    // Numeric ordering weight among ads that share a slot.
    position:    { type: Number, default: 0 },
    startDate:   { type: Date, default: null },
    endDate:     { type: Date, default: null },
    isActive:    { type: Boolean, default: true },
    impressions: { type: Number, default: 0 },
    clicks:      { type: Number, default: 0 },
    createdBy:   { type: String, default: "" },
    createdAt:   { type: Date, default: Date.now },
    updatedAt:   { type: Date, default: Date.now },
});

adSchema.index({ isActive: 1, slot: 1, position: 1 });
adSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.models.Ad || mongoose.model("Ad", adSchema);
module.exports.AD_SLOTS = AD_SLOTS;
