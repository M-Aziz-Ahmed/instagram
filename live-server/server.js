require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

const LiveStream = require("./models/liveStream");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

app.use(cors({ origin: CORS_ORIGIN.split(","), credentials: true }));
app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: CORS_ORIGIN.split(","),
        methods: ["GET", "POST"],
        credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
});

// ── MongoDB ─────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://39.62.217.128:27017";

mongoose.connect(MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
}).then(() => {
    console.log("[DB] MongoDB connected");
}).catch((err) => {
    console.error("[DB] MongoDB connection failed:", err.message);
    process.exit(1);
});

// ── HTTP Routes ─────────────────────────────────────────────────
app.get("/health", (req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
});

app.get("/api/streams", async (req, res) => {
    try {
        const streams = await LiveStream.find({ status: "live" })
            .sort({ startedAt: -1 })
            .limit(20)
            .lean();

        const hostNames = [...new Set(streams.map((s) => s.host))];
        const usersCol = mongoose.connection.db.collection("users");
        const hosts = await usersCol.find({ username: { $in: hostNames } })
            .project({ username: 1, avatarUrl: 1, avatarColor: 1 })
            .toArray();
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

        res.json({ streams: enriched });
    } catch (err) {
        console.error("[API] Failed to fetch streams:", err.message);
        res.status(500).json({ error: "Failed to fetch streams" });
    }
});

app.post("/api/streams", async (req, res) => {
    try {
        const { username, title } = req.body;
        if (!username) return res.status(400).json({ error: "Username required" });

        const existing = await LiveStream.findOne({ host: username, status: "live" });
        if (existing) return res.json({ streamId: existing._id, message: "Already live" });

        const stream = await LiveStream.create({
            host: username,
            title: title || "",
            status: "live",
        });

        io.emit("stream:started", {
            _id: stream._id,
            host: stream.host,
            title: stream.title,
            status: "live",
            startedAt: stream.startedAt,
        });

        res.json({ streamId: stream._id, title: stream.title });
    } catch (err) {
        console.error("[API] Failed to create stream:", err.message);
        res.status(500).json({ error: "Failed to start stream" });
    }
});

app.delete("/api/streams/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { username } = req.body;

        const stream = await LiveStream.findById(id);
        if (!stream) return res.status(404).json({ error: "Stream not found" });
        if (stream.host !== username) return res.status(403).json({ error: "Unauthorized" });

        stream.status = "ended";
        stream.endedAt = new Date();
        await stream.save();

        io.to(`stream:${id}`).emit("host-ended", { streamId: id });
        io.emit("stream:ended", { streamId: id });

        res.json({ ok: true });
    } catch (err) {
        console.error("[API] Failed to end stream:", err.message);
        res.status(500).json({ error: "Failed to end stream" });
    }
});

// ── Socket.IO ───────────────────────────────────────────────────
io.on("connection", (socket) => {
    console.log(`[WS] Connected: ${socket.id}`);

    socket.on("join-stream", async ({ streamId, username }) => {
        socket.join(`stream:${streamId}`);
        socket.data = { streamId, username };

        try {
            const stream = await LiveStream.findById(streamId);
            if (!stream || stream.status !== "live") {
                socket.emit("error", { message: "Stream not found or ended" });
                return;
            }

            if (!stream.viewers.includes(username)) {
                stream.viewers.push(username);
                if (stream.viewers.length > stream.maxViewers) {
                    stream.maxViewers = stream.viewers.length;
                }
                await stream.save();
            }

            io.to(`stream:${streamId}`).emit("viewer-count", { count: stream.viewers.length });
            console.log(`[WS] ${username} joined stream ${streamId} (${stream.viewers.length} viewers)`);
        } catch (err) {
            console.error("[WS] join-stream error:", err.message);
        }
    });

    socket.on("leave-stream", async ({ streamId, username }) => {
        socket.leave(`stream:${streamId}`);

        try {
            const stream = await LiveStream.findById(streamId);
            if (stream) {
                stream.viewers = stream.viewers.filter((v) => v !== username);
                await stream.save();
                io.to(`stream:${streamId}`).emit("viewer-count", { count: stream.viewers.length });
            }
        } catch (err) {
            console.error("[WS] leave-stream error:", err.message);
        }
    });

    socket.on("signal", ({ streamId, to, type, data, from }) => {
        if (to) {
            io.to(`stream:${streamId}`).except(socket.id).emit("signal", {
                from,
                to,
                type,
                data,
                createdAt: new Date().toISOString(),
            });
        } else {
            socket.to(`stream:${streamId}`).emit("signal", {
                from,
                to: "",
                type,
                data,
                createdAt: new Date().toISOString(),
            });
        }
    });

    socket.on("chat-message", async ({ streamId, username, color, avatarUrl, text, replyTo }) => {
        if (!text?.trim()) return;

        const msg = {
            username,
            color: color || "#3b82f6",
            avatarUrl: avatarUrl || "",
            text: text.trim(),
            replyTo: (replyTo?.username && replyTo?.text)
                ? { username: replyTo.username, text: String(replyTo.text).slice(0, 300) }
                : null,
            createdAt: new Date(),
        };

        try {
            const stream = await LiveStream.findById(streamId);
            if (stream) {
                stream.chat.push(msg);
                if (stream.chat.length > 200) {
                    stream.chat = stream.chat.slice(-200);
                }
                await stream.save();
            }
        } catch (err) {
            console.error("[WS] chat save error:", err.message);
        }

        io.to(`stream:${streamId}`).emit("chat-message", {
            ...msg,
            createdAt: msg.createdAt.toISOString(),
        });
    });

    socket.on("disconnect", async () => {
        const { streamId, username } = socket.data || {};
        if (!streamId || !username) return;

        try {
            const stream = await LiveStream.findById(streamId);
            if (stream) {
                stream.viewers = stream.viewers.filter((v) => v !== username);
                await stream.save();
                io.to(`stream:${streamId}`).emit("viewer-count", { count: stream.viewers.length });
            }
        } catch (err) {
            console.error("[WS] disconnect cleanup error:", err.message);
        }

        console.log(`[WS] Disconnected: ${socket.id} (${username})`);
    });
});

// ── Start ───────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`[Live Server] Running on port ${PORT}`);
    console.log(`[Live Server] CORS allowed: ${CORS_ORIGIN}`);
});
