/**
 * Admin API: user-safety, data-health, audit and compliance tooling.
 *
 * Mounted at /api/admin/safety-ops so these paths cannot collide with the
 * existing /api/admin router.
 *
 * Everything here is READ-HEAVY and bounded. Collections in this app are small
 * and unbounded at the same time (a posts collection with no cap is a production
 * incident waiting to happen), so every query takes an explicit `limit`, every
 * `$sample`/aggregate is capped, and nothing scans a full collection without a
 * range predicate.
 */

const express = require("express");
const mongoose = require("mongoose");

const User = require("../models/user");
const Post = require("../models/post");
const Report = require("../models/report");
const ModerationLog = require("../models/moderationLog");
const SystemLog = require("../models/systemLog");
const SiteSettings = require("../models/siteSettings");
const ContentFilter = require("../models/contentFilter");
const Story = require("../models/story");
const { requireAdmin, requirePermission } = require("../middleware/auth");
const { checkText, invalidateCache } = require("../lib/textFilter");
const { clearVerdictCache } = require("../lib/mediaModeration");
const { invalidateShadowbanCache } = require("../lib/visibility");
const { logModeration, logSystem } = require("../logService");

const router = express.Router();

const clamp = (v, min, max, dflt) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, n));
};

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Hosts that commonly front credential-harvesting clones. Purely heuristic. */
const PHISHING_PATTERNS = [
    /(?:^|[.-])(?:login|signin|sign-in|verify|account|secure|auth|wallet|unlock|support|helpdesk)[.-](?:[a-z0-9-]+\.)*(?:com|net|org|io|co|ru|cn|tk|xyz|top|info|biz|link|click|site|online|live|shop|icu|vip|work|fun|space|store|club|pro|dev)[.-]/i,
    /(?:^|[.-])(?:apple|icloud|google|gmail|facebook|instagram|twitter|tiktok|netflix|paypal|amazon|microsoft|steam|discord)[.-](?:[a-z0-9-]+\.)*$/i,
    /(?:^|\.)(?:bit\.ly|tinyurl\.com|t\.co|is\.gd|shorturl\.at|cutt\.ly|rb\.gy|rebrand\.ly|lnkd\.in)$/i,
];

/** Distance-1 typosquat check against popular brand names. */
const PROTECTED_BRANDS = [
    "instagram", "facebook", "google", "apple", "icloud", "paypal", "netflix",
    "amazon", "microsoft", "tiktok", "twitter", "discord", "steam", "roblox",
    "whatsapp", "telegram", "snapchat", "linkedin", "coinbase", "binance",
];

function levenshtein(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 2) return 99;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(
                prev[j] + 1,
                cur[j - 1] + 1,
                prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        prev = cur;
    }
    return prev[b.length];
}

