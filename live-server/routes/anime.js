const express = require("express");
const fetch = require("node-fetch");
const { ANIME } = require("@consumet/extensions");
const router = express.Router();

const ANILIST = "https://graphql.anilist.co";
const animeUnity = new ANIME.AnimeUnity();

// Simple in-memory cache for AnimeUnity ID lookups (anilistId -> animeUnityId)
const idCache = new Map();
const episodeCache = new Map();

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

// Search anime (AniList metadata)
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

// Trending / spotlight
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

// Get anime info by AniList ID
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

        // Try to find AnimeUnity episodes in background
        let unityEpisodes = [];
        const title = m.title?.english || m.title?.romaji || "";
        try {
            const unityId = await findAnimeUnityId(id, title);
            if (unityId) {
                const epData = await fetchUnityEpisodes(unityId);
                unityEpisodes = epData;
            }
        } catch { /* silent - streaming may not be available */ }

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
            episodes: unityEpisodes,
        });
    } catch (err) {
        console.error("Anime info error:", err.message);
        res.status(502).json({ error: "Anime info unavailable" });
    }
});

// Fetch episodes for a specific anime (searches AnimeUnity by AniList ID or title)
router.get("/episodes/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
        const title = req.query.title || "";

        const unityId = await findAnimeUnityId(id, title);
        if (!unityId) return res.json({ episodes: [], message: "No streaming source found" });

        const episodes = await fetchUnityEpisodes(unityId);
        res.json({ episodes });
    } catch (err) {
        console.error("Anime episodes error:", err.message);
        res.status(502).json({ error: "Episodes unavailable" });
    }
});

// Get stream URL for an episode
router.get("/watch/:episodeId", async (req, res) => {
    try {
        const episodeId = req.params.episodeId;
        const sources = await animeUnity.fetchEpisodeSources(episodeId);
        res.json(sources);
    } catch (err) {
        console.error("Anime watch error:", err.message);
        res.status(502).json({ error: "Streaming unavailable" });
    }
});

// Get anime genres
router.get("/genres", async (_req, res) => {
    try {
        const data = await gql(`query { GenreCollection }`);
        res.json(data);
    } catch (err) {
        console.error("Anime genres error:", err.message);
        res.status(502).json({ error: "Genres unavailable" });
    }
});

// Browse anime by genre
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

async function findAnimeUnityId(anilistId, title) {
    if (idCache.has(anilistId)) return idCache.get(anilistId);
    if (!title) return null;

    try {
        const results = await animeUnity.search(title);
        if (!results?.results?.length) return null;

        // Try exact match first
        const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
        let match = results.results.find(r =>
            r.title?.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedTitle
        );
        // Fall back to first result
        if (!match) match = results.results[0];
        if (!match?.id) return null;

        idCache.set(anilistId, match.id);
        return match.id;
    } catch {
        return null;
    }
}

async function fetchUnityEpisodes(unityId) {
    if (episodeCache.has(unityId)) return episodeCache.get(unityId);
    try {
        const info = await animeUnity.fetchAnimeInfo(unityId);
        const episodes = (info.episodes || []).map(ep => ({
            id: ep.id,
            number: ep.number,
            title: ep.title || "",
            url: ep.url || "",
        }));
        episodeCache.set(unityId, episodes);
        return episodes;
    } catch {
        return [];
    }
}

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
