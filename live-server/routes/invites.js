const express = require("express");

const Message = require("../models/messages");
const Notification = require("../models/notification");
const User = require("../models/user");
const { verifyToken, optionalAuth } = require("../middleware/auth");
const { resolveRecipient } = require("../lib/dmGuard");
const { rejectIfBlocked } = require("../lib/textFilter");
const { requireFeature } = require("../lib/featureFlags");
const { sendPushNotification } = require("../push");
const { logChat } = require("../logService");
const {
    ensureInviteCode, findInviterByCode, normalizeCode, greetBudgetRemaining,
} = require("../lib/invites");
const {
    inviteCodeLimiter, inviteResolveLimiter, inviteGreetLimiter,
} = require("../middleware/rateLimit");

const router = express.Router();

/* ── What an invite is, and what it deliberately is not ────────────────────
 *
 * There is no friendship or follow graph in this app. A DM thread exists the
 * moment a message exists between two usernames, and `POST /api/messages`
 * already lets anyone message anyone by name. An invite is therefore NOT a new
 * relationship type — it hands someone your username without either of you
 * typing it, and it credits the referral that was never actually being written.
 *
 * Two rules follow, and they are why this is not simply "a QR that opens the
 * composer":
 *
 *  1. A scan sends nothing by itself. The scanner lands on a screen naming the
 *     person, and the human chooses to greet. A self-sending QR is an open
 *     relay for spam and the fastest way to get the domain flagged.
 *  2. The greeting is an ordinary DM written through the ordinary model, so it
 *     inherits the content filter, the block rule, the notification, the push
 *     and the socket emit. There is no second path into an inbox, so there is
 *     no second thing to audit.
 * -------------------------------------------------------------------------*/

const GREETING_MAX = 500;
const PROFILE_FIELDS = "username avatarColor avatarUrl displayName bio";

/** The canonical shareable URL. The QR encodes this, so it also works as a link. */
function inviteUrl(req, code) {
    const base = process.env.PUBLIC_WEB_URL
        || (req.get("host") ? `${req.protocol}://${req.get("host")}` : "");
    return `${String(base).replace(/\/+$/, "")}/invite/${code}`;
}

async function actor(req) {
    const doc = await User.findById(req.userId).select("username").lean();
    return doc?.username || null;
}

async function requireActor(req, res) {
    const username = await actor(req);
    if (!username) res.status(401).json({ error: "Could not resolve your account" });
    return username;
}

function suggestionFor(inviter) {
    const name = (inviter.displayName || "").trim() || inviter.username;
    return `Hi ${name}! I scanned your invite code on AnonFeed — would love to connect.`;
}

/* ── GET /api/invites/mine — your code, minted on demand ───────────────────
 *
 * Minting here rather than at signup means the accounts that already exist get
 * a working code on their first visit, with no backfill to run and nothing to
 * keep in sync. `POST /api/auth/setup` also mints one, so the referrals page has
 * something to show before anyone opens this.
 */
router.get("/mine", verifyToken, requireFeature("invites"), async (req, res) => {
    try {
        const username = await requireActor(req, res);
        if (!username) return;

        const user = await User.findById(req.userId).select("inviteCode inviteCount username").lean();
        if (!user) return res.status(404).json({ error: "Account not found" });

        const code = await ensureInviteCode(user);
        const fresh = await User.findById(req.userId).select("inviteCount").lean();

        return res.json({
            code,
            url: inviteUrl(req, code),
            invited: fresh?.inviteCount || 0,
        });
    } catch (err) {
        console.error("[invites] mine failed:", err.message);
        return res.status(500).json({ error: "Could not read your invite code" });
    }
});

/* ── POST /api/invites/rotate — invalidate the old code ───────────────────
 *
 * The only use of a rotate is "this link leaked". The old code stops resolving
 * the moment this returns, and the referrer it credited stays credited, because
 * a signup that already happened cannot be un-happened.
 */
