/**
 * Messaging: per-conversation settings, message-level actions, bulk operations,
 * search, export, and per-conversation drafts.
 *
 * Mounted at /api/messaging, kept separate from routes/messages.js (which is the
 * send/receive core) because the existing PATCH dispatchers are already the
 * single point of truth for react/star/read and a second dispatcher for the
 * same actions in a different file would be a second thing to forget to update.
 *
 * Two things about this app drive most of the design here:
 *
 * 1. THERE IS NO CONVERSATION MODEL. The DM list is a `Message.aggregate()`
 *    grouped by counterpart username, recomputed on every poll. Per-conversation
 *    state therefore lives on the User document â€” `archivedChats`, `mutedChats`,
 *    `pinnedChats` as username arrays, plus a `chatPreferences` Map for anything
 *    richer. Introducing a Conversation collection would mean two sources of
 *    truth for "which threads exist", so this extends what is already there.
 *
 * 2. Strict schemas drop undeclared paths silently. Every field written here is
 *    declared in models/messages.js, models/groupMessage.js, models/user.js or
 *    models/groupChat.js. Check before assigning a new one.
 */

const express = require("express");
const mongoose = require("mongoose");

const Message = require("../models/messages");
const GroupMessage = require("../models/groupMessage");
const GroupChat = require("../models/groupChat");
const User = require("../models/user");
const ChatDraft = require("../models/chatDraft");
const { verifyToken } = require("../middleware/auth");
const { rejectIfBlocked } = require("../lib/textFilter");
const { enforceMedia } = require("../lib/mediaModeration");
const { logModeration } = require("../logService");

const router = express.Router();

const CAP = 100;
const MSG_REACTIONS = ["like", "love", "laugh", "fire", "sad", "angry"];
const lower = (s) => String(s ?? "").toLowerCase();
const clamp = (v, min, max, dflt) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, n));
};

/** Resolve the caller's username. verifyToken only sets userId, so every route needs it. */
async function actor(req) {
    const doc = await User.findById(req.userId).select("username").lean();
    return doc?.username || null;
}

/** Resolve the actor, answering 401 and returning null when it cannot be found. */
async function requireActor(req, res) {
    const username = await actor(req);
    if (!username) res.status(401).json({ error: "Could not resolve your account" });
    return username;
}

