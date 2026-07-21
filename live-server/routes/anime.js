const express = require("express");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { ANIME } = require("@consumet/extensions");
const router = express.Router();

const ANILIST = "https://graphql.anilist.co";
const HIANIME = "https://hianime.to";

// HiAnime proxy URL — routes through Vercel to bypass Cloudflare IP block
// Set HIANIME_PROXY env to your Vercel URL (e.g. https://anontweet.vercel.app)
const HIANIME_PROXY = (process.env.HIANIME_PROXY || "").replace(/\/+$/, "");

const animeUnity = new ANIME.AnimeUnity();

// Caches: anilistId -> streaming provider ID
const hianimeIdCache = new Map();
const hianimeEpisodeCache = new Map();
const unityIdCache = new Map();
const unityEpisodeCache = new Map();

async function gql(query, variables = {}) {
    const res = await fetch(ANILIST, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "AnonTweet/1.0" },
        body: JSON.stringify({ query, variables }),
        timeout: 15000,
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message || "AniList error");
    return json.data;
}

const MEDIA_FIELDS = `
    id
    title { romaji english native }
    coverImage { large medium }
    bannerImage
    episodes
    status
    averageScore
    format
    description(asHtml:false)
    genres
    startDate { year month day }
    season
    nextAiringEpisode { episode airingAt }
    streamingEpisodes { title thumbnail url site }
    relations { edges { node { ... on Media { id title { romaji english } format } } } }
`;

// ── Search anime (AniList metadata) ───────────────────────────
router.get("/search", async (req, res) => {
    try {
        const { q, page = 1 } = req.query;
        if (!q) return res.status(400).json({ error: "Query required" });
        const data = await gql(
            `query ($search: String, $page: Int) {
                Page(page: $page, perPage: 20) {
                    media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
                    pageInfo { hasNextPage total }
                }
            }`,
            { search: q, page: Number(page) }
        );
        const results = (data.Page.media || []).map(formatMedia);
        res.json({ results, hasNextPage: data.Page.pageInfo?.hasNextPage || false });
    } catch (err) {
        console.error("Anime search error:", err.message);
        res.status(502).json({ error: "Anime search unavailable" });
    }
});

// ── Trending / spotlight ──────────────────────────────────────
router.get("/spotlight", async (_req, res) => {
    try {
        const data = await gql(
            `query {
                Page(page: 1, perPage: 18) {
                    media(type: ANIME, sort: TRENDING_DESC) { ${MEDIA_FIELDS} }
                }
            }`
        );
        const results = (data.Page.media || []).map(formatMedia);
        res.json({ results });
    } catch (err) {
        console.error("Anime spotlight error:", err.message);
        res.status(502).json({ error: "Spotlight unavailable" });
    }
});

// ── Get anime info by AniList ID ──────────────────────────────
router.get("/info/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
        const data = await gql(
            `query ($id: Int) {
                Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} }
            }`,
            { id }
        );
        if (!data.Media) return res.status(404).json({ error: "Anime not found" });
        const m = data.Media;
        const title = m.title?.english || m.title?.romaji || "";

        // Try HiAnime first (English sub/dub), then AnimeUnity (Italian)
        let episodes = [];
        let hasSub = true;
        let hasDub = false;
        let source = "none";

        try {
            const hiEps = await fetchHiAnimeEpisodes(id, title);
            if (hiEps.length > 0) {
                episodes = hiEps;
                hasDub = true;
                source = "hianime";
            }
        } catch { /* HiAnime unreachable */ }

        if (episodes.length === 0) {
            try {
                const unityEps = await fetchUnityEpisodes(id, title);
                if (unityEps.length > 0) {
                    episodes = unityEps;
                    source = "animeunity";
                }
            } catch { /* AnimeUnity unavailable */ }
        }

        res.json({
            id: m.id,
            title: m.title?.english || m.title?.romaji || "",
            description: (m.description || "").replace(/<[^>]*>/g, ""),
            image: m.coverImage?.large || "",
            genres: m.genres || [],
            status: m.status,
            totalEpisodes: m.episodes,
            releaseDate: m.startDate?.year || "",
            score: m.averageScore,
            otherNames: [m.title?.romaji, m.title?.native].filter(Boolean),
            streamingEpisodes: m.streamingEpisodes || [],
            episodes,
            hasSub,
            hasDub,
            source,
        });
    } catch (err) {
        console.error("Anime info error:", err.message);
        res.status(502).json({ error: "Anime info unavailable" });
    }
});

