require("dotenv").config();
const express = require("express");
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

const LiveStream = require("./models/liveStream");

const app = express();

let server;
const certDir = __dirname;
const keyPath = path.join(certDir, "key.pem");
const certPath = path.join(certDir, "cert.pem");

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    server = https.createServer({
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
    }, app);
    console.log("[HTTPS] SSL certificates loaded");
} else {
    server = http.createServer(app);
    console.log("[HTTP] No SSL certs found, running without TLS");
}

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: true,
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

// ── Voice Channels (in-memory) ─────────────────────────────────
const DEFAULT_CHANNELS = [
    { id: "general", name: "General", participants: new Map() },
    { id: "gaming", name: "Gaming", participants: new Map() },
    { id: "music", name: "Music", participants: new Map() },
    { id: "chill", name: "Chill", participants: new Map() },
];

const voiceChannels = new Map();
DEFAULT_CHANNELS.forEach((ch) => voiceChannels.set(ch.id, { ...ch, participants: new Map() }));

// In-memory admin-muted users per channel: { channelId -> Set<username> }
const channelMutedUsers = new Map();

let channelCounter = 100;

function getChannelState(channelId) {
    const ch = voiceChannels.get(channelId);
    if (!ch) return null;
    return {
        id: ch.id,
        name: ch.name,
        participants: Array.from(ch.participants.values()).map((p) => ({
            username: p.username,
            avatarUrl: p.avatarUrl,
            color: p.color,
            muted: p.muted,
            deafened: p.deafened,
            speaking: p.speaking,
            isAdmin: p.isAdmin || false,
            socketId: p.socketId,
        })),
    };
}

function getAllChannelsState() {
    return Array.from(voiceChannels.values()).map((ch) => ({
        id: ch.id,
        name: ch.name,
        participantCount: ch.participants.size,
    }));
}

function broadcastChannelList() {
    io.emit("voice:channels", getAllChannelsState());
}

function broadcastChannelParticipants(channelId) {
    const state = getChannelState(channelId);
    if (state) {
        io.to(`voice:${channelId}`).emit("voice:channel-update", state);
    }
}

async function isUserAdmin(username) {
    try {
        const usersCol = mongoose.connection.db.collection("users");
        const user = await usersCol.findOne({ username }, { projection: { isAdmin: 1 } });
        return user?.isAdmin === true;
    } catch { return false; }
}

async function isUserBanned(username) {
    try {
        const usersCol = mongoose.connection.db.collection("users");
        const user = await usersCol.findOne(
            { username },
            { projection: { voiceChatBanned: 1, voiceChatBannedUntil: 1 } }
        );
        if (!user) return false;
        if (user.voiceChatBanned) {
            if (user.voiceChatBannedUntil && new Date(user.voiceChatBannedUntil) > new Date()) {
                return true;
            } else if (!user.voiceChatBannedUntil) {
                return true;
            }
            // Ban expired, auto-unban
            if (user.voiceChatBannedUntil && new Date(user.voiceChatBannedUntil) <= new Date()) {
                await usersCol.updateOne({ username }, {
                    $set: { voiceChatBanned: false, voiceChatBannedUntil: null, voiceChatBannedReason: "" }
                });
                return false;
            }
        }
        return false;
    } catch { return false; }
}

