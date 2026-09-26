const mongoose = require("mongoose");

// Site-wide runtime configuration stored as a single document. Admin-only
// PATCH via /api/admin/settings; read by the public /api/app/config endpoint.
const siteSettingsSchema = new mongoose.Schema({
    key:          { type: String, default: "config", unique: true },
    signupsOpen:  { type: Boolean, default: true },
    maintenance:  {
        active:  { type: Boolean, default: false },
        message: { type: String, default: "We'll be right back — scheduled maintenance." },
    },
    // Granular kill switches, enforced server-side by lib/featureFlags.js.
    // Each defaults to true so a missing or hand-edited document can only ever
    // turn a feature ON, never silently off.
    features:     {
        posting:     { type: Boolean, default: true },
        uploads:     { type: Boolean, default: true },
        dms:         { type: Boolean, default: true },
        liveStreams: { type: Boolean, default: true },
        voiceChat:   { type: Boolean, default: true },
        comments:    { type: Boolean, default: true },
    },
    updatedAt:    { type: Date, default: Date.now },
    updatedBy:    { type: String, default: "" },
}, { versionKey: false });

async function getSettings() {
    let doc = await mongoose.models.SiteSetting ? mongoose.models.SiteSetting.findOne().lean() : null;
    if (!doc) {
        doc = new (mongoose.models.SiteSetting || mongoose.model("SiteSetting", siteSettingsSchema))({}).toObject();
    }
    const f = doc.features || {};
    return {
        signupsOpen: doc.signupsOpen !== false,
        maintenance: {
            active: !!(doc.maintenance && doc.maintenance.active),
            message: (doc.maintenance && doc.maintenance.message) || "We'll be right back.",
        },
        features: {
            posting:     f.posting     !== false,
            uploads:     f.uploads     !== false,
            dms:         f.dms         !== false,
            liveStreams: f.liveStreams !== false,
            voiceChat:   f.voiceChat   !== false,
            comments:    f.comments    !== false,
        },
    };
}

module.exports = mongoose.models.SiteSetting || mongoose.model("SiteSetting", siteSettingsSchema);
module.exports.getSettings = getSettings;