// ── Fetch episodes for a specific anime ───────────────────────
router.get("/episodes/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
        const title = req.query.title || "";

        // Try HiAnime first
        try {
            const hiEps = await fetchHiAnimeEpisodes(id, title);
            if (hiEps.length > 0) return res.json({ episodes: hiEps, source: "hianime" });
        } catch { /* fallback */ }

        // Fall back to AnimeUnity
        try {
            const episodes = await fetchUnityEpisodes(id, title);
            if (episodes.length > 0) return res.json({ episodes, source: "animeunity" });
        } catch { /* both failed */ }

        res.json({ episodes: [], message: "No streaming source found" });
    } catch (err) {
        console.error("Anime episodes error:", err.message);
        res.status(502).json({ error: "Episodes unavailable" });
    }
});

// ── Get stream URL for an episode ─────────────────────────────
router.get("/watch/:episodeId", async (req, res) => {
    try {
        const episodeId = req.params.episodeId;
        const { server, subOrDub } = req.query;

        // Try HiAnime first (English sub/dub) — routed through Vercel proxy
        if (HIANIME_PROXY) {
            try {
                const epNum = episodeId.split("ep=")[1] || episodeId.split("?ep=")[1];
                if (epNum) {
                    const serverData = await hiFetchJson(`/ajax/v2/episode/servers?episodeId=${epNum}`);
                    const servers = serverData?.sub || serverData?.dub || [];
                    if (servers.length) {
                        const srcRes = await hiFetchJson(`/ajax/v2/episode/sources?id=${servers[0].id}`);
                        if (srcRes?.link) {
                            // Return the embed link — the frontend will need to resolve it
                            // or we resolve it here by fetching the embed page
                            try {
                                const embedRes = await fetch(srcRes.link, {
                                    headers: {
                                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                                        "Referer": `${HIANIME}/`,
                                    },
                                    timeout: 10000,
                                });
                                const embedHtml = await embedRes.text();
                                const m3u8 = embedHtml.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
                                const mp4 = embedHtml.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/);
                                const sources = [];
                                if (m3u8) sources.push({ url: m3u8[0], quality: "default", isM3U8: true });
                                if (mp4) sources.push({ url: mp4[0], quality: "default", isM3U8: false });
                                if (sources.length) {
                                    return res.json({ sources, subtitles: [], source: "hianime" });
                                }
                            } catch { /* embed fetch failed, try direct */ }
                            // If embed parsing fails, return the embed URL for the frontend
                            return res.json({ sources: [{ url: srcRes.link, quality: "embed" }], subtitles: [], source: "hianime" });
                        }
                    }
                }
            } catch { /* HiAnime unavailable */ }
        }

        // Fall back to AnimeUnity
        try {
            const sources = await withTimeout(animeUnity.fetchEpisodeSources(episodeId), 12000);
            if (sources?.sources?.length > 0) {
                return res.json({ ...sources, source: "animeunity" });
            }
        } catch { /* both failed */ }

        res.status(502).json({ error: "Streaming unavailable" });
    } catch (err) {
        console.error("Anime watch error:", err.message);
        res.status(502).json({ error: "Streaming unavailable" });
    }
});

// ── Get available servers for an episode ──────────────────────
router.get("/servers/:episodeId", async (req, res) => {
    if (HIANIME_PROXY) {
        try {
            const data = await hiFetchJson(`/ajax/v2/episode/servers?episodeId=${req.params.episodeId}`);
            res.json(data);
            return;
        } catch { /* fallback */ }
    }
    res.json({ sub: [{ name: "default", url: "" }], dub: [], raw: [] });
});

// ── Get anime genres ──────────────────────────────────────────
router.get("/genres", async (_req, res) => {
    try {
        const data = await gql(`query { GenreCollection }`);
        res.json(data);
    } catch (err) {
        console.error("Anime genres error:", err.message);
        res.status(502).json({ error: "Genres unavailable" });
    }
});

// ── Browse anime by genre ─────────────────────────────────────
router.get("/genre/:genre", async (req, res) => {
    try {
        const { genre } = req.params;
        const { page = 1, sort = "POPULARITY_DESC" } = req.query;
        const data = await gql(
            `query ($genre: String, $page: Int, $sort: [MediaSort]) {
                Page(page: $page, perPage: 20) {
                    media(genre: $genre, type: ANIME, sort: $sort) { ${MEDIA_FIELDS} }
                    pageInfo { hasNextPage total }
                }
            }`,
            { genre, page: Number(page), sort }
        );
        const results = (data.Page.media || []).map(formatMedia);
        res.json({ results, hasNextPage: data.Page.pageInfo?.hasNextPage || false });
    } catch (err) {
        console.error("Anime genre browse error:", err.message);
        res.status(502).json({ error: "Genre browse unavailable" });
    }
});

// ── Helpers ──────────────────────────────────────────────────

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
}

// ── HiAnime helpers (routed through Vercel proxy) ───────────

