require("dotenv").config();
require("./logBuffer");
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
const Connect4Game = require("./models/connect4Game");
const connect4Logic = require("./connect4Logic");
const { getAIMove: getConnect4AIMove } = require("./connect4AI");
const TictactoeGame = require("./models/tictactoeGame");
const tictactoeLogic = require("./tictactoeLogic");
const { getAIMove: getTictactoeAIMove } = require("./tictactoeAI");
const CheckersGame = require("./models/checkersGame");
const checkersLogic = require("./checkersLogic");
const { getAIMove: getCheckersAIMove } = require("./checkersAI");
const ReversiGame = require("./models/reversiGame");
const reversiLogic = require("./reversiLogic");
const { getAIMove: getReversiAIMove } = require("./reversiAI");
const BattleshipGame = require("./models/battleshipGame");
const battleshipLogic = require("./battleshipLogic");
const { getAIMove: getBattleshipAIMove } = require("./battleshipAI");
const HangmanGame = require("./models/hangmanGame");
const hangmanLogic = require("./hangmanLogic");
const { sendPushNotification } = require("./push");

let stockfishEngine = null;
let stockfishReady = false;
let stockfishBusy = false;
let stockfishResolve = null;

process.on("unhandledRejection", (err) => {
    console.error("[SF] Unhandled rejection (non-fatal):", err?.message || err);
});

async function initStockfish() {
    try {
        const sfPath = require("path").join(__dirname, "node_modules", "stockfish", "bin");
        const liteWasm = require("path").join(sfPath, "stockfish-18-lite.wasm");
        const singleWasm = require("path").join(sfPath, "stockfish-18-lite-single.wasm");

        let variant = "lite-single";
        if (require("fs").existsSync(singleWasm)) {
            variant = "lite-single";
            console.log("[SF] Using single-threaded WASM (no pthreads)");
        } else if (require("fs").existsSync(liteWasm)) {
            variant = "lite";
        } else {
            console.warn("[SF] No Stockfish WASM found, using fallback AI");
            return;
        }

        const initEngine = require("stockfish");
        const engine = initEngine(variant, function (err, eng) {
            if (err) {
                console.warn("[SF] Init error:", err.message || err, "- using fallback AI");
                return;
            }
            stockfishEngine = eng;
            stockfishEngine.sendCommand("uci");
            stockfishEngine.sendCommand("isready");
            stockfishReady = true;
            console.log("[SF] Stockfish 18 WASM ready (variant: " + variant + ")");
        });
        engine.listener = function (line) {
            if (typeof line !== "string") return;
            if (line.startsWith("bestmove")) {
                const move = line.split(" ")[1];
                stockfishBusy = false;
                if (stockfishResolve) {
                    const r = stockfishResolve;
                    stockfishResolve = null;
                    r(move);
                }
            }
        };
    } catch (err) {
        console.warn("[SF] Failed to load Stockfish:", err.message, "- using fallback AI");
    }
}

async function getAIMoveAsync(chess, difficulty) {
    const moves = chess.moves({ verbose: true });
    if (!moves.length) return null;

    const clamped = Math.min(Math.max(difficulty || 10, 1), 20);
    const fen = chess.fen();
    const timeMs = Math.round(50 + Math.pow(clamped / 4, 2) * 60);

    if (stockfishEngine && stockfishReady && !stockfishBusy) {
        stockfishBusy = true;
        try {
            console.log("[SF] Requesting move, difficulty=" + clamped + ", time=" + timeMs + "ms");
            const sfMove = await new Promise((resolve) => {
                stockfishResolve = resolve;
                stockfishEngine.sendCommand("stop");
                stockfishEngine.sendCommand("position fen " + fen);
                stockfishEngine.sendCommand("go movetime " + timeMs);
                setTimeout(() => {
                    if (stockfishResolve) {
                        const r = stockfishResolve;
                        stockfishResolve = null;
                        stockfishEngine.sendCommand("stop");
                        r(null);
                    }
                }, timeMs + 3000);
            });
            console.log("[SF] Stockfish returned:", sfMove);
            if (sfMove && sfMove !== "0000") {
                const from = sfMove.substring(0, 2);
                const to = sfMove.substring(2, 4);
                const promo = sfMove.length > 4 ? sfMove[4] : undefined;
                const moveObj = moves.find(m => m.from === from && m.to === to && (!promo || m.promotion === promo));
                if (moveObj) return moveObj;
            }
        } catch (e) {
            console.error("[SF] Move error:", e.message);
        } finally {
            stockfishBusy = false;
        }
    } else if (stockfishEngine && stockfishReady) {
        console.log("[SF] Engine busy, using fallback");
    } else {
        console.log("[SF] Engine not ready, using fallback");
    }

    // Fallback: pick best move by simple scoring
    console.log("[AI] Using fallback move picker, difficulty=" + clamped);
    const scored = moves.map((m) => {
        let s = Math.random() * (21 - clamped);
        if (m.captured) s += 10000;
        if (m.promotion) s += 50000;
        if (m.san.includes("#")) s += 1000000;
        if (m.san.includes("+")) s += 500;
        return { move: m, score: s };
    });
    scored.sort((a, b) => b.score - a.score);
    const topN = Math.max(1, Math.ceil(scored.length * (1 - clamped / 25)));
    return scored[Math.floor(Math.random() * topN)].move;
}

const app = express();
app.set('trust proxy', 1);

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

const cookieParser = require("cookie-parser");
const ALLOWED_ORIGINS = [
    "https://anontweet.vercel.app",
    "https://anontweet.duckdns.org",
    "http://localhost:3000",
    "http://localhost:3001",
];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".duckdns.org")) {
            callback(null, true);
        } else {
            callback(null, true); // allow all in dev; tighten in production
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Requested-With"],
}));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

const io = new Server(server, {
    cors: {
        origin: true,
        methods: ["GET", "POST"],
        credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    allowEIO3: true,
});

// ── MongoDB ─────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://azizahmed:I_hateyou2@localhost:27017/?authSource=admin";

mongoose.connect(MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
}).then(() => {
    console.log("[DB] MongoDB connected");
}).catch((err) => {
    console.error("[DB] MongoDB connection failed:", err.message);
    process.exit(1);
});

const { getLogs } = require("./logBuffer");

// ── HTTP Routes ─────────────────────────────────────────────────
app.get("/health", (req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
});

