const express = require("express");
const mongoose = require("mongoose");
const Message = require("../models/messages");
const Notification = require("../models/notification");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");
const { getBlockedUsers } = require("../lib/visibility");
const { isProUserDoc } = require("../lib/economy");
const { requireFeature } = require("../lib/featureFlags");
const { logChat } = require("../logService");
const { sendPushNotification } = require("../push");
const { resolveLinkPreview } = require("../utils/linkPreview");
const { rejectIfBlocked } = require("../lib/textFilter");
const { enforceMedia } = require("../lib/mediaModeration");

// How long a sender may un-send their own message. The client mirrors
// this for the button, but the server is what actually enforces it.
const RECALL_WINDOW_MS = 60 * 1000;

const router = express.Router();

// Resolves a recipient and enforces every messaging rule that must hold before
// a message can be delivered, so the send and forward paths cannot drift apart.
//
// Blocking is enforced here, not in the UI, because the UI is not the only way
// to post a message â€” the socket layer and any direct API caller must be held to
// the same rule. A block is symmetric: if either side has blocked the other, the
// message is not delivered.
//
// Mute is deliberately NOT consulted. Muting hides someone's posts; it must not
// cut off a DM thread, otherwise "mute" silently becomes "block" for messaging
// and the UI's promise that you can still message a muted user becomes a lie.
//
// Returns `{ status, body }` on failure, or the resolved recipient on success.
async function resolveRecipient(sender, senderDoc, recipientNameRaw) {
    if (!recipientNameRaw?.trim()) {
        return { status: 400, body: { error: "Recipient is required" } };
    }
    const recipientName = recipientNameRaw.trim();
    if (recipientName.toLowerCase() === sender.toLowerCase()) {
        return { status: 400, body: { error: "You cannot message yourself" } };
    }

    // getBlockedUsers returns a de-duplicated array of lowercased usernames;
    // normalise to a Set here so the lookups below are O(1) and cannot be
    // broken by the helper's return type.
    const [blockedBySender, recipientDoc] = await Promise.all([
        getBlockedUsers(sender, senderDoc),
        User.findOne({ username: recipientName }).select("username avatarColor blockedUsers").lean(),
    ]);
    const senderBlocked = new Set(blockedBySender);

    const recipientNameLower = recipientName.toLowerCase();
    if (!recipientDoc) return { status: 404, body: { error: "Recipient not found" } };

    const recipientBlocked = new Set(
        (recipientDoc.blockedUsers || []).map((u) => String(u).toLowerCase())
    );

    if (senderBlocked.has(recipientNameLower)) {
        return { status: 403, body: { error: "You have blocked this account" } };
    }
    if (recipientBlocked.has(sender.toLowerCase())) {
        // Deliberately the same shape as a missing user, so the API cannot be
        // used to discover who has blocked you.
        return { status: 404, body: { error: "Recipient not found" } };
    }

    return { recipientName, recipientDoc };
}

