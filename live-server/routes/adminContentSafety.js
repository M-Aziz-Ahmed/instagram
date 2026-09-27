/**
 * Admin API for media (image/video) moderation and the content-safety tooling
 * that goes with it.
 *
 * Mounted at /api/admin/content-safety, so paths here are relative:
 *   GET    /provider-status      is a classifier configured, and does it work?
 *   POST   /test                 dry-run a URL through the real pipeline
 *   GET    /queue                recently flagged content awaiting review
 *   POST   /queue/resolve        approve or reject a flagged item, keyed by url
 *   GET    /stats                detection counts by window
 *   POST   /scan                 backfill-screening existing content
 *   GET    /links                the domain blocklist
 *   POST   /links/check          test a URL against the domain policy
 *   GET    /orphans              media the database still references
 *
 * The honest framing throughout: with `provider: "none"` nothing here detects
 * nudity. Every endpoint that could be mistaken for "we are scanning" says so
 * explicitly rather than returning a cheerful empty result.
 */

const express = require("express");
const mongoose = require("mongoose");

const Post = require("../models/post");
const User = require("../models/user");
const Story = require("../models/story");
const ContentFilter = require("../models/contentFilter");
const Report = require("../models/report");
const { requireAdmin, requirePermission } = require("../middleware/auth");
const { enforceMedia, screenMediaUrl, destroyAsset, parseCloudinaryUrl, clearVerdictCache, loadSettings } = require("../lib/mediaModeration");
const { checkText, SURFACES: textFilterSurfaces, invalidateCache: invalidateTextFilterCache } = require("../lib/textFilter");
const toxicMatch = require("../lib/toxicMatch");
const { logModeration } = require("../logService");

const router = express.Router();

/** In-memory ring of recent verdicts, so the queue survives without a new model. */
const verdictLog = [];
const VERDICT_LOG_MAX = 500;

function recordVerdict(entry) {
    verdictLog.unshift({ id: new mongoose.Types.ObjectId().toString(), at: new Date(), ...entry });
    if (verdictLog.length > VERDICT_LOG_MAX) verdictLog.length = VERDICT_LOG_MAX;
}

