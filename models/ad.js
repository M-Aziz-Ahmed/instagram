import mongoose from "mongoose";

const adSchema = new mongoose.Schema({
    title:       { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: "", maxlength: 300 },
    imageUrl:    { type: String, default: "" },
    linkUrl:     { type: String, default: "" },
    adType:      { type: String, enum: ["custom", "adsense", "adsterra"], default: "custom" },
    // For adsterra: the ad zone/script URL
    adsterraCode:{ type: String, default: "" },
    // For adsense: the ad slot ID
    adsenseSlot: { type: String, default: "" },
    // Custom ad creative
    ctaText:     { type: String, default: "Learn More" },
    // Targeting
    position:    { type: Number, default: 0 }, // 0 = auto (every 10-15 posts)
    // Scheduling
    startDate:   { type: Date, default: null },
    endDate:     { type: Date, default: null },
    // Status
    isActive:    { type: Boolean, default: true },
    impressions: { type: Number, default: 0 },
    clicks:      { type: Number, default: 0 },
    // Admin who created it
    createdBy:   { type: String, default: "" },
    createdAt:   { type: Date, default: Date.now },
    updatedAt:   { type: Date, default: Date.now },
});

adSchema.index({ isActive: 1, position: 1 });
adSchema.index({ startDate: 1, endDate: 1 });

export default mongoose.models.Ad || mongoose.model("Ad", adSchema);
