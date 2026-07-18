require("dotenv").config();
const express = require("express");
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

const { Chess } = require("chess.js");
const LiveStream = require("./models/liveStream");
const ChessGame = require("./models/chessGame");
const { sendPushNotification } = require("./push");

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const PST = {
    p: [
         0,  0,  0,  0,  0,  0,  0,  0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
         5,  5, 10, 25, 25, 10,  5,  5,
         0,  0,  0, 20, 20,  0,  0,  0,
         5, -5,-10,  0,  0,-10, -5,  5,
         5, 10, 10,-20,-20, 10, 10,  5,
         0,  0,  0,  0,  0,  0,  0,  0,
    ],
    n: [
        -50,-40,-30,-30,-30,-30,-40,-50,
        -40,-20,  0,  0,  0,  0,-20,-40,
        -30,  0, 10, 15, 15, 10,  0,-30,
        -30,  5, 15, 20, 20, 15,  5,-30,
        -30,  0, 15, 20, 20, 15,  0,-30,
        -30,  5, 10, 15, 15, 10,  5,-30,
        -40,-20,  0,  5,  5,  0,-20,-40,
        -50,-40,-30,-30,-30,-30,-40,-50,
    ],
    b: [
        -20,-10,-10,-10,-10,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5, 10, 10,  5,  0,-10,
        -10,  5,  5, 10, 10,  5,  5,-10,
        -10,  0, 10, 10, 10, 10,  0,-10,
        -10, 10, 10, 10, 10, 10, 10,-10,
        -10,  5,  0,  0,  0,  0,  5,-10,
        -20,-10,-10,-10,-10,-10,-10,-20,
    ],
    r: [
         0,  0,  0,  0,  0,  0,  0,  0,
         5, 10, 10, 10, 10, 10, 10,  5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
         0,  0,  0,  5,  5,  0,  0,  0,
    ],
    q: [
        -20,-10,-10, -5, -5,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5,  5,  5,  5,  0,-10,
         -5,  0,  5,  5,  5,  5,  0, -5,
          0,  0,  5,  5,  5,  5,  0, -5,
        -10,  5,  5,  5,  5,  5,  0,-10,
        -10,  0,  5,  0,  0,  0,  0,-10,
        -20,-10,-10, -5, -5,-10,-10,-20,
    ],
    k: [
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20,
        -10,-20,-20,-20,-20,-20,-20,-10,
         20, 20,  0,  0,  0,  0, 20, 20,
         20, 30, 10,  0,  0, 10, 30, 20,
    ],
};

function evaluate(chess) {
    const board = chess.board();
    let score = 0;
    let wMat = 0, bMat = 0;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p) continue;
            const val = PIECE_VALUES[p.type] || 0;
            const sidx = p.color === "w" ? (7 - r) * 8 + c : r * 8 + (7 - c);
            const pst = PST[p.type];
            const pos = pst ? pst[sidx] : 0;
            if (p.color === "w") {
                score += val + pos;
                wMat += val;
            } else {
                score -= val + pos;
                bMat += val;
            }
        }
    }

    // King safety in endgame
    if (wMat < 1500 || bMat < 1500) {
        const wKing = findKing(board, "w");
        const bKing = findKing(board, "b");
        if (wKing) score += (7 - Math.abs(wKing[0] - 3.5)) * 5;
        if (bKing) score -= (7 - Math.abs(bKing[0] - 3.5)) * 5;
    }

    return score;
}

function findKing(board, color) {
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c]?.type === "k" && board[r][c]?.color === color)
                return [r, c];
    return null;
}

function orderMoves(chess, moves) {
    return moves.sort((a, b) => {
        let sa = 0, sb = 0;
        if (a.captured) sa += PIECE_VALUES[a.captured] * 10 - PIECE_VALUES[a.piece];
        if (b.captured) sb += PIECE_VALUES[b.captured] * 10 - PIECE_VALUES[b.piece];
        if (a.promotion) sa += 900;
        if (b.promotion) sb += 900;
        if (a.san.includes("#")) sa += 100000;
        if (b.san.includes("#")) sb += 100000;
        if (a.san.includes("+")) sa += 50;
        if (b.san.includes("+")) sb += 50;
        return sb - sa;
    });
}

