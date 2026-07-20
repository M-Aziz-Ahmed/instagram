const express = require("express");
const LiveStream = require("../models/liveStream");
const User = require("../models/user");
const Notification = require("../models/notification");

const router = express.Router();

// GET / - list live streams
router.get("/", async (req, res) => {
    try {
        const streams = await LiveStream.find({ status: "live" })
            .sort({ startedAt: -1 })
            .limit(20)
            .lean();

        const hostNames = [...new Set(streams.map((s) => s.host))];
        const hosts = await User.find({ username: { $in: hostNames } })
            .select("username avatarUrl avatarColor")
            .lean();
        const hostMap = {};
        hosts.forEach((h) => { hostMap[h.username] = h; });

        const enriched = streams.map((s) => {
            const u = hostMap[s.host] || {};
            return {
                ...s,
                hostAvatarUrl: u.avatarUrl || "",
                hostAvatarColor: u.avatarColor || "#3b82f6",
            };
        });

        return res.json({ streams: enriched });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch streams" });
    }
});

// POST / - create stream
router.post("/", async (req, res) => {
    try {
        const { username, title } = req.body;
        if (!username) return res.status(400).json({ error: "Username required" });

        const existing = await LiveStream.findOne({ host: username, status: "live" });
        if (existing) return res.json({ streamId: existing._id, message: "Already live" });

        const hostUser = await User.findOne({ username }).lean();
        if (!hostUser?.isAdmin && !hostUser?.liveStreamAllowed) {
            return res.status(403).json({ error: "You are not allowed to go live. Contact an admin." });
        }

        const stream = await LiveStream.create({ host: username, title: title || "", status: "live" });

        if (hostUser?.followers?.length) {
            const notifs = hostUser.followers.map((follower) => ({
                recipient: follower, type: "live", fromUser: username,
                fromColor: hostUser.avatarColor || "#3b82f6",
                fromAvatarUrl: hostUser.avatarUrl || "",
                text: title || "is live now",
            }));
            await Notification.insertMany(notifs).catch(() => {});
        }

        return res.json({ streamId: stream._id, title: stream.title });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to start stream" });
    }
});

// GET /:id
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const action = req.query.action;

        const stream = await LiveStream.findById(id).lean();
        if (!stream) return res.status(404).json({ error: "Stream not found" });

        if (action === "chat") {
            const since = req.query.since;
            const sinceDate = since ? new Date(since) : new Date(0);
            const messages = stream.chat.filter((m) => new Date(m.createdAt) > sinceDate);
            return res.json({ messages });
        }

        return res.json(stream);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch stream" });
    }
});

// POST /:id - actions (join, leave, signal, poll, chat)
router.post("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { username, action, to, type, data, since, chatSince, text, color, avatarUrl, replyTo } = req.body;

        const stream = await LiveStream.findById(id);
        if (!stream) return res.status(404).json({ error: "Stream not found" });

        if (action === "join") {
            if (!stream.viewers.includes(username)) {
                stream.viewers.push(username);
                if (stream.viewers.length > stream.maxViewers) {
                    stream.maxViewers = stream.viewers.length;
                }
                await stream.save();
            }
            return res.json({ ok: true, viewers: stream.viewers.length });
        }

        if (action === "leave") {
            stream.viewers = stream.viewers.filter((v) => v !== username);
            await stream.save();
            return res.json({ ok: true, viewers: stream.viewers.length });
        }

        if (action === "signal") {
            stream.signals.push({ from: username, to: to || "", type, data });
            await stream.save();
            return res.json({ ok: true });
        }

        if (action === "poll") {
            const sinceDate = since ? new Date(since) : new Date(0);
            const mySignals = stream.signals.filter(
                (s) => (s.to === username || s.to === "") && new Date(s.createdAt) > sinceDate
            );
            const chatSinceDate = chatSince ? new Date(chatSince) : null;
            const messages = chatSinceDate
                ? stream.chat.filter((m) => new Date(m.createdAt) > chatSinceDate)
                : [];

            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
            stream.signals = stream.signals.filter((s) => new Date(s.createdAt) > fiveMinAgo);
            if (stream.isModified()) await stream.save();

            return res.json({ signals: mySignals, viewers: stream.viewers.length, messages });
        }

        if (action === "chat") {
            if (!text?.trim()) return res.status(400).json({ error: "Empty message" });
            const msg = {
                username, color: color || "#3b82f6", avatarUrl: avatarUrl || "",
                text: text.trim(),
                replyTo: (replyTo && replyTo.username && replyTo.text)
                    ? { username: replyTo.username, text: String(replyTo.text).slice(0, 300) }
                    : null,
            };
            stream.chat.push(msg);
            if (stream.chat.length > 200) stream.chat = stream.chat.slice(-200);
            await stream.save();
            return res.json({ ok: true, message: msg });
        }

        return res.status(400).json({ error: "Invalid action" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// DELETE /:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { username } = req.body;

        const stream = await LiveStream.findById(id);
        if (!stream) return res.status(404).json({ error: "Stream not found" });
        if (stream.host !== username) return res.status(403).json({ error: "Unauthorized" });

        stream.status = "ended";
        stream.endedAt = new Date();
        await stream.save();

        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to end stream" });
    }
});

module.exports = router;
