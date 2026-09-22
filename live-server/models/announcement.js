const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema({
    title:      { type: String, required: true },
    body:       { type: String, default: "" },
    link:       { type: String, default: "" },
    color:      { type: String, default: "#1cb0f6" },
    audience:   { type: String, enum: ["all", "guests"], default: "all" },
    dismissible:{ type: Boolean, default: true },
    active:     { type: Boolean, default: true, index: true },
    createdBy:  { type: String, default: "" },
    startsAt:   { type: Date, default: null },
    endsAt:     { type: Date, default: null },
    pushedAt:   { type: Date, default: null },
}, { timestamps: true, versionKey: false });

announcementSchema.index({ active: 1, endsAt: 1 });

module.exports = mongoose.models.Announcement || mongoose.model("Announcement", announcementSchema);