async function hiFetch(path, ajax = false) {
    const url = `${HIANIME}${path}`;
    if (!HIANIME_PROXY) throw new Error("No HiAnime proxy configured");
    const proxyUrl = `${HIANIME_PROXY}/api/anime-proxy?url=${encodeURIComponent(url)}${ajax ? "&ajax=1" : ""}`;
    const res = await fetch(proxyUrl, {
        timeout: 15000,
        headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`Proxy ${res.status}`);
    return res;
}

async function hiFetchJson(path) {
    const res = await hiFetch(path, true);
    return res.json();
}

async function findHiAnimeId(anilistId, title) {
    if (hianimeIdCache.has(anilistId)) return hianimeIdCache.get(anilistId);
    if (!title) return null;
    try {
        const res = await hiFetch(`/search?keyword=${encodeURIComponent(title)}`);
        const html = await res.text();
        const $ = cheerio.load(html);
        let matchId = null;
        $(".film_list-wrap .flw-item").each((_, el) => {
            const name = $(el).find(".film-name a").text().trim().toLowerCase();
            const href = $(el).find(".film-name a").attr("href") || "";
            const id = href.replace(/^\/?/, "");
            if (!matchId && name === title.toLowerCase()) matchId = id;
            if (!matchId && name.includes(title.toLowerCase())) matchId = id;
        });
        if (!matchId) {
            const first = $(".film_list-wrap .flw-item .film-name a").attr("href");
            if (first) matchId = first.replace(/^\/?/, "");
        }
        if (matchId) hianimeIdCache.set(anilistId, matchId);
        return matchId;
    } catch { return null; }
}

async function fetchHiAnimeEpisodes(anilistId, title) {
    const hiId = await findHiAnimeId(anilistId, title);
    if (!hiId) return [];
    if (hianimeEpisodeCache.has(hiId)) return hianimeEpisodeCache.get(hiId);
    try {
        const animeNum = hiId.split("-").pop();
        const data = await hiFetchJson(`/ajax/v2/episode/list/${animeNum}`);
        const $ = cheerio.load(data.html || "");
        const episodes = [];
        $(".ep-item").each((_, el) => {
            const epId = $(el).attr("data-id") || "";
            const num = parseInt($(el).attr("data-number"), 10);
            if (epId && !isNaN(num)) {
                episodes.push({ id: `${hiId}?ep=${epId}`, number: num, title: "" });
            }
        });
        hianimeEpisodeCache.set(hiId, episodes);
        return episodes;
    } catch { return []; }
}

async function fetchHiAnimeSources(episodeId) {
    const epNum = episodeId.split("ep=")[1] || episodeId.split("?ep=")[1];
    if (!epNum) throw new Error("No episode ID");
    const data = await hiFetchJson(`/ajax/v2/episode/servers?episodeId=${epNum}`);
    const servers = data?.sub || data?.dub || data?.data || [];
    if (!servers.length) throw new Error("No servers");
    const serverId = servers[0].id;
    const srcData = await hiFetchJson(`/ajax/v2/episode/sources?id=${serverId}`);
    const embedUrl = srcData?.link;
    if (!embedUrl) throw new Error("No embed URL");
    const embedRes = await hiFetch(embedUrl.replace(HIANIME, ""));
    return embedUrl;
}

// ── AnimeUnity helpers ──────────────────────────────────────

async function findAnimeUnityId(anilistId, title) {
    if (unityIdCache.has(anilistId)) return unityIdCache.get(anilistId);
    if (!title) return null;

    try {
        const results = await withTimeout(animeUnity.search(title), 10000);
        if (!results?.results?.length) return null;

        const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
        let match = results.results.find(r =>
            r.title?.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedTitle
        );
        if (!match) match = results.results[0];
        if (!match?.id) return null;

        unityIdCache.set(anilistId, match.id);
        return match.id;
    } catch {
        return null;
    }
}

async function fetchUnityEpisodes(anilistId, title) {
    const unityId = await findAnimeUnityId(anilistId, title);
    if (!unityId) return [];

    if (unityEpisodeCache.has(unityId)) return unityEpisodeCache.get(unityId);

    try {
        const info = await withTimeout(animeUnity.fetchAnimeInfo(unityId), 10000);
        const episodes = (info.episodes || []).map(ep => ({
            id: ep.id,
            number: ep.number,
            title: ep.title || "",
            url: ep.url || "",
        }));
        unityEpisodeCache.set(unityId, episodes);
        return episodes;
    } catch {
        return [];
    }
}

// ── Format AniList media ──────────────────────────────────────

function formatMedia(m) {
    return {
        id: m.id,
        title: m.title?.english || m.title?.romaji || "",
        image: m.coverImage?.large || m.coverImage?.medium || "",
        sub: true,
        dub: false,
        type: m.format,
        episodes: m.episodes,
        score: m.averageScore,
        status: m.status,
        description: (m.description || "").replace(/<[^>]*>/g, ""),
        genres: m.genres || [],
        rating: m.averageScore ? `${m.averageScore}/100` : null,
        year: m.startDate?.year,
        season: m.season,
    };
}

module.exports = router;
