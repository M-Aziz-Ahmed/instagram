const express = require("express");
const fetch = require("node-fetch");
const dns = require("dns");
const router = express.Router();

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const MANGADEX = "https://api.mangadex.org";

async function safeFetch(url) {
    const res = await fetch(url, {
        headers: { "User-Agent": "AnonTweet/1.0" },
        timeout: 15000,
    });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    return res.json();
}

// Search manga
router.get("/search", async (req, res) => {
    try {
        const { q, limit = 20, offset = 0 } = req.query;
        if (!q) return res.status(400).json({ error: "Query required" });
        const url = `${MANGADEX}/manga?title=${encodeURIComponent(q)}&limit=${Math.min(Number(limit), 100)}&offset=${offset}&includes[]=cover_art&order[relevance]=desc`;
        const data = await safeFetch(url);
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
        const url = `${MANGADEX}/manga?limit=${Math.min(Number(limit), 100)}&offset=${offset}&includes[]=cover_art&order[latestUploadedChapter]=desc`;
        const data = await safeFetch(url);
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
        const url = `${MANGADEX}/manga/${req.params.id}/feed?translatedLanguage[]=${lang}&order[chapter]=${order}&limit=${Math.min(Number(limit), 500)}&offset=${offset}`;
        const data = await safeFetch(url);
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

// Get manga genres/tags
router.get("/genres", async (_req, res) => {
    try {
        const data = await safeFetch(`${MANGADEX}/manga/tag`);
        res.json(data);
    } catch (err) {
        console.error("Manga genres error:", err.message);
        res.status(502).json({ error: "Genres unavailable" });
    }
});

// Browse manga by tag
router.get("/tag/:tagId", async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;
        const url = `${MANGADEX}/manga?includedTags[]=${req.params.tagId}&limit=${Math.min(Number(limit), 100)}&offset=${offset}&includes[]=cover_art&order[latestUploadedChapter]=desc`;
        const data = await safeFetch(url);
        res.json(data);
    } catch (err) {
        console.error("Manga tag browse error:", err.message);
        res.status(502).json({ error: "Tag browse unavailable" });
    }
});

// Proxy cover images from MangaDex CDN (avoids hotlink blocks and watermarks)
router.get("/cover", async (req, res) => {
    try {
        const { url } = req.query;
        if (!url || !url.startsWith("https://uploads.mangadex.org/")) {
            return res.status(400).json({ error: "Invalid cover URL" });
        }
        const upstream = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://mangadex.org/",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
            timeout: 15000,
            redirect: "follow",
        });
        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: "Cover not found" });
        }
        const contentType = upstream.headers.get("content-type") || "image/jpeg";
        const buffer = await upstream.buffer();
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=604800");
        res.send(buffer);
    } catch (err) {
        console.error("Manga cover proxy error:", err.message);
        res.status(502).json({ error: "Cover unavailable" });
    }
});

// Proxy chapter page images from MangaDex CDN (required due to hotlink protection)
router.get("/page", async (req, res) => {
    try {
        const { url } = req.query;
        if (!url || !url.includes("mangadex.org")) {
            return res.status(400).json({ error: "Invalid page URL" });
        }
        const upstream = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://mangadex.org/",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
            timeout: 20000,
            redirect: "follow",
        });
        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: "Page not found" });
        }
        const contentType = upstream.headers.get("content-type") || "image/jpeg";
        const buffer = await upstream.buffer();
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=604800");
        res.send(buffer);
    } catch (err) {
        console.error("Manga page proxy error:", err.message);
        res.status(502).json({ error: "Page unavailable" });
    }
});

module.exports = router;