function alphaBeta(chess, depth, alpha, beta, isMax, startTime, limitMs) {
    if (Date.now() - startTime > limitMs) return null;
    if (depth === 0 || chess.isGameOver()) {
        if (chess.isCheckmate()) return isMax ? -100000 + depth : 100000 - depth;
        if (chess.isDraw() || chess.isStalemate()) return 0;
        return evaluate(chess);
    }

    const moves = orderMoves(chess, chess.moves({ verbose: true }));

    if (isMax) {
        let best = -Infinity;
        for (const m of moves) {
            chess.move(m.san);
            const v = alphaBeta(chess, depth - 1, alpha, beta, false, startTime, limitMs);
            chess.undo();
            if (v === null) return null;
            if (v > best) best = v;
            if (v > alpha) alpha = v;
            if (beta <= alpha) break;
        }
        return best;
    } else {
        let best = Infinity;
        for (const m of moves) {
            chess.move(m.san);
            const v = alphaBeta(chess, depth - 1, alpha, beta, true, startTime, limitMs);
            chess.undo();
            if (v === null) return null;
            if (v < best) best = v;
            if (v < beta) beta = v;
            if (beta <= alpha) break;
        }
        return best;
    }
}

function getAIMove(chess, difficulty) {
    const moves = chess.moves({ verbose: true });
    if (!moves.length) return null;

    const clamped = Math.min(Math.max(difficulty || 10, 1), 20);

    // Map difficulty to search parameters
    const configs = {
        1:  { depth: 1, time: 100,  noise: 200 },
        4:  { depth: 2, time: 200,  noise: 100 },
        8:  { depth: 3, time: 500,  noise: 50 },
        12: { depth: 4, time: 1000, noise: 20 },
        16: { depth: 5, time: 2000, noise: 5 },
        20: { depth: 8, time: 4000, noise: 0 },
    };

    // Interpolate
    const keys = Object.keys(configs).map(Number).sort((a, b) => a - b);
    let cfg = configs[keys[0]];
    for (let i = 0; i < keys.length - 1; i++) {
        if (clamped >= keys[i] && clamped <= keys[i + 1]) {
            const t = (clamped - keys[i]) / (keys[i + 1] - keys[i]);
            const lo = configs[keys[i]];
            const hi = configs[keys[i + 1]];
            cfg = {
                depth: Math.round(lo.depth + (hi.depth - lo.depth) * t),
                time:  Math.round(lo.time + (hi.time - lo.time) * t),
                noise: Math.round(lo.noise + (hi.noise - lo.noise) * (1 - t)),
            };
            break;
        }
    }
    if (clamped >= keys[keys.length - 1]) cfg = configs[keys[keys.length - 1]];

    const { depth, time: limitMs, noise } = cfg;
    const startTime = Date.now();
    const isMax = chess.turn() === "w";

    let bestMove = null;
    let bestScore = -Infinity;

    // Iterative deepening
    for (let d = 1; d <= depth; d++) {
        let found = false;
        for (const move of moves) {
            if (Date.now() - startTime > limitMs) break;
            chess.move(move.san);
            const v = alphaBeta(chess, d - 1, -Infinity, Infinity, !isMax, startTime, limitMs);
            chess.undo();
            if (v === null) continue;
            found = true;
            const adjusted = v + (Math.random() - 0.5) * noise;
            if (adjusted > bestScore || !bestMove) {
                bestScore = adjusted;
                bestMove = move;
            }
        }
        if (!found) break;
    }

    if (!bestMove) {
        // Fallback: pick highest material gain
        const scored = moves.map(m => {
            let s = Math.random();
            if (m.captured) s += PIECE_VALUES[m.captured] * 10 - (PIECE_VALUES[m.piece] || 0);
            if (m.promotion) s += 900;
            if (m.san.includes("#")) s += 100000;
            if (m.san.includes("+")) s += 50;
            return { move: m, score: s };
        });
        scored.sort((a, b) => b.score - a.score);
        bestMove = scored[0].move;
    }

    return bestMove;
}

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

// ── Chess HTTP Routes ──────────────────────────────────────────
app.get("/api/chess/games", async (req, res) => {
    try {
        const { status, username } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (username) {
            filter.$or = [
                { "white.username": username },
                { "black.username": username },
            ];
        }
        const games = await ChessGame.find(filter)
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        res.json({ games });
    } catch (err) {
        console.error("[CHESS API] List games error:", err.message);
        res.status(500).json({ error: "Failed to fetch games" });
    }
});

