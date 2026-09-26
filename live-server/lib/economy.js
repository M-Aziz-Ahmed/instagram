const User = require("../models/user");
const GemTransaction = require("../models/gemTransaction");

// ── Pricing ────────────────────────────────────────────────────────────────
// One place to retune the whole economy. There is no payment provider wired up,
// so gems are credited by admins and earned in-app; the catalogue below is
// priced in gems only.
const GEM_CATALOG = {
    pro_1_month:  { gems: 500,   months: 1,  label: "Pro — 1 month" },
    pro_3_months: { gems: 1350,  months: 3,  label: "Pro — 3 months" },
    pro_12_months:{ gems: 4500,  months: 12, label: "Pro — 12 months" },
};

// What Pro actually grants. Kept as data so the client can render the same list
// the server enforces, instead of two definitions drifting apart.
const PRO_PERKS = [
    { id: "ad_free",     label: "No ads on any surface" },
    { id: "pro_badge",   label: "Pro badge next to your name" },
    { id: "priority",    label: "Your posts rank higher in discovery" },
];

// Reasons a balance can move. Enforced so a typo in a caller cannot invent
// arbitrary ledger entries.
const GEM_REASONS = new Set([
    "admin_grant",
    "admin_deduct",
    "pro_purchase",
    "reward",
    "refund",
    "adjustment",
]);

const MAX_GEM_DELTA = 1_000_000;

// Pro is time-boxed rather than a boolean, so "when does this expire" is always
// answerable and there is no separate job to flip a flag.
function isProUserDoc(user) {
    if (!user?.proUntil) return false;
    const until = user.proUntil instanceof Date ? user.proUntil : new Date(user.proUntil);
    return !Number.isNaN(until.getTime()) && until.getTime() > Date.now();
}

async function isProUser(userId) {
    if (!userId) return false;
    const user = await User.findById(userId).select("proUntil").lean();
    return isProUserDoc(user);
}

// ── Movement ───────────────────────────────────────────────────────────────

// Credits gems and writes the ledger row.
//
// The balance is updated first and the ledger second. If the ledger insert
// fails the balance is still correct, and the failure is logged loudly rather
// than swallowed: the balance is the authoritative number, the ledger is the
// audit trail.
async function creditGems(userId, amount, reason, { note = "", by = "system" } = {}) {
    const delta = Math.floor(Number(amount));
    if (!Number.isFinite(delta) || delta <= 0) {
        throw new Error("Credit amount must be a positive whole number");
    }
    if (delta > MAX_GEM_DELTA) throw new Error("Credit amount is too large");
    if (!GEM_REASONS.has(reason)) throw new Error(`Unknown gem reason: ${reason}`);

    const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { gems: delta } },
        { new: true }
    ).select("username gems");
    if (!user) return null;

    await recordMovement(user, delta, reason, note, by);
    return { balance: user.gems, username: user.username };
}

// Debits gems, refusing to overdraw.
//
// The balance check is part of the update filter rather than a read followed by
// a write, so two concurrent spends cannot both read the same balance and drive
// it negative. A null result means the guard did not match: either the account
// is gone or the balance is too low.
async function debitGems(userId, amount, reason, { note = "", by = "system" } = {}) {
    const delta = Math.floor(Number(amount));
    if (!Number.isFinite(delta) || delta <= 0) {
        throw new Error("Debit amount must be a positive whole number");
    }
    if (delta > MAX_GEM_DELTA) throw new Error("Debit amount is too large");
    if (!GEM_REASONS.has(reason)) throw new Error(`Unknown gem reason: ${reason}`);

    const user = await User.findOneAndUpdate(
        { _id: userId, gems: { $gte: delta } },
        { $inc: { gems: -delta } },
        { new: true }
    ).select("username gems");
    if (!user) return null;

    await recordMovement(user, -delta, reason, note, by);
    return { balance: user.gems, username: user.username };
}

async function recordMovement(user, amount, reason, note, by) {
    try {
        await GemTransaction.create({
            user: user.username,
            amount,
            balanceAfter: user.gems,
            reason,
            note: String(note || "").slice(0, 200),
            by: String(by || "system").slice(0, 60),
        });
    } catch (err) {
        // The balance is already correct; losing the audit row is bad but not
        // worth failing the user's request over.
        console.error("[economy] failed to write gem ledger row:", err);
    }
}

// ── Pro purchase ───────────────────────────────────────────────────────────

// Buys a Pro subscription for `sku` and returns the new expiry.
//
// Settled in gems because there is no payment provider. This function is the
// seam a real provider slots into: a Stripe capture would call the same
// creditGems/debitGems helpers, so nothing above this layer changes.
//
// The balance check and the expiry extension happen in a single aggregation
// pipeline update, so two simultaneous purchases cannot both read the same
// `proUntil` and produce a shorter-than-expected expiry or a negative balance.
async function purchasePro(userId, sku) {
    const item = GEM_CATALOG[sku];
    if (!item) return { error: "Unknown item", status: 400 };

    const now = new Date();
    const ms = item.months * 30 * 24 * 60 * 60 * 1000;

    const user = await User.findOneAndUpdate(
        { _id: userId, gems: { $gte: item.gems } },
        [
            {
                $set: {
                    gems: { $subtract: ["$gems", item.gems] },
                    // Extend from the current expiry when still active, otherwise
                    // from now - so buying twice in a row stacks, and an expired
                    // one restarts rather than granting time in the past.
                    proUntil: {
                        $add: [
                            {
                                $cond: [
                                    { $gt: [{ $ifNull: ["$proUntil", new Date(0)] }, now] },
                                    "$proUntil",
                                    now,
                                ],
                            },
                            ms,
                        ],
                    },
                },
            },
        ],
        { new: true }
    ).select("username gems proUntil");

    if (!user) {
        // Distinguish "not enough gems" from "no such account" without leaking
        // anything: the client only needs to know it cannot afford this yet.
        const exists = await User.exists({ _id: userId });
        if (!exists) return { error: "Account not found", status: 404 };
        return { error: "Not enough gems", status: 402, required: item.gems };
    }

    await recordMovement(user, -item.gems, "pro_purchase", `${item.label} (${sku})`, user.username);

    return {
        balance: user.gems,
        proUntil: user.proUntil,
        username: user.username,
    };
}

module.exports = {
    GEM_CATALOG,
    PRO_PERKS,
    GEM_REASONS,
    isProUser,
    isProUserDoc,
    creditGems,
    debitGems,
    purchasePro,
};