/** Pull a counterpart's chatPreferences entry, defaulted. A missing key is normal. */
function prefsFor(userDoc, counterpart) {
    const key = lower(counterpart);
    const raw = userDoc?.chatPreferences instanceof Map
        ? userDoc.chatPreferences.get(key)
        : userDoc?.chatPreferences?.[key];
    return {
        nickname: raw?.nickname || "",
        notify: raw?.notify || "all",
        sound: raw?.sound || "default",
        autoDeleteHours: raw?.autoDeleteHours ?? 0,
        disappearingDays: raw?.disappearingDays ?? 0,
        excludeFromBadge: raw?.excludeFromBadge === true,
    };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PER-CONVERSATION SETTINGS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const PIN_ACTIONS = new Set(["pin", "unpin"]);
const CONVO_ACTIONS = new Set([
    "pin", "unpin", "rename", "notify", "sound",
    "autoDelete", "disappearing", "excludeFromBadge", "resetPreferences",
]);

/**
 * PATCH /conversation/:username
 *
 * The old PATCH /api/messages/conversation already exists for archive/mute and
 * is kept working; this is the expanded version. Both are kept because the
 * existing client calls the old one, and silently repointing it would be a
 * breaking change in a file I am not editing.
 */
router.patch("/conversation/:username", verifyToken, async (req, res) => {
    const { username: rawCounterpart } = req.params;
    const counterpart = lower(rawCounterpart);
    const action = req.body?.action;

    if (!CONVO_ACTIONS.has(action)) {
        return res.status(400).json({ error: `Unknown action "${action}"`, valid: [...CONVO_ACTIONS] });
    }

    const username = await requireActor(req, res);
    if (!username) return;

    // The counterpart must exist, or the setting would attach to a typo and
    // silently follow the person later if they sign up.
    const other = await User.findOne({ username: rawCounterpart }).select("username").lean();
    if (!other) return res.status(404).json({ error: "No such user" });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Account not found" });

    const key = counterpart;

    if (PIN_ACTIONS.has(action)) {
        user.pinnedChats = (user.pinnedChats || []).filter((c) => lower(c) !== key);
        if (action === "pin") user.pinnedChats.push(key);
    } else if (action === "resetPreferences") {
        if (user.chatPreferences instanceof Map) user.chatPreferences.delete(key);
        else if (user.chatPreferences) delete user.chatPreferences[key];
    } else {
        const current = prefsFor(user, rawCounterpart);
        const next = { ...current };

        if (action === "rename") {
            const nickname = String(req.body?.nickname ?? "").trim().slice(0, 40);
            next.nickname = nickname;
        } else if (action === "notify") {
            const v = String(req.body?.value ?? "");
            if (!["off", "mentions", "all"].includes(v)) {
                return res.status(400).json({ error: "notify must be off, mentions or all" });
            }
            next.notify = v;
        } else if (action === "sound") {
            const v = String(req.body?.value ?? "");
            if (!["default", "none"].includes(v)) return res.status(400).json({ error: "sound must be default or none" });
            next.sound = v;
        } else if (action === "autoDelete") {
            next.autoDeleteHours = clamp(req.body?.hours, 0, 8760, 0);
        } else if (action === "disappearing") {
            next.disappearingDays = clamp(req.body?.days, 0, 365, 0);
        } else if (action === "excludeFromBadge") {
            next.excludeFromBadge = !!req.body?.value;
        }

        // Mongoose Maps need .set(); a plain object needs assignment. Handle both
        // so this works whether the document hydrated as a Map or an object.
        if (user.chatPreferences instanceof Map) user.chatPreferences.set(key, next);
        else {
            user.chatPreferences = user.chatPreferences || {};
            user.chatPreferences[key] = next;
        }
    }

    await user.save();

    return res.json({
        ok: true,
        with: other.username,
        pinned: (user.pinnedChats || []).some((c) => lower(c) === key),
        preferences: prefsFor(user, other.username),
    });
});

/** GET /preferences â€” account-level notification settings. */
router.get("/preferences", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("quietHours notificationPreviews").lean();
        if (!user) return res.status(404).json({ error: "Account not found" });
        return res.json({
            quietHours: {
                enabled: user.quietHours?.enabled === true,
                // Stored and reported in UTC, matching every other timestamp here.
                startHour: user.quietHours?.startHour ?? 22,
                endHour: user.quietHours?.endHour ?? 8,
            },
            notificationPreviews: user.notificationPreviews !== false,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

router.patch("/preferences", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: "Account not found" });
        const { quietHours, notificationPreviews } = req.body || {};

        if (quietHours && typeof quietHours === "object") {
            user.quietHours = {
                enabled: !!quietHours.enabled,
                startHour: clamp(quietHours.startHour ?? 22, 0, 23, 22),
                endHour: clamp(quietHours.endHour ?? 8, 0, 23, 8),
            };
        }
        if (typeof notificationPreviews === "boolean") user.notificationPreviews = notificationPreviews;
        await user.save();
        return res.json({ ok: true, quietHours: user.quietHours, notificationPreviews: user.notificationPreviews });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/**
 * GET /notification-context/:username
 * Everything the client needs to decide whether to interrupt the user for one
 * incoming message, in one round trip. Doing this client-side would mean
 * shipping every user's preferences to every device.
 */
router.get("/notification-context/:username", verifyToken, async (req, res) => {
    try {
        const me = await User.findById(req.userId).select("chatPreferences quietHours notificationPreviews mutedChats").lean();
        if (!me) return res.status(404).json({ error: "Account not found" });
        const prefs = prefsFor(me, req.params.username);
        const now = new Date();
        const hour = now.getUTCHours();
        const qh = me.quietHours || {};
        const inQuiet = qh.enabled === true && (qh.startHour <= qh.endHour
            ? hour >= qh.startHour && hour < qh.endHour
            : hour >= qh.startHour || hour < qh.endHour);
        const muted = (me.mutedChats || []).some((c) => lower(c) === lower(req.params.username));

        return res.json({
            shouldNotify: prefs.notify !== "off" && !muted && !inQuiet,
            shouldPlaySound: prefs.sound !== "none" && !inQuiet,
            includePreview: me.notificationPreviews !== false && prefs.notify === "all",
            reason: muted ? "conversation muted"
                : inQuiet ? "quiet hours"
                    : prefs.notify === "off" ? "notifications off for this conversation"
                        : "notify",
            preferences: prefs,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MESSAGE-LEVEL ACTIONS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const MESSAGE_ACTIONS = new Set(["pin", "unpin", "bookmark", "unbookmark", "markUnread", "markRead", "setExpiry"]);

router.patch("/messages/:id", verifyToken, async (req, res) => {
    try {
        const action = req.body?.action;
        if (!MESSAGE_ACTIONS.has(action)) {
            return res.status(400).json({ error: `Unknown action "${action}"`, valid: [...MESSAGE_ACTIONS] });
        }
        const username = await requireActor(req, res);
        if (!username) return;

        const message = await Message.findById(req.params.id);
        if (!message) return res.status(404).json({ error: "Message not found" });

        // Membership: only the two participants may act on a DM message.
        if (message.sender !== username && message.recipient !== username) {
            return res.status(403).json({ error: "Not your message" });
        }

        switch (action) {
            case "pin":
            case "unpin":
                // A pin is shared by both participants, so it is a property of
                // the message rather than a per-user array. The last person to
                // pin wins; unpin clears it.
                message.pinned = action === "pin";
                break;
            case "bookmark":
                message.bookmarkedBy = Array.from(new Set([...(message.bookmarkedBy || []), username]));
                break;
            case "unbookmark":
                message.bookmarkedBy = (message.bookmarkedBy || []).filter((u) => u !== username);
                break;
            case "markUnread":
                // Only meaningful for the recipient, and only on a message that
                // has been read. Flagging your own sent message unread does
                // nothing and would be confusing.
                if (message.recipient !== username) {
                    return res.status(400).json({ error: "Only the recipient can mark a message unread" });
                }
                if (message.isRead) {
                    message.markedUnreadBy = Array.from(new Set([...(message.markedUnreadBy || []), username]));
                }
                break;
            case "markRead":
                message.markedUnreadBy = (message.markedUnreadBy || []).filter((u) => u !== username);
                break;
            case "setExpiry": {
                const days = clamp(req.body?.days, 0, 365, 0);
                const recipient = message.recipient === username ? message.sender : message.recipient;
                const other = await User.findOne({ username: recipient }).select("chatPreferences").lean();
                const allowed = prefsFor(other, username).disappearingDays;
                // The sender can only shorten the timer, never extend it past
                // what the recipient agreed to.
                if (days > 0 && allowed > 0 && days > allowed) {
                    return res.status(400).json({ error: `The recipient set a ${allowed}-day limit for this conversation` });
                }
                message.expiresAt = days > 0 ? new Date(Date.now() + days * 86400000) : null;
                break;
            }
            default:
                break;
        }

        await message.save();
        return res.json({
            ok: true,
            id: String(message._id),
            pinned: message.pinned,
            bookmarked: (message.bookmarkedBy || []).includes(username),
            markedUnread: (message.markedUnreadBy || []).includes(username),
            expiresAt: message.expiresAt,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** POST /messages/bulk â€” react / star / bookmark / delete across a selection. */
router.post("/messages/bulk", verifyToken, async (req, res) => {
    try {
        const { ids = [], action, value } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });
        if (!["react", "star", "unstar", "bookmark", "unbookmark", "delete", "pin", "unpin"].includes(action)) {
            return res.status(400).json({ error: "Unsupported bulk action" });
        }
        const username = await requireActor(req, res);
        if (!username) return;

        const capped = ids.slice(0, CAP).filter((id) => /^[0-9a-fA-F]{24}$/.test(String(id)));
        if (capped.length === 0) return res.status(400).json({ error: "No valid message ids supplied" });

        // Scope every query to messages the caller is actually part of, so a
        // guessed id cannot be used to act on someone else's conversation.
        const owned = { _id: { $in: capped }, $or: [{ sender: username }, { recipient: username }] };
        const docs = await Message.find(owned);
        const results = { matched: docs.length, modified: 0, skipped: capped.length - docs.length };

        for (const m of docs) {
            switch (action) {
                case "react": {
                    if (!MSG_REACTIONS.includes(value)) continue;
                    // Clear every bucket first so one reaction per user holds,
                    // then apply the chosen one. The previous version only
                    // appended when the bucket already existed, so a user's
                    // FIRST ever reaction of a type was silently not written —
                    // and `modified` still counted it, so the success number
                    // disagreed with what the poll then returned.
                    for (const bucket of MSG_REACTIONS) {
                        if (!Array.isArray(m.reactions[bucket])) m.reactions[bucket] = [];
                        m.reactions[bucket] = m.reactions[bucket].filter((u) => u !== username);
                    }
                    if (!m.reactions[value].includes(username)) m.reactions[value].push(username);
                    break;
                }

                case "star": m.starredBy = Array.from(new Set([...(m.starredBy || []), username])); break;
                case "unstar": m.starredBy = (m.starredBy || []).filter((u) => u !== username); break;
                case "bookmark": m.bookmarkedBy = Array.from(new Set([...(m.bookmarkedBy || []), username])); break;
                case "unbookmark": m.bookmarkedBy = (m.bookmarkedBy || []).filter((u) => u !== username); break;
                case "pin": m.pinned = true; break;
                case "unpin": m.pinned = false; break;
                case "delete":
                    // Same rule as the single delete: the sender only, and soft.
                    if (m.sender !== username) continue;
                    m.text = ""; m.imageUrl = ""; m.audioUrl = ""; m.videoUrl = "";
                    m.attachments = []; m.deleted = true; m.editedAt = null;
                    break;
                default: break;
            }
            // eslint-disable-next-line no-await-in-loop
            await m.save();
            results.modified += 1;
        }

        return res.json({ ok: true, action, ...results, note: "skipped counts ids that were malformed or not part of your conversations." });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /messages/:id â€” full details, for the message-info sheet. */
/**
 * POST /messages/:id/poll/vote
 *
 * A DM poll rendered but could never be voted in, which is a dead control
 * rather than an incomplete one. A vote may be CHANGED: the previous one is
 * removed before the new one is applied, so `poll.votes` cannot contain a
 * duplicate and the total can never exceed the number of voters.
 */
router.post("/messages/:id/poll/vote", verifyToken, async (req, res) => {
    try {
        const username = await requireActor(req, res);
        if (!username) return;
        const optionIndex = Number(req.body?.optionIndex);
        if (!Number.isInteger(optionIndex) || optionIndex < 0) {
            return res.status(400).json({ error: "optionIndex must be a non-negative integer" });
        }

        const message = await Message.findById(req.params.id);
        if (!message) return res.status(404).json({ error: "Message not found" });
        if (message.sender !== username && message.recipient !== username) {
            return res.status(403).json({ error: "Not your message" });
        }
        if (message.kind !== "poll" || !Array.isArray(message.poll?.options)) {
            return res.status(400).json({ error: "That message is not a poll" });
        }
        if (optionIndex >= message.poll.options.length) {
            return res.status(400).json({ error: "That option does not exist on this poll" });
        }

        const previous = (message.poll.votes || []).findIndex((v) => v.username === username);
        if (previous !== -1 && message.poll.votes[previous].optionIndex === optionIndex) {
            return res.json({ poll: message.poll, unchanged: true });
        }
        if (previous !== -1) message.poll.votes.splice(previous, 1);
        message.poll.options.forEach((o) => { o.votes = (o.votes || []).filter((u) => u !== username); });
        message.poll.options[optionIndex].votes.push(username);
        message.poll.votes.push({ username, optionIndex });
        await message.save();

        return res.json({ poll: message.poll, changed: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /messages/:id — full details, for the message-info sheet. */
router.get("/messages/:id", verifyToken, async (req, res) => {

    try {
        const username = await requireActor(req, res);
        if (!username) return;
        const message = await Message.findById(req.params.id).lean();
        if (!message) return res.status(404).json({ error: "Message not found" });
        if (message.sender !== username && message.recipient !== username) {
            return res.status(403).json({ error: "Not your message" });
        }
        return res.json({
            ...message,
            with: message.sender === username ? message.recipient : message.sender,
            sentByMe: message.sender === username,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /pinned/:username */
router.get("/pinned/:username", verifyToken, async (req, res) => {
    try {
        const username = await requireActor(req, res);
        if (!username) return;
        const other = req.params.username;
        const rows = await Message.find({
            pinned: true,
            deleted: { $ne: true },
            $or: [{ sender: username, recipient: other }, { sender: other, recipient: username }],
        }).sort({ timeStamp: -1 }).limit(CAP).lean();
        return res.json({ messages: rows, count: rows.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /starred â€” the real list, with conversation attribution. */
router.get("/starred", verifyToken, async (req, res) => {
    try {
        const username = await requireActor(req, res);
        if (!username) return;
        const rows = await Message.find({ starredBy: username, deleted: { $ne: true } })
            .sort({ timeStamp: -1 })
            .limit(CAP)
            .lean();
        return res.json({
            messages: rows.map((m) => ({ ...m, with: m.sender === username ? m.recipient : m.sender, sentByMe: m.sender === username })),
            count: rows.length,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /bookmarked */
router.get("/bookmarked", verifyToken, async (req, res) => {
    try {
        const username = await requireActor(req, res);
        if (!username) return;
        const rows = await Message.find({ bookmarkedBy: username, deleted: { $ne: true } })
            .sort({ timeStamp: -1 })
            .limit(CAP)
            .lean();
        return res.json({
            messages: rows.map((m) => ({ ...m, with: m.sender === username ? m.recipient : m.sender, sentByMe: m.sender === username })),
            count: rows.length,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /media/:username â€” shared media, for a conversation's media tab. */
router.get("/media/:username", verifyToken, async (req, res) => {
    try {
        const username = await requireActor(req, res);
        if (!username) return;
        const other = req.params.username;
        const rows = await Message.find({
            deleted: { $ne: true },
            $or: [
                { sender: username, recipient: other },
                { sender: other, recipient: username },
            ],
            $or: [
                { imageUrl: { $exists: true, $nin: ["", null] } },
                { videoUrl: { $exists: true, $nin: ["", null] } },
            ],
        })
            .select("imageUrl videoUrl kind timeStamp sender audioUrl")
            .sort({ timeStamp: -1 })
            .limit(200)
            .lean();
        return res.json({ items: rows, count: rows.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SEARCH
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * GET /search?q=&with=&has=&from=&before=&page=
 *
 * Extends the existing GET /api/messages/search, which has no per-conversation
 * scope, no operators, no date bounds and no pagination. Operators are parsed
 * from `q` and removed before the text is searched, so a literal "from:" in a
 * message is still findable by quoting it.
 */
router.get("/search", verifyToken, async (req, res) => {
    try {
        const username = await requireActor(req, res);
        if (!username) return;

        let q = String(req.query.q ?? "").slice(0, 200);
        const ops = { with: req.query.with || null, has: req.query.has || null, from: null, before: null, after: null };

        // Operators: from:alice  has:image  before:2026-01-01  after:...
        q = q.replace(/\bfrom:(\S+)/gi, (_, v) => { ops.from = v; return " "; });
        q = q.replace(/\bhas:(image|video|audio|file|link|poll|location)\b/gi, (_, v) => { ops.has = v.toLowerCase(); return " "; });
        q = q.replace(/\bbefore:(\d{4}-\d{2}-\d{2})\b/gi, (_, v) => { ops.before = v; return " "; });
        q = q.replace(/\bafter:(\d{4}-\d{2}-\d{2})\b/gi, (_, v) => { ops.after = v; return " "; });
        q = q.trim();

        const page = clamp(req.query.page, 1, 50, 1);
        const limit = clamp(req.query.limit, 1, 50, 25);
        const text = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const match = {
            deleted: { $ne: true },
            // ALWAYS start from "a thread I am part of". Every operator below
            // narrows this; none may widen it. An earlier version handled
            // `from:` by setting `match.sender` and deleting `match.$or`, which
            // threw away the participation check entirely and would have
            // returned messages from conversations the caller has no part in.
            $or: [{ sender: username }, { recipient: username }],
        };

        // `with:` narrows to one conversation.
        if (ops.with) {
            const other = lower(ops.with);
            match.$or = [
                { sender: username, recipient: other },
                { sender: other, recipient: username },
            ];
        }
        // `from:` narrows the SENDER, keeping the participation check above.
        if (ops.from) {
            match.sender = ops.from;
        }

        if (ops.has === "image") match.imageUrl = { $exists: true, $nin: ["", null] };
        if (ops.has === "video") match.videoUrl = { $exists: true, $nin: ["", null] };
        if (ops.has === "audio") match.audioUrl = { $exists: true, $nin: ["", null] };
        if (ops.has === "file") match.attachments = { $exists: true, $nin: [[], null] };
        if (ops.has === "link") match.linkPreview = { $exists: true, $nin: [null] };
        if (ops.has === "poll") match.poll = { $exists: true };
        if (ops.has === "location") match.location = { $exists: true };
        if (ops.before) match.timeStamp = { ...(match.timeStamp || {}), $lt: new Date(ops.before) };
        if (ops.after) match.timeStamp = { ...(match.timeStamp || {}), $gt: new Date(ops.after) };
        if (text) match.text = { $regex: text, $options: "i" };

        const [rows, total] = await Promise.all([
            Message.find(match).sort({ timeStamp: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            Message.countDocuments(match),
        ]);

        return res.json({
            results: rows.map((m) => ({
                id: String(m._id),
                with: m.sender === username ? m.recipient : m.sender,
                text: m.text,
                sentByMe: m.sender === username,
                timeStamp: m.timeStamp,
                hasImage: !!m.imageUrl,
                hasVideo: !!m.videoUrl,
                hasAudio: !!m.audioUrl,
                hasFile: !!(m.attachments && m.attachments.length),
            })),
            page,
            limit,
            total,
            hasMore: page * limit < total,
            operators: ops,
            remainingQuery: q,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HISTORY MANAGEMENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/** DELETE /conversation/:username â€” remove the thread from the caller's view. */
router.delete("/conversation/:username", verifyToken, async (req, res) => {
    try {
        const username = await requireActor(req, res);
        if (!username) return;
        const other = lower(req.params.username);
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: "Account not found" });

        // Deletes the caller's copy of the thread from their lists. The messages
        // themselves are NOT removed: the other participant still has them, and
        // unilaterally destroying a shared conversation is not something a "clear
        // chat" button should do.
        for (const field of ["archivedChats", "mutedChats", "pinnedChats"]) {
            user[field] = (user[field] || []).filter((c) => lower(c) !== other);
        }
        if (user.chatPreferences instanceof Map) user.chatPreferences.delete(other);
        else if (user.chatPreferences) delete user.chatPreferences[other];
        await user.save();
        return res.json({ ok: true, note: "Removed from your lists. Messages were not deleted â€” the other person still has them." });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** POST /conversation/:username/clear â€” soft-delete every message in the thread. */
router.post("/conversation/:username/clear", verifyToken, async (req, res) => {
    try {
        const username = await requireActor(req, res);
        if (!username) return;
        const other = lower(req.params.username);
        const result = await Message.updateMany(
            { sender: username, recipient: other, deleted: { $ne: true } },
            { $set: { text: "", imageUrl: "", audioUrl: "", videoUrl: "", attachments: [], deleted: true, editedAt: null } }
        );
        try {
            logModeration("conversation_cleared", { username, meta: { with: other, cleared: result.modifiedCount } });
        } catch { /* ignore */ }
        return res.json({ ok: true, cleared: result.modifiedCount, note: "Only YOUR messages were cleared. Their messages were left intact." });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/**
 * GET /conversation/:username/export?format=json|csv|text
 * Downloads are built here, not by the client, so a 5000-message thread does not
 * have to be pulled into a browser tab first.
 */
router.get("/conversation/:username/export", verifyToken, async (req, res) => {
    try {
        const username = await requireActor(req, res);
        if (!username) return;
        const other = req.params.username;
        const format = ["json", "csv", "text"].includes(req.query.format) ? req.query.format : "json";
        const key = lower(other);

        const rows = await Message.find({
            $or: [
                { sender: username, recipient: other },
                { sender: other, recipient: username },
            ],
        }).sort({ timeStamp: 1 }).limit(10000).lean();

        const stamp = new Date().toISOString().slice(0, 10);
        if (format === "json") {
            return res.json({ with: other, exportedAt: new Date(), messages: rows });
        }

        const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = [];
        if (format === "csv") {
            lines.push("timestamp,sender,recipient,type,text,image,edited,deleted");
            for (const m of rows) {
                lines.push([
                    esc(new Date(m.timeStamp).toISOString()),
                    esc(m.sender), esc(m.recipient),
                    esc(m.kind || (m.imageUrl ? "image" : m.audioUrl ? "audio" : "text")),
                    esc(m.text), esc(m.imageUrl), m.editedAt ? "yes" : "no", m.deleted ? "yes" : "no",
                ].join(","));
            }
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
        } else {
            for (const m of rows) {
                const when = new Date(m.timeStamp).toLocaleString();
                const who = m.sender === username ? "You" : m.sender;
                lines.push(`[${when}] ${who}: ${m.deleted ? "(message deleted)" : m.text || `(${m.kind || "media"} message)`}`);
            }
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
        }
        res.setHeader("Content-Disposition", `attachment; filename="conversation-${key}-${stamp}.${format}"`);
        return res.send(lines.join("\n"));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PER-CONVERSATION DRAFTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

router.get("/drafts/:scope", verifyToken, async (req, res) => {
    try {
        const scope = lower(req.params.scope);
        const draft = await ChatDraft.findOne({ userId: req.userId, scope }).lean();
        return res.json({ draft: draft || null });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

router.put("/drafts/:scope", verifyToken, async (req, res) => {
    try {
        const scope = lower(req.params.scope);
        const payload = req.body || {};
        // A scope of "group:<id>" or a username; both are bounded strings.
        if (scope.length > 80) return res.status(400).json({ error: "scope too long" });

        const text = String(payload.text ?? "").slice(0, 4000);
        const hasContent = text.trim()
            || payload.imageUrl || payload.audioUrl || payload.videoUrl
            || (Array.isArray(payload.attachments) && payload.attachments.length)
            || payload.location || payload.poll;

        if (!hasContent) {
            await ChatDraft.deleteOne({ userId: req.userId, scope });
            return res.json({ ok: true, cleared: true });
        }

        const draft = await ChatDraft.findOneAndUpdate(
            { userId: req.userId, scope },
            {
                $set: {
                    text,
                    imageUrl: String(payload.imageUrl ?? ""),
                    audioUrl: String(payload.audioUrl ?? ""),
                    videoUrl: String(payload.videoUrl ?? ""),
                    attachments: Array.isArray(payload.attachments) ? payload.attachments.slice(0, 10) : null,
                    replyTo: payload.replyTo ?? null,
                    location: payload.location ?? null,
                    poll: payload.poll ?? null,
                    kind: payload.kind === "code" ? "code" : "text",
                    updatedAt: new Date(),
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return res.json({ ok: true, draft });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

router.delete("/drafts/:scope", verifyToken, async (req, res) => {
    try {
        const scope = lower(req.params.scope);
        await ChatDraft.deleteOne({ userId: req.userId, scope });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /drafts â€” every saved draft, so the composer can warn about other threads. */
router.get("/drafts", verifyToken, async (req, res) => {
    try {
        const rows = await ChatDraft.find({ userId: req.userId }).sort({ updatedAt: -1 }).limit(50).lean();
        return res.json({ drafts: rows, count: rows.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

module.exports = router;