app.get("/api/chess/games/:id", async (req, res) => {
    try {
        const game = await ChessGame.findById(req.params.id).lean();
        if (!game) return res.status(404).json({ error: "Game not found" });
        res.json({ game });
    } catch (err) {
        console.error("[CHESS API] Get game error:", err.message);
        res.status(500).json({ error: "Failed to fetch game" });
    }
});

app.post("/api/chess/games", async (req, res) => {
    try {
        const { username, avatarUrl, avatarColor, timeControl, mode, aiDifficulty, inviteUser } = req.body;
        if (!username) return res.status(400).json({ error: "Username required" });

        const initial = timeControl?.initial || 600;
        const increment = timeControl?.increment || 0;

        const game = await ChessGame.create({
            white: { username, avatarUrl: avatarUrl || "", avatarColor: avatarColor || "#3b82f6" },
            mode: mode || "multiplayer",
            aiDifficulty: aiDifficulty || 10,
            timeControl: { initial, increment },
            timers: { white: initial, black: initial },
            invitedBy: inviteUser || "",
            status: mode === "ai" ? "active" : "waiting",
            timerLastTick: mode === "ai" ? new Date() : null,
        });

        res.json({ game });
    } catch (err) {
        console.error("[CHESS API] Create game error:", err.message);
        res.status(500).json({ error: "Failed to create game" });
    }
});

app.post("/api/chess/games/:id/join", async (req, res) => {
    try {
        const { username, avatarUrl, avatarColor } = req.body;
        const game = await ChessGame.findById(req.params.id);
        if (!game) return res.status(404).json({ error: "Game not found" });
        if (game.status !== "waiting") return res.status(400).json({ error: "Game already started" });
        if (game.mode === "ai") return res.status(400).json({ error: "Cannot join AI game" });
        if (game.white.username === username) return res.status(400).json({ error: "Cannot play yourself" });

        game.black = { username, avatarUrl: avatarUrl || "", avatarColor: avatarColor || "#3b82f6" };
        game.status = "active";
        game.timerLastTick = new Date();
        await game.save();

        res.json({ game });
    } catch (err) {
        console.error("[CHESS API] Join game error:", err.message);
        res.status(500).json({ error: "Failed to join game" });
    }
});

