const express = require("express");
const Notification = require("../models/notification");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// GET /
router.get("/", verifyToken, async (req, res) => {
    try {
        const username = (await User.findById(req.userId).select("username").lean())?.username;
        if (!username) return res.status(400).json({ error: "Username required" });

        const limit = Math.min(parseInt(req.query.limit || "30", 10), 100);
        const notifs = await Notification.find({ recipient: username })
            .sort({ createdAt: -1 }).limit(limit).lean();

        const fromUsernames = [...new Set(notifs.map((n) => n.fromUser))];
        const users = await User.find({ username: { $in: fromUsernames } })
            .select("username isVerified isAdmin roles")
            .populate("roles", "name badge color").lean();

        const userMap = Object.fromEntries(users.map((u) => [u.username, u]));

        const enriched = notifs.map((n) => ({
            ...n,
            fromUserDoc: userMap[n.fromUser] || null,
        }));

        return res.json(enriched);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch notifications" });
    }
});

// PATCH /read
router.patch("/read", verifyToken, async (req, res) => {
    try {
        const username = req.body?.username || (await User.findById(req.userId).select("username").lean())?.username;
        if (!username) return res.status(400).json({ error: "Username required" });

        await Notification.updateMany({ recipient: username, read: false }, { read: true });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to mark read" });
    }
});

// DELETE /:id
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const username = (await User.findById(req.userId).select("username").lean())?.username;

        const notif = await Notification.findById(id);
        if (!notif) return res.status(404).json({ error: "Not found" });
        if (notif.recipient !== username) return res.status(403).json({ error: "Unauthorized" });

        await Notification.findByIdAndDelete(id);
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

module.exports = router;
