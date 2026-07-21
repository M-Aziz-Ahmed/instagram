const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

const MANGADEX = "https://api.mangadex.org";

async function safeFetch(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
        headers: { "User-Agent": "AnonTweet/1.0" },
        signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    return res.json();
}

// Search manga
router.get("/search", async (req, res) => {
    try {
        const { q, limit = 20, offset = 0, includes = "cover_art" } = req.query;
        if (!q) return res.status(400).json({ error: "Query required" });
        const params = new URLSearchParams({
            title: q,
            limit: String(Math.min(Number(limit), 100)),
            offset: String(offset),
            "order[relevance]": "desc",
            "includes[]": includes,
            "hasAvailableChapters": "true",
        });
        const data = await safeFetch(`${MANGADEX}/manga?${params}`);
        res.json(data);
    } catch (err) {
        console.error("Manga search error:", err.message);
        res.status(502).json({ error: "Manga search unavailable" });
    }
});

// Get recently updated / popular
router.get("/recent", async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;
        const params = new URLSearchParams({
            limit: String(Math.min(Number(limit), 100)),
            offset: String(offset),
            "includes[]": "cover_art",
            "order[latestUploadedChapter]": "desc",
            "hasAvailableChapters": "true",
        });
        const data = await safeFetch(`${MANGADEX}/manga?${params}`);
        res.json(data);
    } catch (err) {
        console.error("Manga recent error:", err.message);
        res.status(502).json({ error: "Recent manga unavailable" });
    }
});

// Get manga info
router.get("/info/:id", async (req, res) => {
    try {
        const url = `${MANGADEX}/manga/${req.params.id}?includes[]=cover_art&includes[]=author`;
        const data = await safeFetch(url);
        res.json(data);
    } catch (err) {
        console.error("Manga info error:", err.message);
        res.status(502).json({ error: "Manga info unavailable" });
    }
});

// Get chapters for a manga
router.get("/chapters/:id", async (req, res) => {
    try {
        const { lang = "en", limit = 500, offset = 0, order = "asc" } = req.query;
        const params = new URLSearchParams({
            "translatedLanguage[]": lang,
            "order[chapter]": order,
            limit: String(Math.min(Number(limit), 500)),
            offset: String(offset),
        });
        const data = await safeFetch(`${MANGADEX}/manga/${req.params.id}/feed?${params}`);
        res.json(data);
    } catch (err) {
        console.error("Manga chapters error:", err.message);
        res.status(502).json({ error: "Chapters unavailable" });
    }
});

// Get chapter pages
router.get("/chapter/:id", async (req, res) => {
    try {
        const data = await safeFetch(`${MANGADEX}/at-home/server/${req.params.id}`);
        const baseUrl = data.baseUrl;
        const hash = data.chapter.hash;
        const pages = data.chapter.data.map(
            (filename) => `${baseUrl}/data/${hash}/${filename}`
        );
        const pagesSaver = (data.chapter.dataSaver || []).map(
            (filename) => `${baseUrl}/data-saver/${hash}/${filename}`
        );
        res.json({ pages, pagesSaver, hash });
    } catch (err) {
        console.error("Manga chapter pages error:", err.message);
        res.status(502).json({ error: "Chapter pages unavailable" });
    }
});

// Get manga genres
router.get("/genres", async (_req, res) => {
    try {
        const data = await safeFetch(`${MANGADEX}/manga/tag`);
        res.json(data);
    } catch (err) {
        console.error("Manga genres error:", err.message);
        res.status(502).json({ error: "Genres unavailable" });
    }
});

module.exports = router;
