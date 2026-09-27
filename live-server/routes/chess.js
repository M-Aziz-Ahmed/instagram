const express = require("express");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// Both routes were unauthenticated and took the username from the query/body,
// so anyone could read — or, worse, rewrite — any account's chess history,
// including forging wins. The username now comes from the session.
//
// `?username=` is still accepted on GET, but only as a request to view
// *someone else's* record; writing is always self-only.

// GET /history
router.get("/history", verifyToken, async (req, res) => {
    try {
        const me = await User.findById(req.userId).select("username").lean();
        const caller = me?.username;
        if (!caller) return res.status(401).json({ error: "Unauthorized" });

        // Chess history is public-facing (the lobby shows an opponent's record),
        // so any username may be read. Absent or equal to the caller means self.
        const username = req.query.username || caller;

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
router.post("/history", verifyToken, async (req, res) => {
    try {
        const { gameId, opponent, playerColor, result, resultReason, mode, moves, timeControl, gameStats } = req.body;

        if (!gameId) {
            return res.status(400).json({ error: "gameId required" });
        }

        // Self-only. A body-supplied `username` is ignored entirely: it used to
        // be the whole basis of authorisation, so any caller could append
        // fabricated results to any account.
        const me = await User.findById(req.userId).select("username").lean();
        const username = me?.username;
        if (!username) return res.status(401).json({ error: "Unauthorized" });

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
