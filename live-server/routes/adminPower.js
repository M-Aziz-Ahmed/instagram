const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/user");
const Post = require("../models/post");
const SystemLog = require("../models/systemLog");
const AnalyticsEvent = require("../models/analyticsEvent");
const Report = require("../models/report");
const Announcement = require("../models/announcement");
const SiteSetting = require("../models/siteSettings");
const { requireAdmin } = require("../middleware/auth");
const { getSettings } = require("../models/siteSettings");
const { broadcastPush } = require("../push");

const router = express.Router();
router.use(requireAdmin);

// ── CSV helpers ───────────────────────────────────────────────
function esc(v) {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}
function csv(rows) {
    return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
function csvDownload(res, filename, rows) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv(rows));
}
function f(v) {
    return v == null ? null : v;
}

// ── System health ─────────────────────────────────────────────
router.get("/system", async (req, res) => {
    try {
        const mem = process.memoryUsage();
        let latency = null;
        let mongoOk = false;
        try {
            const t = Date.now();
            await User.findOne().select("_id").lean();
            latency = Date.now() - t;
            mongoOk = mongoose.connection.readyState === 1;
        } catch {
            mongoOk = false;
        }
        const since = new Date(Date.now() - 24 * 3600 * 1000);
        const [users, posts, reportsOpen, events24h, announcementsActive] = await Promise.all([
            User.countDocuments(),
            Post.countDocuments(),
            Report.countDocuments({ status: "open" }),
            AnalyticsEvent.countDocuments({ createdAt: { $gte: since } }),
            Announcement.countDocuments({ active: true }),
        ]);
        return res.json({
            ok: true,
            now: new Date().toISOString(),
            version: require("../package.json").version,
            node: process.version,
            platform: process.platform,
            uptime: Math.round(process.uptime()),
            memory: { rss: mem.rss, heapTotal: mem.heapTotal, heapUsed: mem.heapUsed, external: mem.external },
            mongo: { state: mongoOk ? "connected" : "disconnected", host: mongoose.connection.host || null, name: mongoose.connection.name || null, latency },
            counts: { users, posts, reportsOpen, events24h, announcementsActive },
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post("/system/ping", async (req, res) => {
    try {
        const t = Date.now();
        await User.findOne().select("_id").lean();
        return res.json({ ok: true, latency: Date.now() - t, state: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post("/system/cache-clear", async (req, res) => {
    try {
        await mongoose.connection.db?.admin().ping();
        return res.json({ ok: true, note: "Stateless server — no persistent in-memory cache. MongoDB connection re-validated.", latency: null });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post("/system/restart", async (req, res) => {
    if (process.env.ALLOW_RESTART !== "true") {
        return res.status(403).json({ error: "Restart is disabled (set ALLOW_RESTART=true in live-server/.env to enable)" });
    }
    res.json({ ok: true, message: "Restarting server..." });
    setTimeout(() => process.exit(0), 600);
});

// ── Announcements ─────────────────────────────────────────────
router.get("/announcements", async (req, res) => {
    try {
        const items = await Announcement.find().sort({ createdAt: -1 }).limit(100).lean();
        return res.json(items.map((a) => ({ ...a, id: a._id.toString() })));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post("/announcements", async (req, res) => {
    try {
        const { title, body, link, color, audience, dismissible, active, startsAt, endsAt } = req.body || {};
        if (!title) return res.status(400).json({ error: "Title required" });
        const created = await Announcement.create({
            title: String(title).slice(0, 200),
            body: String(body || "").slice(0, 2000),
            link: String(link || "").slice(0, 500),
            color: String(color || "#1cb0f6"),
            audience: audience === "guests" ? "guests" : "all",
            dismissible: dismissible !== false,
            active: active !== false,
            startsAt: startsAt ? new Date(startsAt) : null,
            endsAt: endsAt ? new Date(endsAt) : null,
            createdBy: req.userId ? String(req.userId).slice(0, 24) : "admin",
        });
        return res.json(created.toObject({ versionKey: false }));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.patch("/announcements/:id", async (req, res) => {
    try {
        const allow = ["title", "body", "link", "color", "audience", "dismissible", "active", "startsAt", "endsAt"];
        const update = {};
        for (const k of allow) if (k in (req.body || {})) update[k] = req.body[k];
        const item = await Announcement.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
        if (!item) return res.status(404).json({ error: "Not found" });
        return res.json({ ...item, id: item._id.toString() });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.delete("/announcements/:id", async (req, res) => {
    try {
        await Announcement.findByIdAndDelete(req.params.id);
        return res.json({ ok: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post("/announcements/:id/broadcast", async (req, res) => {
    try {
        const a = await Announcement.findById(req.params.id).lean();
        if (!a) return res.status(404).json({ error: "Not found" });
        if (!a.title) return res.status(400).json({ error: "Announcement has no title" });
        const result = await broadcastPush({
            title: a.title,
            body: a.body || a.link || "Tap to view",
            url: a.link || "/",
            type: "announcement",
        });
        await Announcement.findByIdAndUpdate(a._id, { pushedAt: new Date() });
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ── Reports inbox ─────────────────────────────────────────────
router.get("/reports", async (req, res) => {
    try {
        const status = ["open", "resolved", "dismissed"].includes(req.query.status) ? req.query.status : "open";
        const items = await Report.find({ status }).sort({ createdAt: -1 }).limit(200).lean();
        return res.json(items.map((r) => ({ ...r, id: r._id.toString() })));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.get("/reports/stats", async (req, res) => {
    try {
        const [open, resolved, dismissed, total, byReason] = await Promise.all([
            Report.countDocuments({ status: "open" }),
            Report.countDocuments({ status: "resolved" }),
            Report.countDocuments({ status: "dismissed" }),
            Report.countDocuments(),
            Report.aggregate([{ $group: { _id: "$reason", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
        ]);
        return res.json({ open, resolved, dismissed, total, byReason: byReason.map((r) => ({ reason: r._id, count: r.n })) });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post("/reports/:id/resolve", async (req, res) => {
    try {
        const { actionTaken } = req.body || {};
        const r = await Report.findByIdAndUpdate(req.params.id, { status: "resolved", actionTaken: String(actionTaken || "").slice(0, 500), resolvedAt: new Date() }, { new: true }).lean();
        if (!r) return res.status(404).json({ error: "Not found" });
        return res.json({ ok: true, id: r._id.toString() });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post("/reports/:id/dismiss", async (req, res) => {
    try {
        const r = await Report.findByIdAndUpdate(req.params.id, { status: "dismissed", actionTaken: (req.body || {}).actionTaken || "dismissed", resolvedAt: new Date() }, { new: true }).lean();
        if (!r) return res.status(404).json({ error: "Not found" });
        return res.json({ ok: true, id: r._id.toString() });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ── Data exports (CSV) ────────────────────────────────────────
router.get("/exports/users.csv", async (req, res) => {
    try {
        const users = await User.find().lean();
        csvDownload(res, "anontweet-users.csv", [
            ["id", "username", "email", "createdAt", "lastActive", "inviteCode", "referredBy", "inviteCount", "isAdmin", "isVerified", "suspended", "language", "avatarColor"],
            ...users.map((u) => [u._id.toString(), u.username, u.email, u.createdAt ? u.createdAt.toISOString() : "", u.lastActive ? u.lastActive.toISOString() : "", u.inviteCode || "", u.referredBy || "", u.inviteCount || 0, u.isAdmin, u.isVerified, u.suspended, u.language || "", u.avatarColor || ""]),
        ]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.get("/exports/posts.csv", async (req, res) => {
    try {
        const limit = Math.min(5000, parseInt(req.query.limit, 10) || 2000);
        const posts = await Post.find().sort({ createdAt: -1 }).limit(limit).lean();
        csvDownload(res, "anontweet-posts.csv", [
            ["id", "sender", "text", "likes", "comments", "isRemoved", "removedReason", "createdAt"],
            ...posts.map((p) => [p._id.toString(), p.sender, String(p.text || "").slice(0, 500), (p.likes || []).length, (p.comments || []).length, p.isRemoved || false, p.removedReason || "", p.createdAt ? p.createdAt.toISOString() : ""]),
        ]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.get("/exports/events.csv", async (req, res) => {
    try {
        const limit = Math.min(10000, parseInt(req.query.limit, 10) || 5000);
        const events = await AnalyticsEvent.find().sort({ createdAt: -1 }).limit(limit).lean();
        csvDownload(res, "anontweet-events.csv", [
            ["type", "path", "country", "city", "device", "os", "browser", "username", "createdAt"],
            ...events.map((e) => [e.type, e.path, e.location?.country || "", e.location?.city || "", e.device?.type || "", e.device?.os || "", e.device?.browser || "", e.userId ? "" : "", e.createdAt ? e.createdAt.toISOString() : ""]),
        ]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.get("/exports/growth.csv", async (req, res) => {
    try {
        const days = Math.min(365, parseInt(req.query.days, 10) || 90);
        const since = new Date(Date.now() - days * 24 * 3600 * 1000);
        const fmt = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: req.query.tz || "UTC" } };
        const [users, posts, events] = await Promise.all([
            User.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: fmt, n: { $sum: 1 } } }]),
            Post.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: fmt, n: { $sum: 1 } } }]),
            AnalyticsEvent.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: fmt, n: { $sum: 1 } } }]),
        ]);
        const u = Object.fromEntries(users.map((x) => [x._id, x.n]));
        const p = Object.fromEntries(posts.map((x) => [x._id, x.n]));
        const e = Object.fromEntries(events.map((x) => [x._id, x.n]));
        const rows = [["date", "users", "posts", "events"]];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(since.getTime() + i * 24 * 3600 * 1000).toISOString().slice(0, 10);
            rows.push([d, u[d] || 0, p[d] || 0, e[d] || 0]);
        }
        csvDownload(res, "anontweet-growth.csv", rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.get("/exports/locations.csv", async (req, res) => {
    try {
        const days = Math.min(90, parseInt(req.query.days, 10) || 30);
        const since = new Date(Date.now() - days * 24 * 3600 * 1000);
        const events = await AnalyticsEvent.find({ createdAt: { $gte: since } }).select("location").lean();
        const byCountry = new Map();
        const byCity = new Map();
        for (const ev of events) {
            const loc = ev.location || {};
            if (!loc.countryCode) continue;
            const ck = loc.countryCode;
            const ccur = byCountry.get(ck) || { code: ck, name: loc.country || ck, raw: null, n: 0 };
            ccur.n++;
            if (!ccur.raw && (loc.lat != null || loc.lon != null)) ccur.raw = { lat: loc.lat, lon: loc.lon };
            byCountry.set(ck, ccur);
            if (loc.city) {
                const key = `${ck}:${loc.city}`;
                const cur = byCity.get(key) || { code: ck, city: loc.city, country: loc.country || ck, raw: null, n: 0 };
                cur.n++;
                if (!cur.raw && (loc.lat != null || loc.lon != null)) cur.raw = { lat: loc.lat, lon: loc.lon };
                byCity.set(key, cur);
            }
        }
        const rows = [["type", "code", "name", "count", "lat", "lon"]];
        for (const c of byCountry.values()) rows.push(["country", c.code, c.name, c.n, c.raw ? c.raw.lat : "", c.raw ? c.raw.lon : ""]);
        for (const c of byCity.values()) rows.push(["city", c.code, c.city, c.n, c.raw ? c.raw.lat : "", c.raw ? c.raw.lon : ""]);
        csvDownload(res, "anontweet-locations.csv", rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ── Settings & feature flags ──────────────────────────────────
router.get("/settings", async (req, res) => {
    try {
        const s = await getSettings();
        return res.json({ ...s });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.patch("/settings", async (req, res) => {
    try {
        const allowed = { signupsOpen: "boolean", "maintenance.active": "boolean", "maintenance.message": "string" };
        const update = {};
        for (const [k, type] of Object.entries(allowed)) {
            if (!(k in (req.body || {}))) continue;
            const v = req.body[k];
            if (type === "boolean" && typeof v === "boolean") {
                if (k === "signupsOpen") update.signupsOpen = v;
                else update["maintenance.active"] = v;
            } else if (type === "string" && typeof v === "string") {
                update["maintenance.message"] = String(v).slice(0, 300);
            }
        }
        update.updatedAt = new Date();
        update.updatedBy = req.userId ? String(req.userId).slice(0, 24) : "";
        const doc = await SiteSetting.findOneAndUpdate({ key: "config" }, { $set: update, $setOnInsert: { key: "config" } }, { upsert: true, new: true }).lean();
        return res.json({ ok: true, settings: { signupsOpen: doc.signupsOpen !== false, maintenance: { active: !!(doc.maintenance && doc.maintenance.active), message: (doc.maintenance && doc.maintenance.message) || "" } } });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ── Security & access audit ───────────────────────────────────
router.get("/audit", async (req, res) => {
    try {
        const days = Math.min(30, parseInt(req.query.days, 10) || 14);
        const since = new Date(Date.now() - days * 24 * 3600 * 1000);
        const q = { createdAt: { $gte: since } };
        if (req.query.action) q.action = String(req.query.action).slice(0, 80);
        if (req.query.q) {
            const rx = new RegExp(String(req.query.q).slice(0, 80), "i");
            q.$or = [{ username: rx }, { message: rx }, { targetUser: rx }];
        }
        const [rows, topIPs, failed] = await Promise.all([
            SystemLog.find(q).sort({ createdAt: -1 }).limit(500).select("createdAt category level action message username ip userAgent path statusCode targetUser").lean(),
            SystemLog.aggregate([{ $match: { createdAt: { $gte: since }, ip: { $ne: null } } }, { $group: { _id: "$ip", n: { $sum: 1 }, last: { $max: "$createdAt" } } }, { $sort: { n: -1 } }, { $limit: 20 }]),
            SystemLog.countDocuments({ createdAt: { $gte: since }, action: { $in: ["otp_failed", "pin_failed"] } }),
        ]);
        return res.json({
            days,
            rows: rows.map((r) => ({ id: r._id.toString(), createdAt: r.createdAt, category: r.category, level: r.level, action: r.action, message: r.message, username: r.username, ip: r.ip, userAgent: r.userAgent, path: r.path, statusCode: r.statusCode, targetUser: r.targetUser })),
            topIPs: topIPs.map((x) => ({ ip: x._id, count: x.n, last: x.last })),
            failed,
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ── Invites & referrals ───────────────────────────────────────
router.get("/invites", async (req, res) => {
    try {
        const [withCodes, codesUsed, topReferrers, list] = await Promise.all([
            User.countDocuments({ inviteCode: { $ne: null } }),
            User.countDocuments({ inviteCount: { $gt: 0 } }),
            User.find().select("username inviteCode inviteCount referredBy createdAt").sort({ inviteCount: -1 }).limit(50).lean(),
            User.find({ inviteCode: { $ne: null } }).select("username inviteCode inviteCount createdAt").sort({ createdAt: -1 }).limit(200).lean(),
        ]);
        return res.json({
            stats: { withCodes, codesUsed, topReferrersTotal: topReferrers.length },
            topReferrers: topReferrers.map((u) => ({ id: u._id.toString(), username: u.username, code: u.inviteCode, count: u.inviteCount || 0, createdAt: u.createdAt })),
            list: list.map((u) => ({ id: u._id.toString(), username: u.username, code: u.inviteCode, count: u.inviteCount || 0, createdAt: u.createdAt })),
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post("/invites/issue", async (req, res) => {
    try {
        const { username, code } = req.body || {};
        if (!username) return res.status(400).json({ error: "username required" });
        const user = await User.findOne({ username: String(username).trim() });
        if (!user) return res.status(404).json({ error: "User not found" });
        const newCode = (code && String(code).trim().slice(0, 24)) || user.username.toUpperCase().slice(0, 12) || "CODE";
        user.inviteCode = newCode;
        await user.save();
        return res.json({ ok: true, username: user.username, code: newCode });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post("/invites/:id/revoke", async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { inviteCode: null });
        return res.json({ ok: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ── Live activity stream ──────────────────────────────────────
router.get("/live", async (req, res) => {
    try {
        const [events, users, posts, openReports, activeAnns] = await Promise.all([
            AnalyticsEvent.find().sort({ createdAt: -1 }).limit(12).select("type path createdAt location userId").lean(),
            User.find().sort({ createdAt: -1 }).limit(6).select("username createdAt").lean(),
            Post.find().sort({ createdAt: -1 }).limit(6).select("sender text createdAt").lean(),
            Report.countDocuments({ status: "open" }),
            Announcement.countDocuments({ active: true }),
        ]);
        const items = [];
        for (const e of events) {
            items.push({ kind: "event", label: e.type, detail: e.path || "", who: null, region: e.location?.country ? `${e.location.country}${e.location.city ? ` · ${e.location.city}` : ""}` : "", time: e.createdAt });
        }
        for (const u of users) items.push({ kind: "signup", label: "new user", detail: "", who: u.username, region: "", time: u.createdAt });
        for (const p of posts) items.push({ kind: "post", label: "new post", detail: String(p.text || "").slice(0, 60), who: p.sender, region: "", time: p.createdAt });
        items.sort((a, b) => new Date(b.time) - new Date(a.time));
        return res.json({ items: items.slice(0, 30).map((it) => ({ ...it, time: it.time })), now: new Date().toISOString(), counters: { openReports, activeAnnouncements: activeAnns } });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;