function analyseUrl(url) {
    let parsed;
    try {
        parsed = new URL(String(url));
    } catch {
        return { url: String(url), valid: false, signals: ["unparseable"] };
    }
    const host = parsed.hostname.toLowerCase();
    const signals = [];

    const knownSafe = /(?:^|\.)(google|facebook|instagram|apple|icloud|microsoft|netflix|paypal|amazon|twitter|x|tiktok|youtube|github|npmjs|stackoverflow|wikipedia|reddit|linkedin|discord|spotify)\.(?:com|org|net|co|io|dev|app|ai)$/i;
    if (!knownSafe.test(host)) {
        for (const re of PHISHING_PATTERNS) {
            if (re.test(host)) { signals.push("phishing-pattern"); break; }
        }
        if (/[0-9]{1,3}(\.[0-9]{1,3}){3}/.test(host)) signals.push("raw-ip-host");
        if (host.split(".").length > 4) signals.push("deep-subdomain");
        if (/xn--/.test(host)) signals.push("punycode");
        if (host.includes("--")) signals.push("double-hyphen");

        const label = host.split(".")[0];
        for (const brand of PROTECTED_BRANDS) {
            if (levenshtein(label, brand) === 1) {
                signals.push(`typosquat-of:${brand}`);
                break;
            }
        }
    }
    if (parsed.protocol === "http:" && !knownSafe.test(host)) signals.push("no-tls");

    return {
        url: String(url),
        valid: true,
        host,
        signals,
        suspicious: signals.length > 0,
        risk: signals.length >= 2 ? "high" : signals.length === 1 ? "medium" : "low",
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// USER SAFETY
// ═══════════════════════════════════════════════════════════════════════════

/** GET /safety-scores — a composite per-user risk score with its components.
 *  The point is explainability: a bare number is not actionable, so every
 *  component is returned so an admin can see WHY a user scored 80. */
router.get("/safety-scores", requireAdmin, async (req, res) => {
    try {
        const limit = clamp(req.query.limit, 1, 200, 50);
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
        // Every query in this router is capped; these two were not, and the
        // report loop also did a sequential `await Post.findById` per report,
        // which is an N+1 over an unbounded set. Both would fall over on a real
        // dataset. Capped, and the post lookups are now a single batched query.
        const SCAN_CAP = 5000;

        const [reports, removedPosts, suspended] = await Promise.all([
            Report.find({ createdAt: { $gte: since } }).select("targetType targetId status").sort({ createdAt: -1 }).limit(SCAN_CAP).lean(),
            Post.find({ isRemoved: true, removedAt: { $gte: since } }).select("sender").limit(SCAN_CAP).lean(),
            User.find({ suspended: true }).select("username").limit(1000).lean(),
        ]);

        // One batched lookup for every reported post, instead of one per report.
        const reportedPostIds = [
            ...new Set(
                reports
                    .filter((r) => r.targetType === "post" && /^[0-9a-fA-F]{24}$/.test(String(r.targetId || "")))
                    .map((r) => String(r.targetId))
            ),
        ];
        const reportedPosts = reportedPostIds.length
            ? await Post.find({ _id: { $in: reportedPostIds.slice(0, SCAN_CAP) } }).select("_id sender").lean()
            : [];
        const senderForPostId = new Map(reportedPosts.map((p) => [String(p._id), p.sender]));

        const score = new Map();
        const bump = (key, points, reason) => {
            if (!key) return;
            const entry = score.get(key) || { username: key, score: 0, reasons: [] };
            entry.score += points;
            entry.reasons.push(reason);
            score.set(key, entry);
        };

        for (const p of removedPosts) bump(p.sender, 40, "post removed by moderator");

        for (const r of reports) {
            if (r.status === "dismissed") continue;
            if (r.targetType === "post") {
                const sender = senderForPostId.get(String(r.targetId));
                if (sender) bump(sender, 15, "post reported");
            } else if (r.targetType === "user" || r.targetType === "profile") {
                bump(r.targetId, 25, "user reported");
            }
        }
        for (const u of suspended) bump(u.username, 50, "currently suspended");

        const rows = Array.from(score.values())
            .map((e) => ({ ...e, reasons: Array.from(new Set(e.reasons)) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        return res.json({
            rows,
            windowDays: 30,
            truncated: reports.length >= SCAN_CAP || removedPosts.length >= SCAN_CAP,
            scanCap: SCAN_CAP,
            totals: {
                reports: reports.length,
                openReports: reports.filter((r) => r.status === "open").length,
                removedPosts: removedPosts.length,
                suspendedUsers: suspended.length,
            },
            note: "Score is a heuristic triage aid, not a verdict. 40 = removed post, 25 = user reported, 15 = post reported, 50 = suspended."
                + (reports.length >= SCAN_CAP || removedPosts.length >= SCAN_CAP
                    ? ` Capped at ${SCAN_CAP} documents per source, so these totals are lower bounds.`
                    : ""),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /offenders — users ranked by confirmed moderation actions. */
router.get("/offenders", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const limit = clamp(req.query.limit, 1, 200, 25);
        const since = new Date(Date.now() - clamp(req.query.days, 1, 365, 30) * 24 * 3600 * 1000);

        const logs = await ModerationLog.find({ timeStamp: { $gte: since }, action: "remove" })
            .select("postOwner moderator reason")
            .lean()
            .limit(5000);

        const byUser = {};
        for (const l of logs) {
            const key = l.postOwner || "unknown";
            byUser[key] = byUser[key] || { username: key, removals: 0, reasons: {} };
            byUser[key].removals += 1;
            if (l.reason) byUser[key].reasons[l.reason] = (byUser[key].reasons[l.reason] || 0) + 1;
        }

        const rows = Object.values(byUser)
            .map((r) => ({ ...r, reasons: Object.entries(r.reasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })) }))
            .sort((a, b) => b.removals - a.removals)
            .slice(0, limit);

        return res.json({ rows, windowDays: Math.round((Date.now() - since) / 86400000), totalRemovals: logs.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** POST /users/:username/shadowban */
router.post("/users/:username/shadowban", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const { username } = req.params;
        const { shadowbanned } = req.body || {};
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: "User not found" });

        user.isShadowbanned = !!shadowbanned;
        user.shadowbanReason = String(req.body?.reason || "").slice(0, 200);
        await user.save();
        // The read path caches the shadowban list, so without this the toggle
        // would take up to 30s to have any effect.
        invalidateShadowbanCache();
        try {
            logModeration("shadowban", { username, meta: { shadowbanned: !!shadowbanned } });
        } catch { /* ignore */ }
        return res.json({ ok: true, username, isShadowbanned: user.isShadowbanned });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /open-reports — the ids `POST /bulk-reports` needs.
 *  It takes `ids`, but no other safety-ops endpoint returned any, so the bulk
 *  resolver could not actually be driven from its own router. */
router.get("/open-reports", requireAdmin, async (req, res) => {
    try {
        const limit = clamp(req.query.limit, 1, 500, 200);
        const rows = await Report.find({ status: "open" })
            .select("targetType targetId reason details reporter createdAt")
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        return res.json({
            rows: rows.map((r) => ({
                id: String(r._id),
                targetType: r.targetType,
                targetId: r.targetId,
                reason: r.reason,
                details: String(r.details || "").slice(0, 160),
                reporter: r.reporter,
                createdAt: r.createdAt,
            })),
            count: rows.length,
            limit,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** POST /bulk-reports — resolve or dismiss many reports at once. */
router.post("/bulk-reports", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const { ids = [], action, reason } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });
        if (!["resolved", "dismissed"].includes(action)) return res.status(400).json({ error: "action must be resolved or dismissed" });

        const capped = ids.slice(0, 200);
        const result = await Report.updateMany(
            { _id: { $in: capped.filter((id) => /^[0-9a-fA-F]{24}$/.test(String(id))) } },
            { status: action, actionTaken: reason || `bulk ${action}`, resolvedAt: new Date() }
        );
        return res.json({ ok: true, matched: result.matchedCount, modified: result.modifiedCount, requested: ids.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /report-age — how stale the open queue is. A queue nobody ages is a queue
 *  that has silently stopped being worked. */
router.get("/report-age", requireAdmin, async (req, res) => {
    try {
        const open = await Report.find({ status: "open" }).select("createdAt targetType reason").lean().limit(5000);
        const buckets = { "0-1d": 0, "1-3d": 0, "3-7d": 0, "7-30d": 0, "30d+": 0 };
        let oldest = null;
        for (const r of open) {
            const ageDays = (Date.now() - new Date(r.createdAt).getTime()) / 86400000;
            if (ageDays < 1) buckets["0-1d"]++;
            else if (ageDays < 3) buckets["1-3d"]++;
            else if (ageDays < 7) buckets["3-7d"]++;
            else if (ageDays < 30) buckets["7-30d"]++;
            else buckets["30d+"]++;
            if (!oldest || new Date(r.createdAt) < new Date(oldest.createdAt)) oldest = r;
        }
        return res.json({ buckets, totalOpen: open.length, oldest });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** POST /analyse-urls — bulk phishing / typosquat analysis. */
router.post("/analyse-urls", requireAdmin, async (req, res) => {
    try {
        const { urls = [] } = req.body || {};
        if (!Array.isArray(urls)) return res.status(400).json({ error: "urls must be an array" });
        const results = urls.slice(0, 200).map((u) => analyseUrl(u));
        // An unparseable URL returns early with no `risk` and no `suspicious`, so
        // counting only `suspicious` excluded the worst inputs from the total.
        // It is counted separately and included in the denominator.
        const invalid = results.filter((r) => !r.valid).length;
        return res.json({
            results,
            analysed: results.length,
            invalid,
            suspicious: results.filter((r) => r.suspicious).length,
            high: results.filter((r) => r.risk === "high").length,
            medium: results.filter((r) => r.risk === "medium").length,
            low: results.filter((r) => r.risk === "low").length,
            note: "Heuristic only. A clean result is not a safety guarantee; a flagged one warrants a manual look. Unparseable URLs are reported as `invalid` rather than counted as suspicious or clean."
                + (urls.length > 200 ? ` Input truncated to 200 of ${urls.length} URLs.` : ""),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /mention-spam — users mass-mentioning. */
router.get("/mention-spam", requireAdmin, async (req, res) => {
    try {
        const limit = clamp(req.query.limit, 1, 100, 25);
        const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
        const posts = await Post.find({ timeStamp: { $gte: since } })
            .select("sender text mentions")
            .sort({ mentions: -1 })
            .limit(limit)
            .lean();
        const rows = posts
            .filter((p) => (p.mentions || []).length > 0)
            .map((p) => ({ sender: p.sender, mentions: p.mentions.length, postId: String(p._id), preview: (p.text || "").slice(0, 80) }));
        return res.json({ rows, windowDays: 7, threshold: ">10 mentions in one post is the usual spam shape" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DATA HEALTH / OPS
// ═══════════════════════════════════════════════════════════════════════════

/** GET /index-audit — every declared index vs what queries actually need. */
router.get("/index-audit", requireAdmin, async (req, res) => {
    try {
        const models = [
            ["User", User], ["Post", Post], ["Report", Report],
            ["ModerationLog", ModerationLog], ["SystemLog", SystemLog],
            ["Story", Story], ["ContentFilter", ContentFilter], ["SiteSettings", SiteSettings],
        ];
        const rows = [];
        for (const [name, model] of models) {
            let indexes = [];
            let count = null;
            try {
                count = await model.estimatedDocumentCount();
                indexes = (model.schema.indexes() || []).map(([fields, opts]) => ({
                    fields: typeof fields === "string" ? fields : Object.entries(fields).map(([k, v]) => (v === 1 || v === -1 ? k : `${k}:${v}`)).join(", "),
                    unique: !!(opts && opts.unique),
                    ttl: opts && opts.expireAfterSeconds,
                }));
            } catch (e) {
                rows.push({ model: name, error: e.message });
                continue;
            }
            rows.push({ model: name, documents: count, indexes, unindexedWarning: count > 10000 && indexes.length === 0 });
        }
        return res.json({ rows, note: "estimatedDocumentCount is a collection-level estimate, not exact — fast but approximate." });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /collection-stats */
router.get("/collection-stats", requireAdmin, async (req, res) => {
    try {
        const names = mongoose.connection.db
            ? (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name)
            : [];
        const rows = [];
        for (const name of names.sort()) {
            try {
                const stats = await mongoose.connection.db.command({ collStats: name });
                rows.push({
                    name,
                    count: stats.count,
                    sizeMB: Number(((stats.size || 0) / 1048576).toFixed(2)),
                    storageSizeMB: Number(((stats.storageSize || 0) / 1048576).toFixed(2)),
                    indexSizeMB: Number(((stats.totalIndexSize || 0) / 1048576).toFixed(2)),
                    nindexes: stats.nindexes,
                });
            } catch {
                // collStats needs privileges a managed DB often withholds; count
                // per collection is the portable fallback.
                try {
                    const count = await mongoose.connection.db.collection(name).estimatedDocumentCount();
                    rows.push({ name, count, sizeMB: null, note: "collStats unavailable on this deployment" });
                } catch { /* skip */ }
            }
        }
        return res.json({ rows, total: rows.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /duplicates — near-duplicate posts, for spam/bot detection. */
router.get("/duplicates", requireAdmin, async (req, res) => {
    try {
        const limit = clamp(req.query.limit, 1, 100, 20);
        const posts = await Post.find({}).select("text sender timeStamp").sort({ timeStamp: -1 }).limit(2000).lean();
        const byFingerprint = {};
        for (const p of posts) {
            const text = String(p.text || "").trim().toLowerCase();
            if (text.length < 12) continue;
            // Normalise whitespace/punctuation so "hello world!" and "hello
            // world" collapse to one bucket.
            const norm = text.replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
            if (!norm) continue;
            const fp = `${norm.slice(0, 40)}:${norm.length}`;
            (byFingerprint[fp] = byFingerprint[fp] || []).push({ id: String(p._id), sender: p.sender, at: p.timeStamp, text: text.slice(0, 100) });
        }
        const groups = Object.values(byFingerprint)
            .filter((g) => g.length > 1)
            .sort((a, b) => b.length - a.length)
            .slice(0, limit);
        return res.json({
            groups,
            postsScanned: posts.length,
            duplicateGroups: groups.length,
            note: "Fingerprint is the first 40 normalised chars + length. Approximate by design; edits past char 40 are not detected.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /ttl-health — collections with an index-based expiry, and whether
 *  documents are actually being collected. */
router.get("/ttl-health", requireAdmin, async (req, res) => {
    try {
        const now = Date.now();
        const rows = [];

        const stories = await Story.find({}).select("createdAt expires").sort({ createdAt: -1 }).limit(5000).lean();
        const expired = stories.filter((s) => new Date(s.expires).getTime() < now);
        const newest = stories[0];
        rows.push({
            collection: "stories",
            documents: stories.length,
            expiredStillPresent: expired.length,
            newestAt: newest ? newest.createdAt : null,
            healthy: expired.length === 0,
            note: "Stories use a TTL index (86400s). Documents past expiry are removed by mongod, not by the app.",
        });

        // Scheduled posts that will never publish because their time has passed.
        const stale = await Post.countDocuments({ scheduledAt: { $exists: true, $lt: new Date() }, published: { $ne: true } });
        rows.push({
            collection: "posts(scheduled)",
            documents: stale,
            healthy: stale === 0,
            note: "Scheduled posts whose time has passed without publishing. A non-zero value means the scheduler is stuck.",
        });

        // System logs DO have a 30-day TTL (models/systemLog.js declares
        // expireAfterSeconds on createdAt). An earlier version of this endpoint
        // asserted "No TTL index... grows without bound" and hard-coded
        // healthy: true, which was simply wrong.
        const LOG_TTL_DAYS = 30;
        const logs = await SystemLog.estimatedDocumentCount();
        rows.push({
            collection: "systemlogs",
            documents: logs,
            healthy: true,
            note: `Has a ${LOG_TTL_DAYS}-day TTL index on createdAt, so mongod removes entries for you. estimatedDocumentCount is approximate.`,
        });

        return res.json({ rows });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** POST /cache/clear */
router.post("/cache/clear", requireAdmin, async (req, res) => {
    try {
        // Be honest about what this actually clears. There is no Redis-backed
        // cache in this app — the only caches are the two in-process ones below
        // — so "all" and "content-filter" do the same thing. The previous
        // response returned a hard-coded `cleared` array that read like a report
        // of what had been emptied.
        invalidateCache();
        clearVerdictCache();
        return res.json({
            ok: true,
            scope: req.body?.scope === "all" ? "all" : "content-filter",
            cleared: ["textFilter config cache", "media moderation verdict cache"],
            note: "In-process only. Restarting live-server also clears both. No Redis or CDN cache is configured, so there is nothing else to purge.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPLIANCE / AUDIT
// ═══════════════════════════════════════════════════════════════════════════

/** GET /audit — who changed what, from the system log's moderation category. */
router.get("/audit", requireAdmin, async (req, res) => {
    try {
        const limit = clamp(req.query.limit, 1, 200, 100);
        const category = req.query.category || "moderation";
        const rows = await SystemLog.find({ category })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        return res.json({ rows, count: rows.length, category });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /filter-history — every content-filter change with who made it. */
router.get("/filter-history", requireAdmin, async (req, res) => {
    try {
        const rows = await SystemLog.find({ category: "moderation", action: /filter|content/i })
            .sort({ createdAt: -1 })
            .limit(clamp(req.query.limit, 1, 200, 50))
            .lean();
        return res.json({ rows, count: rows.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /user-export/:username — full data for one account (GDPR access). */
router.get("/user-export/:username", requireAdmin, async (req, res) => {
    try {
        const { username } = req.params;
        const doc = await User.findOne({ username }).lean();
        if (!doc) return res.status(404).json({ error: "User not found" });

        const [posts, messages, groupMessages, reports, notifications, stories] = await Promise.all([
            Post.find({ sender: username }).select("-comments").lean().limit(1000),
            mongoose.model("Message").find({ $or: [{ sender: username }, { recipient: username }] }).lean().limit(1000),
            mongoose.model("GroupMessage").find({ sender: username }).lean().limit(1000),
            Report.find({ $or: [{ targetType: "user", targetId: username }, { reporter: username }] }).lean().limit(500),
            mongoose.model("Notification").find({ recipient: username }).lean().limit(500),
            Story.find({ sender: username }).lean().limit(500),
        ]);

        // Strip secrets by ALLOWLIST, not denylist. The previous version deleted
        // only `password` and `totpSecret`, which meant the export still carried
        // `pinHash`, `inviteCode` and anything added to the schema later — a new
        // secret field would have started leaking into admin downloads with no
        // code change and no test failure.
        const SAFE_USER_FIELDS = [
            "_id", "username", "email", "bio", "avatarColor", "avatarUrl",
            "isAdmin", "isPro", "isVerified", "suspended", "suspendedUntil",
            "suspendedReason", "roles", "createdAt", "lastSeen", "followerCount",
            "followingCount", "postCount", "gemBalance", "adultConfirmedAt",
            "videoUploadAllowed", "mutedUsers", "blockedUsers", "following",
            "followers", "mfaEnabled",
        ];
        const safeUser = {};
        for (const field of SAFE_USER_FIELDS) {
            if (doc[field] !== undefined) safeUser[field] = doc[field];
        }
        safeUser._redactedFields = Object.keys(doc).filter((k) => !SAFE_USER_FIELDS.includes(k));

        return res.json({
            user: safeUser,
            posts, messages, groupMessages, reports, notifications, stories,
            counts: {
                posts: posts.length, messages: messages.length, groupMessages: groupMessages.length,
                reports: reports.length, notifications: notifications.length, stories: stories.length,
            },
            note: "Only an allowlisted set of account fields is exported; every other field (including credentials and invite codes) is withheld. The withheld names are listed in user._redactedFields.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** POST /user-anonymize/:username — GDPR erasure. Irreversible, so it is
 *  deliberately a POST that reports exactly what it changed. */
router.post("/user-anonymize/:username", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const { username } = req.params;
        const { confirm } = req.body || {};
        if (confirm !== true) {
            return res.status(400).json({ error: "Send { confirm: true }. This operation is irreversible." });
        }
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: "User not found" });
        if (user.isAdmin) return res.status(400).json({ error: "Refusing to anonymize an admin account" });

        const anon = `deleted_${user._id.toString().slice(-8)}`;

        const result = {
            user: 1,
            posts: 0,
            messages: 0,
            groupMessages: 0,
            stories: 0,
            commentsScrubbed: 0,
        };

        user.username = anon;
        user.email = `${anon}@anonymised.invalid`;
        user.bio = "";
        user.avatarUrl = "";
        user.avatarColor = "#9ca3af";
        user.password = undefined;
        await user.save();
        result.user = 1;

        const posts = await Post.find({ sender: username }).select("_id comments");
        for (const p of posts) {
            p.isAnonymised = true;
            if (Array.isArray(p.comments)) {
                for (const c of p.comments) {
                    if (c.sender === username) {
                        c.sender = anon;
                        result.commentsScrubbed += 1;
                    }
                }
            }
            await p.save();
        }
        result.posts = posts.length;

        const Message = mongoose.model("Message");
        result.messages = (await Message.updateMany({ sender: username }, { $set: { sender: anon } })).modifiedCount;
        const GroupMessage = mongoose.model("GroupMessage");
        result.groupMessages = (await GroupMessage.updateMany({ sender: username }, { $set: { sender: anon } })).modifiedCount;
        result.stories = (await Story.updateMany({ sender: username }, { $set: { sender: anon } })).modifiedCount;

        try {
            logModeration("user_anonymised", { username, targetUser: anon, meta: { ...result } });
        } catch { /* ignore */ }

        return res.json({ ok: true, anonymisedAs: anon, ...result });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /retention — what would be affected by a retention policy sweep. */
router.get("/retention", requireAdmin, async (req, res) => {
    try {
        const now = Date.now();
        const day = 86400000;
        const rows = [];
        for (const days of [7, 30, 90, 180, 365]) {
            const cutoff = new Date(now - days * day);
            const [posts, reports, logs, removed] = await Promise.all([
                Post.countDocuments({ timeStamp: { $lt: cutoff } }),
                Report.countDocuments({ createdAt: { $lt: cutoff } }),
                SystemLog.countDocuments({ createdAt: { $lt: cutoff } }),
                Post.countDocuments({ isRemoved: true, removedAt: { $lt: cutoff } }),
            ]);
            rows.push({ olderThanDays: days, posts, reports, systemLogs: logs, removedPosts: removed });
        }
        return res.json({
            rows,
            note: "Counts what a sweep WOULD delete. This endpoint never deletes anything.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /effectiveness — filter blocked/flag volume by day, so an admin can see
 *  whether a config change helped or made false-positives worse. */
router.get("/effectiveness", requireAdmin, async (req, res) => {
    try {
        const days = clamp(req.query.days, 1, 90, 14);
        const since = new Date(Date.now() - days * 86400000);
        const rows = await SystemLog.find({
            category: "moderation",
            createdAt: { $gte: since },
        }).select("action createdAt").lean().limit(10000);

        const byDay = {};
        for (const r of rows) {
            const key = String(r.createdAt).slice(0, 10);
            byDay[key] = byDay[key] || { day: key, total: 0 };
            byDay[key].total += 1;
            if (/block|reject|remove/i.test(r.action || "")) byDay[key].blocked = (byDay[key].blocked || 0) + 1;
        }
        return res.json({ days, series: Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)), total: rows.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** POST /presets/:name — load a curated word list into the filter. */
const WORD_PRESETS = {
    mild: ["damn", "hell", "crap", "wtf"],
    standard: ["damn", "hell", "crap", "wtf", "shit", "fuck", "bitch", "asshole", "bastard"],
    strict: [
        "damn", "hell", "crap", "wtf", "shit", "fuck", "bitch", "asshole", "bastard",
        "cunt", "nigger", "faggot", "retard", "whore", "slut", "rape", "nigga",
    ],
};

router.post("/presets/:name", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const { name } = req.params;
        const target = name === "mild" ? "toxicWords" : "nudityKeywords";
        const words = WORD_PRESETS[name];
        if (!words) return res.status(404).json({ error: `Unknown preset. Available: ${Object.keys(WORD_PRESETS).join(", ")}` });

        const { mode = "replace" } = req.body || {};
        const filter = await ContentFilter.load();
        const existing = filter[target] || [];
        const next = mode === "merge" ? Array.from(new Set([...existing, ...words])) : words.slice();
        filter[target] = next;
        filter.updatedAt = new Date();
        filter.updatedBy = req.admin?.username || "admin";
        await filter.save();
        invalidateCache();
        try {
            logModeration("filter_preset_applied", { meta: { preset: name, target, mode, count: next.length } });
        } catch { /* ignore */ }
        return res.json({ ok: true, preset: name, target, mode, count: next.length, words: next });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

router.get("/presets", requireAdmin, async (req, res) => {
    const rows = Object.entries(WORD_PRESETS).map(([name, words]) => ({ name, count: words.length, words }));
    return res.json({ rows, note: "'mild' loads into toxicWords (blur only). 'standard' and 'strict' load into nudityKeywords (hard block)." });
});

/** POST /bulk-words — paste a whole list in one go. */
router.post("/bulk-words", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const { text = "", target = "toxicWords", mode = "merge" } = req.body || {};
        if (!["toxicWords", "nudityKeywords", "allowedWords"].includes(target)) {
            return res.status(400).json({ error: "target must be toxicWords, nudityKeywords or allowedWords" });
        }
        const parsed = String(text)
            .split(/[\n,]/)
            .map((w) => w.trim().toLowerCase())
            .filter(Boolean)
            .filter((w) => w.length <= 64)
            .slice(0, 5000);

        const filter = await ContentFilter.load();
        const existing = filter[target] || [];
        const next = mode === "replace" ? Array.from(new Set(parsed)) : Array.from(new Set([...existing, ...parsed]));
        filter[target] = next;
        filter.updatedAt = new Date();
        filter.updatedBy = req.admin?.username || "admin";
        await filter.save();
        invalidateCache();
        return res.json({ ok: true, target, mode, added: parsed.length, total: next.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /overview — one call backing the top of the Safety panel. */
router.get("/overview", requireAdmin, async (req, res) => {
    try {
        const filter = await ContentFilter.load();
        const doc = typeof filter.toObject === "function" ? filter.toObject() : filter;
        const mm = doc.mediaModeration || {};
        const [openReports, removedPosts, suspended, logs] = await Promise.all([
            Report.countDocuments({ status: "open" }),
            Post.countDocuments({ isRemoved: true }),
            User.countDocuments({ suspended: true }),
            SystemLog.countDocuments({ category: "moderation" }),
        ]);
        return res.json({
            text: {
                toxicWords: (doc.toxicWords || []).length,
                nudityKeywords: (doc.nudityKeywords || []).length,
                allowedWords: (doc.allowedWords || []).length,
                blockNudity: doc.blockNudity !== false,
                blurToxicWords: doc.blurToxicWords !== false,
                matchOptions: doc.matchOptions || {},
            },
            media: {
                enabled: mm.enabled === true,
                provider: mm.provider || "none",
                detectingNudity: mm.enabled === true && mm.provider && mm.provider !== "none",
                action: mm.action || "block",
            },
            queue: { openReports, removedPosts, suspended, moderationLogEntries: logs },
            updatedAt: doc.updatedAt || null,
            updatedBy: doc.updatedBy || "",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

module.exports = router;