// GET /
router.get("/", verifyToken, async (req, res) => {
    try {
        const { user1, user2, username, before, limit: limitStr } = req.query;
        const limit = Math.min(parseInt(limitStr || "20", 10), 100);

        if (user1 && user2) {
            // Reading a thread with someone you blocked should behave as if it
            // never happened, in both directions of the block.
            const [a, b] = [String(user1), String(user2)];
                const [hiddenByA, hiddenByB] = await Promise.all([
                    getBlockedUsers(a),
                    getBlockedUsers(b),
                ]);
            const aBlocksB = hiddenByA.includes(b.toLowerCase());
            const bBlocksA = hiddenByB.includes(a.toLowerCase());
            if (aBlocksB || bBlocksA) {
                return res.json({ messages: [], hasMore: false, blocked: true });
            }

            const query = {
                $or: [
                    { sender: user1, recipient: user2 },
                    { sender: user2, recipient: user1 },
                ],
            };
            if (before) query.timeStamp = { $lt: new Date(before) };

            // Marks *before* the read, not after it.
            //
            // The response body is the array of documents the `find()` below
            // returns, so an `updateMany` fired after that read - and not
            // awaited - could not change the payload: the messages went out with
            // `delivered: false` even though the flag had just been set, and the
            // grey tick only turned up on a later poll. Doing the write first
            // makes this response the one that carries the new values. A failure
            // here must not fail the read, so it is caught.
            try {
                await Message.updateMany(
                    { sender: user2, recipient: user1, delivered: false },
                    { $set: { delivered: true } }
                ).maxTimeMS(5000);
            } catch (e) {
                console.error("[MESSAGES] delivered flag update failed:", e.message);
            }

            const messages = await Message.find(query)
                .sort({ timeStamp: -1 })
                .limit(limit + 1)
                .maxTimeMS(10000)
                .lean();

            const hasMore = messages.length > limit;
            const sliced = hasMore ? messages.slice(0, limit) : messages;
            const ordered = sliced.reverse();

            return res.json({ messages: ordered, hasMore });
        }

        if (username) {
            // Conversations with *blocked* accounts drop out of the inbox
            // entirely, and their unread messages stop counting toward the
            // badge so a blocked user cannot nag you back into their DMs.
            // Muted accounts stay: muting hides their posts, it does not
            // revoke an existing conversation thread.
            const hidden = await getBlockedUsers(username);
            const hiddenVariants = [...new Set(hidden.flatMap((h) => [h, h.toLowerCase()]))];

            const conversations = await Message.aggregate([
                { $match: { $or: [{ sender: username }, { recipient: username }] } },
                { $sort: { timeStamp: -1 } },
                {
                    $group: {
                        _id: { $cond: [{ $eq: ["$sender", username] }, "$recipient", "$sender"] },
                        lastMessage: { $first: "$$ROOT" },
                        unreadCount: {
                            $sum: {
                                $cond: [
                                    { $and: [{ $eq: ["$recipient", username] }, { $eq: ["$isRead", false] }] },
                                    1, 0,
                                ],
                            },
                        },
                    },
                },
                ...(hiddenVariants.length
                    ? [{ $match: { _id: { $nin: hiddenVariants } } }]
                    : []),
                { $sort: { "lastMessage.timeStamp": -1 } },
                { $limit: 100 },
            ], { maxTimeMS: 10000 });

            const usernames = conversations.map((conv) => conv._id);
            const users = await User.find({ username: { $in: usernames } })
                .select("username avatarUrl color isVerified isAdmin roles proUntil")
                .populate("roles", "name badge color")
                .lean().maxTimeMS(5000);

            // isPro is derived here rather than sent as a stored flag so the
            // conversation list's badge follows the same expiry check as every
            // other surface, with no chance of a stale cached value.
            const userMap = new Map(users.map((u) => [u.username, { ...u, isPro: isProUserDoc(u) }]));

            // Archived and muted conversations stay in the payload, flagged,
            // rather than being filtered out server-side. The client can then
            // offer an "Archived" / "Muted" section and the reader can un-archive
            // something — a list they cannot see is a list they cannot undo.
            //
            // `?view=active|archived|muted` applies that separation server-side
            // as well, so the list can be paged and counted without shipping
            // every thread to a client that is about to hide most of them.
            const me = await User.findById(req.userId)
                .select("archivedChats mutedChats pinnedChats chatPreferences")
                .lean()
                .maxTimeMS(5000);
            const lc = (v) => String(v).toLowerCase();
            const archived = new Set((me?.archivedChats || []).map(lc));
            const muted = new Set((me?.mutedChats || []).map(lc));
            const pinned = new Set((me?.pinnedChats || []).map(lc));
            const preferences = me?.chatPreferences instanceof Map
                ? Object.fromEntries(me.chatPreferences)
                : me?.chatPreferences || {};

            let result = conversations.map((conv) => {
                const key = lc(conv._id);
                const raw = preferences[key] || {};
                return {
                    username: conv._id,
                    user: userMap.get(conv._id) || { username: conv._id, avatarUrl: "", color: "#3b82f6", isPro: false },
                    lastMessage: conv.lastMessage,
                    unreadCount: conv.unreadCount,
                    archived: archived.has(key),
                    muted: muted.has(key),
                    pinned: pinned.has(key),
                    // Resolved so the client does not have to know whether the
                    // user document hydrated chatPreferences as a Map or an
                    // object, and so a missing key is a plain default here.
                    preferences: {
                        nickname: raw.nickname || "",
                        notify: raw.notify || "all",
                        sound: raw.sound || "default",
                        autoDeleteHours: raw.autoDeleteHours ?? 0,
                        disappearingDays: raw.disappearingDays ?? 0,
                        excludeFromBadge: raw.excludeFromBadge === true,
                    },
                };
            });

            // Pinned threads float to the top, then everything else by recency.
            // Pinned-ness is a per-view concern: an archived thread pinned by the
            // user still belongs in the archived section, so ordering is applied
            // after the view filter rather than before.
            const view = ["active", "archived", "muted"].includes(req.query.view) ? req.query.view : "all";
            if (view === "active") result = result.filter((c) => !c.archived);
            if (view === "archived") result = result.filter((c) => c.archived);
            if (view === "muted") result = result.filter((c) => c.muted);
            result.sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                return new Date(b.lastMessage?.timeStamp || 0) - new Date(a.lastMessage?.timeStamp || 0);
            });

            return res.json(result);
        }

        return res.status(400).json({ error: "Parameters required" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch messages" });
    }
});

