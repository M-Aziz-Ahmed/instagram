const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

const ANILIST = "https://graphql.anilist.co";

async function gql(query, variables = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const res = await fetch(ANILIST, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": "AnonTweet/1.0" },
            body: JSON.stringify({ query, variables }),
            signal: controller.signal,
        });
        clearTimeout(timer);
        const json = await res.json();
        if (json.errors) throw new Error(json.errors[0]?.message || "AniList error");
        return json.data;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
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

// Search anime
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
            relations: (m.relations?.edges || []).map((e) => ({
                id: e.node?.id,
                title: e.node?.title?.romaji || e.node?.title?.english || "",
                format: e.node?.format,
            })),
        });
    } catch (err) {
        console.error("Anime info error:", err.message);
        res.status(502).json({ error: "Anime info unavailable" });
    }
});

// Watch endpoint - returns external streaming links (AniList has them!)
router.get("/watch/:episodeId", async (req, res) => {
    try {
        const id = Number(req.params.episodeId);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
        const data = await gql(
            `query ($id: Int) {
                Media(id: $id, type: ANIME) { streamingEpisodes { title thumbnail url site } }
            }`,
            { id }
        );
        const episodes = data.Media?.streamingEpisodes || [];
        const sources = episodes.map((ep) => ({
            url: ep.url || "",
            thumbnail: ep.thumbnail || "",
            title: ep.title || "",
            site: ep.site || "",
        }));
        res.json({ sources });
    } catch (err) {
        console.error("Anime watch error:", err.message);
        res.status(502).json({ error: "Streaming unavailable" });
    }
});

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
