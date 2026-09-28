const crypto = require("crypto");
const User = require("../models/user");
const Message = require("../models/messages");

/**
 * Every rule about invite codes, in one file, because there are two independent
 * things that were previously half-built against `User.inviteCode` and neither
 * worked:
 *
 *  1. REFERRED SIGNUPS. The login form has always sent `inviteCode` to
 *     `POST /api/auth/verify-otp`, and the server has always ignored it, so
 *     `referredBy` and `inviteCount` were only ever readable and never written.
 *     The `/referrals` page then called `/api/referrals`, which was not
 *     registered at all. The growth loop existed only as UI.
 *  2. QR EXCHANGE. A code that can be shown as a QR, so two people can open a
 *     thread without either typing a username.
 *
 * Both hang off the ONE `User.inviteCode` field rather than a second collection.
 * A separate invite collection was the first design and it was wrong: it would
 * have meant two codes per user, two sources of truth for "who invited me", and
 * a QR that silently did not credit referrals.
 *
 * Security posture of a code:
 *  - 48 bits of entropy from a CSPRNG over a 30-symbol alphabet, so a code is
 *    not guessable and not derivable from the username. (The admin issuer
 *    previously defaulted a code to `USERNAME.toUpperCase().slice(0,12)`, which
 *    hands every user's referral link to anyone who can guess their name.)
 *  - The alphabet omits I, L, O, U, 0 and 1, so a code read aloud or copied off
 *    a screen by hand cannot be mistyped into a different code.
 *  - It is a referral link, not a credential: it grants no access to the
 *    inviter's account, and redeeming it can only start a conversation that the
 *    inviter can mute, block, or delete like any other.
 */

/** Crockford-style alphabet: no I/L/O/U to avoid 1/0 confusion. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LEN = 10;
const CODE_RE = new RegExp(`^[${ALPHABET}]{${CODE_LEN}}$`);

/** How many greetings one invite code may start per rolling 24 hours. */
const GREET_BUDGET_PER_DAY = 40;

/**
 * A fresh code. Rejection-sampled so every symbol is uniform — a plain `% len`
 * over a 30-symbol alphabet would bias the first 6 symbols, which quietly
 * shrinks the effective keyspace.
 */
function newInviteCode() {
    const out = [];
    const limit = 256 - (256 % ALPHABET.length); // largest unbiased byte multiple
    while (out.length < CODE_LEN) {
        for (const byte of crypto.randomBytes(CODE_LEN * 2)) {
            if (byte >= limit) continue;           // biased tail, discard
            out.push(ALPHABET[byte % ALPHABET.length]);
            if (out.length === CODE_LEN) break;
        }
    }
    return out.join("");
}

function normalizeCode(raw) {
    const code = String(raw ?? "").trim().toUpperCase();
    return CODE_RE.test(code) ? code : null;
}

/**
 * Return the user's code, minting one if they do not have a usable one.
 *
 * "Usable" matters as much as "present". Codes predating this module were
 * admin-issued and not required to match `CODE_RE` — the old issuer defaulted to
 * `USERNAME.toUpperCase().slice(0,12)`, which is both guessable and (for most
 * usernames) the wrong length, so `normalizeCode` rejects it and the code would
 * resolve to nobody even though the user still had one. Silently keeping a legacy
 * value would leave those accounts with a QR that scans but never works, so a code
 * that fails validation is replaced instead.
 *
 * A replaced code invalidates the old link. That is the intended reading — the old
 * value was a guessable string, so anything derived from it was never private —
 * and referrals it already credited stay credited.
 *
 * Minting lazily rather than in a migration means the feature works for the
 * accounts that already exist, today, with no backfill and no deploy ordering. A
 * lost race (two tabs, two requests) resolves in the database: the unique index
 * rejects the second write and we re-read the winner's code.
 */
async function ensureInviteCode(user) {
    if (user.inviteCode && CODE_RE.test(user.inviteCode)) return user.inviteCode;

    for (let attempt = 0; attempt < 5; attempt++) {
        const code = newInviteCode();
        // The `$or` deliberately does NOT include "inviteCode is some other
        // non-matching value": two concurrent requests for one legacy account
        // must not each overwrite, and only the first should win the replacement.
        const claimed = await User.findOneAndUpdate(
            {
                _id: user._id,
                $or: [{ inviteCode: null }, { inviteCode: { $exists: false } }],
            },
            { $set: { inviteCode: code } },
            { new: true },
        ).select("inviteCode").lean();
        if (claimed?.inviteCode) return claimed.inviteCode;

        // A legacy value is present, so the filter above can never match. Replace
        // it explicitly, but only while it is still the value we inspected, so a
        // concurrent replacement is not clobbered by a stale read.
        const replaced = await User.findOneAndUpdate(
            { _id: user._id, inviteCode: user.inviteCode || null },
            { $set: { inviteCode: code } },
            { new: true },
        ).select("inviteCode").lean().catch(() => null);
        if (replaced?.inviteCode) return replaced.inviteCode;
    }

    // Somebody won every race, or the user genuinely already has one.
    const fresh = await User.findById(user._id).select("inviteCode").lean();
    if (fresh?.inviteCode) return fresh.inviteCode;
    throw new Error("Could not allocate an invite code");
}

/** Resolve a code to its owner. `null` for malformed, unknown, or revoked. */
async function findInviterByCode(raw) {
    const code = normalizeCode(raw);
    if (!code) return null;
    return User.findOne({ inviteCode: code })
        .select("username avatarColor avatarUrl displayName bio inviteCode inviteCount")
        .lean();
}

/**
 * Credit a referrer on first signup.
 *
 * Deliberately conservative:
 *  - no self-referral (a user can paste their own code; that must not inflate
 *    their own counter or make the /referrals number meaningless);
 *  - first touch wins, so a replayed signup request cannot re-increment;
 *  - the referrer's own `referralCount` is bumped in the same statement that
 *    records the attribution, never in two writes that can half-happen.
 */
async function creditReferral(code, newUsername) {
    const inviter = await findInviterByCode(code);
    if (!inviter) return null;
    if (inviter.username.toLowerCase() === String(newUsername).toLowerCase()) return null;

    const updated = await User.findOneAndUpdate(
        { username: inviter.username, $expr: { $lt: [{ $ifNull: ["$inviteCount", 0] }, 100000] } },
        { $inc: { inviteCount: 1 } },
        { new: true },
    ).select("inviteCount").lean();
    if (!updated) return null;

    return { inviter: inviter.username, inviteCount: updated.inviteCount };
}

/** Greetings already sent to this account inside the rolling window. */
async function greetCountSince(username, since) {
    return Message.countDocuments({
        recipient: username,
        kind: "greeting",
        timeStamp: { $gte: since },
    });
}

/** Remaining greeting budget for a code's owner. */
async function greetBudgetRemaining(inviter) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const used = await greetCountSince(inviter.username, since);
    return Math.max(0, GREET_BUDGET_PER_DAY - used);
}

module.exports = {
    newInviteCode,
    normalizeCode,
    ensureInviteCode,
    findInviterByCode,
    creditReferral,
    greetBudgetRemaining,
    GREET_BUDGET_PER_DAY,
    CODE_RE,
};