router.post("/rotate", verifyToken, requireFeature("invites"), inviteCodeLimiter, async (req, res) => {
    try {
        const username = await requireActor(req, res);
        if (!username) return;

        const { newInviteCode } = require("../lib/invites");
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = newInviteCode();
            // The unique index makes the collision impossible to miss, so the
            // try/catch is the correctness backstop rather than the mechanism.
            const written = await User.findOneAndUpdate(
                { _id: req.userId },
                { $set: { inviteCode: candidate } },
                { new: true },
            ).select("inviteCode").lean().catch(() => null);
            if (written?.inviteCode === candidate) {
                return res.json({ code: candidate, url: inviteUrl(req, candidate) });
            }
        }
        return res.status(500).json({ error: "Could not rotate your invite code" });
    } catch (err) {
        console.error("[invites] rotate failed:", err.message);
        return res.status(500).json({ error: "Could not rotate your invite code" });
    }
});

/* ── GET /api/invites/resolve/:code — who is this, and may I greet? ────────
 *
 * Public, because a stranger holding the QR may not be signed in, and because a
 * code has to render something before login. `optionalAuth` gates nothing; it
 * only lets the response say "this is you" and skip the form on a self-scan.
 *
 * Unknown, malformed and revoked codes all answer 404 with the same body. Saying
 * "expired" or "revoked" separately would confirm which codes were once real,
 * which is the one thing this endpoint must not leak.
 */
router.get("/resolve/:code", optionalAuth, inviteResolveLimiter, async (req, res) => {
    try {
        const raw = normalizeCode(req.params.code);
        if (!raw) return res.status(404).json({ error: "This invite code is not valid" });

        const inviter = await findInviterByCode(raw);
        if (!inviter) return res.status(404).json({ error: "This invite code is not valid" });

        const viewer = req.userId
            ? await User.findById(req.userId).select("username").lean()
            : null;
        const isSelf = !!viewer?.username
            && viewer.username.toLowerCase() === inviter.username.toLowerCase();

        // Checked only when it will be acted on, so a signed-out visitor does
        // not spend a query on a limit they cannot hit yet.
        const remaining = isSelf ? 0 : await greetBudgetRemaining(inviter);

        return res.json({
            inviter: {
                username: inviter.username,
                avatarColor: inviter.avatarColor || "#3b82f6",
                avatarUrl: inviter.avatarUrl || "",
                displayName: inviter.displayName || "",
                bio: String(inviter.bio || "").slice(0, 160),
            },
            isSelf,
            canGreet: !!viewer?.username && !isSelf && remaining > 0,
            // Pre-filled so the common case is one tap, still fully editable.
            suggestedGreeting: suggestionFor(inviter),
            greetingCharsLeft: GREETING_MAX,
        });
    } catch (err) {
        console.error("[invites] resolve failed:", err.message);
        return res.status(500).json({ error: "Could not read that invite code" });
    }
});

/* ── POST /api/invites/validate — legacy shape, kept working ───────────────
 *
 * `components/Auth/InviteLandingClient.jsx` has always called
 * `POST /api/invites/validate` and expected `{ valid, createdBy }`. No route by
 * that name existed and `/api/invites` was not mounted at all, so the invite
 * landing page could only ever render its "Invalid Invite" branch.
 *
 * This keeps that exact contract alive for the signed-out path, where there is
 * nothing to greet and the only question is whether the code is real. The
 * signed-in path uses `/resolve` instead, which returns the profile.
 */
router.post("/validate", inviteResolveLimiter, async (req, res) => {
    try {
        const raw = normalizeCode(req.body?.code);
        if (!raw) return res.json({ valid: false, error: "That invite code is not valid" });

        const inviter = await findInviterByCode(raw);
        if (!inviter) return res.json({ valid: false, error: "That invite code is not valid" });

        return res.json({ valid: true, createdBy: inviter.username });
    } catch (err) {
        console.error("[invites] validate failed:", err.message);
        return res.status(500).json({ valid: false, error: "Could not check that code" });
    }
});