app.post("/api/chess/games/:id/move", async (req, res) => {
    try {
        const { from, to, promotion, username } = req.body;
        const game = await ChessGame.findById(req.params.id);
        if (!game) return res.status(404).json({ error: "Game not found" });
        if (game.status !== "active") return res.status(400).json({ error: "Game not active" });

        const chess = new Chess(game.fen);
        const isWhiteTurn = chess.turn() === "w";
        const playerColor = game.white.username === username ? "w" : "b";
        const isAIMove = game.mode === "ai" && chess.turn() === "b";
        if (!isAIMove && playerColor !== (isWhiteTurn ? "w" : "b")) {
            return res.status(400).json({ error: "Not your turn" });
        }

        let moveResult;
        try {
            moveResult = chess.move({ from, to, promotion: promotion || "q" });
        } catch (e) {
            return res.status(400).json({ error: "Illegal move" });
        }
        if (!moveResult) return res.status(400).json({ error: "Illegal move" });

        if (game.timerLastTick) {
            const elapsed = (Date.now() - new Date(game.timerLastTick).getTime()) / 1000;
            const increment = game.timeControl.increment || 0;
            if (isWhiteTurn) {
                game.timers.white = Math.max(0, game.timers.white - elapsed + increment);
            } else {
                game.timers.black = Math.max(0, game.timers.black - elapsed + increment);
            }
        }

        const now = new Date();
        game.fen = chess.fen();
        game.turn = chess.turn();
        game.moves.push({
            from, to, san: moveResult.san, fen: game.fen,
            notation: moveResult.san, timestamp: now,
            thinkingMs: game.timerLastTick ? (now.getTime() - new Date(game.timerLastTick).getTime()) : 0,
        });
        game.pgn = chess.pgn();
        game.timerLastTick = now;

            const whiteName = game.white.username || "White";
            const blackName = game.mode === "ai" ? "Computer" : (game.black.username || "Black");

            if (chess.isCheckmate()) {
                game.status = "checkmate";
                game.result = isWhiteTurn ? "1-0" : "0-1";
                game.resultReason = "Checkmate";
                game.winner = isWhiteTurn ? whiteName : blackName;
            } else if (chess.isStalemate()) {
                game.status = "stalemate";
                game.result = "1/2-1/2";
                game.resultReason = "Stalemate";
            } else if (chess.isDraw()) {
                game.status = "draw";
                game.result = "1/2-1/2";
                game.resultReason = "Draw";
            } else if (game.timers.white <= 0 || game.timers.black <= 0) {
                game.status = "timeout";
                game.result = game.timers.white <= 0 ? "0-1" : "1-0";
                game.resultReason = "Timeout";
                game.winner = game.timers.white <= 0 ? blackName : whiteName;
        } else {
            game.status = "active";
            game.result = "*";
        }

        await game.save();

        if (game.mode === "ai" && game.status === "active") {
            const aiMove = getAIMove(chess, game.aiDifficulty);
            if (aiMove) {
                const aiResult = chess.move(aiMove);
                if (aiResult) {
                    const aiNow = new Date();
                    game.fen = chess.fen();
                    game.turn = chess.turn();
                    game.moves.push({
                        from: aiResult.from, to: aiResult.to, san: aiResult.san, fen: game.fen,
                        notation: aiResult.san, timestamp: aiNow, thinkingMs: 500 + Math.random() * 2000,
                    });
                    game.pgn = chess.pgn();
                    game.timerLastTick = aiNow;

                    if (chess.isCheckmate()) {
                        game.status = "checkmate";
                        game.result = "0-1";
                        game.resultReason = "Checkmate";
                        game.winner = "Computer";
                    } else if (chess.isStalemate()) {
                        game.status = "stalemate";
                        game.result = "1/2-1/2";
                        game.resultReason = "Stalemate";
                    } else if (chess.isDraw()) {
                        game.status = "draw";
                        game.result = "1/2-1/2";
                        game.resultReason = "Draw";
                    } else {
                        game.status = "active";
                        game.result = "*";
                    }
                    await game.save();
                }
            }
        }

        res.json({ game, move: moveResult });
    } catch (err) {
        console.error("[CHESS API] Move error:", err.message);
        res.status(500).json({ error: "Failed to make move" });
    }
});

app.get("/api/chess/games/:id/moves", async (req, res) => {
    try {
        const game = await ChessGame.findById(req.params.id).lean();
        if (!game) return res.status(404).json({ error: "Game not found" });
        res.json({ moves: game.moves, pgn: game.pgn });
    } catch (err) {
        console.error("[CHESS API] Get moves error:", err.message);
        res.status(500).json({ error: "Failed to fetch moves" });
    }
});

