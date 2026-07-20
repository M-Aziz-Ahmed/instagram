const express = require("express");
const router = express.Router();
const ReactionDuelGame = require("../models/reactionduelGame");

module.exports = function (io) {
    // POST /api/reactionduel/games  -> create a new duel (creator is p1)
    router.post("/games", async (req, res) => {
        try {
            const { username, avatarUrl, avatarColor } = req.body;
            if (!username || !username.toString().trim()) {
                return res.status(400).json({ error: "Username required" });
            }
            const u = username.toString().trim();
            const game = await ReactionDuelGame.create({
                players: [{
                    username: u,
                    avatarUrl: avatarUrl || "",
                    avatarColor: avatarColor || "#3b82f6",
                }],
                status: "waiting",
                round: 1,
            });
            return res.json({ game });
        } catch (err) {
            console.error("[RD API] Create game error:", err.message);
            return res.status(500).json({ error: "Failed to create game" });
        }
    });

    // GET /api/reactionduel/games/:id -> fetch a duel
    router.get("/games/:id", async (req, res) => {
        try {
            const game = await ReactionDuelGame.findById(req.params.id).lean();
            if (!game) return res.status(404).json({ error: "Game not found" });
            res.json({ game });
        } catch (err) {
            console.error("[RD API] Get game error:", err.message);
            res.status(500).json({ error: "Failed to fetch game" });
        }
    });

    // POST /api/reactionduel/games/:id/join -> p2 joins (status -> active)
    router.post("/games/:id/join", async (req, res) => {
        try {
            const { username, avatarUrl, avatarColor } = req.body;
            if (!username || !username.toString().trim()) {
                return res.status(400).json({ error: "Username required" });
            }
            const u = username.toString().trim();
            const game = await ReactionDuelGame.findById(req.params.id);
            if (!game) return res.status(404).json({ error: "Game not found" });
            if (game.status !== "waiting") return res.status(400).json({ error: "Game already started" });
            if (game.players[0] && game.players[0].username === u) {
                return res.status(400).json({ error: "Cannot play yourself" });
            }
            game.players.push({
                username: u,
                avatarUrl: avatarUrl || "",
                avatarColor: avatarColor || "#3b82f6",
            });
            game.status = "active";
            await game.save();
            const saved = game.toObject();
            if (io) {
                io.to(`reactionduel:${game._id}`).emit("reactionduel:update", {
                    phase: "waiting",
                    status: "active",
                    players: saved.players,
                    ready: [],
                });
            }
            res.json({ game: saved });
        } catch (err) {
            console.error("[RD API] Join game error:", err.message);
            res.status(500).json({ error: "Failed to join game" });
        }
    });

    // POST /api/reactionduel/games/:id/rematch -> new duel, players swapped
    router.post("/games/:id/rematch", async (req, res) => {
        try {
            const game = await ReactionDuelGame.findById(req.params.id);
            if (!game) return res.status(404).json({ error: "Game not found" });
            const p1 = game.players[1] ? game.players[1] : game.players[0];
            const p2 = game.players[0];
            const newGame = await ReactionDuelGame.create({
                players: [
                    { username: p1.username, avatarUrl: p1.avatarUrl || "", avatarColor: p1.avatarColor || "#3b82f6" },
                    { username: p2.username, avatarUrl: p2.avatarUrl || "", avatarColor: p2.avatarColor || "#3b82f6" },
                ],
                status: "active",
                round: (game.round || 1) + 1,
            });
            if (io) {
                io.to(`reactionduel:${game._id}`).emit("reactionduel:rematch", { gameId: newGame._id });
            }
            res.json({ game: newGame });
        } catch (err) {
            console.error("[RD API] Rematch error:", err.message);
            res.status(500).json({ error: "Failed to start rematch" });
        }
    });

    return router;
};
