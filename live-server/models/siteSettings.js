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
    updatedAt:    { type: Date, default: Date.now },
    updatedBy:    { type: String, default: "" },
}, { versionKey: false });

async function getSettings() {
    let doc = await mongoose.models.SiteSetting ? mongoose.models.SiteSetting.findOne().lean() : null;
    if (!doc) {
        doc = new (mongoose.models.SiteSetting || mongoose.model("SiteSetting", siteSettingsSchema))({}).toObject();
    }
    return {
        signupsOpen: doc.signupsOpen !== false,
        maintenance: {
            active: !!(doc.maintenance && doc.maintenance.active),
            message: (doc.maintenance && doc.maintenance.message) || "We'll be right back.",
        },
    };
}

module.exports = mongoose.models.SiteSetting || mongoose.model("SiteSetting", siteSettingsSchema);
module.exports.getSettings = getSettings;