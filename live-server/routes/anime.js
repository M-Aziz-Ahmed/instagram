const express = require("express");
const router = express.Router();

const CONSUMET = process.env.CONSUMET_URL || "https://api.consumet.org";
const ANIME_SOURCE = "zoro";

async function safeFetch(url) {
    const res = await fetch(url, {
        headers: { "User-Agent": "AnonTweet/1.0" },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    return res.json();
}

// Search anime
router.get("/search", async (req, res) => {
    try {
        const { q, page = 1 } = req.query;
        if (!q) return res.status(400).json({ error: "Query required" });
        const data = await safeFetch(
            `${CONSUMET}/anime/${ANIME_SOURCE}/${encodeURIComponent(q)}?page=${page}`
        );
        res.json(data);
    } catch (err) {
        console.error("Anime search error:", err.message);
        res.status(502).json({ error: "Anime search unavailable" });
    }
});

// Get recent/spotlight/trending
router.get("/spotlight", async (_req, res) => {
    try {
        const data = await safeFetch(`${CONSUMET}/anime/${ANIME_SOURCE}/spotlight`);
        res.json(data);
    } catch (err) {
        console.error("Anime spotlight error:", err.message);
        res.status(502).json({ error: "Spotlight unavailable" });
    }
});

// Get anime info (episodes list)
router.get("/info/:id", async (req, res) => {
    try {
        const data = await safeFetch(
            `${CONSUMET}/anime/${ANIME_SOURCE}/info/${encodeURIComponent(req.params.id)}`
        );
        res.json(data);
    } catch (err) {
        console.error("Anime info error:", err.message);
        res.status(502).json({ error: "Anime info unavailable" });
    }
});

// Get streaming sources for an episode
router.get("/watch/:episodeId", async (req, res) => {
    try {
        const data = await safeFetch(
            `${CONSUMET}/anime/${ANIME_SOURCE}/watch/${encodeURIComponent(req.params.episodeId)}`
        );
        res.json(data);
    } catch (err) {
        console.error("Anime watch error:", err.message);
        res.status(502).json({ error: "Streaming sources unavailable" });
    }
});

// Get anime genres
router.get("/genres", async (_req, res) => {
    try {
        const data = await safeFetch(`${CONSUMET}/anime/${ANIME_SOURCE}/genres`);
        res.json(data);
    } catch (err) {
        console.error("Anime genres error:", err.message);
        res.status(502).json({ error: "Genres unavailable" });
    }
});

module.exports = router;
