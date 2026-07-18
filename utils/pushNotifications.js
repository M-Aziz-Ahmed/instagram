import webPush from "web-push";
import connectDB from "@/utils/db";
import PushSubscription from "@/models/pushSubscription";
import User from "@/models/user";

const VAPID_PUBLIC_KEY  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(
        "mailto:admin@anonfeed.app",
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
}

const PUSH_TYPES = ["comment", "reply", "mention", "repost", "follow", "message", "live"];

function titleFor(type, fromUser) {
    switch (type) {
        case "message": return `${fromUser} sent you a message`;
        case "comment": return `${fromUser} commented on your post`;
        case "reply":   return `${fromUser} replied to your comment`;
        case "mention": return `${fromUser} mentioned you`;
        case "repost":  return `${fromUser} reposted your post`;
        case "follow":  return `${fromUser} followed you`;
        case "live":    return `${fromUser} is now live`;
        default:        return `New notification from ${fromUser}`;
    }
}

function urlFor(type, postId, fromUser) {
    switch (type) {
        case "message": return "/inbox";
        case "follow":  return `/${fromUser}`;
        case "live":    return `/${fromUser}`;
        default:        return postId ? `/post/${postId}` : "/";
    }
}

export async function sendPushNotification({ recipientUsername, type, fromUser, postId, text }) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
    if (!PUSH_TYPES.includes(type)) return;

    try {
        await connectDB();

        // Skip push for messages if recipient was active in the last 3 minutes
        // (they're on the app — the SW handles suppression, but this is the reliable fallback)
        if (type === "message") {
            const recipient = await User.findOne({ username: recipientUsername }).select("lastActive").lean();
            if (recipient?.lastActive && (Date.now() - new Date(recipient.lastActive).getTime()) < 3 * 60 * 1000) {
                return;
            }
        }

        const subscriptions = await PushSubscription.find({ username: recipientUsername });
        if (!subscriptions.length) return;

        const payload = JSON.stringify({
            title: titleFor(type, fromUser),
            body:  text || "",
            icon:  "/icon-192.svg",
            badge: "/icon-192.svg",
            url:   urlFor(type, postId, fromUser),
            type,
        });

        const results = await Promise.allSettled(
            subscriptions.map((sub) =>
                webPush.sendNotification(
                    { endpoint: sub.endpoint, keys: sub.keys },
                    payload
                ).catch((err) => {
                    if (err.statusCode === 404 || err.statusCode === 410) {
                        return PushSubscription.deleteOne({ _id: sub._id });
                    }
                    throw err;
                })
            )
        );
    } catch (err) {
        console.error("Push notification error:", err);
    }
}
