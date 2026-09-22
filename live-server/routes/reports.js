const express = require("express");
const crypto = require("crypto");
const Report = require("../models/report");
const { optionalAuth } = require("../middleware/auth");

// dual use: router with optionalAuth applied only to POST /
const router = express.Router();

// Report a post / user. Lightweight spam-guard: one open report per
// reporter+target within 24h returns the existing report idempotently.
router.post("/", optionalAuth, async (req, res) => {
    try {
        const { targetType = "post", targetId = "", reason = "spam", details = "" } = req.body || {};
        if (typeof targetId !== "string" || !targetId.trim()) {
            return res.status(400).json({ error: "targetId required" });
        }
        const type = ["post", "comment", "user", "profile"].includes(targetType) ? targetType : "post";
        if (reason.length > 120) return res.status(400).json({ error: "Reason too long" });
        if (details.length > 2000) return res.status(400).json({ error: "Details too long" });

        const reporterSource = req.userId ? String(req.userId) : `guest:${req.ip || "anon"}`;
        const reporterHash = crypto.createHash("sha256").update(reporterSource).digest("hex").slice(0, 32);

        const dup = await Report.findOne({
            targetType: type,
            targetId: String(targetId).slice(0, 64),
            reporterHash,
            status: "open",
            createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
        });
        if (dup) return res.json({ ok: true, id: dup._id.toString(), duplicate: true });

        const created = await Report.create({
            targetType: type,
            targetId: String(targetId).slice(0, 64),
            reason: String(reason).slice(0, 120),
            details: String(details).slice(0, 2000),
            reporter: req.userId ? "user" : "guest",
            reporterHash,
        });
        return res.json({ ok: true, id: created._id.toString(), duplicate: false });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;