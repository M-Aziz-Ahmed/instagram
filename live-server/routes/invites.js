const express = require("express");
const crypto = require("crypto");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

function generateInviteCode() {
    return crypto.randomBytes(4).toString("hex").toUpperCase();
}

router.get("/my-code", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("inviteCode").lean();
        if (!user) return res.status(404).json({ error: "User not found" });

        if (user.inviteCode) {
            return res.json({ code: user.inviteCode });
        }

        let code;
        let attempts = 0;
        do {
            code = generateInviteCode();
            attempts++;
        } while (attempts < 10 && await User.exists({ inviteCode: code }));

        await User.findByIdAndUpdate(req.userId, { inviteCode: code });
        return res.json({ code });
    } catch (err) {
        console.error("[INVITES] my-code error:", err.message);
        res.status(500).json({ error: "Failed to get invite code" });
    }
});

router.post("/claim", verifyToken, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "Invite code required" });

        const referrer = await User.findOne({ inviteCode: code }).lean();
        if (!referrer) return res.status(404).json({ error: "Invalid invite code" });
        if (referrer._id.toString() === req.userId) {
            return res.status(400).json({ error: "You cannot use your own invite code" });
        }

        const claimer = await User.findById(req.userId).select("referredBy").lean();
        if (claimer?.referredBy) {
            return res.status(400).json({ error: "Already claimed an invite code" });
        }

        await User.findByIdAndUpdate(req.userId, { referredBy: referrer.username });
        await User.updateOne({ _id: referrer._id }, { $inc: { inviteCount: 1 } });

        return res.json({ ok: true, referrer: referrer.username });
    } catch (err) {
        console.error("[INVITES] claim error:", err.message);
        res.status(500).json({ error: "Failed to claim invite" });
    }
});

router.get("/stats", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("inviteCount referredBy inviteCode").lean();
        if (!user) return res.status(404).json({ error: "User not found" });

        const referredUsers = await User.find({ referredBy: user.username || "" })
            .select("username avatarUrl avatarColor createdAt")
            .lean();

        return res.json({
            inviteCount: user.inviteCount || 0,
            referredBy: user.referredBy || null,
            inviteCode: user.inviteCode || null,
            referredUsers,
        });
    } catch (err) {
        console.error("[INVITES] stats error:", err.message);
        res.status(500).json({ error: "Failed to get invite stats" });
    }
});

module.exports = router;
