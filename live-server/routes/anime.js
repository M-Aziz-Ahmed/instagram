const express = require("express");
const router = express.Router();

const JIKAN = "https://api.jikan.moe/v4";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeFetch(url, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            if (i > 0) await sleep(1000 * i);
            const res = await fetch(url, {
                headers: { "User-Agent": "AnonTweet/1.0" },
                signal: AbortSignal.timeout(15000),
            });
            if (res.status === 429) {
                await sleep(2000);
                continue;
            }
            if (!res.ok) throw new Error(`Upstream ${res.status}`);
            return await res.json();
        } catch (err) {
            if (i === retries) throw err;
        }
    }
}

// Search anime via Jikan (MyAnimeList)
router.get("/search", async (req, res) => {
    try {
        const { q, page = 1 } = req.query;
        if (!q) return res.status(400).json({ error: "Query required" });
        const data = await safeFetch(
            `${JIKAN}/anime?q=${encodeURIComponent(q)}&page=${page}&limit=20&sfw=true`
        );
        const results = (data.data || []).map((a) => ({
            id: String(a.mal_id),
            title: a.title,
            image: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || "",
            sub: true,
            dub: false,
            type: a.type,
            episodes: a.episodes,
            score: a.score,
            status: a.status,
            synopsis: a.synopsis,
            genres: (a.genres || []).map((g) => g.name),
            rating: a.rating,
            year: a.year,
            season: a.season,
        }));
        res.json({ results, hasNextPage: data.pagination?.has_next_page || false });
    } catch (err) {
        console.error("Anime search error:", err.message);
        res.status(502).json({ error: "Anime search unavailable" });
    }
});

// Spotlight / trending (use top anime)
router.get("/spotlight", async (_req, res) => {
    try {
        const data = await safeFetch(`${JIKAN}/top/anime?limit=18`);
        const results = (data.data || []).map((a) => ({
            id: String(a.mal_id),
            title: a.title,
            image: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || "",
            sub: true,
            dub: false,
            type: a.type,
            episodes: a.episodes,
            score: a.score,
            rank: a.rank,
        }));
        res.json({ results });
    } catch (err) {
        console.error("Anime spotlight error:", err.message);
        res.status(502).json({ error: "Spotlight unavailable" });
    }
});

// Get anime info
router.get("/info/:id", async (req, res) => {
    try {
        const data = await safeFetch(`${JIKAN}/anime/${req.params.id}/full`);
        const a = data.data || {};
        const episodes = [];
        try {
            const epData = await safeFetch(`${JIKAN}/anime/${req.params.id}/episodes?filter=video`);
            for (const ep of (epData.data || [])) {
                episodes.push({
                    id: String(ep.mal_id),
                    number: ep.mal_id,
                    title: ep.title || "",
                    synopsis: ep.synopsis || "",
                    aired: ep.aired || "",
                });
            }
        } catch { /* episodes may be unavailable */ }

        res.json({
            title: a.title || "",
            description: a.synopsis || "",
            image: a.images?.jpg?.large_image_url || "",
            genres: (a.genres || []).map((g) => g.name),
            status: a.status,
            totalEpisodes: a.episodes,
            releaseDate: a.year || a.aired?.prop?.from?.year || "",
            score: a.score,
            rating: a.rating,
            otherNames: [a.title_japanese, a.title_english, ...((a.title_synonyms) || [])].filter(Boolean),
            episodes,
        });
    } catch (err) {
        console.error("Anime info error:", err.message);
        res.status(502).json({ error: "Anime info unavailable" });
    }
});

// Episode info (returns streaming links to external sources)
router.get("/watch/:episodeId", async (req, res) => {
    try {
        const data = await safeFetch(`${JIKAN}/episodes/${req.params.episodeId}`);
        const ep = data.data || {};
        const sources = [];
        if (ep.video) {
            sources.push({ url: ep.video, quality: "default", provider: "myanimelist" });
        }
        res.json({ sources, episode: { title: ep.title, synopsis: ep.synopsis } });
    } catch (err) {
        console.error("Anime watch error:", err.message);
        res.status(502).json({ error: "Streaming unavailable" });
    }
});

// Get anime genres
router.get("/genres", async (_req, res) => {
    try {
        const data = await safeFetch(`${JIKAN}/genres/anime`);
        res.json(data);
    } catch (err) {
        console.error("Anime genres error:", err.message);
        res.status(502).json({ error: "Genres unavailable" });
    }
});

module.exports = router;
