const express = require("express");
const SystemLog = require("../models/systemLog");
const { requireAdmin } = require("../middleware/auth");
const { LOG_CATEGORIES, LOG_LEVELS, flushNow } = require("../logService");

const router = express.Router();

// GET /api/admin/system-logs — query logs with filters
router.get("/", requireAdmin, async (req, res) => {
    try {
        const {
            category,
            level,
            action,
            username,
            search,
            gameId,
            gameType,
            targetUser,
            since,
            until,
            limit = "200",
            page = "1",
            sort = "desc",
        } = req.query;

        const filter = {};

        if (category && LOG_CATEGORIES.includes(category)) filter.category = category;
        if (level && LOG_LEVELS.includes(level)) filter.level = level;
        if (action) filter.action = { $regex: action, $options: "i" };
        if (username) filter.username = { $regex: username, $options: "i" };
        if (gameId) filter.gameId = gameId;
        if (gameType) filter.gameType = gameType;
        if (targetUser) filter.targetUser = { $regex: targetUser, $options: "i" };
        if (search) {
            filter.$or = [
                { message: { $regex: search, $options: "i" } },
                { action: { $regex: search, $options: "i" } },
                { username: { $regex: search, $options: "i" } },
                { path: { $regex: search, $options: "i" } },
            ];
        }
        if (since || until) {
            filter.createdAt = {};
            if (since) filter.createdAt.$gte = new Date(since);
            if (until) filter.createdAt.$lte = new Date(until);
        }

        const pageSize = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const skip = (pageNum - 1) * pageSize;
        const sortOrder = sort === "asc" ? 1 : -1;

        const [logs, total] = await Promise.all([
            SystemLog.find(filter)
                .sort({ createdAt: sortOrder })
                .skip(skip)
                .limit(pageSize)
                .lean(),
            SystemLog.countDocuments(filter),
        ]);

        return res.json({
            logs,
            total,
            page: pageNum,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        });
    } catch (error) {
        console.error("[Admin Logs] Query error:", error.message);
        return res.status(500).json({ error: "Failed to fetch logs" });
    }
});

// GET /api/admin/system-logs/stats — log statistics
router.get("/stats", requireAdmin, async (req, res) => {
    try {
        const { since } = req.query;
        const matchFilter = {};
        if (since) matchFilter.createdAt = { $gte: new Date(since) };

        const [byCategory, byLevel, recentErrors, totalLogs] = await Promise.all([
            SystemLog.aggregate([
                { $match: matchFilter },
                { $group: { _id: "$category", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            SystemLog.aggregate([
                { $match: matchFilter },
                { $group: { _id: "$level", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            SystemLog.find({ level: "error", ...(since ? { createdAt: { $gte: new Date(since) } } : {}) })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean(),
            SystemLog.countDocuments(matchFilter),
        ]);

        return res.json({
            total: totalLogs,
            byCategory: byCategory.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {}),
            byLevel: byLevel.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {}),
            recentErrors,
        });
    } catch (error) {
        console.error("[Admin Logs] Stats error:", error.message);
        return res.status(500).json({ error: "Failed to fetch stats" });
    }
});

// POST /api/admin/system-logs — receive client-side logs
router.post("/", async (req, res) => {
    try {
        await flushNow();

        const body = req.body;
        if (!Array.isArray(body)) {
            if (body && body.category) {
                const { log } = require("../logService");
                log({ ...body, ip: req.ip });
                return res.json({ ok: true });
            }
            return res.status(400).json({ error: "Invalid payload" });
        }

        const { log } = require("../logService");
        for (const entry of body) {
            log({ ...entry, ip: req.ip });
        }
        return res.json({ ok: true, received: body.length });
    } catch (error) {
        console.error("[Admin Logs] Ingest error:", error.message);
        return res.status(500).json({ error: "Failed to ingest logs" });
    }
});

// DELETE /api/admin/system-logs — purge old logs
router.delete("/", requireAdmin, async (req, res) => {
    try {
        const { olderThan, category } = req.query;
        const filter = {};
        if (olderThan) filter.createdAt = { $lt: new Date(olderThan) };
        if (category) filter.category = category;

        const result = await SystemLog.deleteMany(filter);
        return res.json({ ok: true, deleted: result.deletedCount });
    } catch (error) {
        console.error("[Admin Logs] Purge error:", error.message);
        return res.status(500).json({ error: "Failed to purge logs" });
    }
});

module.exports = router;
