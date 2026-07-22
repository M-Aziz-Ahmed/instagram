const express = require("express");
const fetch = require("node-fetch");
const { bypassFetch } = require("../utils/dnsBypass");
const router = express.Router();

const NHENTAI = "https://nhentai.net/api";

async function nhFetch(path, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await bypassFetch(`${NHENTAI}${path}`, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json",
                },
                timeout: 20000,
            });
            if (!res.ok) throw new Error(`nhentai ${res.status}`);
            return res.json();
        } catch (err) {
            if (i === retries) throw err;
            await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

router.get("/search", async (req, res) => {
    try {
        const { q, page = 1 } = req.query;
        if (!q) return res.status(400).json({ error: "Query required" });
        const data = await nhFetch(`/galleries/search?query=${encodeURIComponent(q)}&page=${page}`);
        res.json(data);
    } catch (err) {
        console.error("Adult manga search error:", err.message);
        res.status(502).json({ error: "Search unavailable" });
    }
});

router.get("/browse", async (req, res) => {
    try {
        const { page = 1 } = req.query;
        const data = await nhFetch(`/galleries/all?page=${page}`);
        res.json(data);
    } catch (err) {
        console.error("Adult manga browse error:", err.message);
        res.status(502).json({ error: "Browse unavailable" });
    }
});

router.get("/pages/:id", async (req, res) => {
    try {
        const data = await nhFetch(`/gallery/${req.params.id}/images`);
        res.json(data);
    } catch (err) {
        console.error("Adult manga pages error:", err.message);
        res.status(502).json({ error: "Pages unavailable" });
    }
});

async function proxyImage(url, req, res) {
    try {
        const upstream = await bypassFetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
            timeout: 20000,
        });
        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: "Image not found" });
        }
        const contentType = upstream.headers.get("content-type") || "image/jpeg";
        const buffer = await upstream.buffer();
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=604800");
        res.send(buffer);
    } catch (err) {
        console.error("Adult manga image proxy error:", err.message);
        res.status(502).json({ error: "Image unavailable" });
    }
}

router.get("/cover", async (req, res) => {
    const { url } = req.query;
    if (!url || !url.includes("nhentai")) {
        return res.status(400).json({ error: "Invalid cover URL" });
    }
    await proxyImage(url, req, res);
});

router.get("/page", async (req, res) => {
    const { url } = req.query;
    if (!url || !url.includes("nhentai")) {
        return res.status(400).json({ error: "Invalid page URL" });
    }
    await proxyImage(url, req, res);
});

module.exports = router;
