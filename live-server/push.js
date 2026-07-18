const webPush = require("web-push");
const mongoose = require("mongoose");

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL       = process.env.VAPID_EMAIL || "admin@anonfeed.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    try {
        const email = VAPID_EMAIL.startsWith("mailto:") ? VAPID_EMAIL : `mailto:${VAPID_EMAIL}`;
        webPush.setVapidDetails(email, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    } catch (err) {
        console.error("[PUSH] VAPID setup error:", err.message);
    }
}

/**
 * Send push notifications to a user.
 * @param {Object} opts
 * @param {string} opts.recipientUsername
 * @param {string} opts.type      - "voice_invite" | "voice_kicked" | "voice_banned" | "voice_timeout"
 * @param {string} opts.fromUser
 * @param {string} [opts.text]
 * @param {string} [opts.url]
 */
async function sendPushNotification({ recipientUsername, type, fromUser, text, url }) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

    try {
        const col = mongoose.connection.db.collection("pushsubscriptions");
        const subs = await col.find({ username: recipientUsername }).toArray();
        if (!subs.length) return;

        const payload = JSON.stringify({
            title: titleFor(type, fromUser),
            body:  text || "",
            icon:  "/icon-192.png",
            badge: "/icon-192.png",
            url:   url || "/",
            type,
        });

        for (const sub of subs) {
            try {
                await webPush.sendNotification(
                    { endpoint: sub.endpoint, keys: sub.keys },
                    payload
                );
            } catch (err) {
                if (err.statusCode === 404 || err.statusCode === 410) {
                    await col.deleteOne({ _id: sub._id });
                }
            }
        }
    } catch (err) {
        console.error("[PUSH] Error:", err.message);
    }
}

function titleFor(type, fromUser) {
    switch (type) {
        case "voice_invite":  return `${fromUser} invited you to voice chat`;
        case "voice_kicked":  return `You were kicked from voice chat`;
        case "voice_banned":  return `You were banned from voice chat`;
        case "voice_timeout": return `You were timed out in voice chat`;
        default:              return `Notification from ${fromUser || "system"}`;
    }
}

module.exports = { sendPushNotification };