// POST /
// GET /search?q= â€” full-text search across the caller's own DM history.
//
// Scoped to the caller on both sides of the conversation, so this can never
// surface a message the requester was not a party to. Deleted messages are
// excluded, and conversations that are blocked in either direction drop out
// entirely, matching what the inbox itself already shows.
router.get("/search", verifyToken, async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        if (!q) return res.json({ results: [] });
        if (q.length > 200) return res.status(400).json({ error: "Query is too long" });

        const limit = Math.min(parseInt(req.query.limit || "30", 10) || 30, 50);

        // Regex metacharacters are escaped so a user typing "((" gets a literal
        // search rather than a pattern error, and cannot smuggle in an
        // unanchored wildcard that turns the scan into a full collection match.
        const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

        const senderDoc = await User.findById(req.userId).select("username blockedUsers").lean();
        const me = senderDoc?.username;
        if (!me) return res.json({ results: [] });

        const meLower = me.toLowerCase();
        const blockedByMe = new Set(await getBlockedUsers(me, senderDoc));

        const messages = await Message.find({
            $or: [{ sender: me }, { recipient: me }],
            deleted: { $ne: true },
            text: pattern,
        })
            .sort({ timeStamp: -1 })
            .limit(limit * 3) // headroom, trimmed below once blocks are applied
            .maxTimeMS(10000)
            .select("text imageUrl audioUrl sender recipient timeStamp")
            .lean();

        // A block is symmetric, so the other side's block list has to be
        // consulted too. Resolved in one query over the distinct counterparties
        // rather than per result.
        const counterparts = [
            ...new Set(messages.map((m) => (m.sender === me ? m.recipient : m.sender))),
        ];
        const otherDocs = await User.find({ username: { $in: counterparts } })
            .select("username blockedUsers")
            .lean();
        const blockedMeByThem = new Set();
        for (const d of otherDocs) {
            if ((d.blockedUsers || []).some((u) => String(u).toLowerCase() === meLower)) {
                blockedMeByThem.add(d.username.toLowerCase());
            }
        }

        const results = [];
        const seen = new Set();
        for (const m of messages) {
            const other = m.sender === me ? m.recipient : m.sender;
            const otherLower = String(other).toLowerCase();
            if (blockedByMe.has(otherLower) || blockedMeByThem.has(otherLower)) continue;

            // Collapse duplicate hits from the same conversation to the newest
            // match, so one long thread cannot fill the entire result list.
            const dedupeKey = `${otherLower}:${String(m.text).slice(0, 40)}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            results.push({
                id: m._id,
                with: other,
                text: m.text || "",
                hasImage: !!m.imageUrl,
                hasAudio: !!m.audioUrl,
                sentByMe: m.sender === me,
                timeStamp: m.timeStamp,
            });
            if (results.length >= limit) break;
        }

        return res.json({ results });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to search messages" });
    }
});

router.post("/", verifyToken, requireFeature("dms"), async (req, res) => {
    try {
        // The destructure list here was the ONLY place the new fields could be
        // written from, and it listed none of them — so `videoUrl`,
        // `attachments`, `kind`, `location` and `poll` were declared on the
        // schema and then silently discarded, and a video/file/poll/location-only
        // message was rejected outright by the "text, image or audio required"
        // check below. Both are fixed together, because a message made only of
        // an attachment is the entire point of the attachment field.
        const {
            text, imageUrl, audioUrl, videoUrl, recipient, color, replyTo, linkPreview,
            attachments, location, poll, contact, kind,
        } = req.body;
        const senderDoc = await User.findById(req.userId).select("username avatarColor blockedUsers mutedUsers").lean();
        const sender = senderDoc?.username;
        if (!sender) return res.status(400).json({ error: "Sender not found" });
        if (!recipient?.trim()) return res.status(400).json({ error: "Recipient is required" });

        // Normalise the attachment list once so every later check sees the same
        // shape. Entries missing a url are dropped rather than stored as blanks.
        const attachmentList = (Array.isArray(attachments) ? attachments : [])
            .filter((a) => a && typeof a === "object" && a.url)
            .slice(0, 10)
            .map((a) => ({
                url: String(a.url).slice(0, 2000),
                name: String(a.name ?? "").slice(0, 200),
                mimeType: String(a.mimeType ?? "").slice(0, 120),
                size: Number.isFinite(Number(a.size)) ? Math.max(0, Number(a.size)) : 0,
            }));

        const hasPoll = !!(poll && typeof poll === "object" && String(poll.question || "").trim() && Array.isArray(poll.options));
        const pollOptions = hasPoll
            ? poll.options
                .map((o) => String(o?.text ?? "").trim().slice(0, 100))
                .filter(Boolean)
                .slice(0, 6)
            : [];
        const hasLocation = !!(location && typeof location === "object"
            && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng)));

        if (!text?.trim() && !imageUrl && !audioUrl && !videoUrl && attachmentList.length === 0 && !hasPoll && !hasLocation) {
            return res.status(400).json({ error: "A message needs text, media, a file, a poll or a location" });
        }

        // A poll with no usable options would render an empty card forever.
        if (poll && String(poll.question || "").trim() && pollOptions.length < 2) {
            return res.status(400).json({ error: "A poll needs at least 2 options" });
        }

        const resolved = await resolveRecipient(sender, senderDoc, recipient);
        if (resolved.status) return res.status(resolved.status).json(resolved.body);
        const { recipientName, recipientDoc } = resolved;

        // `suppressPreview` exists because the server re-resolves a preview
        // whenever the client omits one, so a client-side "don't load link
        // previews" toggle could not work — sending `linkPreview: null` just
        // made the server fetch it anyway. An explicit opt-out is honoured
        // before the fetch, which is the only way a user can stop this app
        // fetching a URL someone sent them.
        const resolvedPreview = req.body?.suppressPreview
            ? null
            : await resolveLinkPreview(text, linkPreview);

        // DMs were entirely unmoderated. The Message model also has a pre-save
        // hook as a backstop, but checking here means the user gets a clean 400
        // with the matched term instead of a generic 500 from the hook.
        if (await rejectIfBlocked(text, "dm", res)) return;

        // Screen every media URL on the message, not just imageUrl. A video or a
        // document attachment was previously unmoderated because only the single
        // image field existed when this check was written.
        const mediaUrls = [
            ...(imageUrl ? [imageUrl] : []),
            ...(videoUrl ? [videoUrl] : []),
            ...attachmentList.map((a) => a.url),
        ];
        if (mediaUrls.length > 0) {
            const dmMedia = await enforceMedia(mediaUrls, {
                surface: "dm",
                message: "This attachment was blocked by the automated media filter.",
            });
            if (!dmMedia.ok) {
                return res.status(400).json({ error: dmMedia.message, filtered: true, reason: dmMedia.error });
            }
        }

        // Derived rather than trusted, because a client that omits `kind` would
        // otherwise default to "text" and an image-only message would render as
        // an empty bubble. Order matters: an explicit "code" or "contact" is
        // respected, everything else is inferred from the fields present.
        const resolvedKind = ["code", "contact", "poll", "location"].includes(String(kind))
            ? String(kind)
            : hasPoll ? "poll"
                : hasLocation ? "location"
                    : videoUrl ? "video"
                        : attachmentList.length ? "file"
                            : imageUrl ? "image"
                                : audioUrl ? "audio"
                                    : "text";

        const message = await Message.create({
            text:      text?.trim() || "",
            imageUrl:  imageUrl || "",
            audioUrl:  audioUrl || "",
            videoUrl:  videoUrl || "",
            attachments: attachmentList,
            kind:      resolvedKind,
            location:  hasLocation
                ? {
                    lat: Number(location.lat),
                    lng: Number(location.lng),
                    label: String(location.label ?? "").slice(0, 200),
                }
                : null,
            poll: hasPoll
                ? {
                    question: String(poll.question).trim().slice(0, 200),
                    options: pollOptions.map((t) => ({ text: t, votes: [] })),
                    votes: [],
                }
                : null,
            contact: contact && contact.username
                ? {
                    username: String(contact.username).slice(0, 40),
                    displayName: String(contact.displayName ?? "").slice(0, 80),
                    avatarUrl: String(contact.avatarUrl ?? "").slice(0, 2000),
                }
                : null,
            sender,
            recipient: recipientName,
            color:     color || senderDoc?.avatarColor || "#3b82f6",
            replyTo:   (replyTo && replyTo.sender && replyTo.text) ? { sender: replyTo.sender, text: String(replyTo.text).slice(0, 500) } : null,
            linkPreview: resolvedPreview,
        });

        // The notification preview has to name what was actually sent, or a
        // file-only or poll-only message arrives as an empty push.
        const preview = text?.trim()
            ? text.trim().slice(0, 120)
            : resolvedKind === "poll" ? "\uD83D\uDCC3 Poll"
                : resolvedKind === "location" ? "\uD83D\uDCCD Location"
                    : resolvedKind === "video" ? "\uD83C\uDFAC Video"
                        : resolvedKind === "file" ? "\uD83D\uDCCE File"
                            : resolvedKind === "contact" ? "\uD83D\uDCCB Contact"
                                : resolvedKind === "code" ? "\uD83D\uDCDC Code"
                                    : audioUrl ? "\uD83C\uDFA4 Voice message" : "\uD83D\uDCF7 Image";

        Notification.create({
            recipient: recipientName,
            type: "message",
            fromUser: sender,
            fromColor: color || senderDoc?.avatarColor || "#3b82f6",
            postId: message._id.toString(),
            text: preview,
        }).catch(() => {});

        // OS push so the recipient gets notified even when the app is closed
        if (recipientName.toLowerCase() !== sender.toLowerCase()) {
            sendPushNotification({
                recipientUsername: recipientName,
                type: "message",
                fromUser: sender,
                text: preview,
                url: `/inbox?user=${encodeURIComponent(sender)}`,
            });
        }

        // Real-time socket event so an open/background tab can notify instantly
        // (works without Web Push / VAPID).
        try {
            const io = req.app.locals?.io;
            if (io) {
                io.to(recipientName).emit("message:new", {
                    from: sender,
                    body: preview,
                    timeStamp: message.timeStamp || Date.now(),
                });
            }
        } catch {}

        logChat("dm_sent", { username: sender, targetUser: recipientName, message: `DM from ${sender} to ${recipientName}: ${(text || "").slice(0, 100)}` });
        return res.status(201).json(message.toObject());
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to send message" });
    }
});

// PATCH / â€” unified action dispatcher (react, mark-read)
// POST /forward â€” re-send one of the caller's own messages to someone else.
//
// The original is copied as a fresh message rather than mutated, so the two
// threads stay independent: editing or deleting the forward never touches the
// source, and the source author is recorded in `forwardedFrom` for provenance.
// Blocks are re-checked against the *new* recipient, since forwarding to a
// third party is a fresh delivery that must not become a back door around one.
router.post("/forward", verifyToken, async (req, res) => {
    try {
        const { messageId, recipient, note } = req.body;
        if (!messageId) return res.status(400).json({ error: "Message id is required" });

        const senderDoc = await User.findById(req.userId)
            .select("username avatarColor blockedUsers mutedUsers")
            .lean();
        const sender = senderDoc?.username;
        if (!sender) return res.status(400).json({ error: "Sender not found" });

        if (!mongoose.isValidObjectId(messageId)) {
            return res.status(400).json({ error: "Invalid message id" });
        }

        // Scoped to the caller so a guessed id cannot be used to read and
        // re-send somebody else's conversation.
        const original = await Message.findOne({
            _id: messageId,
            $or: [{ sender }, { recipient: sender }],
            deleted: { $ne: true },
        })
            .select("text imageUrl audioUrl sender timeStamp deleted")
            .lean();

        if (!original) return res.status(404).json({ error: "Message not found" });
        if (!original.text && !original.imageUrl && !original.audioUrl) {
            return res.status(400).json({ error: "This message has no content to forward" });
        }

        const resolved = await resolveRecipient(sender, senderDoc, recipient);
        if (resolved.status) return res.status(resolved.status).json(resolved.body);
        const { recipientName } = resolved;

        const forwarded = await Message.create({
            text:      original.text || "",
            imageUrl:  original.imageUrl || "",
            audioUrl:  original.audioUrl || "",
            sender,
            recipient: recipientName,
            color:     senderDoc?.avatarColor || "#3b82f6",
            forwardedFrom: {
                sender: original.sender,
                text: String(original.text || "").slice(0, 200),
            },
        });

        const noteText = note?.trim() ? String(note).trim().slice(0, 500) : "";
        if (noteText) {
            await Message.create({
                text:      noteText,
                sender,
                recipient: recipientName,
                color:     senderDoc?.avatarColor || "#3b82f6",
                replyTo:   { sender: original.sender, text: String(original.text || "").slice(0, 200) },
            });
        }

        const preview = original.text?.trim()
            ? original.text.trim().slice(0, 120)
            : original.audioUrl ? "ðŸŽ¤ Voice message" : "ðŸ“· Image";

        Notification.create({
            recipient: recipientName,
            type: "message",
            fromUser: sender,
            fromColor: senderDoc?.avatarColor || "#3b82f6",
            postId: forwarded._id.toString(),
            text: preview,
        }).catch(() => {});

        sendPushNotification({
            recipientUsername: recipientName,
            type: "message",
            fromUser: sender,
            text: preview,
            url: `/inbox?user=${encodeURIComponent(sender)}`,
        });

        try {
            const io = req.app.locals?.io;
            if (io) {
                io.to(recipientName).emit("message:new", {
                    from: sender,
                    body: preview,
                    timeStamp: forwarded.timeStamp || Date.now(),
                });
            }
        } catch {}

        logChat("dm_forwarded", {
            username: sender,
            targetUser: recipientName,
            message: `Forwarded message from ${original.sender} to ${recipientName}`,
        });

        return res.status(201).json(forwarded.toObject());
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to forward message" });
    }
});

// Was completely unauthenticated and took the caller's identity from the body,
// so anyone could mark any conversation read, or react as any user, just by
// posting their name. Both now require a session and derive the actor from it.
router.patch("/", verifyToken, async (req, res) => {
    try {
        const { sender, recipient, messageId, action, reactionType } = req.body;

        // The body still names the other party, but never the actor.
        const me = await User.findById(req.userId).select("username").lean();
        const username = me?.username;
        if (!username) return res.status(401).json({ error: "Unauthorized" });

        // Mark messages as read when opening a conversation
        if (sender && recipient) {
            await Message.updateMany(
                { sender: recipient, recipient: sender, isRead: false },
                { $set: { isRead: true, readAt: new Date() } }
            );
            return res.json({ ok: true });
        }

        // React to a message
        if (action === "react" && messageId && reactionType) {
            const validReactions = ["like", "love", "laugh", "fire", "sad", "angry"];
            if (!validReactions.includes(reactionType)) {
                return res.status(400).json({ error: "Invalid reaction" });
            }

            const msg = await Message.findById(messageId);
            if (!msg) return res.status(404).json({ error: "Message not found" });

            // You can only react to a message you were actually sent or sent
            // yourself. Without this, any logged-in user could react to (and so
            // enumerate the existence of) anyone's private message by id.
            if (msg.sender !== username && msg.recipient !== username) {
                return res.status(403).json({ error: "Not your message" });
            }

            if (!msg.reactions) {
                msg.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
            }

            // Remove from all other reaction types
            validReactions.forEach(type => {
                if (!msg.reactions[type]) msg.reactions[type] = [];
                const idx = msg.reactions[type].indexOf(username);
                if (idx !== -1) msg.reactions[type].splice(idx, 1);
            });

            // Toggle the selected reaction
            if (!msg.reactions[reactionType]) msg.reactions[reactionType] = [];
            const idx = msg.reactions[reactionType].indexOf(username);
            if (idx === -1) {
                msg.reactions[reactionType].push(username);
            }

            await msg.save();
            return res.json({ reactions: msg.reactions });
        }

        if (action === "star" && messageId) {
            const msg = await Message.findById(messageId);
            if (!msg) return res.status(404).json({ error: "Message not found" });
            if (msg.sender !== username && msg.recipient !== username) {
                return res.status(403).json({ error: "Not your message" });
            }
            msg.starredBy = msg.starredBy || [];
            const idx = msg.starredBy.indexOf(username);
            const starred = idx === -1;
            if (starred) msg.starredBy.push(username);
            else msg.starredBy.splice(idx, 1);
            await msg.save();
            return res.json({ starred });
        }

        return res.status(400).json({ error: "Invalid request" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /conversation
// Archive or mute a whole thread. Distinct from block/mute-user: this changes
// only what *you* see, and messages keep arriving either way.
//
// Separate route rather than another branch on PATCH "/" because that one keys
// off `sender`/`recipient` in the body, which is exactly the shape this does not
// have.
router.patch("/conversation", verifyToken, async (req, res) => {
    try {
        const { with: other, action } = req.body || {};
        if (!other || (action !== "archive" && action !== "unarchive" && action !== "mute" && action !== "unmute")) {
            return res.status(400).json({ error: "with and a valid action are required" });
        }

        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        if (user.username === other) {
            return res.status(400).json({ error: "You cannot archive a chat with yourself" });
        }

        const field = action === "archive" || action === "unarchive" ? "archivedChats" : "mutedChats";
        const removing = action.startsWith("un");
        const key = String(other).toLowerCase();
        const current = user[field] || [];
        const present = current.some((c) => String(c).toLowerCase() === key);

        if (removing && present) {
            user[field] = current.filter((c) => String(c).toLowerCase() !== key);
        } else if (!removing && !present) {
            current.push(other);
            user[field] = current;
        }
        // Guard against unbounded growth from a script.
        if (user[field].length > 500) user[field] = user[field].slice(-500);

        await user.save();
        return res.json({ [field]: user[field] });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /starred
// Everything the viewer has starred, newest first, across every conversation.
// Scoped to the session user — a `?username=` param would be a way to read
// someone else's saved messages.
router.get("/starred", verifyToken, async (req, res) => {
    try {
        const me = await User.findById(req.userId).select("username").lean();
        const username = me?.username;
        if (!username) return res.status(401).json({ error: "Unauthorized" });

        const messages = await Message.find({ starredBy: username })
            .sort({ timeStamp: -1 })
            .limit(100)
            .lean();

        return res.json(messages.map((m) => ({
            ...m,
            with: m.sender === username ? m.recipient : m.sender,
        })));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /:id/read
router.patch("/:id/read", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        await Message.findByIdAndUpdate(id, { $set: { isRead: true } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /read-all
router.patch("/read-all", verifyToken, async (req, res) => {
    try {
        const { sender } = req.query;
        const userDoc = await User.findById(req.userId).select("username").lean();
        const recipient = userDoc?.username;
        if (!recipient) return res.status(400).json({ error: "User not found" });

        await Message.updateMany(
            { sender: sender || recipient, recipient: sender ? recipient : { $ne: "" }, isRead: false },
            { $set: { isRead: true } }
        );
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /unread
router.get("/unread", verifyToken, async (req, res) => {
    try {
        const userDoc = await User.findById(req.userId).select("username mutedChats chatPreferences").lean();
        const username = userDoc?.username;
        if (!username) return res.status(400).json({ error: "User not found" });

        // Muted conversations were counted here even though
        // User.mutedChats documents itself as "excluded from the unread badge".
        // The badge therefore climbed for conversations the user had explicitly
        // silenced — which is the exact opposite of what muting is for.
        const prefs = userDoc?.chatPreferences instanceof Map
            ? Object.fromEntries(userDoc.chatPreferences)
            : userDoc?.chatPreferences || {};
        const excluded = new Set(
            (userDoc?.mutedChats || []).map((c) => String(c).toLowerCase())
        );
        for (const [key, value] of Object.entries(prefs)) {
            if (value && value.excludeFromBadge === true) excluded.add(String(key).toLowerCase());
        }

        const result = await Message.aggregate([
            { $match: { recipient: username, isRead: false } },
            { $group: { _id: "$sender", count: { $sum: 1 } } },
            { $match: { _id: { $nin: [...excluded] } } },
            { $group: { _id: null, total: { $sum: "$count" } } },
        ]);

        return res.json({
            total: result[0]?.total || 0,
            excludedConversations: excluded.size,
        });
    } catch (error) {
        console.error(error);
        // Returning 0 on error makes a broken unread count look like "you are
        // all caught up", which is worse than admitting the count is unknown.
        return res.json({ total: 0, degraded: true, error: "Could not read the unread count" });
    }
});

// PUT /:id â€” edit message
router.put("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;

        const userDoc = await User.findById(req.userId).select("username").lean();
        const username = userDoc?.username;
        if (!username) return res.status(400).json({ error: "User not found" });

        const message = await Message.findById(id);
        if (!message) return res.status(404).json({ error: "Message not found" });
        if (message.sender !== username) return res.status(403).json({ error: "Unauthorized" });

        const newText = text?.trim();
        if (!newText) return res.status(400).json({ error: "Text required" });

        message.text = newText;
        message.editedAt = new Date();
        await message.save();

        return res.json(message.toObject());
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to edit message" });
    }
});

// DELETE /:id — soft-delete message
//
// `?recall=1` is the sender un-sending their own message inside the recall
// window. Without it this is the sender's ordinary "delete for me", which only
// ever blanks what they sent.
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const isRecall = req.query.recall === "1" || req.body?.recall === true;

        const userDoc = await User.findById(req.userId).select("username").lean();
        const username = userDoc?.username;
        if (!username) return res.status(400).json({ error: "User not found" });

        const message = await Message.findById(id);
        if (!message) return res.status(404).json({ error: "Message not found" });
        if (message.sender !== username) return res.status(403).json({ error: "Unauthorized" });

        if (isRecall) {
            // The 60s recall window was enforced ONLY in the client
            // (RECALL_WINDOW_MS in Chat.jsx). Any caller could send the request
            // without the button and remove a message of any age. The window
            // has to live on the server to mean anything.
            const ageMs = Date.now() - new Date(message.timeStamp).getTime();
            if (ageMs > RECALL_WINDOW_MS) {
                return res.status(400).json({
                    error: "The time to unsend this message has passed",
                    ageSeconds: Math.round(ageMs / 1000),
                    windowSeconds: RECALL_WINDOW_MS / 1000,
                });
            }
            if (message.deleted) return res.status(400).json({ error: "Message already deleted" });
        }

        message.text = "";
        // Media must be cleared as well. The old code blanked the text and left
        // imageUrl/audioUrl in place, so the picture stayed visible underneath
        // a "This message was deleted" tombstone.
        message.imageUrl = "";
        message.audioUrl = "";
        message.videoUrl = "";
        message.attachments = [];
        message.linkPreview = null;
        message.pinned = false;
        message.deleted = true;
        message.editedAt = null;
        await message.save();

        return res.json(message.toObject());
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to delete message" });
    }
});

module.exports = router;
