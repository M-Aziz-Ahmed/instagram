const User = require("../models/user");
const { getBlockedUsers } = require("./visibility");

/**
 * Resolves a recipient and enforces every messaging rule that must hold before
 * a message can be delivered, so the send and forward paths cannot drift apart.
 *
 * Blocking is enforced here, not in the UI, because the UI is not the only way
 * to post a message — the socket layer and any direct API caller must be held to
 * the same rule. A block is symmetric: if either side has blocked the other, the
 * message is not delivered.
 *
 * Mute is deliberately NOT consulted. Muting hides someone's posts; it must not
 * cut off a DM thread, otherwise "mute" silently becomes "block" for messaging
 * and the UI's promise that you can still message a muted user becomes a lie.
 *
 * This lives in `lib/` rather than inside `routes/messages.js` because more than
 * one entry point can now create a thread — the normal composer, forwarding, and
 * an invite greeting. A new caller that re-implemented these checks would be a
 * silent hole in the block rule, so there is exactly one implementation and it
 * is imported.
 *
 * Returns `{ status, body }` on failure, or the resolved recipient on success.
 */
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

module.exports = { resolveRecipient };
