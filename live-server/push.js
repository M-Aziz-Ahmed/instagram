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

/**
 * Read the service account from either an inline JSON blob or a path to a file.
 *
 * The inline form is the one that breaks. A service account pasted out of the
 * Firebase console arrives as a JavaScript object literal, and the two failures
 * that actually occur are a doubled outer brace (a second paste layer, or a
 * templating helper that wrapped it) and single-quoted keys. Both are invalid
 * JSON and both failed at "position 1", which is a completely unhelpful place to
 * look when the real problem is somewhere in the middle of a 500-character blob
 * — and it cost the native app its closed-app notifications while web push kept
 * working, so nothing looked broken.
 *
 * So the doubled-brace form is unwrapped rather than rejected, and anything
 * still unparseable is reported with the actual offset. Using
 * FIREBASE_SERVICE_ACCOUNT_PATH with a real .json file remains the robust option
 * and sidesteps .env quoting entirely.
 */
function parseServiceAccount(raw) {
    const trimmed = raw.trim();

    // A filesystem path, not inline JSON.
    if (!trimmed.startsWith("{")) return require(trimmed);

    // `{{ ... }}` -> `{ ... }`, but only when it really is doubled, so a valid
    // single-brace object whose first *value* is an object is left alone.
    let candidate = trimmed;
    if (candidate.startsWith("{{") && candidate.endsWith("}}")) {
        candidate = candidate.slice(1, -1).trim();
    }

    try {
        return JSON.parse(candidate);
    } catch (err) {
        throw new Error(
            `${err.message} — the value looks like a JS object literal rather than JSON. ` +
            `Check for a doubled outer brace ({{...}}), single-quoted keys, or a trailing comma. ` +
            `Prefer setting FIREBASE_SERVICE_ACCOUNT_PATH to a .json file instead.`
        );
    }
}
const fcmConfig = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (fcmConfig) {
    try {
        const { initializeApp, credential } = require("firebase-admin");
        const admin = { initializeApp, credential };
        const serviceAccount = parseServiceAccount(fcmConfig);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        messaging = admin;
        console.log("[PUSH] FCM configured — native app closed-notifications enabled");
    } catch (err) {
        messaging = null;
        console.error("[PUSH] FCM init error (native app push DISABLED):", err.message);
        // This silently cost the mobile app its closed-app notifications while
        // the only other symptom was web push still working, so nothing looked
        // broken. Say which value is at fault and what is wrong with it.
        console.error("[PUSH]   variable : FIREBASE_SERVICE_ACCOUNT" + (process.env.FIREBASE_SERVICE_ACCOUNT ? "" : "_PATH"));
        console.error("[PUSH]   looks like: a JavaScript object literal, not JSON. Common causes:");
        console.error("[PUSH]     - double braces  {{ \"type\": ... }}   -> remove one layer");
        console.error("[PUSH]     - single quotes  { 'type': ... }      -> use double quotes");
        console.error("[PUSH]     - trailing comma after the last field");
        console.error("[PUSH]   or point FIREBASE_SERVICE_ACCOUNT_PATH at a .json FILE instead, which");
        console.error("[PUSH]   sidesteps .env quoting entirely.");
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
 * @param {string} [opts.callId] - required for call_incoming so the notification
 *   can offer accept/decline and so a page opened from it can rebuild state.
 */
async function sendPushNotification({ recipientUsername, type, fromUser, text, url, callId }) {
    if (!recipientUsername) return;

    const title = titleFor(type, fromUser);
    const body = text || "";
    const link = url || "/";
    // One notification per conversation, not per message: a tag makes the
    // platform replace the previous notification instead of stacking them.
    //
    // Calls are keyed on the callId, not the caller, so two calls from the same
    // person cannot overwrite each other. The page-side path in
    // CallContext.jsx uses this same key, which is what stops a minimised tab
    // showing a duplicate of the notification the service worker just raised.
    const tag = type === "message"
        ? `dm_${fromUser}`
        : type === "call_incoming"
            ? `call_${callId || fromUser}`
            : undefined;

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
            const payload = JSON.stringify({ title, body, icon: "/icon-192.png", badge: "/icon-192.png", url: link, type, tag, callId: callId || "" });
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
        await sendFcmPush({ recipientUsername, title, body, type, url: link, callId });
    }

    if (!anyChannel) {
        console.warn(`[PUSH] Skipping ${type} -> ${recipientUsername} (no VAPID keys and no FCM configured)`);
    }
}

async function sendFcmPush({ recipientUsername, title, body, type, url, callId }) {
    try {
        const tokens = await FcmToken.find({ username: recipientUsername }).select("token platform").lean();
        if (!tokens.length) return;

        const result = await messaging.messaging().sendEachForMulticast({
            tokens: tokens.map(t => t.token),
            notification: { title, body },
            // FCM data values must all be strings, and the native shell reads
            // `callId` to raise its own accept/decline affordance.
            data: { type, url, title, body, callId: callId || "" },
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
        // Social activity. These had no title, so they fell through to the
        // generic default and every like read "Notification from someone" — the
        // in-app document said "liked your post" while the OS notification said
        // nothing, which is why it was not worth turning on.
        case "like":
        case "love":
        case "laugh":
        case "fire":
        case "sad":
        case "angry":          return `${fromUser} reacted to your post`;
        case "comment":        return `${fromUser} commented on your post`;
        case "mention":        return `${fromUser} mentioned you`;
        case "follow":         return `${fromUser} started following you`;
        case "live":           return `${fromUser} is live now`;
        case "story_reply":    return `${fromUser} replied to your story`;
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