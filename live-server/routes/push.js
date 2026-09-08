const express = require("express");
const PushSubscription = require("../models/pushSubscription");
const FcmToken = require("../models/fcmToken");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// POST /subscribe
router.post("/subscribe", verifyToken, async (req, res) => {
    try {
        const { subscription, userAgent } = req.body;
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return res.status(400).json({ error: "Invalid subscription" });
        }

        const user = await User.findById(req.userId).select("username").lean();
        if (!user) return res.status(404).json({ error: "User not found" });

        await PushSubscription.findOneAndUpdate(
            { endpoint: subscription.endpoint },
            {
                userId: req.userId,
                username: user.username,
                endpoint: subscription.endpoint,
                keys: subscription.keys,
                userAgent: userAgent || "",
            },
            { upsert: true, returnDocument: 'after' }
        );

        return res.json({ ok: true });
    } catch (err) {
        console.error("Push subscribe error:", err);
        return res.status(500).json({ error: "Failed to save subscription" });
    }
});

// POST /unsubscribe
router.post("/unsubscribe", verifyToken, async (req, res) => {
    try {
        const { endpoint } = req.body;

        if (endpoint) {
            await PushSubscription.deleteOne({ endpoint });
        } else {
            await PushSubscription.deleteMany({ userId: req.userId });
        }

        return res.json({ ok: true });
    } catch (err) {
        console.error("Push unsubscribe error:", err);
        return res.status(500).json({ error: "Failed to remove subscription" });
    }
});

// POST /fcm/token — native app (Capacitor) registers its Firebase token.
router.post("/fcm/token", verifyToken, async (req, res) => {
    try {
        const { token, platform } = req.body;
        if (!token) return res.status(400).json({ error: "Missing token" });

        const user = await User.findById(req.userId).select("username").lean();
        if (!user) return res.status(404).json({ error: "User not found" });

        await FcmToken.findOneAndUpdate(
            { token },
            { userId: req.userId, username: user.username, platform: platform || "android", lastSeen: new Date() },
            { upsert: true, returnDocument: "after" }
        );

        return res.json({ ok: true });
    } catch (err) {
        console.error("FCM token save error:", err);
        return res.status(500).json({ error: "Failed to save FCM token" });
    }
});

// DELETE /fcm/token — remove a token (app logout / dev reset).
router.delete("/fcm/token", verifyToken, async (req, res) => {
    try {
        const { token } = req.body;
        if (token) {
            await FcmToken.deleteOne({ token });
        } else {
            await FcmToken.deleteMany({ userId: req.userId });
        }
        return res.json({ ok: true });
    } catch (err) {
        console.error("FCM token delete error:", err);
        return res.status(500).json({ error: "Failed to remove FCM token" });
    }
});

module.exports = router;