app.get("/api/chess/games/:id/chat", async (req, res) => {
    try {
        const game = await ChessGame.findById(req.params.id).lean();
        if (!game) return res.status(404).json({ error: "Game not found" });
        res.json({ chat: game.chat || [] });
    } catch (err) {
        console.error("[CHESS API] Get chat error:", err.message);
        res.status(500).json({ error: "Failed to fetch chat" });
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

        sendPushNotification({
            recipientUsername: targetUsername,
            type: "voice_kicked",
            fromUser: socket.data.username,
            text: `Kicked from #${ch.name}`,
        }).catch(() => {});
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

        sendPushNotification({
            recipientUsername: targetUsername,
            type: "voice_timeout",
            fromUser: socket.data.username,
            text: `Timed out for ${Math.round((duration || 300) / 60)} minutes`,
        }).catch(() => {});
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

        sendPushNotification({
            recipientUsername: targetUsername,
            type: "voice_banned",
            fromUser: socket.data.username,
            text: "Banned from voice chat",
        }).catch(() => {});
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

    // ── Chess Socket Events ───────────────────────────────────────
    socket.on("chess:join-game", async ({ gameId }) => {
        socket.join(`chess:${gameId}`);
        socket.data.chessGameId = gameId;
        console.log(`[CHESS] ${username} joined game room ${gameId}`);
    });

    socket.on("chess:leave-game", ({ gameId }) => {
        socket.leave(`chess:${gameId}`);
        socket.data.chessGameId = null;
    });

    socket.on("chess:make-move", async ({ gameId, from, to, promotion }) => {
        try {
            const game = await ChessGame.findById(gameId);
            if (!game || game.status !== "active") {
                return socket.emit("chess:error", { message: "Game not active" });
            }

            const chess = new Chess(game.fen);
            const isWhiteTurn = chess.turn() === "w";
            const playerColor = game.white.username === username ? "w" : "b";
            const isAIMove = game.mode === "ai" && chess.turn() === "b";

            if (!isAIMove && playerColor !== (isWhiteTurn ? "w" : "b")) {
                return socket.emit("chess:error", { message: "Not your turn" });
            }

            let moveResult;
            try {
                moveResult = chess.move({ from, to, promotion: promotion || "q" });
            } catch (e) {
                return socket.emit("chess:error", { message: "Illegal move" });
            }
            if (!moveResult) return socket.emit("chess:error", { message: "Illegal move" });

            // Update timer
            if (game.timerLastTick) {
                const elapsed = (Date.now() - new Date(game.timerLastTick).getTime()) / 1000;
                const increment = game.timeControl.increment || 0;
                if (isWhiteTurn) {
                    game.timers.white = Math.max(0, game.timers.white - elapsed + increment);
                } else {
                    game.timers.black = Math.max(0, game.timers.black - elapsed + increment);
                }
            }

            const now = new Date();
            game.fen = chess.fen();
            game.turn = chess.turn();
            game.moves.push({
                from, to, san: moveResult.san, fen: game.fen,
                notation: moveResult.san, timestamp: now,
                thinkingMs: game.timerLastTick ? (now.getTime() - new Date(game.timerLastTick).getTime()) : 0,
            });
            game.pgn = chess.pgn();
            game.timerLastTick = now;

            if (chess.isCheckmate()) {
                game.status = "checkmate";
                game.result = isWhiteTurn ? "1-0" : "0-1";
                game.resultReason = "Checkmate";
                game.winner = isWhiteTurn ? game.white.username : game.black.username;
            } else if (chess.isStalemate()) {
                game.status = "stalemate";
                game.result = "1/2-1/2";
                game.resultReason = "Stalemate";
            } else if (chess.isDraw()) {
                game.status = "draw";
                game.result = "1/2-1/2";
                game.resultReason = "Draw";
            } else if (game.timers.white <= 0 || game.timers.black <= 0) {
                game.status = "timeout";
                game.result = game.timers.white <= 0 ? "0-1" : "1-0";
                game.resultReason = "Timeout";
                game.winner = game.timers.white <= 0 ? game.black.username : game.white.username;
            } else {
                game.status = "active";
                game.result = "*";
            }

            await game.save();

            io.to(`chess:${gameId}`).emit("chess:move", {
                gameId,
                move: moveResult,
                fen: game.fen,
                turn: game.turn,
                status: game.status,
                result: game.result,
                resultReason: game.resultReason,
                winner: game.winner,
                timers: game.timers,
                moves: game.moves,
                pgn: game.pgn,
            });

            if (game.mode === "ai" && game.status === "active") {
                const aiDelay = 400 + Math.random() * 600;
                setTimeout(async () => {
                    try {
                        const latest = await ChessGame.findById(gameId);
                        if (!latest || latest.status !== "active") return;

                        const aiChess = new Chess(latest.fen);
                        const aiMove = getAIMove(aiChess, latest.aiDifficulty);
                        if (!aiMove) return;

                        const aiResult = aiChess.move(aiMove);
                        if (!aiResult) return;

                        const aiNow = new Date();
                        latest.fen = aiChess.fen();
                        latest.turn = aiChess.turn();
                        latest.moves.push({
                            from: aiResult.from, to: aiResult.to, san: aiResult.san, fen: latest.fen,
                            notation: aiResult.san, timestamp: aiNow, thinkingMs: aiDelay,
                        });
                        latest.pgn = aiChess.pgn();
                        latest.timerLastTick = aiNow;

                        if (aiChess.isCheckmate()) {
                            latest.status = "checkmate";
                            latest.result = "0-1";
                            latest.resultReason = "Checkmate";
                            latest.winner = "Computer";
                        } else if (aiChess.isStalemate()) {
                            latest.status = "stalemate";
                            latest.result = "1/2-1/2";
                            latest.resultReason = "Stalemate";
                        } else if (aiChess.isDraw()) {
                            latest.status = "draw";
                            latest.result = "1/2-1/2";
                            latest.resultReason = "Draw";
                        } else {
                            latest.status = "active";
                            latest.result = "*";
                        }

                        await latest.save();

                        io.to(`chess:${gameId}`).emit("chess:move", {
                            gameId,
                            move: aiResult,
                            fen: latest.fen,
                            turn: latest.turn,
                            status: latest.status,
                            result: latest.result,
                            resultReason: latest.resultReason,
                            winner: latest.winner,
                            timers: latest.timers,
                            moves: latest.moves,
                            pgn: latest.pgn,
                        });
                    } catch (err) {
                        console.error("[CHESS] AI move error:", err.message);
                    }
                }, aiDelay);
            }
        } catch (err) {
            console.error("[CHESS] Move error:", err.message);
            socket.emit("chess:error", { message: "Move failed" });
        }
    });

    socket.on("chess:chat", async ({ gameId, text, color, avatarUrl }) => {
        if (!text?.trim()) return;
        try {
            const game = await ChessGame.findById(gameId);
            if (!game) return;

            const msg = {
                username,
                color: color || "#3b82f6",
                avatarUrl: avatarUrl || "",
                text: text.trim(),
                createdAt: new Date(),
            };

            game.chat.push(msg);
            if (game.chat.length > 100) game.chat = game.chat.slice(-100);
            await game.save();

            io.to(`chess:${gameId}`).emit("chess:chat", {
                ...msg,
                createdAt: msg.createdAt.toISOString(),
            });
        } catch (err) {
            console.error("[CHESS] Chat error:", err.message);
        }
    });

    socket.on("chess:resign", async ({ gameId }) => {
        try {
            const game = await ChessGame.findById(gameId);
            if (!game || game.status !== "active") return;

            const isWhite = game.white.username === username;
            game.status = "resigned";
            game.result = isWhite ? "0-1" : "1-0";
            game.resultReason = "Resignation";
            game.winner = isWhite ? game.black.username : game.white.username;
            await game.save();

            io.to(`chess:${gameId}`).emit("chess:game-over", {
                gameId,
                status: game.status,
                result: game.result,
                resultReason: game.resultReason,
                winner: game.winner,
            });
        } catch (err) {
            console.error("[CHESS] Resign error:", err.message);
        }
    });

    socket.on("chess:offer-draw", ({ gameId }) => {
        io.to(`chess:${gameId}`).except(socket.id).emit("chess:draw-offer", {
            gameId,
            from: username,
        });
    });

    socket.on("chess:accept-draw", async ({ gameId }) => {
        try {
            const game = await ChessGame.findById(gameId);
            if (!game || game.status !== "active") return;

            game.status = "draw";
            game.result = "1/2-1/2";
            game.resultReason = "Draw agreed";
            await game.save();

            io.to(`chess:${gameId}`).emit("chess:game-over", {
                gameId,
                status: game.status,
                result: game.result,
                resultReason: game.resultReason,
                winner: "",
            });
        } catch (err) {
            console.error("[CHESS] Accept draw error:", err.message);
        }
    });

    socket.on("chess:decline-draw", ({ gameId }) => {
        io.to(`chess:${gameId}`).except(socket.id).emit("chess:draw-declined", {
            gameId,
            from: username,
        });
    });

    socket.on("chess:time-sync", async ({ gameId }) => {
        try {
            const game = await ChessGame.findById(gameId);
            if (!game || game.status !== "active") return;

            if (game.timerLastTick) {
                const elapsed = (Date.now() - new Date(game.timerLastTick).getTime()) / 1000;
                const timers = { ...game.timers };
                if (game.turn === "w") {
                    timers.white = Math.max(0, timers.white - elapsed);
                } else {
                    timers.black = Math.max(0, timers.black - elapsed);
                }
                socket.emit("chess:time-sync", { gameId, timers });
            }
        } catch (err) {
            console.error("[CHESS] Time sync error:", err.message);
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