function providerReadiness() {
    const cloudName = !!process.env.CLOUDINARY_CLOUD_NAME;
    const cloudKeys = !!(process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
    const google = !!process.env.GOOGLE_CLOUD_VISION_API_KEY;
    return {
        cloudinary: {
            configured: cloudName && cloudKeys,
            missing: [
                ...(cloudName ? [] : ["CLOUDINARY_CLOUD_NAME"]),
                ...(cloudKeys ? [] : ["CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]),
            ],
            note: "Uses Cloudinary's moderation add-on (AWS Rekognition or Google Video). The add-on must be enabled on the Cloudinary account; the API key alone is not enough.",
        },
        google: {
            configured: google,
            missing: google ? [] : ["GOOGLE_CLOUD_VISION_API_KEY"],
            note: "Google Cloud Vision SafeSearch via REST. Stills only — a video needs per-frame extraction first.",
        },
        aws: {
            configured: false,
            missing: ["AWS_REKOGNITION_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
            note: "Deliberately not implemented. SigV4 signing that is subtly wrong returns 403s that look like 'no nudity found', so this reports itself as unavailable rather than silently passing everything.",
        },
    };
}

/** GET /provider-status */
router.get("/provider-status", requireAdmin, async (req, res) => {
    try {
        const filter = await ContentFilter.load();
        const doc = typeof filter.toObject === "function" ? filter.toObject() : filter;
        const mm = doc.mediaModeration || {};
        return res.json({
            enabled: mm.enabled === true,
            provider: mm.provider || "none",
            action: mm.action || "block",
            failureMode: mm.failureMode || "closed",
            threshold: mm.threshold ?? 0.8,
            detectingNudity: mm.enabled === true && mm.provider && mm.provider !== "none",
            providers: providerReadiness(),
            scope: mm.scope || {},
            requireCloudinaryHost: mm.requireCloudinaryHost === true,
            destroyOnReject: mm.destroyOnReject !== false,
            // These two are read by the panel but were not returned here, so the
            // controls rendered blank until it made a second request to a
            // different endpoint to source them.
            cacheResults: mm.cacheResults !== false,
            cacheTtlHours: mm.cacheTtlHours ?? 168,
            lastCheckedAt: new Date(),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

/** POST /test — run one URL through the real pipeline without persisting anything. */
router.post("/test", requireAdmin, async (req, res) => {
    try {
        const { url, surface = "postImage" } = req.body || {};
        if (!url) return res.status(400).json({ error: "url required" });

        const verdict = await screenMediaUrl(url, { surface });
        return res.json({
            url,
            surface,
            allowed: verdict.allowed,
            reason: verdict.reason,
            confidence: verdict.confidence ?? null,
            provider: verdict.provider || null,
            labels: verdict.labels || [],
            checked: verdict.checked === true,
            note: verdict.note || null,
            cloudinary: parseCloudinaryUrl(url),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

/** POST /test-text — run text through the real text matcher, no persistence. */
router.post("/test-text", requireAdmin, async (req, res) => {
    try {
        const { text = "", surface = "post" } = req.body || {};
        // Reject an unknown surface instead of letting it fall through. The old
        // lookup did `textScope[SURFACES[surface]]`, so passing a MEDIA surface
        // ("postImage") silently evaluated to undefined, `!== false`, and
        // reported the verdict as if the "posts" switch had been consulted.
        const scopeKey = textFilterSurfaces[surface];
        if (!scopeKey) {
            return res.status(400).json({
                error: `Unknown text surface "${surface}"`,
                validSurfaces: Object.keys(textFilterSurfaces),
            });
        }
        const result = await checkText(String(text).slice(0, 5000), surface);
        const filter = await ContentFilter.load();
        const doc = typeof filter.toObject === "function" ? filter.toObject() : filter;
        return res.json({
            blocked: result.blocked,
            reason: result.reason,
            matches: result.matches || [],
            // A useful "why" for the admin: which of the gates stopped it.
            gates: {
                blockNudity: doc.blockNudity !== false,
                surfaceEnabled: doc.textScope?.[scopeKey] !== false,
                keywordCount: (doc.nudityKeywords || []).length,
                matchOptions: doc.matchOptions || {},
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

/** GET /queue — recent verdicts, newest first. */
router.get("/queue", requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const onlyFlagged = req.query.flagged === "1";
        const items = (onlyFlagged ? verdictLog.filter((v) => !v.allowed || v.flagged) : verdictLog).slice(0, limit);
        return res.json({
            items,
            total: verdictLog.length,
            note: "In-memory ring buffer (last 500 verdicts). Restarting live-server clears it; durable history lives in the moderation log.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

/** POST /queue/resolve — approve (optionally allowlist) or reject (optionally destroy). */
router.post("/queue/resolve", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const { url, decision, allowlist = false } = req.body || {};
        if (!url || !["approve", "reject"].includes(decision)) {
            return res.status(400).json({ error: "url and decision (approve|reject) required" });
        }

        const index = verdictLog.findIndex((v) => v.url === url);
        if (index !== -1) verdictLog.splice(index, 1);

        if (decision === "approve") {
            if (allowlist) {
                const filter = await ContentFilter.load();
                const host = (() => {
                    try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
                })();
                if (host) {
                    filter.links = filter.links || {};
                    filter.links.allowedDomains = Array.from(new Set([...(filter.links.allowedDomains || []), host]));
                    filter.updatedAt = new Date();
                    filter.updatedBy = req.admin?.username || "admin";
                    await filter.save();
                    invalidateTextFilterCache();
                }
            }
            // Drop the cached verdict so the approve actually takes effect.
            clearVerdictCache();
        } else {
            const result = await destroyAsset(url);
            recordVerdict({ url, allowed: false, reason: "rejected-by-moderator", destroyed: result.destroyed, decidedAt: new Date() });
            try {
                logModeration("media_rejected", { message: "Media rejected by moderator", meta: { url, destroyed: result.destroyed } });
            } catch { /* audit must not break the action */ }
        }

        return res.json({ ok: true, decision, url });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

/** GET /stats */
router.get("/stats", requireAdmin, async (req, res) => {
    try {
        const now = Date.now();
        const inWindow = (ms) => verdictLog.filter((v) => now - new Date(v.at).getTime() < ms);
        const blocked = (list) => list.filter((v) => v.allowed === false);
        const flagged = (list) => list.filter((v) => v.flagged);

        return res.json({
            last24h: {
                screened: inWindow(24 * 3600 * 1000).length,
                blocked: blocked(inWindow(24 * 3600 * 1000)).length,
                flagged: flagged(inWindow(24 * 3600 * 1000)).length,
            },
            last7d: {
                screened: inWindow(7 * 24 * 3600 * 1000).length,
                blocked: blocked(inWindow(7 * 24 * 3600 * 1000)).length,
                flagged: flagged(inWindow(7 * 24 * 3600 * 1000)).length,
            },
            bufferSize: verdictLog.length,
            byReason: verdictLog.reduce((acc, v) => {
                acc[v.reason] = (acc[v.reason] || 0) + 1;
                return acc;
            }, {}),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

/**
 * POST /scan — backfill-screening existing content.
 *
 * Bounded and explicitly opt-in: this is a potentially expensive operation over
 * the whole collection, so it takes an explicit limit, runs sequentially, and
 * reports what it skipped rather than silently truncating.
 */
router.post("/scan", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const filter = await ContentFilter.load();
        const doc = typeof filter.toObject === "function" ? filter.toObject() : filter;
        const mm = doc.mediaModeration || {};
        if (!mm.enabled) {
            return res.status(400).json({
                error: "Media moderation is disabled. Enable it before scanning, or this will report everything as clean and imply you screened 500 posts when you screened nothing.",
            });
        }

        const limit = Math.min(Number(req.body?.limit) || 100, 1000);
        const surface = req.body?.surface || "postImage";
        const dryRun = req.body?.dryRun !== false;

        const posts = await Post.find({ imageUrl: { $exists: true, $nin: ["", null] } })
            .select("imageUrl imageUrls sender text")
            .sort({ timeStamp: -1 })
            .limit(limit)
            .lean();

        const results = { scanned: 0, wouldBlock: 0, errors: 0, items: [] };
        for (const post of posts) {
            const urls = [
                ...(Array.isArray(post.imageUrls) ? post.imageUrls : []),
                ...(post.imageUrl ? [post.imageUrl] : []),
            ].filter(Boolean);
            for (const url of urls) {
                // Sequential on purpose: N posts x M images would otherwise fire
                // N*M provider calls at once and get rate-limited immediately.
                // eslint-disable-next-line no-await-in-loop
                const verdict = await screenMediaUrl(url, { surface, filterDoc: doc });
                results.scanned += 1;
                if (!verdict.allowed) {
                    results.wouldBlock += 1;
                    results.items.push({ url, postId: post._id?.toString(), sender: post.sender, reason: verdict.reason, confidence: verdict.confidence ?? null });
                } else if (!verdict.checked) {
                    results.errors += 1;
                }
            }
        }

        if (!dryRun) {
            for (const item of results.items) {
                recordVerdict({ url: item.url, allowed: false, reason: `backfill:${item.reason}`, postId: item.postId, sender: item.sender });
                // eslint-disable-next-line no-await-in-loop
                if (mm.destroyOnReject && mm.action === "block") await destroyAsset(item.url);
            }
            try {
                logModeration("media_backfill_scan", { message: `Scanned ${results.scanned} media items`, meta: { ...results, items: results.items.length } });
            } catch { /* ignore */ }
        }

        return res.json({
            ...results,
            dryRun,
            truncatedAt: posts.length,
            limit,
            note: dryRun
                ? "Dry run — nothing was changed. Re-run with dryRun:false to act on the results."
                : "Backfill complete. Flagged items were logged to the review queue.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

/** GET /links */
router.get("/links", requireAdmin, async (req, res) => {
    try {
        const filter = await ContentFilter.load();
        const doc = typeof filter.toObject === "function" ? filter.toObject() : filter;
        return res.json({
            blockedDomains: doc.links?.blockedDomains || [],
            allowedDomains: doc.links?.allowedDomains || [],
            blockAllLinks: doc.links?.blockAllLinks === true,
            blockPhishingPatterns: doc.links?.blockPhishingPatterns !== false,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

/** POST /links/check — test a URL against the domain policy. */
router.post("/links/check", requireAdmin, async (req, res) => {
    try {
        const { url } = req.body || {};
        if (!url) return res.status(400).json({ error: "url required" });
        const filter = await ContentFilter.load();
        const doc = typeof filter.toObject === "function" ? filter.toObject() : filter;
        const links = doc.links || {};
        let host = null;
        try { host = new URL(url).hostname.toLowerCase(); } catch { /* invalid */ }

        const blocked = host && (links.blockedDomains || []).includes(host);
        const allowed = host && (links.allowedDomains || []).includes(host);
        // A hostname that merely CONTAINS a blocked domain (not equal to it) is
        // the common bypass: "evil-example.com" vs "example.com".
        const subdomainBypass = host && !(links.blockedDomains || []).some(
            (d) => host === d || host.endsWith(`.${d}`)
        ) && (links.blockedDomains || []).some((d) => host.includes(d));

        return res.json({
            url,
            host,
            verdict: !host ? "invalid" : blocked ? "blocked" : allowed ? "allowed" : subdomainBypass ? "suspicious-subdomain" : links.blockAllLinks ? "blocked" : "permitted",
            matchedRule: blocked || allowed || subdomainBypass,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

/** GET /orphans — media referenced by no post/comment/story.
 *  Directly useful because rejected uploads are otherwise invisible: the client
 *  uploads, the server rejects, the asset stays live and unreferenced forever. */
router.get("/orphans", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 200, 1000);
        const [posts, stories] = await Promise.all([
            Post.find({}).select("imageUrl imageUrls videoUrl").sort({ timeStamp: -1 }).limit(limit).lean(),
            Story.find({ imageUrl: { $exists: true, $nin: ["", null] } }).select("imageUrl").sort({ createdAt: -1 }).limit(limit).lean(),
        ]);

        const referenced = new Set();
        for (const p of posts) {
            if (p.imageUrl) referenced.add(p.imageUrl);
            if (p.videoUrl) referenced.add(p.videoUrl);
            for (const u of p.imageUrls || []) referenced.add(u);
        }
        for (const s of stories) if (s.imageUrl) referenced.add(s.imageUrl);

        return res.json({
            referencedCount: referenced.size,
            scannedPosts: posts.length,
            scannedStories: stories.length,
            note: "This lists what the database still references. Assets on Cloudinary that no row points at are only visible via the Cloudinary API and are cleaned up by POST /content-safety/sweep-orphans.",
            referencedSample: Array.from(referenced).slice(0, 20),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

module.exports = router;
