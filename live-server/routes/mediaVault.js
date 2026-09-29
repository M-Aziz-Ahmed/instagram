const express = require("express");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");
const { requireFeature } = require("../lib/featureFlags");
const { writeLimiter, readLimiter } = require("../middleware/rateLimit");
const {
    resolveMediaTarget, getConnection, remainingBytes, assertWithinQuota,
    connectCloudinary, disconnectCloudinary, addUsage, markOffered,
    SITE_TIER_QUOTA_BYTES,
} = require("../lib/mediaVault");

const router = express.Router();

/**
 * Media vault — the user's own storage account.
 *
 * Every route here is about the person who OWNS the media. The site's own
 * storage is the fallback, not the destination.
 *
 * Security posture, which is the reason this is built this way:
 *
 *   NO SECRETS ARE STORED. A Cloudinary cloud name and an unsigned preset name
 *   are public identifiers; the browser needs them to upload directly. A preset
 *   grants exactly one capability — "append a file to this cloud" — and cannot
 *   read, modify or delete anything already there. Because uploads go straight
 *   to the provider, this server never touches user media and never proxies
 *   playback, which is what keeps the cost at zero.
 *
 *   SO NO USER-SUPPLIED CREDENTIAL IS EVER LOGGED OR ECHOED. The connect route
 *   validates the shape of what it is given and stores it; it does not return
 *   the values back, and the audit log records the cloud name only.
 */

// ── GET /api/media-vault/status ───────────────────────────────────────────
router.get("/status", verifyToken, requireFeature("mediaVault"), readLimiter, async (req, res) => {
    try {
        const user = await User.findById(req.userId)
            .select("isAdmin videoUploadAllowed roles")
            .populate("roles")
            .lean();
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const conn = await getConnection(req.userId);
        const target = resolveMediaTarget(user, conn);
        const left = remainingBytes(target, conn?.usage);

        return res.json({
            tier: target.tier,
            provider: target.provider,
            canUpload: target.canUpload,
            alternative: target.alternative || null,

            // Enough to render the client without ever sending a secret. The
            // cloud name and preset are the same values the browser needs to
            // upload, so returning them grants nothing.
            cloud: cloudinaryReadyValues(conn),
            drive: { connected: !!conn?.providers?.googleDrive?.refreshToken },

            maxFileBytes: target.maxFileBytes || null,
            quota: {
                usedBytes: conn?.usage?.storedBytes || 0,
                quotaBytes: target.quotaBytes || 0,
                remainingBytes: Number.isFinite(left) ? left : null,
                // "unlimited" is the honest word for the user tier: their cloud,
                // their bill, and we have no idea what it holds.
                unlimited: !target.quotaBytes,
            },
            lastReconciledAt: conn?.usage?.reconciledAt || null,
            connect: { cloudName: conn?.providers?.cloudinary?.cloudName || "" },
        });
    } catch (err) {
        console.error("[mediaVault] status failed:", err.message);
        return res.status(500).json({ error: "Could not read your storage settings" });
    }
});

// ── POST /api/media-vault/cloudinary ──────────────────────────────────────
// Connect the caller's own Cloudinary cloud.
//
// Not rate limited by IP into uselessness, but still on the write limiter: this
// writes a row per account, and a loop should not be able to churn it.
router.post("/cloudinary", verifyToken, requireFeature("mediaVault"), writeLimiter, async (req, res) => {
    try {
        const { cloudName, uploadPreset } = req.body || {};
        await connectCloudinary(req.userId, { cloudName, uploadPreset });
        return res.json({ ok: true, tier: "user", provider: "cloudinary" });
    } catch (err) {
        return res.status(err.status || 500).json({ error: err.message || "Could not connect that cloud" });
    }
});

// ── DELETE /api/media-vault/cloudinary ────────────────────────────────────
//
// Does NOT delete anything in the user's cloud. It only stops this site from
// pointing at it; the files are the user's and are not ours to remove.
router.delete("/cloudinary", verifyToken, requireFeature("mediaVault"), writeLimiter, async (req, res) => {
    try {
        await disconnectCloudinary(req.userId);
        return res.json({ ok: true, tier: "site" });
    } catch (err) {
        return res.status(500).json({ error: "Could not disconnect that cloud" });
    }
});

// ── POST /api/media-vault/usage ───────────────────────────────────────────
// Record a completed direct upload.
//
// The bytes went browser → provider, so this is a notification, not a
// measurement: the client reports the size Cloudinary returned. It is
// monotonic (an increment) so a replayed or edited number can only ever
// under-report against a real upload, and the quota check still refuses
// over-quota media at attach time. Under-reporting buys an attacker nothing
// except their own uploads failing to post.
router.post("/usage", verifyToken, requireFeature("mediaVault"), writeLimiter, async (req, res) => {
    try {
        const bytes = Number(req.body?.bytes);
        if (!Number.isFinite(bytes) || bytes <= 0 || bytes > 2 * 1024 * 1024 * 1024) {
            return res.status(400).json({ error: "Invalid size" });
        }

        const user = await User.findById(req.userId)
            .select("isAdmin videoUploadAllowed roles").populate("roles").lean();
        const conn = await getConnection(req.userId);
        const target = resolveMediaTarget(user, conn);

        const refusal = assertWithinQuota(target, conn?.usage, bytes);
        if (refusal) return res.status(refusal.status).json(refusal);

        await addUsage(req.userId, bytes);
        return res.json({ ok: true });
    } catch (err) {
        console.error("[mediaVault] usage failed:", err.message);
        return res.status(500).json({ error: "Could not record that upload" });
    }
});

// ── POST /api/media-vault/offered ─────────────────────────────────────────
// "We have shown the user the connect-your-own-storage prompt."
router.post("/offered", verifyToken, requireFeature("mediaVault"), writeLimiter, async (req, res) => {
    try {
        await markOffered(req.userId);
        return res.json({ ok: true });
    } catch {
        return res.json({ ok: true }); // never worth surfacing
    }
});

/** Only ever returns public identifiers, and only when they are set. */
function cloudinaryReadyValues(conn) {
    const c = conn?.providers?.cloudinary;
    if (!c?.cloudName || !c?.uploadPreset) return null;
    return { cloudName: c.cloudName, uploadPreset: c.uploadPreset, verifiedAt: c.verifiedAt || null };
}

// ── Google Drive sub-router ───────────────────────────────────────────────
//
// Mounted from HERE rather than as a second `app.use("/api/media-vault", ...)`
// in server.js. Two mounts of the same prefix is valid Express — unmatched
// paths fall through — but it reads like an oversight and it is the kind of
// thing someone eventually "fixes" by deleting the wrong line. One mount point,
// one place that owns the prefix, and the Drive paths keep their stable
// `/api/media-vault/drive/*` URLs because the parent mount supplies the prefix.
router.use(require("./mediaVaultDrive"));

module.exports = router;
module.exports.SITE_TIER_QUOTA_BYTES = SITE_TIER_QUOTA_BYTES;