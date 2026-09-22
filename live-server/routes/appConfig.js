const express = require("express");
const Announcement = require("../models/announcement");
const siteSettings = require("../models/siteSettings");

const router = express.Router();

// Public config surface: maintenance flag + active announcements.
// Consumed by the app shell (AnnouncementBanner) and signup gate.
router.get("/config", async (req, res) => {
    try {
        const [settings, announcements] = await Promise.all([
            siteSettings.getSettings(),
            Announcement.find({
                active: true,
                $or: [{ endsAt: null }, { endsAt: { $gt: new Date() } }],
                $and: [{ startsAt: { $exists: true } }, { $or: [{ startsAt: null }, { startsAt: { $lte: new Date() } }] }],
            }).sort({ createdAt: -1 }).limit(5).lean(),
        ]);

        const publicAnnouncements = announcements.map((a) => ({
            id: a._id.toString(),
            title: a.title,
            body: a.body,
            link: a.link,
            color: a.color,
            audience: a.audience,
            dismissible: a.dismissible,
            createdAt: a.createdAt,
        }));

        res.json({
            maintenance: settings.maintenance,
            signupsOpen: settings.signupsOpen,
            announcements: publicAnnouncements,
            generatedAt: new Date().toISOString(),
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;