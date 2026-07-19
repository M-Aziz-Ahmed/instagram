const express = require("express");
const User = require("../models/user");

const router = express.Router();

// GET /history
router.get("/history", async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ error: "Username required" });

        const user = await User.findOne({ username }).select("chessGames").lean();
        if (!user) return res.status(404).json({ error: "User not found" });

        const games = (user.chessGames || [])
            .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt))
            .slice(0, 50);

        const stats = {
            total: games.length,
            wins: games.filter((g) =>
                (g.result === "1-0" && g.playerColor === "w") ||
                (g.result === "0-1" && g.playerColor === "b")
            ).length,
            losses: games.filter((g) =>
                (g.result === "0-1" && g.playerColor === "w") ||
                (g.result === "1-0" && g.playerColor === "b")
            ).length,
            draws: games.filter((g) => g.result === "1/2-1/2").length,
        };

        return res.json({ games, stats });
    } catch (error) {
        console.error("[CHESS HISTORY] Fetch error:", error.message);
        return res.status(500).json({ error: "Failed to fetch chess history" });
    }
});

// POST /history
router.post("/history", async (req, res) => {
    try {
        const { username, gameId, opponent, playerColor, result, resultReason, mode, moves, timeControl, gameStats } = req.body;

        if (!username || !gameId) {
            return res.status(400).json({ error: "Username and gameId required" });
        }

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: "User not found" });

        const existing = user.chessGames.find((g) => g.gameId === gameId);
        if (existing) return res.json({ message: "Game already saved" });

        user.chessGames.push({
            gameId,
            opponent: opponent || "",
            playerColor: playerColor || "w",
            result: result || "*",
            resultReason: resultReason || "",
            mode: mode || "multiplayer",
            moves: moves || 0,
            timeControl: timeControl || "",
            playedAt: new Date(),
            gameStats: gameStats || {},
        });

        if (user.chessGames.length > 200) {
            user.chessGames = user.chessGames.slice(-200);
        }

        await user.save();
        return res.json({ message: "Game saved" });
    } catch (error) {
        console.error("[CHESS HISTORY] Save error:", error.message);
        return res.status(500).json({ error: "Failed to save game" });
    }
});

module.exports = router;
