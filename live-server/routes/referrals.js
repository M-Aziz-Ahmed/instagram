const express = require("express");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");
const { ensureInviteCode } = require("../lib/invites");

const router = express.Router();

/* ── GET /api/referrals — the dashboard behind /referrals ──────────────────
 *
 * This endpoint did not exist. `components/Profile/ReferralsClient.jsx` has
 * always called it, `/referrals` is linked from the profile page and from
 * MeHub, and every visitor got "Failed to load referral stats" — because
 * `referredBy` and `inviteCount` were also never written by anything, so even
 * a correct implementation had nothing to show.
 *
 * Both halves are fixed alongside it: `lib/invites.creditReferral` now writes
 * the attribution during signup, and this reads it back.
 *
 * `inviteCount` is a counter on the inviter, so a dashboard of "how many people
 * did I bring in" cannot be a join on `referredBy` alone without a full user
 * scan. The counter is authoritative for the headline number; the list of who
 * joined is a capped, latest-first projection and is explicitly allowed to be
 * incomplete rather than pretending otherwise.
 */
router.get("/", verifyToken, async (req, res) => {
    try {
        const me = await User.findById(req.userId).select("username inviteCode inviteCount referredBy").lean();
        if (!me) return res.status(404).json({ error: "Account not found" });

        // Minted lazily so a long-standing account sees a working share link the
        // first time they open this page, with no backfill to have run.
        const code = await ensureInviteCode(me);

        const [invitedCount, latest] = await Promise.all([
            User.countDocuments({ referredBy: me.username }),
            User.find({ referredBy: me.username })
                .select("username avatarColor avatarUrl createdAt")
                .sort({ createdAt: -1 })
                .limit(25)
                .lean(),
        ]);

        return res.json({
            code,
            shareUrl: `/invite/${code}`,
            // The counter the signup path increments.
            invited: me.inviteCount || 0,
            // What the database can actually prove, which is the honest number
            // to show. These can differ if a code was rotated or an account was
            // removed, and quietly showing only one of them would hide that.
            invitedOnRecord: invitedCount,
            recent: latest.map((u) => ({
                username: u.username,
                avatarColor: u.avatarColor || "#3b82f6",
                avatarUrl: u.avatarUrl || "",
                joinedAt: u.createdAt,
            })),

            // ── The shape ReferralsClient has always read ───────────────────
            // The page shipped expecting this payload while no route served it, so
            // every one of these was `undefined` at runtime and the page rendered
            // its failure branch. They are mapped from the fields above rather
            // than the component being rewritten, so the two stay in step.
            referredBy: me.referredBy || null,
            totalInvited: me.inviteCount || 0,
            referredUsers: latest.map((u) => ({
                username: u.username,
                avatarColor: u.avatarColor || "#3b82f6",
                avatarUrl: u.avatarUrl || "",
                joinedAt: u.createdAt,
            })),
            // "Active vs used codes" only made sense for the old admin-issued
            // multi-code scheme, which no longer exists: there is exactly one
            // code per user now. Reporting 1/0 keeps the tile meaningful instead
            // of showing NaN.
            stats: { activeCodes: me.inviteCode ? 1 : 0, usedCodes: invitedCount },
        });
    } catch (err) {
        console.error("[referrals] load failed:", err.message);
        return res.status(500).json({ error: "Could not load your referral stats" });
    }
});

module.exports = router;
