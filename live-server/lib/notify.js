const Notification = require("../models/notification");
const { sendPushNotification } = require("../push");

/**
 * Deliver a notification on both channels, together.
 *
 * The reason this exists: the two channels were written separately. In-app
 * Notification documents are created at ~20 call sites across the routes;
 * `sendPushNotification` was called at 6. So a like, a comment, a follow, a
 * mention or a story reply reached a user with the app open and vanished
 * silently for everyone else — which is most people, most of the time, and
 * looked like the app "not notifying" rather than like a missing feature.
 *
 * Bundling them means a new notification type cannot be added to one channel
 * and forgotten in the other. `notify` is the only entry point; nothing should
 * call `Notification.create` or `sendPushNotification` directly for a social
 * event.
 *
 * Failures on either channel never fail the caller's request: a push endpoint
 * that has gone stale, or a push service that is down, must not stop a like from
 * being recorded.
 */

// Kept short on purpose. A wall of push notifications for every reaction is how
// people turn notifications off entirely, which helps nobody.
const MAX_RECIPIENTS = 50;

function normalizeRecipients(recipients) {
    const list = Array.isArray(recipients) ? recipients : [recipients];
    const seen = new Set();
    const out = [];
    for (const r of list) {
        if (typeof r !== "string") continue;
        const name = r.trim();
        if (!name) continue;
        // Usernames are compared case-insensitively elsewhere in the app.
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(name);
        if (out.length >= MAX_RECIPIENTS) break;
    }
    return out;
}

/**
 * @param {Object} opts
 * @param {string|string[]} opts.recipients  usernames, excluding the actor
 * @param {string}   opts.type              e.g. "like" | "comment" | "follow"
 * @param {string}   opts.fromUser          the actor
 * @param {string}  [opts.fromColor]
 * @param {string}  [opts.fromAvatarUrl]
 * @param {string}  [opts.postId]
 * @param {string}  [opts.commentId]
 * @param {string}  [opts.text]
 * @param {string}  [opts.postText]
 * @param {string}  [opts.postImageUrl]
 * @param {string}  [opts.url]              in-app target; defaults to the post
 * @param {boolean} [opts.skipSelf]         drop the actor (default true)
 * @param {string}  [opts.actor]            username to treat as "self"
 */
async function notify(opts) {
    const {
        recipients,
        type,
        fromUser,
        fromColor,
        fromAvatarUrl,
        postId,
        commentId,
        text,
        postText,
        postImageUrl,
        url,
        skipSelf = true,
        actor,
    } = opts || {};

    if (!fromUser || !type) return { delivered: 0 };

    let targets = normalizeRecipients(recipients);
    if (skipSelf) {
        const self = (actor || fromUser).toLowerCase();
        targets = targets.filter((r) => r.toLowerCase() !== self);
    }
    if (targets.length === 0) return { delivered: 0 };

    // In-app bell + notification page.
    try {
        const docs = targets.map((recipient) => ({
            recipient,
            type,
            fromUser,
            fromColor: fromColor || "#3b82f6",
            fromAvatarUrl: fromAvatarUrl || "",
            postId: postId || null,
            commentId: commentId || null,
            text: text || "",
            postText: postText || "",
            postImageUrl: postImageUrl || "",
        }));
        await Notification.insertMany(docs);
    } catch (err) {
        console.error(`[notify] in-app insert failed for ${type}:`, err.message);
    }

    // OS push. Fire-and-forget: this is awaited only so the caller sees failures
    // in the log, and each recipient is independent so one dead subscription
    // cannot affect the rest.
    const target = url || (postId ? `/post/${postId}` : "/");
    await Promise.all(
        targets.map((recipient) =>
            sendPushNotification({
                recipientUsername: recipient,
                type,
                fromUser,
                text: text || "",
                url: target,
            }).catch((err) => {
                console.error(`[notify] push failed for ${type} -> ${recipient}:`, err.message);
            })
        )
    );

    return { delivered: targets.length };
}

module.exports = { notify };