/* ── POST /api/invites/greet — send the opening message ───────────────────
 *
 * The only state-changing invite endpoint, and the one that matters. Order is
 * deliberate:
 *
 *   1. resolve the caller          (who is asking)
 *   2. load the inviter by code    (does it still resolve)
 *   3. resolveRecipient            (shared block + self rules, as for any DM)
 *   4. content filter              (a banned greeting is a clean 400, not a 500)
 *   5. check the greeting budget   (per inviter, rolling 24h)
 *   6. write the message           (an ordinary Message, kind "greeting")
 *   7. notify, push, socket        (identical fan-out to a normal send)
 *
 * Steps 5 and 6 are not one atomic operation, so a burst can overshoot the
 * budget by a handful. That is bounded on purpose: the per-account limiter caps
 * a single sender at 5/min, so closing the race entirely would buy very little
 * and cost a counter that can drift out of sync with reality.
 */
router.post("/greet", verifyToken, requireFeature("invites"), inviteGreetLimiter, async (req, res) => {
    try {
        const sender = await requireActor(req, res);
        if (!sender) return;

        const raw = normalizeCode(req.body?.code);
        if (!raw) return res.status(400).json({ error: "That invite code is not valid" });

        const inviter = await findInviterByCode(raw);
        if (!inviter) return res.status(404).json({ error: "That invite code is not valid" });
        if (inviter.username.toLowerCase() === sender.toLowerCase()) {
            return res.status(400).json({ error: "This is your own invite code" });
        }

        const senderDoc = await User.findById(req.userId)
            .select("username avatarColor blockedUsers mutedUsers").lean();
        if (!senderDoc?.username) return res.status(401).json({ error: "Could not resolve your account" });

        // The guard every other DM goes through, imported rather than
        // reimplemented, so an invite can never become a way around a block.
        const resolved = await resolveRecipient(sender, senderDoc, inviter.username);
        if (resolved.status) return res.status(resolved.status).json(resolved.body);
        const { recipientName } = resolved;

        const text = String(req.body?.text ?? "").trim().slice(0, GREETING_MAX);
        if (!text) return res.status(400).json({ error: "Write a greeting before sending" });

        if (await rejectIfBlocked(text, "dm", res)) return;

        const remaining = await greetBudgetRemaining(inviter);
        if (remaining <= 0) {
            return res.status(429).json({
                error: "This account has reached its greeting limit for today. Try messaging them directly instead.",
            });
        }

        const color = senderDoc.avatarColor || "#3b82f6";
        const message = await Message.create({
            text,
            sender,
            recipient: recipientName,
            color,
            kind: "greeting",
        });

        // Fan-out identical to a normal send, so the inviter's badge, push, open
        // thread and mute/block all behave as if it had been typed by hand.
        Notification.create({
            recipient: recipientName,
            type: "message",
            fromUser: sender,
            fromColor: color,
            postId: message._id.toString(),
            text: text.slice(0, 120),
        }).catch(() => {});

        sendPushNotification({
            recipientUsername: recipientName,
            type: "message",
            fromUser: sender,
            text: text.slice(0, 120),
            url: `/inbox?user=${encodeURIComponent(sender)}`,
        });

        try {
            const io = req.app.locals?.io;
            if (io) io.to(recipientName).emit("message:new", {
                from: sender,
                body: text.slice(0, 120),
                timeStamp: message.timeStamp || Date.now(),
            });
        } catch {}

        logChat("invite_greeted", { sender, recipient: recipientName, code: raw });

        return res.status(201).json({
            ok: true,
            conversation: { username: recipientName, avatarColor: inviter.avatarColor || "#3b82f6" },
            message: message.toObject(),
        });
    } catch (err) {
        console.error("[invites] greet failed:", err.message);
        return res.status(500).json({ error: "Your greeting could not be sent — try again" });
    }
});

module.exports = router;