io.on("connection", async (socket) => {
    const username = socket.handshake?.query?.username;
    const isAdmin = username ? await isUserAdmin(username) : false;
    socket.data = { ...socket.data, username, isAdmin };
    console.log(`[WS] Connected: ${socket.id} (admin=${isAdmin})`);

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

    // ── Voice Channel Events ────────────────────────────────────
    socket.on("voice:get-channels", () => {
        socket.emit("voice:channels", getAllChannelsState());
    });

    socket.on("voice:join", async ({ channelId, username, avatarUrl, color }) => {
        const ch = voiceChannels.get(channelId);
        if (!ch) return socket.emit("voice:error", { message: "Channel not found" });

        // Check if user is banned
        if (await isUserBanned(username)) {
            return socket.emit("voice:error", { message: "You are banned from voice chat." });
        }

        // Check if user is muted in this channel
        const mutedSet = channelMutedUsers.get(channelId);
        const isMutedByAdmin = mutedSet?.has(username);

        // Leave any current channel first
        if (socket.data?.voiceChannel) {
            const prevCh = voiceChannels.get(socket.data.voiceChannel);
            if (prevCh) {
                prevCh.participants.delete(socket.id);
                socket.leave(`voice:${socket.data.voiceChannel}`);
                broadcastChannelParticipants(socket.data.voiceChannel);
                io.to(`voice:${socket.data.voiceChannel}`).emit("voice:user-left", { username: socket.data.username });
            }
        }

        ch.participants.set(socket.id, {
            username,
            avatarUrl: avatarUrl || "",
            color: color || "#3b82f6",
            muted: isMutedByAdmin || false,
            deafened: false,
            speaking: false,
            socketId: socket.id,
            isAdmin: socket.data.isAdmin || false,
        });

        socket.data.voiceChannel = channelId;
        socket.data.username = username;
        socket.join(`voice:${channelId}`);

        // Send full channel state to the joiner
        socket.emit("voice:joined", getChannelState(channelId));

        // Broadcast updated participant list to everyone in the channel
        broadcastChannelParticipants(channelId);
        broadcastChannelList();

        // If muted by admin, notify the user
        if (isMutedByAdmin) {
            socket.emit("voice:admin-muted", { muted: true });
        }

        console.log(`[VOICE] ${username} joined channel ${channelId} (${ch.participants.size} users)`);
    });

    socket.on("voice:leave", ({ channelId }) => {
        const ch = voiceChannels.get(channelId);
        if (!ch) return;

        const participant = ch.participants.get(socket.id);
        ch.participants.delete(socket.id);
        socket.leave(`voice:${channelId}`);
        socket.data.voiceChannel = null;

        broadcastChannelParticipants(channelId);
        broadcastChannelList();

        if (participant) {
            io.to(`voice:${channelId}`).emit("voice:user-left", { username: participant.username });
        }
    });

    socket.on("voice:toggle-mute", ({ channelId, muted }) => {
        const ch = voiceChannels.get(channelId);
        if (!ch) return;
        const p = ch.participants.get(socket.id);
        if (!p) return;
        p.muted = muted;
        if (muted) p.speaking = false;
        broadcastChannelParticipants(channelId);
    });

    socket.on("voice:toggle-deafen", ({ channelId, deafened }) => {
        const ch = voiceChannels.get(channelId);
        if (!ch) return;
        const p = ch.participants.get(socket.id);
        if (!p) return;
        p.deafened = deafened;
        if (deafened) {
            p.muted = true;
            p.speaking = false;
        }
        broadcastChannelParticipants(channelId);
    });

    socket.on("voice:speaking", ({ channelId, speaking }) => {
        const ch = voiceChannels.get(channelId);
        if (!ch) return;
        const p = ch.participants.get(socket.id);
        if (!p || p.muted) return;
        p.speaking = speaking;
        socket.to(`voice:${channelId}`).emit("voice:user-speaking", {
            username: p.username,
            speaking,
        });
    });

    // WebRTC signaling for voice (peer-to-peer mesh)
    socket.on("voice:signal", ({ to, from, fromUsername, type, data }) => {
        if (!to || !type) return;
        const actualFrom = socket.id;
        const actualFromUsername = socket.data?.username;
        io.to(to).emit("voice:signal", { from: actualFrom, fromUsername: actualFromUsername, type, data });
    });

    // ── Voice Channel Admin Events ──────────────────────────────

    socket.on("voice:create-channel", async ({ name }) => {
        if (!socket.data.isAdmin) return socket.emit("voice:error", { message: "Admin only" });
        if (!name?.trim()) return socket.emit("voice:error", { message: "Channel name required" });

        const id = `ch-${++channelCounter}`;
        voiceChannels.set(id, { id, name: name.trim(), participants: new Map() });
        broadcastChannelList();
        console.log(`[VOICE] Admin ${socket.data.username} created channel: ${name}`);
    });

    socket.on("voice:delete-channel", async ({ channelId }) => {
        if (!socket.data.isAdmin) return socket.emit("voice:error", { message: "Admin only" });
        const ch = voiceChannels.get(channelId);
        if (!ch) return;

        // Kick all participants
        ch.participants.forEach((p, socketId) => {
            const s = io.sockets.sockets.get(socketId);
            if (s) {
                s.leave(`voice:${channelId}`);
                s.data.voiceChannel = null;
                s.emit("voice:kicked", { reason: "Channel deleted" });
            }
        });
        ch.participants.clear();
        voiceChannels.delete(channelId);
        channelMutedUsers.delete(channelId);
        broadcastChannelList();
        console.log(`[VOICE] Admin ${socket.data.username} deleted channel: ${channelId}`);
    });

    socket.on("voice:admin-kick", async ({ channelId, targetUsername }) => {
        if (!socket.data.isAdmin) return socket.emit("voice:error", { message: "Admin only" });
        const ch = voiceChannels.get(channelId);
        if (!ch) return;

        ch.participants.forEach((p, socketId) => {
            if (p.username === targetUsername) {
                const s = io.sockets.sockets.get(socketId);
                if (s) {
                    s.leave(`voice:${channelId}`);
                    s.data.voiceChannel = null;
                    s.emit("voice:kicked", { reason: "Kicked by admin" });
                }
                ch.participants.delete(socketId);
            }
        });

        broadcastChannelParticipants(channelId);
        broadcastChannelList();
        console.log(`[VOICE] Admin ${socket.data.username} kicked ${targetUsername} from ${channelId}`);
    });

    socket.on("voice:admin-mute", async ({ channelId, targetUsername, muted }) => {
        if (!socket.data.isAdmin) return socket.emit("voice:error", { message: "Admin only" });
        const ch = voiceChannels.get(channelId);
        if (!ch) return;

        if (!channelMutedUsers.has(channelId)) channelMutedUsers.set(channelId, new Set());
        const mutedSet = channelMutedUsers.get(channelId);

        if (muted) {
            mutedSet.add(targetUsername);
        } else {
            mutedSet.delete(targetUsername);
        }

        // Find participant and update
        ch.participants.forEach((p, socketId) => {
            if (p.username === targetUsername) {
                p.muted = muted;
                if (muted) p.speaking = false;
                const s = io.sockets.sockets.get(socketId);
                if (s) s.emit("voice:admin-muted", { muted });
            }
        });

        broadcastChannelParticipants(channelId);
        console.log(`[VOICE] Admin ${socket.data.username} ${muted ? "muted" : "unmuted"} ${targetUsername} in ${channelId}`);
    });

    socket.on("voice:admin-timeout", async ({ channelId, targetUsername, duration }) => {
        if (!socket.data.isAdmin) return socket.emit("voice:error", { message: "Admin only" });
        const ch = voiceChannels.get(channelId);
        if (!ch) return;

        const until = new Date(Date.now() + (duration || 300) * 1000); // default 5 min

        try {
            const usersCol = mongoose.connection.db.collection("users");
            await usersCol.updateOne(
                { username: targetUsername },
                { $set: { voiceChatBanned: true, voiceChatBannedUntil: until, voiceChatBannedReason: `Timeout by ${socket.data.username}` } }
            );
        } catch (err) {
            console.error("[VOICE] Timeout DB error:", err.message);
        }

        // Kick them from the channel
        ch.participants.forEach((p, socketId) => {
            if (p.username === targetUsername) {
                const s = io.sockets.sockets.get(socketId);
                if (s) {
                    s.leave(`voice:${channelId}`);
                    s.data.voiceChannel = null;
                    s.emit("voice:kicked", { reason: `Timed out for ${Math.round(duration / 60) || 5} minutes` });
                }
                ch.participants.delete(socketId);
            }
        });

        broadcastChannelParticipants(channelId);
        broadcastChannelList();
        io.emit("voice:user-timeout", { username: targetUsername, until: until.toISOString() });
        console.log(`[VOICE] Admin ${socket.data.username} timed out ${targetUsername} until ${until}`);
    });

    socket.on("voice:admin-ban", async ({ targetUsername }) => {
        if (!socket.data.isAdmin) return socket.emit("voice:error", { message: "Admin only" });

        try {
            const usersCol = mongoose.connection.db.collection("users");
            await usersCol.updateOne(
                { username: targetUsername },
                { $set: { voiceChatBanned: true, voiceChatBannedUntil: null, voiceChatBannedReason: `Banned by ${socket.data.username}` } }
            );
        } catch (err) {
            console.error("[VOICE] Ban DB error:", err.message);
        }

        // Kick from all channels
        voiceChannels.forEach((ch, channelId) => {
            ch.participants.forEach((p, socketId) => {
                if (p.username === targetUsername) {
                    const s = io.sockets.sockets.get(socketId);
                    if (s) {
                        s.leave(`voice:${channelId}`);
                        s.data.voiceChannel = null;
                        s.emit("voice:kicked", { reason: "Banned from voice chat" });
                    }
                    ch.participants.delete(socketId);
                }
            });
            broadcastChannelParticipants(channelId);
        });

        broadcastChannelList();
        io.emit("voice:user-banned", { username: targetUsername });
        console.log(`[VOICE] Admin ${socket.data.username} banned ${targetUsername} from voice chat`);
    });

    socket.on("voice:admin-unban", async ({ targetUsername }) => {
        if (!socket.data.isAdmin) return socket.emit("voice:error", { message: "Admin only" });

        try {
            const usersCol = mongoose.connection.db.collection("users");
            await usersCol.updateOne(
                { username: targetUsername },
                { $set: { voiceChatBanned: false, voiceChatBannedUntil: null, voiceChatBannedReason: "" } }
            );
        } catch (err) {
            console.error("[VOICE] Unban DB error:", err.message);
        }

        io.emit("voice:user-unbanned", { username: targetUsername });
        console.log(`[VOICE] Admin ${socket.data.username} unbanned ${targetUsername}`);
    });

    socket.on("voice:get-bans", async () => {
        if (!socket.data.isAdmin) return socket.emit("voice:error", { message: "Admin only" });

        try {
            const usersCol = mongoose.connection.db.collection("users");
            const banned = await usersCol.find(
                { voiceChatBanned: true },
                { projection: { username: 1, avatarUrl: 1, avatarColor: 1, voiceChatBannedUntil: 1, voiceChatBannedReason: 1 } }
            ).toArray();
            socket.emit("voice:bans-list", banned.map((u) => ({
                username: u.username,
                avatarUrl: u.avatarUrl || "",
                color: u.avatarColor || "#3b82f6",
                until: u.voiceChatBannedUntil,
                reason: u.voiceChatBannedReason || "",
            })));
        } catch (err) {
            console.error("[VOICE] Get bans error:", err.message);
        }
    });

    socket.on("disconnect", async () => {
        const { streamId, username } = socket.data || {};

        // Clean up voice channel on disconnect
        if (socket.data?.voiceChannel) {
            const ch = voiceChannels.get(socket.data.voiceChannel);
            if (ch) {
                ch.participants.delete(socket.id);
                socket.leave(`voice:${socket.data.voiceChannel}`);
                broadcastChannelParticipants(socket.data.voiceChannel);
                broadcastChannelList();
                io.to(`voice:${socket.data.voiceChannel}`).emit("voice:user-left", { username });
            }
        }

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
