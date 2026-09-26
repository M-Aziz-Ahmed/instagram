const express = require("express");
const User = require("../models/user");
const GemTransaction = require("../models/gemTransaction");
const { verifyToken } = require("../middleware/auth");
const {
    GEM_CATALOG,
    PRO_PERKS,
    purchasePro,
    isProUserDoc,
} = require("../lib/economy");

const router = express.Router();

// GET / — balance, Pro status, catalogue and recent ledger entries.
//
// The catalogue and perk list are served from the server's own config so the
// prices a user is quoted are exactly the prices the server will charge.
router.get("/", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId)
            .select("username gems proUntil avatarColor")
            .lean();
        if (!user) return res.status(404).json({ error: "Account not found" });

        const history = await GemTransaction.find({ user: user.username })
            .sort({ createdAt: -1 })
            .limit(25)
            .lean();

        return res.json({
            username: user.username,
            gems: user.gems || 0,
            isPro: isProUserDoc(user),
            proUntil: user.proUntil || null,
            catalog: GEM_CATALOG,
            perks: PRO_PERKS,
            history,
        });
    } catch (err) {
        console.error("gems GET error:", err);
        return res.status(500).json({ error: "Failed to load wallet" });
    }
});

// POST /pro — spend gems on a Pro subscription.
//
// No payment provider is involved: the balance is the source of truth and the
// purchase settles immediately in gems. A real provider would be added in front
// of this route rather than inside it.
router.post("/pro", verifyToken, async (req, res) => {
    try {
        const { sku } = req.body || {};
        if (!sku || typeof sku !== "string") {
            return res.status(400).json({ error: "An item is required" });
        }

        const result = await purchasePro(req.userId, sku.trim());
        if (result.error) {
            return res.status(result.status).json({ error: result.error, required: result.required });
        }

        return res.json({
            ok: true,
            gems: result.balance,
            proUntil: result.proUntil,
            isPro: true,
        });
    } catch (err) {
        console.error("gems pro error:", err);
        return res.status(500).json({ error: "Failed to complete purchase" });
    }
});

module.exports = router;