app.get("/api/logs", (req, res) => {
    const { level, since, limit } = req.query;
    res.json(getLogs({ level, since, limit: parseInt(limit) || 200 }));
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
            const aiMove = await getAIMoveAsync(chess, game.aiDifficulty);
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

// ── Connect Four HTTP Routes ───────────────────────────────────
app.get("/api/connect4/games", async (req, res) => {
    try {
        const { status, username } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (username) {
            filter.$or = [
                { "red.username": username },
                { "yellow.username": username },
            ];
        }
        const games = await Connect4Game.find(filter)
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        res.json({ games });
    } catch (err) {
        console.error("[C4 API] List games error:", err.message);
        res.status(500).json({ error: "Failed to fetch games" });
    }
});

app.get("/api/connect4/games/:id", async (req, res) => {
    try {
        const game = await Connect4Game.findById(req.params.id).lean();
        if (!game) return res.status(404).json({ error: "Game not found" });
        res.json({ game });
    } catch (err) {
        console.error("[C4 API] Get game error:", err.message);
        res.status(500).json({ error: "Failed to fetch game" });
    }
});

app.post("/api/connect4/games", async (req, res) => {
    try {
        const { username, avatarUrl, avatarColor, mode, aiDifficulty, inviteUser } = req.body;
        if (!username) return res.status(400).json({ error: "Username required" });

        const game = await Connect4Game.create({
            red: { username, avatarUrl: avatarUrl || "", avatarColor: avatarColor || "#ef4444" },
            mode: mode || "multiplayer",
            aiDifficulty: aiDifficulty || 3,
            invitedBy: inviteUser || "",
            status: mode === "ai" ? "active" : "waiting",
            yellow: mode === "ai" ? { username: "Computer", avatarUrl: "", avatarColor: "#eab308" } : undefined,
        });

        res.json({ game });
    } catch (err) {
        console.error("[C4 API] Create game error:", err.message);
        res.status(500).json({ error: "Failed to create game" });
    }
});

app.post("/api/connect4/games/:id/join", async (req, res) => {
    try {
        const { username, avatarUrl, avatarColor } = req.body;
        const game = await Connect4Game.findById(req.params.id);
        if (!game) return res.status(404).json({ error: "Game not found" });
        if (game.status !== "waiting") return res.status(400).json({ error: "Game already started" });
        if (game.mode === "ai") return res.status(400).json({ error: "Cannot join AI game" });
        if (game.red.username === username) return res.status(400).json({ error: "Cannot play yourself" });

        game.yellow = { username, avatarUrl: avatarUrl || "", avatarColor: avatarColor || "#eab308" };
        game.status = "active";
        await game.save();

        res.json({ game });
    } catch (err) {
        console.error("[C4 API] Join game error:", err.message);
        res.status(500).json({ error: "Failed to join game" });
    }
});

// ── Tic-Tac-Toe HTTP Routes ────────────────────────────────────
app.get("/api/tictactoe/games", async (req, res) => {
    try {
        const { status, username } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (username) filter.$or = [{ "x.username": username }, { "o.username": username }];
        const games = await TictactoeGame.find(filter).sort({ createdAt: -1 }).limit(50).lean();
        res.json({ games });
    } catch (err) {
        console.error("[TTT API] List error:", err.message);
        res.status(500).json({ error: "Failed to fetch games" });
    }
});

app.get("/api/tictactoe/games/:id", async (req, res) => {
    try {
        const game = await TictactoeGame.findById(req.params.id).lean();
        if (!game) return res.status(404).json({ error: "Game not found" });
        res.json({ game });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch game" });
    }
});

app.post("/api/tictactoe/games", async (req, res) => {
    try {
        const { username, avatarUrl, avatarColor, mode, aiDifficulty, inviteUser } = req.body;
        if (!username) return res.status(400).json({ error: "Username required" });
        const game = await TictactoeGame.create({
            x: { username, avatarUrl: avatarUrl || "", avatarColor: avatarColor || "#3b82f6" },
            mode: mode || "multiplayer",
            aiDifficulty: aiDifficulty || 3,
            invitedBy: inviteUser || "",
            status: mode === "ai" ? "active" : "waiting",
            o: mode === "ai" ? { username: "Computer", avatarUrl: "", avatarColor: "#ef4444" } : undefined,
        });
        res.json({ game });
    } catch (err) {
        console.error("[TTT API] Create error:", err.message);
        res.status(500).json({ error: "Failed to create game" });
    }
});

app.post("/api/tictactoe/games/:id/join", async (req, res) => {
    try {
        const { username, avatarUrl, avatarColor } = req.body;
        const game = await TictactoeGame.findById(req.params.id);
        if (!game) return res.status(404).json({ error: "Game not found" });
        if (game.status !== "waiting") return res.status(400).json({ error: "Game already started" });
        if (game.mode === "ai") return res.status(400).json({ error: "Cannot join AI game" });
        if (game.x.username === username) return res.status(400).json({ error: "Cannot play yourself" });
        game.o = { username, avatarUrl: avatarUrl || "", avatarColor: avatarColor || "#ef4444" };
        game.status = "active";
        await game.save();
        res.json({ game });
    } catch (err) {
        console.error("[TTT API] Join error:", err.message);
        res.status(500).json({ error: "Failed to join game" });
    }
});

// ── Checkers HTTP Routes ───────────────────────────────────────
app.get("/api/checkers/games", async (req, res) => {
    try {
        const { status, username } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (username) filter.$or = [{ "red.username": username }, { "black.username": username }];
        const games = await CheckersGame.find(filter).sort({ createdAt: -1 }).limit(50).lean();
        res.json({ games });
    } catch (err) {
        console.error("[CHK API] List error:", err.message);
        res.status(500).json({ error: "Failed to fetch games" });
    }
});

app.get("/api/checkers/games/:id", async (req, res) => {
    try {
        const game = await CheckersGame.findById(req.params.id).lean();
        if (!game) return res.status(404).json({ error: "Game not found" });
        res.json({ game });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch game" });
    }
});

app.post("/api/checkers/games", async (req, res) => {
    try {
        const { username, avatarUrl, avatarColor, mode, aiDifficulty, inviteUser } = req.body;
        if (!username) return res.status(400).json({ error: "Username required" });
        const game = await CheckersGame.create({
            red: { username, avatarUrl: avatarUrl || "", avatarColor: avatarColor || "#ef4444" },
            mode: mode || "multiplayer",
            aiDifficulty: aiDifficulty || 3,
            invitedBy: inviteUser || "",
            status: mode === "ai" ? "active" : "waiting",
            black: mode === "ai" ? { username: "Computer", avatarUrl: "", avatarColor: "#1f2937" } : undefined,
        });
        res.json({ game });
    } catch (err) {
        console.error("[CHK API] Create error:", err.message);
        res.status(500).json({ error: "Failed to create game" });
    }
});

app.post("/api/checkers/games/:id/join", async (req, res) => {
    try {
        const { username, avatarUrl, avatarColor } = req.body;
        const game = await CheckersGame.findById(req.params.id);
        if (!game) return res.status(404).json({ error: "Game not found" });
        if (game.status !== "waiting") return res.status(400).json({ error: "Game already started" });
        if (game.mode === "ai") return res.status(400).json({ error: "Cannot join AI game" });
        if (game.red.username === username) return res.status(400).json({ error: "Cannot play yourself" });
        game.black = { username, avatarUrl: avatarUrl || "", avatarColor: avatarColor || "#1f2937" };
        game.status = "active";
        await game.save();
        res.json({ game });
    } catch (err) {
        console.error("[CHK API] Join error:", err.message);
        res.status(500).json({ error: "Failed to join game" });
    }
});

// ── Reversi HTTP Routes ────────────────────────────────────────
app.get("/api/reversi/games", async (req, res) => {
    try {
        const { status, username } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (username) filter.$or = [{ "black.username": username }, { "white.username": username }];
        const games = await ReversiGame.find(filter).sort({ createdAt: -1 }).limit(50).lean();
        res.json({ games });
    } catch (err) {
        console.error("[REV API] List error:", err.message);
        res.status(500).json({ error: "Failed to fetch games" });
    }
});

app.get("/api/reversi/games/:id", async (req, res) => {
    try {
        const game = await ReversiGame.findById(req.params.id).lean();
        if (!game) return res.status(404).json({ error: "Game not found" });
        res.json({ game });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch game" });
    }
});

app.post("/api/reversi/games", async (req, res) => {
    try {
        const { username, avatarUrl, avatarColor, mode, aiDifficulty, inviteUser } = req.body;
        if (!username) return res.status(400).json({ error: "Username required" });
        const game = await ReversiGame.create({
            black: { username, avatarUrl: avatarUrl || "", avatarColor: avatarColor || "#111827" },
            mode: mode || "multiplayer",
            aiDifficulty: aiDifficulty || 3,
            invitedBy: inviteUser || "",
            status: mode === "ai" ? "active" : "waiting",
            white: mode === "ai" ? { username: "Computer", avatarUrl: "", avatarColor: "#e5e7eb" } : undefined,
        });
        res.json({ game });
    } catch (err) {
        console.error("[REV API] Create error:", err.message);
        res.status(500).json({ error: "Failed to create game" });
    }
});

app.post("/api/reversi/games/:id/join", async (req, res) => {
    try {
        const { username, avatarUrl, avatarColor } = req.body;
        const game = await ReversiGame.findById(req.params.id);
        if (!game) return res.status(404).json({ error: "Game not found" });
        if (game.status !== "waiting") return res.status(400).json({ error: "Game already started" });
        if (game.mode === "ai") return res.status(400).json({ error: "Cannot join AI game" });
        if (game.black.username === username) return res.status(400).json({ error: "Cannot play yourself" });
        game.white = { username, avatarUrl: avatarUrl || "", avatarColor: avatarColor || "#e5e7eb" };
        game.status = "active";
        await game.save();
        res.json({ game });
    } catch (err) {
        console.error("[REV API] Join error:", err.message);
        res.status(500).json({ error: "Failed to join game" });
    }
});

// ── Battleship HTTP Routes ─────────────────────────────────────
app.get("/api/battleship/games", async (req, res) => {
    try {
        const { status, username } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (username) filter.$or = [{ "p1.username": username }, { "p2.username": username }];
        const games = await BattleshipGame.find(filter).sort({ createdAt: -1 }).limit(50).lean();
        res.json({ games });
    } catch (err) {
        console.error("[BS API] List error:", err.message);
        res.status(500).json({ error: "Failed to fetch games" });
    }
});

app.get("/api/battleship/games/:id", async (req, res) => {
    try {
        const game = await BattleshipGame.findById(req.params.id).lean();
        if (!game) return res.status(404).json({ error: "Game not found" });
        const viewer = req.query.username;
        if (game.boards) {
            const sanitize = (b, revealShips) => ({
                grid: revealShips ? b.grid : b.grid.map((row) => row.map((c) => (c === "S" ? "~" : c))),
                shots: b.shots,
            });
            const mine = viewer && game.p1.username === viewer ? "p1" : viewer && game.p2.username === viewer ? "p2" : null;
            game.boards = {
                p1: sanitize(game.boards.p1, mine === "p1"),
                p2: sanitize(game.boards.p2, mine === "p2"),
            };
        }
        res.json({ game });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch game" });
    }
});

app.post("/api/battleship/games", async (req, res) => {
    try {
        const { username, avatarUrl, avatarColor, mode, aiDifficulty, inviteUser } = req.body;
        if (!username) return res.status(400).json({ error: "Username required" });
        const game = await BattleshipGame.create({
            p1: { username, avatarUrl: avatarUrl || "", avatarColor: avatarColor || "#3b82f6" },
            mode: mode || "multiplayer",
            aiDifficulty: aiDifficulty || 3,
            invitedBy: inviteUser || "",
            status: mode === "ai" ? "active" : "waiting",
            p2: mode === "ai" ? { username: "Computer", avatarUrl: "", avatarColor: "#ef4444" } : undefined,
        });
        res.json({ game });
    } catch (err) {
        console.error("[BS API] Create error:", err.message);
        res.status(500).json({ error: "Failed to create game" });
    }
});

app.post("/api/battleship/games/:id/join", async (req, res) => {
    try {
        const { username, avatarUrl, avatarColor } = req.body;
        const game = await BattleshipGame.findById(req.params.id);
        if (!game) return res.status(404).json({ error: "Game not found" });
        if (game.status !== "waiting") return res.status(400).json({ error: "Game already started" });
        if (game.mode === "ai") return res.status(400).json({ error: "Cannot join AI game" });
        if (game.p1.username === username) return res.status(400).json({ error: "Cannot play yourself" });
        game.p2 = { username, avatarUrl: avatarUrl || "", avatarColor: avatarColor || "#ef4444" };
        game.status = "active";
        await game.save();
        res.json({ game });
    } catch (err) {
        console.error("[BS API] Join error:", err.message);
        res.status(500).json({ error: "Failed to join game" });
    }
});

// ── Hangman HTTP Routes ────────────────────────────────────────
app.get("/api/hangman/games", async (req, res) => {
    try {
        const { status, username } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (username) filter.player = username;
        const games = await HangmanGame.find(filter).sort({ createdAt: -1 }).limit(50).lean();
        res.json({ games });
    } catch (err) {
        console.error("[HM API] List error:", err.message);
        res.status(500).json({ error: "Failed to fetch games" });
    }
});

app.get("/api/hangman/games/:id", async (req, res) => {
    try {
        const game = await HangmanGame.findById(req.params.id).lean();
        if (!game) return res.status(404).json({ error: "Game not found" });
        game.wordLength = (game.word || "").length;
        game.masked = (game.word || "").split("").map((c) => (game.guessed.includes(c) ? c : "")).join("|");
        if (game.status === "active") game.word = "";
        res.json({ game });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch game" });
    }
});

app.post("/api/hangman/games", async (req, res) => {
    try {
        const { username, avatarUrl, avatarColor, mode, aiDifficulty, inviteUser } = req.body;
        if (!username) return res.status(400).json({ error: "Username required" });
        const game = await HangmanGame.create({
            player: { username, avatarUrl: avatarUrl || "", avatarColor: avatarColor || "#3b82f6" },
            mode: mode || "ai",
            aiDifficulty: aiDifficulty || 3,
            invitedBy: inviteUser || "",
            status: "active",
        });
        res.json({ game });
    } catch (err) {
        console.error("[HM API] Create error:", err.message);
        res.status(500).json({ error: "Failed to create game" });
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
    const music = io._voiceMusic?.get(channelId);
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
        music: music ? {
            queue: music.queue,
            current: music.current,
            playing: music.playing,
            position: music.playing && music.startedAt ? (Date.now() - music.startedAt) / 1000 : music.position,
            startedAt: music.startedAt,
            dj: music.dj,
            volume: music.volume,
            videoId: music.current?.videoId || null,
        } : null,
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
    if (username) socket.join(username);
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

        // Send current music state to the joiner
        if (io._voiceMusic?.has(channelId)) {
            broadcastMusicState(channelId);
        }

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

        // Transfer DJ if the leaving user was the DJ
        if (io._voiceMusic && participant) {
            const musicState = io._voiceMusic.get(channelId);
            if (musicState && musicState.dj === participant.username) {
                const remaining = Array.from(ch.participants.values());
                if (remaining.length > 0) {
                    musicState.dj = remaining[0].username;
                } else {
                    musicState.dj = null;
                    musicState.playing = false;
                    musicState.queue = [];
                    musicState.current = null;
                    musicState.position = 0;
                    musicState.startedAt = null;
                }
                broadcastMusicState(channelId);
            }
        }

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
        if (io._voiceMusic) io._voiceMusic.delete(channelId);
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
                const aiDelay = 500 + Math.floor(Math.random() * 1500);
                setTimeout(async () => {
                    try {
                        console.log("[AI] Making AI move for game " + gameId);
                        const latest = await ChessGame.findById(gameId);
                        if (!latest || latest.status !== "active") {
                            console.log("[AI] Game no longer active, skipping");
                            return;
                        }

                        const aiChess = new Chess(latest.fen);
                        const aiMove = await getAIMoveAsync(aiChess, latest.aiDifficulty);
                        if (!aiMove) {
                            console.log("[AI] No move returned!");
                            return;
                        }

                        const aiResult = aiChess.move(aiMove);
                        if (!aiResult) return;

                        const aiNow = new Date();
                        latest.fen = aiChess.fen();
                        latest.turn = aiChess.turn();
                        latest.moves.push({
                            from: aiResult.from, to: aiResult.to, san: aiResult.san, fen: latest.fen,
                            notation: aiResult.san, timestamp: aiNow, thinkingMs: 0,
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

    // ── Connect Four Socket Events ────────────────────────────────
    socket.on("connect4:join-game", ({ gameId }) => {
        socket.join(`connect4:${gameId}`);
        socket.data.connect4GameId = gameId;
        console.log(`[C4] ${username} joined game room ${gameId}`);
    });

    socket.on("connect4:leave-game", ({ gameId }) => {
        socket.leave(`connect4:${gameId}`);
        socket.data.connect4GameId = null;
    });

    function finalizeConnect4(game, moveResult, color) {
        if (moveResult.win) {
            game.status = "win";
            game.winner = color === "r" ? game.red.username : game.yellow.username;
            game.result = color === "r" ? "1-0" : "0-1";
            game.resultReason = "Four in a row";
            game.winningCells = moveResult.win;
        } else if (connect4Logic.isBoardFull(moveResult.board)) {
            game.status = "draw";
            game.result = "1/2-1/2";
            game.resultReason = "Board full";
        } else {
            game.status = "active";
            game.result = "*";
        }
    }

    socket.on("connect4:make-move", async ({ gameId, column }) => {
        try {
            const game = await Connect4Game.findById(gameId);
            if (!game || game.status !== "active") {
                return socket.emit("connect4:error", { message: "Game not active" });
            }

            const playerColor = game.red.username === username ? "r" : game.yellow.username === username ? "y" : null;
            const isAIGame = game.mode === "ai";

            if (!playerColor) return socket.emit("connect4:error", { message: "Not a player" });
            if (game.turn !== playerColor) return socket.emit("connect4:error", { message: "Not your turn" });

            const board = game.board.map((row) => row.map((c) => c || null));
            const moveResult = connect4Logic.applyMove(board, column, playerColor);
            if (!moveResult) return socket.emit("connect4:error", { message: "Column full" });

            game.board = moveResult.board;
            game.turn = playerColor === "r" ? "y" : "r";
            game.moves.push({ column, row: moveResult.row, color: playerColor, timestamp: new Date() });
            finalizeConnect4(game, moveResult, playerColor);
            await game.save();

            io.to(`connect4:${gameId}`).emit("connect4:move", {
                gameId,
                board: game.board,
                turn: game.turn,
                move: { column, row: moveResult.row, color: playerColor },
                status: game.status,
                result: game.result,
                resultReason: game.resultReason,
                winner: game.winner,
                winningCells: game.winningCells,
                moves: game.moves,
            });

            if (isAIGame && game.status === "active" && game.turn === "y") {
                const aiDelay = 500 + Math.floor(Math.random() * 900);
                setTimeout(async () => {
                    try {
                        const latest = await Connect4Game.findById(gameId);
                        if (!latest || latest.status !== "active" || latest.turn !== "y") return;

                        const aiBoard = latest.board.map((row) => row.map((c) => c || null));
                        const aiCol = getConnect4AIMove(aiBoard, "y", latest.aiDifficulty);
                        if (aiCol == null) return;

                        const aiResult = connect4Logic.applyMove(aiBoard, aiCol, "y");
                        if (!aiResult) return;

                        latest.board = aiResult.board;
                        latest.turn = "r";
                        latest.moves.push({ column: aiCol, row: aiResult.row, color: "y", timestamp: new Date() });
                        finalizeConnect4(latest, aiResult, "y");
                        await latest.save();

                        io.to(`connect4:${gameId}`).emit("connect4:move", {
                            gameId,
                            board: latest.board,
                            turn: latest.turn,
                            move: { column: aiCol, row: aiResult.row, color: "y" },
                            status: latest.status,
                            result: latest.result,
                            resultReason: latest.resultReason,
                            winner: latest.winner,
                            winningCells: latest.winningCells,
                            moves: latest.moves,
                        });
                    } catch (err) {
                        console.error("[C4] AI move error:", err.message);
                    }
                }, aiDelay);
            }
        } catch (err) {
            console.error("[C4] Move error:", err.message);
            socket.emit("connect4:error", { message: "Move failed" });
        }
    });

    socket.on("connect4:resign", async ({ gameId }) => {
        try {
            const game = await Connect4Game.findById(gameId);
            if (!game || game.status !== "active") return;

            const playerColor = game.red.username === username ? "r" : game.yellow.username === username ? "y" : null;
            if (!playerColor) return;

            game.status = "resigned";
            game.winner = playerColor === "r" ? game.yellow.username : game.red.username;
            game.result = playerColor === "r" ? "0-1" : "1-0";
            game.resultReason = "Resignation";
            await game.save();

            io.to(`connect4:${gameId}`).emit("connect4:game-over", {
                gameId,
                status: game.status,
                result: game.result,
                resultReason: game.resultReason,
                winner: game.winner,
            });
        } catch (err) {
            console.error("[C4] Resign error:", err.message);
        }
    });

    socket.on("connect4:chat", async ({ gameId, text, color, avatarUrl }) => {
        if (!text?.trim()) return;
        try {
            const game = await Connect4Game.findById(gameId);
            if (!game) return;
            const msg = {
                username,
                color: color || "#3b82f6",
                avatarUrl: avatarUrl || "",
                text: text.trim().slice(0, 500),
                createdAt: new Date(),
            };
            game.chat.push(msg);
            if (game.chat.length > 200) game.chat = game.chat.slice(-200);
            await game.save();
            io.to(`connect4:${gameId}`).emit("connect4:chat", msg);
        } catch (err) {
            console.error("[C4] Chat error:", err.message);
        }
    });

    // ── Tic-Tac-Toe Socket Events ─────────────────────────────────
    socket.on("tictactoe:join-game", ({ gameId }) => {
        socket.join(`tictactoe:${gameId}`);
    });
    socket.on("tictactoe:leave-game", ({ gameId }) => {
        socket.leave(`tictactoe:${gameId}`);
    });

    function finalizeTictactoe(game, board) {
        const result = tictactoeLogic.checkWinner(board);
        if (result) {
            game.status = "win";
            game.winner = result.winner === "x" ? game.x.username : game.o.username;
            game.result = result.winner === "x" ? "1-0" : "0-1";
            game.resultReason = "Three in a row";
            game.winningLine = result.line;
        } else if (tictactoeLogic.isFull(board)) {
            game.status = "draw";
            game.result = "1/2-1/2";
            game.resultReason = "Board full";
        } else {
            game.status = "active";
            game.result = "*";
        }
    }

    socket.on("tictactoe:make-move", async ({ gameId, cell }) => {
        try {
            const game = await TictactoeGame.findById(gameId);
            if (!game || game.status !== "active") return socket.emit("tictactoe:error", { message: "Game not active" });

            const playerMark = game.x.username === username ? "x" : game.o.username === username ? "o" : null;
            if (!playerMark) return socket.emit("tictactoe:error", { message: "Not a player" });
            if (game.turn !== playerMark) return socket.emit("tictactoe:error", { message: "Not your turn" });
            if (cell < 0 || cell > 8 || game.board[cell]) return socket.emit("tictactoe:error", { message: "Invalid move" });

            const board = game.board.slice();
            board[cell] = playerMark;
            game.board = board;
            game.turn = playerMark === "x" ? "o" : "x";
            game.moveCount += 1;
            finalizeTictactoe(game, board);
            await game.save();

            io.to(`tictactoe:${gameId}`).emit("tictactoe:move", {
                gameId, board: game.board, turn: game.turn, cell,
                status: game.status, result: game.result, resultReason: game.resultReason,
                winner: game.winner, winningLine: game.winningLine, moveCount: game.moveCount,
            });

            if (game.mode === "ai" && game.status === "active" && game.turn === "o") {
                setTimeout(async () => {
                    try {
                        const latest = await TictactoeGame.findById(gameId);
                        if (!latest || latest.status !== "active" || latest.turn !== "o") return;
                        const aiCell = getTictactoeAIMove(latest.board.slice(), "o", latest.aiDifficulty);
                        if (aiCell == null) return;
                        const aiBoard = latest.board.slice();
                        aiBoard[aiCell] = "o";
                        latest.board = aiBoard;
                        latest.turn = "x";
                        latest.moveCount += 1;
                        finalizeTictactoe(latest, aiBoard);
                        await latest.save();
                        io.to(`tictactoe:${gameId}`).emit("tictactoe:move", {
                            gameId, board: latest.board, turn: latest.turn, cell: aiCell,
                            status: latest.status, result: latest.result, resultReason: latest.resultReason,
                            winner: latest.winner, winningLine: latest.winningLine, moveCount: latest.moveCount,
                        });
                    } catch (err) {
                        console.error("[TTT] AI error:", err.message);
                    }
                }, 400 + Math.floor(Math.random() * 500));
            }
        } catch (err) {
            console.error("[TTT] Move error:", err.message);
            socket.emit("tictactoe:error", { message: "Move failed" });
        }
    });

    socket.on("tictactoe:resign", async ({ gameId }) => {
        try {
            const game = await TictactoeGame.findById(gameId);
            if (!game || game.status !== "active") return;
            const mark = game.x.username === username ? "x" : game.o.username === username ? "o" : null;
            if (!mark) return;
            game.status = "resigned";
            game.winner = mark === "x" ? game.o.username : game.x.username;
            game.result = mark === "x" ? "0-1" : "1-0";
            game.resultReason = "Resignation";
            await game.save();
            io.to(`tictactoe:${gameId}`).emit("tictactoe:game-over", {
                gameId, status: game.status, result: game.result, resultReason: game.resultReason, winner: game.winner,
            });
        } catch (err) {
            console.error("[TTT] Resign error:", err.message);
        }
    });

    socket.on("tictactoe:chat", async ({ gameId, text, color, avatarUrl }) => {
        if (!text?.trim()) return;
        try {
            const game = await TictactoeGame.findById(gameId);
            if (!game) return;
            const msg = { username, color: color || "#3b82f6", avatarUrl: avatarUrl || "", text: text.trim().slice(0, 500), createdAt: new Date() };
            game.chat.push(msg);
            if (game.chat.length > 200) game.chat = game.chat.slice(-200);
            await game.save();
            io.to(`tictactoe:${gameId}`).emit("tictactoe:chat", msg);
        } catch (err) {
            console.error("[TTT] Chat error:", err.message);
        }
    });

    // ── Checkers Socket Events ────────────────────────────────────
    socket.on("checkers:join-game", ({ gameId }) => {
        socket.join(`checkers:${gameId}`);
    });
    socket.on("checkers:leave-game", ({ gameId }) => {
        socket.leave(`checkers:${gameId}`);
    });

    function finalizeCheckers(game, board, colorToMove) {
        const winner = checkersLogic.getWinner(board, colorToMove);
        if (winner) {
            game.status = "win";
            game.winner = winner === "r" ? game.red.username : game.black.username;
            game.result = winner === "r" ? "1-0" : "0-1";
            game.resultReason = "No moves left";
        } else {
            game.status = "active";
            game.result = "*";
        }
    }

    socket.on("checkers:make-move", async ({ gameId, path }) => {
        try {
            const game = await CheckersGame.findById(gameId);
            if (!game || game.status !== "active") return socket.emit("checkers:error", { message: "Game not active" });

            const playerColor = game.red.username === username ? "r" : game.black.username === username ? "b" : null;
            if (!playerColor) return socket.emit("checkers:error", { message: "Not a player" });
            if (game.turn !== playerColor) return socket.emit("checkers:error", { message: "Not your turn" });

            const board = game.board.map((row) => row.map((c) => c || null));
            const result = checkersLogic.applyMove(board, path, playerColor);
            if (!result) return socket.emit("checkers:error", { message: "Illegal move" });

            game.board = result.board;
            game.turn = playerColor === "r" ? "b" : "r";
            game.moveCount += 1;
            game.lastMove = { path, captures: result.captures };
            finalizeCheckers(game, result.board, game.turn);
            await game.save();

            io.to(`checkers:${gameId}`).emit("checkers:move", {
                gameId, board: game.board, turn: game.turn, lastMove: game.lastMove,
                status: game.status, result: game.result, resultReason: game.resultReason,
                winner: game.winner, moveCount: game.moveCount,
            });

            if (game.mode === "ai" && game.status === "active" && game.turn === "b") {
                setTimeout(async () => {
                    try {
                        const latest = await CheckersGame.findById(gameId);
                        if (!latest || latest.status !== "active" || latest.turn !== "b") return;
                        const aiBoard = latest.board.map((row) => row.map((c) => c || null));
                        const aiPath = getCheckersAIMove(aiBoard, "b", latest.aiDifficulty);
                        if (!aiPath) return;
                        const aiResult = checkersLogic.applyMove(aiBoard, aiPath, "b");
                        if (!aiResult) return;
                        latest.board = aiResult.board;
                        latest.turn = "r";
                        latest.moveCount += 1;
                        latest.lastMove = { path: aiPath, captures: aiResult.captures };
                        finalizeCheckers(latest, aiResult.board, latest.turn);
                        await latest.save();
                        io.to(`checkers:${gameId}`).emit("checkers:move", {
                            gameId, board: latest.board, turn: latest.turn, lastMove: latest.lastMove,
                            status: latest.status, result: latest.result, resultReason: latest.resultReason,
                            winner: latest.winner, moveCount: latest.moveCount,
                        });
                    } catch (err) {
                        console.error("[CHK] AI error:", err.message);
                    }
                }, 500 + Math.floor(Math.random() * 700));
            }
        } catch (err) {
            console.error("[CHK] Move error:", err.message);
            socket.emit("checkers:error", { message: "Move failed" });
        }
    });

    socket.on("checkers:resign", async ({ gameId }) => {
        try {
            const game = await CheckersGame.findById(gameId);
            if (!game || game.status !== "active") return;
            const color = game.red.username === username ? "r" : game.black.username === username ? "b" : null;
            if (!color) return;
            game.status = "resigned";
            game.winner = color === "r" ? game.black.username : game.red.username;
            game.result = color === "r" ? "0-1" : "1-0";
            game.resultReason = "Resignation";
            await game.save();
            io.to(`checkers:${gameId}`).emit("checkers:game-over", {
                gameId, status: game.status, result: game.result, resultReason: game.resultReason, winner: game.winner,
            });
        } catch (err) {
            console.error("[CHK] Resign error:", err.message);
        }
    });

    socket.on("checkers:chat", async ({ gameId, text, color, avatarUrl }) => {
        if (!text?.trim()) return;
        try {
            const game = await CheckersGame.findById(gameId);
            if (!game) return;
            const msg = { username, color: color || "#3b82f6", avatarUrl: avatarUrl || "", text: text.trim().slice(0, 500), createdAt: new Date() };
            game.chat.push(msg);
            if (game.chat.length > 200) game.chat = game.chat.slice(-200);
            await game.save();
            io.to(`checkers:${gameId}`).emit("checkers:chat", msg);
        } catch (err) {
            console.error("[CHK] Chat error:", err.message);
        }
    });

    // ── Reversi Socket Events ──────────────────────────────────────
    socket.on("reversi:join-game", ({ gameId }) => { socket.join(`reversi:${gameId}`); });
    socket.on("reversi:leave-game", ({ gameId }) => { socket.leave(`reversi:${gameId}`); });

    function finalizeReversi(game) {
        const board = game.board.map((row) => row.map((c) => c || null));
        const canB = reversiLogic.hasAnyMove(board, "b");
        const canW = reversiLogic.hasAnyMove(board, "w");
        if (!canB && !canW) {
            const w = reversiLogic.getWinner(board);
            game.status = w === "draw" ? "draw" : "win";
            if (w === "draw") { game.result = "1/2-1/2"; game.resultReason = "Board full"; }
            else {
                game.winner = w === "b" ? game.black.username : game.white.username;
                game.result = w === "b" ? "1-0" : "0-1";
                game.resultReason = "Most discs";
            }
            return true;
        }
        return false;
    }

    async function reversiAdvanceTurn(game) {
        const board = game.board.map((row) => row.map((c) => c || null));
        const nextColor = game.turn === "b" ? "w" : "b";
        if (reversiLogic.hasAnyMove(board, nextColor)) game.turn = nextColor;
    }

    socket.on("reversi:make-move", async ({ gameId, r, c }) => {
        try {
            const game = await ReversiGame.findById(gameId);
            if (!game || game.status !== "active") return socket.emit("reversi:error", { message: "Game not active" });
            const color = game.black.username === username ? "b" : game.white.username === username ? "w" : null;
            if (!color) return socket.emit("reversi:error", { message: "Not a player" });
            if (game.turn !== color) return socket.emit("reversi:error", { message: "Not your turn" });

            const board = game.board.map((row) => row.map((cc) => cc || null));
            const applied = reversiLogic.applyMove(board, { r, c }, color);
            if (!applied) return socket.emit("reversi:error", { message: "Illegal move" });

            game.board = applied.board;
            game.moveCount += 1;
            game.lastMove = { r, c, color, flips: applied.flips };
            await reversiAdvanceTurn(game);
            const over = finalizeReversi(game);
            await game.save();

            io.to(`reversi:${gameId}`).emit("reversi:move", {
                gameId, board: game.board, turn: game.turn, lastMove: game.lastMove,
                status: game.status, result: game.result, resultReason: game.resultReason,
                winner: game.winner, moveCount: game.moveCount,
            });

            if (!over && game.mode === "ai" && game.status === "active") {
                const aiLoop = async () => {
                    const latest = await ReversiGame.findById(gameId);
                    if (!latest || latest.status !== "active" || latest.turn !== "w") return;
                    const aiBoard = latest.board.map((row) => row.map((cc) => cc || null));
                    const aiMove = getReversiAIMove(aiBoard, "w", latest.aiDifficulty);
                    if (!aiMove) return;
                    const aiApplied = reversiLogic.applyMove(aiBoard, aiMove, "w");
                    if (!aiApplied) return;
                    latest.board = aiApplied.board;
                    latest.moveCount += 1;
                    latest.lastMove = { r: aiMove.r, c: aiMove.c, color: "w", flips: aiApplied.flips };
                    await reversiAdvanceTurn(latest);
                    finalizeReversi(latest);
                    await latest.save();
                    io.to(`reversi:${gameId}`).emit("reversi:move", {
                        gameId, board: latest.board, turn: latest.turn, lastMove: latest.lastMove,
                        status: latest.status, result: latest.result, resultReason: latest.resultReason,
                        winner: latest.winner, moveCount: latest.moveCount,
                    });
                    if (latest.status === "active" && latest.turn === "w") setTimeout(aiLoop, 600);
                };
                setTimeout(aiLoop, 500 + Math.floor(Math.random() * 600));
            }
        } catch (err) {
            console.error("[REV] Move error:", err.message);
            socket.emit("reversi:error", { message: "Move failed" });
        }
    });

    socket.on("reversi:resign", async ({ gameId }) => {
        try {
            const game = await ReversiGame.findById(gameId);
            if (!game || game.status !== "active") return;
            const color = game.black.username === username ? "b" : game.white.username === username ? "w" : null;
            if (!color) return;
            game.status = "resigned";
            game.winner = color === "b" ? game.white.username : game.black.username;
            game.result = color === "b" ? "0-1" : "1-0";
            game.resultReason = "Resignation";
            await game.save();
            io.to(`reversi:${gameId}`).emit("reversi:game-over", { gameId, status: game.status, result: game.result, resultReason: game.resultReason, winner: game.winner });
        } catch (err) {
            console.error("[REV] Resign error:", err.message);
        }
    });

    socket.on("reversi:chat", async ({ gameId, text, color, avatarUrl }) => {
        if (!text?.trim()) return;
        try {
            const game = await ReversiGame.findById(gameId);
            if (!game) return;
            const msg = { username, color: color || "#3b82f6", avatarUrl: avatarUrl || "", text: text.trim().slice(0, 500), createdAt: new Date() };
            game.chat.push(msg);
            if (game.chat.length > 200) game.chat = game.chat.slice(-200);
            await game.save();
            io.to(`reversi:${gameId}`).emit("reversi:chat", msg);
        } catch (err) {
            console.error("[REV] Chat error:", err.message);
        }
    });

    // ── Battleship Socket Events ───────────────────────────────────
    socket.on("battleship:join-game", ({ gameId }) => { socket.join(`battleship:${gameId}`); });
    socket.on("battleship:leave-game", ({ gameId }) => { socket.leave(`battleship:${gameId}`); });

    socket.on("battleship:fire", async ({ gameId, r, c }) => {
        try {
            const game = await BattleshipGame.findById(gameId);
            if (!game || game.status !== "active") return socket.emit("battleship:error", { message: "Game not active" });
            const me = game.p1.username === username ? "p1" : game.p2.username === username ? "p2" : null;
            if (!me) return socket.emit("battleship:error", { message: "Not a player" });
            if (game.turn !== me) return socket.emit("battleship:error", { message: "Not your turn" });

            const target = me === "p1" ? "p2" : "p1";
            const boards = game.boards;
            const result = battleshipLogic.applyShot(boards[target], r, c);
            if (result.error) return socket.emit("battleship:error", { message: result.error });

            game.moveCount += 1;
            game.lastShot = { by: me, r, c, hit: result.hit };
            game.markModified("boards");

            if (result.sunk) {
                game.status = "win";
                game.winner = me === "p1" ? game.p1.username : game.p2.username;
                game.result = me === "p1" ? "1-0" : "0-1";
                game.resultReason = "Fleet destroyed";
            } else if (!result.hit) {
                game.turn = target;
            }
            await game.save();

            io.to(`battleship:${gameId}`).emit("battleship:shot", {
                gameId, target, r, c, hit: result.hit, turn: game.turn,
                status: game.status, result: game.result, resultReason: game.resultReason,
                winner: game.winner, moveCount: game.moveCount,
                p1Shots: game.boards.p1.shots, p2Shots: game.boards.p2.shots,
            });

            if (game.mode === "ai" && game.status === "active" && game.turn === "p2") {
                const aiLoop = async () => {
                    const latest = await BattleshipGame.findById(gameId);
                    if (!latest || latest.status !== "active" || latest.turn !== "p2") return;
                    const aiShot = getBattleshipAIMove(latest.boards.p1, latest.aiDifficulty);
                    if (!aiShot) return;
                    const aiRes = battleshipLogic.applyShot(latest.boards.p1, aiShot[0], aiShot[1]);
                    if (aiRes.error) return;
                    latest.moveCount += 1;
                    latest.lastShot = { by: "p2", r: aiShot[0], c: aiShot[1], hit: aiRes.hit };
                    latest.markModified("boards");
                    if (aiRes.sunk) {
                        latest.status = "win";
                        latest.winner = latest.p2.username;
                        latest.result = "0-1";
                        latest.resultReason = "Fleet destroyed";
                    } else if (!aiRes.hit) {
                        latest.turn = "p1";
                    }
                    await latest.save();
                    io.to(`battleship:${gameId}`).emit("battleship:shot", {
                        gameId, target: "p1", r: aiShot[0], c: aiShot[1], hit: aiRes.hit, turn: latest.turn,
                        status: latest.status, result: latest.result, resultReason: latest.resultReason,
                        winner: latest.winner, moveCount: latest.moveCount,
                        p1Shots: latest.boards.p1.shots, p2Shots: latest.boards.p2.shots,
                    });
                    if (latest.status === "active" && latest.turn === "p2") setTimeout(aiLoop, 700);
                };
                setTimeout(aiLoop, 600 + Math.floor(Math.random() * 600));
            }
        } catch (err) {
            console.error("[BS] Fire error:", err.message);
            socket.emit("battleship:error", { message: "Shot failed" });
        }
    });

    socket.on("battleship:resign", async ({ gameId }) => {
        try {
            const game = await BattleshipGame.findById(gameId);
            if (!game || game.status !== "active") return;
            const me = game.p1.username === username ? "p1" : game.p2.username === username ? "p2" : null;
            if (!me) return;
            game.status = "resigned";
            game.winner = me === "p1" ? game.p2.username : game.p1.username;
            game.result = me === "p1" ? "0-1" : "1-0";
            game.resultReason = "Resignation";
            await game.save();
            io.to(`battleship:${gameId}`).emit("battleship:game-over", { gameId, status: game.status, result: game.result, resultReason: game.resultReason, winner: game.winner });
        } catch (err) {
            console.error("[BS] Resign error:", err.message);
        }
    });

    socket.on("battleship:chat", async ({ gameId, text, color, avatarUrl }) => {
        if (!text?.trim()) return;
        try {
            const game = await BattleshipGame.findById(gameId);
            if (!game) return;
            const msg = { username, color: color || "#3b82f6", avatarUrl: avatarUrl || "", text: text.trim().slice(0, 500), createdAt: new Date() };
            game.chat.push(msg);
            if (game.chat.length > 200) game.chat = game.chat.slice(-200);
            await game.save();
            io.to(`battleship:${gameId}`).emit("battleship:chat", msg);
        } catch (err) {
            console.error("[BS] Chat error:", err.message);
        }
    });

    // ── Hangman Socket Events ──────────────────────────────────────
    socket.on("hangman:join-game", ({ gameId }) => { socket.join(`hangman:${gameId}`); });
    socket.on("hangman:leave-game", ({ gameId }) => { socket.leave(`hangman:${gameId}`); });

    socket.on("hangman:guess", async ({ gameId, letter }) => {
        try {
            const game = await HangmanGame.findById(gameId);
            if (!game || game.status !== "active") return socket.emit("hangman:error", { message: "Game not active" });
            if (game.player.username !== username) return socket.emit("hangman:error", { message: "Not a player" });

            const result = hangmanLogic.applyGuess(game.word, game.guessed, letter);
            if (result.error) return socket.emit("hangman:error", { message: result.error });

            game.guessed = result.guessed;
            if (!result.correct) game.wrong += 1;
            game.moveCount += 1;

            if (result.won) {
                game.status = "win";
                game.winner = game.player.username;
                game.result = "1-0";
                game.resultReason = "Word solved";
            } else if (game.wrong >= hangmanLogic.MAX_WRONG) {
                game.status = "loss";
                game.result = "0-1";
                game.resultReason = "Out of guesses";
            }
            await game.save();

            io.to(`hangman:${gameId}`).emit("hangman:update", {
                gameId, guessed: game.guessed, wrong: game.wrong,
                letter: result.letter, correct: result.correct,
                status: game.status, result: game.result, resultReason: game.resultReason,
                winner: game.winner, moveCount: game.moveCount,
                wordLength: game.word.length,
                masked: game.word.split("").map((c) => (game.guessed.includes(c) ? c : "")).join("|"),
                word: game.status !== "active" ? game.word : undefined,
            });
        } catch (err) {
            console.error("[HM] Guess error:", err.message);
            socket.emit("hangman:error", { message: "Guess failed" });
        }
    });

    // ── Call Signaling (1:1 + Group) ──────────────────────────────
    // Map<callId, Set<socketId>>
    if (!io._callRooms) io._callRooms = new Map();

    socket.on("call:initiate", async (data) => {
        // data: { callId, caller, recipients: string[], callType: "audio"|"video", groupId?: string }
        const { callId, caller, recipients, callType, groupId } = data;
        if (!callId || !caller) return;
        // Track this call room
        io._callRooms.set(callId, new Set([socket.id]));
        // Join the socket into the call room
        socket.join(`call:${callId}`);
        // Notify each recipient
        recipients.forEach(r => {
            io.to(r).emit("call:incoming", { callId, caller, callType, groupId, recipients });
        });
        // Persist call session
        try {
            const CallSession = require("../models/callSession").default || require("../models/callSession");
            await CallSession.create({ callId, type: groupId ? "group" : "1:1", groupId: groupId || null, caller, recipients, callType, status: "ringing" });
        } catch (e) { /* model may not exist on live server */ }
    });

    socket.on("call:accept", (data) => {
        // data: { callId, username }
        const { callId } = data;
        if (!callId) return;
        socket.join(`call:${callId}`);
        const room = io._callRooms.get(callId);
        if (room) room.add(socket.id);
        // Notify caller that this person accepted
        io.to(`call:${callId}`).emit("call:accepted", { callId, username: socket.data.username });
    });

    socket.on("call:reject", (data) => {
        const { callId } = data;
        if (!callId) return;
        io.to(`call:${callId}`).emit("call:rejected", { callId, username: socket.data.username });
        try {
            const CallSession = require("../models/callSession").default || require("../models/callSession");
            CallSession.updateOne({ callId }, { status: "declined", endedAt: new Date() }).catch(() => {});
        } catch (e) {}
    });

    socket.on("call:end", (data) => {
        const { callId } = data;
        if (!callId) return;
        io.to(`call:${callId}`).emit("call:ended", { callId, username: socket.data.username });
        io._callRooms?.delete(callId);
        try {
            const CallSession = require("../models/callSession").default || require("../models/callSession");
            CallSession.updateOne({ callId }, { status: "ended", endedAt: new Date() }).catch(() => {});
        } catch (e) {}
    });

    socket.on("call:signal", (data) => {
        // data: { callId, to, signal }
        const { callId, to, signal } = data;
        if (!callId || !to || !signal) return;
        io.to(to).emit("call:signal", { callId, from: socket.data.username, signal });
    });

    socket.on("call:mute", (data) => {
        const { callId, muted, deafened } = data;
        io.to(`call:${callId}`).emit("call:mute", { callId, username: socket.data.username, muted, deafened });
    });

    socket.on("call:video-toggle", (data) => {
        const { callId, videoOn } = data;
        io.to(`call:${callId}`).emit("call:video-toggle", { callId, username: socket.data.username, videoOn });
    });

    // ── Voice Music System ──────────────────────────────────────────
    // In-memory music state per channel
    if (!io._voiceMusic) io._voiceMusic = new Map();
    const getMusicState = (channelId) => {
        if (!io._voiceMusic.has(channelId)) {
            io._voiceMusic.set(channelId, {
                queue: [],
                current: null,
                playing: false,
                position: 0,
                dj: null,
                volume: 0.7,
                startedAt: null,
            });
        }
        return io._voiceMusic.get(channelId);
    };

    const broadcastMusicState = (channelId) => {
        const state = io._voiceMusic.get(channelId);
        if (!state) return;
        const pos = state.playing && state.startedAt
            ? (Date.now() - state.startedAt) / 1000
            : state.position;
        io.to(`voice:${channelId}`).emit("voice:music:state", {
            queue: state.queue,
            current: state.current,
            playing: state.playing,
            position: pos,
            startedAt: state.startedAt,
            dj: state.dj,
            volume: state.volume,
            videoId: state.current?.videoId || null,
        });
    };

    socket.on("voice:music:add", ({ channelId, song }) => {
        if (!socket.data?.voiceChannel || socket.data.voiceChannel !== channelId) return;
        const state = getMusicState(channelId);
        const entry = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            title: song.title || "Unknown",
            duration: song.duration || 0,
            thumbnail: song.thumbnail || "",
            videoId: song.videoId || "",
            addedBy: socket.data.username,
        };
        state.queue.push(entry);
        if (!state.dj) state.dj = socket.data.username;
        broadcastMusicState(channelId);
    });

    socket.on("voice:music:play", ({ channelId, songId }) => {
        if (!socket.data?.voiceChannel || socket.data.voiceChannel !== channelId) return;
        const state = getMusicState(channelId);
        if (state.dj !== socket.data.username) return;
        if (songId) {
            const idx = state.queue.findIndex((s) => s.id === songId);
            if (idx === -1) return;
            const [song] = state.queue.splice(idx, 1);
            state.current = song;
        }
        state.playing = true;
        state.position = 0;
        state.startedAt = Date.now();
        broadcastMusicState(channelId);
    });

    socket.on("voice:music:pause", ({ channelId }) => {
        if (!socket.data?.voiceChannel || socket.data.voiceChannel !== channelId) return;
        const state = getMusicState(channelId);
        if (state.dj !== socket.data.username) return;
        state.position = state.startedAt ? (Date.now() - state.startedAt) / 1000 : 0;
        state.playing = false;
        state.startedAt = null;
        broadcastMusicState(channelId);
    });

    socket.on("voice:music:skip", ({ channelId }) => {
        if (!socket.data?.voiceChannel || socket.data.voiceChannel !== channelId) return;
        const state = getMusicState(channelId);
        if (state.dj !== socket.data.username && !socket.data.isAdmin) return;
        state.current = state.queue.length > 0 ? state.queue.shift() : null;
        state.playing = !!state.current;
        state.position = 0;
        state.startedAt = state.playing ? Date.now() : null;
        broadcastMusicState(channelId);
    });

    socket.on("voice:music:remove", ({ channelId, songId }) => {
        if (!socket.data?.voiceChannel || socket.data.voiceChannel !== channelId) return;
        const state = getMusicState(channelId);
        const idx = state.queue.findIndex((s) => s.id === songId);
        if (idx === -1) return;
        if (state.queue[idx].addedBy !== socket.data.username && state.dj !== socket.data.username && !socket.data.isAdmin) return;
        state.queue.splice(idx, 1);
        broadcastMusicState(channelId);
    });

    socket.on("voice:music:volume", ({ channelId, volume }) => {
        if (!socket.data?.voiceChannel || socket.data.voiceChannel !== channelId) return;
        const state = getMusicState(channelId);
        if (state.dj !== socket.data.username) return;
        state.volume = Math.max(0, Math.min(1, volume));
        broadcastMusicState(channelId);
    });

    socket.on("voice:music:transfer-dj", ({ channelId, toUsername }) => {
        if (!socket.data?.voiceChannel || socket.data.voiceChannel !== channelId) return;
        const state = getMusicState(channelId);
        if (state.dj !== socket.data.username) return;
        state.dj = toUsername;
        broadcastMusicState(channelId);
    });

    socket.on("voice:music:clear", ({ channelId }) => {
        if (!socket.data?.voiceChannel || socket.data.voiceChannel !== channelId) return;
        const state = getMusicState(channelId);
        if (state.dj !== socket.data.username) return;
        state.queue = [];
        state.current = null;
        state.playing = false;
        state.position = 0;
        state.startedAt = null;
        broadcastMusicState(channelId);
    });

    socket.on("voice:music:get-state", ({ channelId }) => {
        if (!socket.data?.voiceChannel || socket.data.voiceChannel !== channelId) return;
        broadcastMusicState(channelId);
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

        // Clean up call rooms on disconnect
        if (io._callRooms) {
            for (const [callId, sockets] of io._callRooms) {
                if (sockets.has(socket.id)) {
                    sockets.delete(socket.id);
                    io.to(`call:${callId}`).emit("call:peer-left", { callId, username: socket.data.username });
                    if (sockets.size === 0) {
                        io._callRooms.delete(callId);
                        try { const CallSession = require("./models/callSession"); CallSession.updateOne({ callId }, { status: "ended", endedAt: new Date() }).catch(() => {}); } catch (e) {}
                    }
                }
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

// ── API Routes ───────────────────────────────────────────────────
const { apiLimiter, authLimiter } = require("./middleware/rateLimit");

app.use("/api/auth", authLimiter, require("./routes/auth"));
app.use("/api/posts", apiLimiter, require("./routes/posts"));
app.use("/api/feed", apiLimiter, require("./routes/feed"));
app.use("/api/users", apiLimiter, require("./routes/users"));
app.use("/api/admin", apiLimiter, require("./routes/admin"));
app.use("/api/messages", apiLimiter, require("./routes/messages"));
app.use("/api/groups", apiLimiter, require("./routes/groups"));
app.use("/api/stories", apiLimiter, require("./routes/stories"));
app.use("/api/search", apiLimiter, require("./routes/search"));
app.use("/api/hashtags", apiLimiter, require("./routes/hashtags"));
app.use("/api/notifications", apiLimiter, require("./routes/notifications"));
app.use("/api/typing", apiLimiter, require("./routes/typing"));
app.use("/api/push", apiLimiter, require("./routes/push"));
app.use("/api/ads", apiLimiter, require("./routes/ads"));
app.use("/api/analytics", apiLimiter, require("./routes/analytics"));
app.use("/api/chess/history", apiLimiter, require("./routes/chess"));
app.use("/api/debug", require("./routes/debug"));
app.use("/api/live", apiLimiter, require("./routes/live"));
app.use("/api/translate", apiLimiter, require("./routes/translate"));
app.use("/api/invites", apiLimiter, require("./routes/invites"));

// ── Start ───────────────────────────────────────────────────────
initStockfish().catch(() => {});

// Start Caddy reverse proxy if available
const caddyPath = path.join(__dirname, "caddy.exe");
if (fs.existsSync(caddyPath)) {
    const { spawn } = require("child_process");
    const caddy = spawn(caddyPath, ["run"], { cwd: __dirname, stdio: "ignore", detached: true });
    caddy.unref();
    console.log("[Caddy] Reverse proxy started (443 → " + PORT + ")");
}

server.listen(PORT, () => {
    console.log(`[Live Server] Running on port ${PORT}`);
    console.log(`[Live Server] CORS allowed: ${CORS_ORIGIN}`);
});
