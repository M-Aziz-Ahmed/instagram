const express = require("express");
const fetch = require("node-fetch");
const dns = require("dns");
const router = express.Router();

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const MANGADEX = "https://api.mangadex.org";

async function mdFetch(url, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, {
                headers: { "User-Agent": "AnonTweet/1.0" },
                timeout: 20000,
                family: 4,
            });
            if (!res.ok) throw new Error(`MangaDex ${res.status}`);
            return res.json();
        } catch (err) {
            if (i === retries) throw err;
            await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

router.get("/search", async (req, res) => {
    try {
        const { q, limit = 30, offset = 0 } = req.query;
        if (!q) return res.status(400).json({ error: "Query required" });
        const url = `${MANGADEX}/manga?title=${encodeURIComponent(q)}&limit=${Math.min(Number(limit), 100)}&offset=${offset}&includes[]=cover_art&contentRating[]=erotica&contentRating[]=pornographic&order[relevance]=desc`;
        const data = await mdFetch(url);
        if (data?.data) {
            const seen = new Map();
            for (const m of data.data) { if (!seen.has(m.id)) seen.set(m.id, m); }
            data.data = [...seen.values()];
        }
        res.json(data);
    } catch (err) {
        console.error("Adult manga search error:", err.message);
        res.status(502).json({ error: "Search unavailable" });
    }
});

router.get("/browse", async (req, res) => {
    try {
        const { limit = 30, offset = 0 } = req.query;
        const url = `${MANGADEX}/manga?limit=${Math.min(Number(limit), 100)}&offset=${offset}&includes[]=cover_art&contentRating[]=erotica&contentRating[]=pornographic&order[latestUploadedChapter]=desc`;
        const data = await mdFetch(url);
        if (data?.data) {
            const seen = new Map();
            for (const m of data.data) { if (!seen.has(m.id)) seen.set(m.id, m); }
            data.data = [...seen.values()];
        }
        res.json(data);
    } catch (err) {
        console.error("Adult manga browse error:", err.message);
        res.status(502).json({ error: "Browse unavailable" });
    }
});

router.get("/chapters/:id", async (req, res) => {
    try {
        const { lang = "en", limit = 500, offset = 0, order = "asc" } = req.query;
        const url = `${MANGADEX}/manga/${req.params.id}/feed?translatedLanguage[]=${lang}&order[chapter]=${order}&limit=${Math.min(Number(limit), 500)}&offset=${offset}`;
        const data = await mdFetch(url);
        if (data?.data) {
            const seen = new Map();
            for (const ch of data.data) {
                const num = ch.attributes?.chapter || "";
                if (!seen.has(num)) seen.set(num, ch);
            }
            data.data = [...seen.values()];
        }
        res.json(data);
    } catch (err) {
        console.error("Adult manga chapters error:", err.message);
        res.status(502).json({ error: "Chapters unavailable" });
    }
});

router.get("/chapter/:id", async (req, res) => {
    try {
        const data = await mdFetch(`${MANGADEX}/at-home/server/${req.params.id}`);
        const baseUrl = data.baseUrl;
        const hash = data.chapter.hash;
        const pages = data.chapter.data.map(
            (filename) => `${baseUrl}/data/${hash}/${filename}`
        );
        res.json({ pages });
    } catch (err) {
        console.error("Adult manga chapter pages error:", err.message);
        res.status(502).json({ error: "Chapter pages unavailable" });
    }
});

router.get("/cover", async (req, res) => {
    try {
        const { url } = req.query;
        if (!url || !url.startsWith("https://uploads.mangadex.org/")) {
            return res.status(400).json({ error: "Invalid cover URL" });
        }
        const upstream = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://mangadex.org/",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
            timeout: 15000,
            redirect: "follow",
            family: 4,
        });
        if (!upstream.ok) return res.status(upstream.status).json({ error: "Cover not found" });
        const contentType = upstream.headers.get("content-type") || "image/jpeg";
        const buffer = await upstream.buffer();
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=604800");
        res.send(buffer);
    } catch (err) {
        console.error("Adult manga cover proxy error:", err.message);
        res.status(502).json({ error: "Cover unavailable" });
    }
});

router.get("/page", async (req, res) => {
    try {
        const { url } = req.query;
        if (!url || !(url.includes("mangadex.org") || url.includes("mangadex.network") || url.includes("uploads.mangadex.org"))) {
            return res.status(400).json({ error: "Invalid page URL" });
        }
        const upstream = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://mangadex.org/",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
            timeout: 20000,
            redirect: "follow",
            family: 4,
        });
        if (!upstream.ok) return res.status(upstream.status).json({ error: "Page not found" });
        const contentType = upstream.headers.get("content-type") || "image/jpeg";
        const buffer = await upstream.buffer();
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=604800");
        res.send(buffer);
    } catch (err) {
        console.error("Adult manga page proxy error:", err.message);
        res.status(502).json({ error: "Page unavailable" });
    }
});

module.exports = router;
