const webPush = require("web-push");
const mongoose = require("mongoose");
const FcmToken = require("./models/fcmToken");

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL       = process.env.VAPID_EMAIL || "admin@anonfeed.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    try {
        const email = VAPID_EMAIL.startsWith("mailto:") ? VAPID_EMAIL : `mailto:${VAPID_EMAIL}`;
        webPush.setVapidDetails(email, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
        console.log("[PUSH] VAPID configured (public key set, private key length " + VAPID_PRIVATE_KEY.length + ")");
    } catch (err) {
        console.error("[PUSH] VAPID setup error:", err.message);
    }
} else {
    console.warn("[PUSH] VAPID keys missing — web closed-app push DISABLED (set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY in live-server/.env)");
}

// Firebase Cloud Messaging → native mobile app (Capacitor shell).
let messaging = null;
const fcmConfig = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (fcmConfig) {
    try {
        const { initializeApp, credential } = require("firebase-admin");
        const admin = { initializeApp, credential };
        const serviceAccount = fcmConfig.trim().startsWith("{") ? JSON.parse(fcmConfig) : require(fcmConfig);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        messaging = admin;
        console.log("[PUSH] FCM configured — native app closed-notifications enabled");
    } catch (err) {
        messaging = null;
        console.error("[PUSH] FCM init error (native app push DISABLED):", err.message);
    }
} else {
    console.warn("[PUSH] FCM not configured — native app closed-notifications DISABLED (set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH in live-server/.env)");
}

/**
 * Send push notifications to a user (web push + native FCM).
 * @param {Object} opts
 * @param {string} opts.recipientUsername
 * @param {string} opts.type      - "message" | "call_incoming" | "voice_*" | ...
 * @param {string} opts.fromUser
 * @param {string} [opts.text]
 * @param {string} [opts.url]
 */
async function sendPushNotification({ recipientUsername, type, fromUser, text, url }) {
    if (!recipientUsername) return;

    const title = titleFor(type, fromUser);
    const body = text || "";
    const link = url || "/";
    const tag = type === "message" ? `dm_${fromUser}` : type === "call_incoming" ? `call_${fromUser}` : undefined;

    let anyChannel = false;

    // 1) Web Push (browser / installed PWA) — works when the tab is closed.
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
        anyChannel = true;
        try {
            const col = mongoose.connection.db.collection("pushsubscriptions");
            const subs = await col.find({ username: recipientUsername }).toArray();
            if (!subs.length) {
                console.warn(`[PUSH] No web subscription for ${recipientUsername} (${type})`);
            }
            const payload = JSON.stringify({ title, body, icon: "/icon-192.png", badge: "/icon-192.png", url: link, type, tag });
            for (const sub of subs) {
                try {
                    await webPush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
                } catch (err) {
                    if (err.statusCode === 404 || err.statusCode === 410) {
                        await col.deleteOne({ _id: sub._id });
                    } else {
                        console.warn(`[PUSH] Web send ${type} -> ${recipientUsername} failed:`, err.statusCode || "", err.message || err);
                    }
                }
            }
        } catch (err) {
            console.error("[PUSH] Web push error:", err.message);
        }
    }

    // 2) Native FCM (Capacitor app) — works when the mobile app is closed/killed.
    if (messaging) {
        anyChannel = true;
        await sendFcmPush({ recipientUsername, title, body, type, url: link });
    }

    if (!anyChannel) {
        console.warn(`[PUSH] Skipping ${type} -> ${recipientUsername} (no VAPID keys and no FCM configured)`);
    }
}

async function sendFcmPush({ recipientUsername, title, body, type, url }) {
    try {
        const tokens = await FcmToken.find({ username: recipientUsername }).select("token platform").lean();
        if (!tokens.length) return;

        const result = await messaging.messaging().sendEachForMulticast({
            tokens: tokens.map(t => t.token),
            notification: { title, body },
            data: { type, url, title, body },
            android: { priority: "high" },
            apns: { payload: { aps: { sound: "default", contentAvailable: true } } },
        });

        await cleanupDeadTokens(result, tokens);
    } catch (err) {
        console.error(`[PUSH][FCM] Send ${type} -> ${recipientUsername} failed:`, err.message || err);
    }
}

async function cleanupDeadTokens(result, tokens) {
    const dead = [];
    result.responses?.forEach((r, i) => {
        const code = r.error?.code || "";
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
            dead.push(tokens[i]?.token);
        }
    });
    const tokensToDelete = dead.filter(Boolean);
    if (tokensToDelete.length) {
        await FcmToken.deleteMany({ token: { $in: tokensToDelete } });
        console.warn(`[PUSH][FCM] Removed ${tokensToDelete.length} stale token(s)`);
    }
}

function titleFor(type, fromUser) {
    switch (type) {
        case "message":        return `${fromUser} sent you a message`;
        case "call_incoming":  return `${fromUser} is calling you`;
        case "voice_invite":   return `${fromUser} invited you to voice chat`;
        case "voice_kicked":   return `You were kicked from voice chat`;
        case "voice_banned":   return `You were banned from voice chat`;
        case "voice_timeout":  return `You were timed out in voice chat`;
        default:               return `Notification from ${fromUser || "system"}`;
    }
}

/**
 * Broadcast a notification to every subscribed device (web push + FCM).
 * @param {Object} opts { title, body, url, type }
 */
async function broadcastPush({ title, body, url, type }) {
    const payload = JSON.stringify({ title, body, icon: "/icon-192.png", badge: "/icon-192.png", url: url || "/", type: type || "announcement", tag: "announcement" });
    let webOk = 0, webTotal = 0, fcmOk = 0, fcmTotal = 0;

    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
        try {
            const col = mongoose.connection.db.collection("pushsubscriptions");
            const subs = await col.find({}).toArray();
            webTotal = subs.length;
            for (const sub of subs) {
                try {
                    await webPush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
                    webOk++;
                } catch (err) {
                    if (err.statusCode === 404 || err.statusCode === 410) await col.deleteOne({ _id: sub._id });
                }
            }
        } catch (err) {
            console.error("[PUSH] broadcast web error:", err.message);
        }
    }

    if (messaging) {
        try {
            const tokens = await FcmToken.find().select("token").lean();
            fcmTotal = tokens.length;
            if (tokens.length) {
                const result = await messaging.messaging().sendEachForMulticast({
                    tokens: tokens.map(t => t.token),
                    notification: { title, body },
                    data: { type: type || "announcement", url: url || "/", title, body },
                    android: { priority: "high" },
                    apns: { payload: { aps: { sound: "default", contentAvailable: true } } },
                });
                fcmOk = result.successCount || 0;
                await cleanupDeadTokens(result, tokens);
            }
        } catch (err) {
            console.error("[PUSH] broadcast fcm error:", err.message);
        }
    }

    const summary = { webOk, webTotal, fcmOk, fcmTotal };
    console.warn("[PUSH] broadcast done:", summary);
    return summary;
}

module.exports = { sendPushNotification, broadcastPush };