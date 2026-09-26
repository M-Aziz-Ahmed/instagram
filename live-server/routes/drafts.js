const express = require("express");
const Draft = require("../models/draft");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// Drafts are private to their author, so every route here requires a session.
// The proxy also keeps /api/drafts out of PUBLIC_PATHS; the verifyToken below is
// the actual enforcement.

const MAX_OPTIONS = 5;
const MAX_OPTION_LEN = 100;

function present(draft) {
    return {
        text: draft.text || "",
        visibility: draft.visibility || "public",
        expiresIn: draft.expiresIn ?? null,
        pollEnabled: !!draft.pollEnabled,
        pollOptions: draft.pollOptions || [],
        hadAttachments: !!draft.hadAttachments,
        updatedAt: draft.updatedAt,
    };
}

// GET / — the caller's current draft, or null when there isn't one.
router.get("/", verifyToken, async (req, res) => {
    try {
        const draft = await Draft.findOne({ userId: req.userId }).lean();
        res.json({ draft: draft ? present(draft) : null });
    } catch (err) {
        console.error("[DRAFTS] read failed:", err.message);
        res.status(500).json({ error: "Failed to load draft" });
    }
});

// PUT / — create or replace the caller's draft.
router.put("/", verifyToken, async (req, res) => {
    try {
        const { text, visibility, expiresIn, pollEnabled, pollOptions, hadAttachments } = req.body || {};

        const cleanText = typeof text === "string" ? text.slice(0, 500) : "";
        const cleanOptions = Array.isArray(pollOptions)
            ? pollOptions
                .map((o) => (typeof o === "string" ? o.trim().slice(0, MAX_OPTION_LEN) : ""))
                .filter(Boolean)
                .slice(0, MAX_OPTIONS)
            : [];

        const cleanVisibility = visibility === "closeFriends" ? "closeFriends" : "public";
        const cleanExpiry = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : null;
        const wantsPoll = !!pollEnabled && cleanOptions.length >= 2;

        const doc = {
            text: cleanText,
            visibility: cleanVisibility,
            expiresIn: cleanExpiry,
            pollEnabled: wantsPoll,
            pollOptions: wantsPoll ? cleanOptions : [],
            hadAttachments: !!hadAttachments,
            updatedAt: Date.now(),
        };

        // An empty draft is the same as no draft, so clear it instead of
        // leaving a blank row behind that the composer has to special-case.
        const isEmpty =
            !cleanText.trim() &&
            !doc.pollEnabled &&
            !doc.hadAttachments &&
            !doc.expiresIn;

        if (isEmpty) {
            await Draft.deleteOne({ userId: req.userId });
            return res.json({ ok: true, draft: null });
        }

        const saved = await Draft.findOneAndUpdate(
            { userId: req.userId },
            { $set: doc, $setOnInsert: { userId: req.userId, createdAt: Date.now() } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).lean();

        res.json({ ok: true, draft: present(saved) });
    } catch (err) {
        console.error("[DRAFTS] save failed:", err.message);
        res.status(500).json({ error: "Failed to save draft" });
    }
});

// DELETE / — discard the caller's draft.
router.delete("/", verifyToken, async (req, res) => {
    try {
        await Draft.deleteOne({ userId: req.userId });
        res.json({ ok: true });
    } catch (err) {
        console.error("[DRAFTS] delete failed:", err.message);
        res.status(500).json({ error: "Failed to discard draft" });
    }
});

module.exports = router;
