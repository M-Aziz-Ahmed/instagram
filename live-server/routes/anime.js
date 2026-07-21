const express = require("express");
const fetch = require("node-fetch");
const { ANIME } = require("@consumet/extensions");
const router = express.Router();

const ANILIST = "https://graphql.anilist.co";

// Primary: HiAnime (English sub + dub, huge library)
const hianime = new ANIME.Hianime();
// Fallback: AnimeUnity (Italian site, Japanese audio only)
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

        // Try HiAnime first, then AnimeUnity
        let episodes = [];
        let hasSub = true;
        let hasDub = false;

        try {
            const hiEps = await fetchHiAnimeEpisodes(id, title);
            if (hiEps.length > 0) {
                episodes = hiEps;
                hasDub = true;
            }
        } catch { /* HiAnime unavailable */ }

        if (episodes.length === 0) {
            try {
                const unityEps = await fetchUnityEpisodes(id, title);
                if (unityEps.length > 0) {
                    episodes = unityEps;
                    hasDub = false;
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
            source: episodes.length > 0 ? (hasDub ? "hianime" : "animeunity") : "none",
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
            const unityId = await findAnimeUnityId(id, title);
            if (!unityId) return res.json({ episodes: [], message: "No streaming source found" });
            const episodes = await fetchUnityEpisodes(id, title);
            return res.json({ episodes, source: "animeunity" });
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

        // Try HiAnime first (supports sub/dub)
        try {
            const SubOrDubEnum = subOrDub === "dub" ? "dub" : subOrDub === "both" ? "both" : "sub";
            const sources = await withTimeout(
                hianime.fetchEpisodeSources(episodeId, server || undefined, SubOrDubEnum),
                15000
            );
            if (sources?.sources?.length > 0) {
                return res.json({
                    sources: sources.sources,
                    subtitles: sources.subtitles || [],
                    intro: sources.intro || null,
                    outro: sources.outro || null,
                    source: "hianime",
                });
            }
        } catch { /* fallback to AnimeUnity */ }

        // Fall back to AnimeUnity
        try {
            const sources = await withTimeout(animeUnity.fetchEpisodeSources(episodeId), 15000);
            return res.json({ ...sources, source: "animeunity" });
        } catch { /* both failed */ }

        res.status(502).json({ error: "Streaming unavailable" });
    } catch (err) {
        console.error("Anime watch error:", err.message);
        res.status(502).json({ error: "Streaming unavailable" });
    }
});

// ── Get available servers for an episode ──────────────────────
router.get("/servers/:episodeId", async (req, res) => {
    try {
        const servers = await withTimeout(hianime.fetchEpisodeServers(req.params.episodeId), 10000);
        res.json(servers);
    } catch (err) {
        console.error("Anime servers error:", err.message);
        res.json({ sub: [], dub: [], raw: [] });
    }
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

// ── HiAnime helpers ───────────────────────────────────────────

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
}

async function findHiAnimeId(anilistId, title) {
    if (hianimeIdCache.has(anilistId)) return hianimeIdCache.get(anilistId);
    if (!title) return null;

    try {
        const results = await withTimeout(hianime.search(title), 10000);
        if (!results?.results?.length) return null;

        const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
        let match = results.results.find(r =>
            r.title?.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedTitle
        );
        if (!match) match = results.results[0];
        if (!match?.id) return null;

        hianimeIdCache.set(anilistId, match.id);
        return match.id;
    } catch {
        return null;
    }
}

async function fetchHiAnimeEpisodes(anilistId, title) {
    const hiId = await findHiAnimeId(anilistId, title);
    if (!hiId) return [];

    if (hianimeEpisodeCache.has(hiId)) return hianimeEpisodeCache.get(hiId);

    try {
        const info = await withTimeout(hianime.fetchAnimeInfo(hiId), 10000);
        const episodes = (info.episodes || []).map(ep => ({
            id: ep.id,
            number: ep.number,
            title: ep.title || "",
            url: ep.url || "",
        }));
        hianimeEpisodeCache.set(hiId, episodes);
        return episodes;
    } catch {
        return [];
    }
}

// ── AnimeUnity helpers (fallback) ─────────────────────────────

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
