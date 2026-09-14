const express = require("express");
const fetch = require("node-fetch");
const { URL } = require("url");
const { assertSafeUrl } = require("../utils/linkPreview");

const router = express.Router();

const PROXY_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;

function buildProxyUrl(target, ref, ua) {
    const params = new URLSearchParams({ url: target });
    if (ref) params.set("ref", ref);
    if (ua) params.set("ua", ua);
    return `/api/media-proxy?${params.toString()}`;
}

function isM3U8(res, url) {
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    return contentType.includes("mpegurl") || contentType.includes("application/vnd.apple") || /\.m3u8(?:\?|$)/i.test(url);
}

async function readLimited(body, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let received = 0;
        let done = false;
        const finish = (html) => {
            if (done) return;
            done = true;
            resolve(html);
        };
        body.on("data", (chunk) => {
            if (done) return;
            received += chunk.length;
            if (received > maxBytes) {
                body.destroy();
                reject(new Error("Playlist too large"));
                return;
            }
            chunks.push(chunk);
        });
        body.on("end", () => finish(Buffer.concat(chunks).toString("utf8")));
        body.on("error", (err) => { if (!done) { done = true; reject(err); } });
    });
}

function rewritePlaylist(playlist, baseUrl, ref, ua) {
    const lines = playlist.split(/\r?\n/);
    const rewritten = [];
    const resolveUrl = (u) => {
        try { return new URL(u, baseUrl).href; } catch { return null; }
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            rewritten.push(line);
            continue;
        }
        if (trimmed.startsWith("#EXT-X-KEY:") || trimmed.startsWith("#EXT-X-MAP:") || trimmed.startsWith("#EXT-X-MEDIA:") || trimmed.includes('#EXT-X-I-FRAME-STREAM-INF:')) {
            const replaced = trimmed.replace(/URI="([^"]+)"/gi, (m, uri) => {
                const target = resolveUrl(uri);
                if (!target) return m;
                return `URI="${buildProxyUrl(target, ref, ua)}"`;
            });
            rewritten.push(replaced);
            continue;
        }
        if (trimmed.startsWith("#")) {
            rewritten.push(line);
            continue;
        }
        // Segment / media URI
        const target = resolveUrl(trimmed);
        rewritten.push(target ? buildProxyUrl(target, ref, ua) : line);
    }
    return rewritten.join("\n");
}

// GET /api/media-proxy?url=&ref=&ua=
router.get("/", async (req, res) => {
    const url = String(req.query.url || "").trim();
    if (!url) return res.status(400).json({ error: "url required" });

    let target;
    try {
        target = await assertSafeUrl(url);
    } catch (err) {
        return res.status(400).json({ error: err.message || "Invalid URL" });
    }

    const ref = String(req.query.ref || "").trim();
    const ua = String(req.query.ua || "").trim() || PROXY_UA;
    const range = req.headers.range || "";

    const headers = {
        "User-Agent": ua,
        Accept: "*/*",
    };
    if (ref) headers.Referer = ref;
    if (range) headers.Range = range;

    try {
        const upstream = await fetch(target.href, {
            headers,
            redirect: "follow",
            timeout: 15000,
        });

        if (!upstream.ok && upstream.status !== 206) {
            return res.status(upstream.status).json({ error: `Upstream error ${upstream.status}` });
        }

        const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();

        // HLS playlist: rewrite segment/key URIs through the proxy
        if (isM3U8(upstream, target.href) && !range) {
            try {
                const playlist = await readLimited(upstream.body, MAX_PLAYLIST_BYTES);
                const rewritten = rewritePlaylist(playlist, target.href, ref, ua);
                res.set("Content-Type", "application/vnd.apple.mpegurl");
                res.set("Cache-Control", "no-cache");
                return res.status(200).send(rewritten);
            } catch (err) {
                return res.status(502).json({ error: "Playlist fetch failed" });
            }
        }

        // Data / segment pass-through
        res.status(upstream.status);
        for (const header of ["content-type", "content-length", "content-range", "accept-ranges", "content-disposition"]) {
            const value = upstream.headers.get(header);
            if (value) res.set(header, value);
        }
        res.set("Cache-Control", "no-cache, max-age=0, no-store");
        upstream.body.pipe(res);
        upstream.body.on("error", () => res.destroy());
    } catch (err) {
        if (!res.headersSent) return res.status(502).json({ error: "Upstream fetch failed" });
        res.destroy();
    }
});

module.exports = router;