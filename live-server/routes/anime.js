const express = require("express");
const fetch = require("node-fetch");
const dns = require("dns");
const { ANIME } = require("@consumet/extensions");
const router = express.Router();

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const ANILIST = "https://graphql.anilist.co";
const GOGO_BASE = "https://gogoanimehd.to";

const animeUnity = new ANIME.AnimeUnity();

// Caches: anilistId -> streaming provider ID
const gogoIdCache = new Map();
const gogoEpisodeCache = new Map();
const unityIdCache = new Map();
const unityEpisodeCache = new Map();

async function gql(query, variables = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(ANILIST, {
                method: "POST",
                headers: { "Content-Type": "application/json", "User-Agent": "AnonTweet/1.0" },
                body: JSON.stringify({ query, variables }),
                timeout: 20000,
                family: 4,
            });
            const json = await res.json();
            if (json.errors) throw new Error(json.errors[0]?.message || "AniList error");
            return json.data;
        } catch (err) {
            if (i === retries) throw err;
            await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
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

        let episodes = [];
        let hasSub = true;
        let hasDub = true;
        let source = "none";

        const [gogoResult, unityResult] = await Promise.allSettled([
            fetchGogoEpisodes(id, title),
            fetchUnityEpisodes(id, title),
        ]);

        const gogoEps = gogoResult.status === "fulfilled" ? gogoResult.value : [];
        const unityEps = unityResult.status === "fulfilled" ? unityResult.value : [];

        if (gogoEps.length > 0) {
            episodes = gogoEps;
            source = "gogoanime";
        } else if (unityEps.length > 0) {
            episodes = unityEps;
            source = "animeunity";
            hasDub = false;
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

        const [gogoResult, unityResult] = await Promise.allSettled([
            fetchGogoEpisodes(id, title),
            fetchUnityEpisodes(id, title),
        ]);

        const gogoEps = gogoResult.status === "fulfilled" ? gogoResult.value : [];
        if (gogoEps.length > 0) return res.json({ episodes: gogoEps, source: "gogoanime" });

        const unityEps = unityResult.status === "fulfilled" ? unityResult.value : [];
        if (unityEps.length > 0) return res.json({ episodes: unityEps, source: "animeunity" });

        res.json({ episodes: [], message: "No streaming source found" });
    } catch (err) {
        console.error("Anime episodes error:", err.message);
        res.status(502).json({ error: "Episodes unavailable" });
    }
});

// ── Get stream URL for an episode ─────────────────────────────
router.get("/watch/:episodeId", async (req, res) => {
    try {
        const episodeId = decodeURIComponent(req.params.episodeId);
        const { subOrDub } = req.query;

        if (episodeId.startsWith("gogo:")) {
            try {
                const parts = episodeId.split(":");
                const slug = parts[1];
                const epNum = parts[2];
                const quality = subOrDub === "dub" ? "DUB" : "SUB";
                const data = await withTimeout(gogoFetchJson(`/api/episode/${slug}/${epNum}`), 10000);
                const qualities = data?.server?.qualities || [];
                const qualityBlock = qualities.find(q => q.title === quality) || qualities.find(q => q.title === "SUB") || qualities[0];
                const servers = qualityBlock?.serverList || [];
                const sources = [];

                if (servers.length) {
                    const primaryServer = servers[0];
                    try {
                        const srvData = await withTimeout(gogoFetchJson(`/api/server?id=${encodeURIComponent(primaryServer.serverId)}`), 8000);
                        if (srvData?.url) {
                            const fullUrl = srvData.url.startsWith("http") ? srvData.url : `${GOGO_BASE}${srvData.url}`;
                            sources.push({ url: fullUrl, quality: quality, isM3U8: true });
                        }
                    } catch { /* server resolve failed */ }
                }

                if (!sources.length && data?.defaultStreamingUrl) {
                    const fullUrl = data.defaultStreamingUrl.startsWith("http") ? data.defaultStreamingUrl : `${GOGO_BASE}${data.defaultStreamingUrl}`;
                    sources.push({ url: fullUrl, quality: quality, isM3U8: true });
                }

                if (sources.length) {
                    return res.json({ sources, subtitles: [], source: "gogoanime", audioTracks: [] });
                }
            } catch (e) {
                console.error("Gogoanime watch error:", e.message);
            }
        }

        // AnimeUnity fallback
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
    const episodeId = decodeURIComponent(req.params.episodeId);
    if (episodeId.startsWith("gogo:")) {
        try {
            const parts = episodeId.split(":");
            const data = await gogoFetchJson(`/api/episode/${parts[1]}/${parts[2]}`);
            const qualities = data?.server?.qualities || [];
            res.json({ qualities });
            return;
        } catch { /* fallback */ }
    }
    res.json({ qualities: [] });
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

// ── Gogoanime helpers (gogoanimehd.to JSON API) ─────────────

async function gogoFetch(path) {
    const res = await fetch(`${GOGO_BASE}${path}`, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
        timeout: 12000,
        redirect: "follow",
    });
    if (!res.ok) throw new Error(`Gogo ${res.status}`);
    return res;
}

async function gogoFetchJson(path) {
    const res = await gogoFetch(path);
    return res.json();
}

async function findGogoId(anilistId, title) {
    if (gogoIdCache.has(anilistId)) return gogoIdCache.get(anilistId);
    if (!title) return null;
    try {
        const data = await withTimeout(gogoFetchJson(`/api/search?q=${encodeURIComponent(title)}`), 10000);
        const items = data?.items || [];
        if (!items.length) return null;

        const norm = title.toLowerCase().replace(/[^a-z0-9]/g, "");
        let match = items.find(i => {
            const t = (i.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
            const te = (i.title_english || "").toLowerCase().replace(/[^a-z0-9]/g, "");
            return t === norm || te === norm;
        });
        if (!match) match = items.find(i => i.type === "TV" && (
            (i.title || "").toLowerCase().includes(title.toLowerCase()) ||
            (i.title_english || "").toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes((i.title || "").toLowerCase())
        ));
        if (!match) match = items.find(i =>
            (i.title || "").toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes((i.title || "").toLowerCase())
        );
        if (!match) match = items[0];
        if (!match?.slug) return null;

        const result = { slug: match.slug, episodeCount: match.latest_episode || match.actual_episodes_count || 0 };
        gogoIdCache.set(anilistId, result);
        return result;
    } catch { return null; }
}

async function fetchGogoEpisodes(anilistId, title) {
    const info = await findGogoId(anilistId, title);
    if (!info?.slug) return [];
    const slug = info.slug;
    if (gogoEpisodeCache.has(slug)) return gogoEpisodeCache.get(slug);
    try {
        const totalEps = info.episodeCount || 50;
        const episodes = [];
        for (let i = 1; i <= totalEps; i++) {
            episodes.push({ id: `gogo:${slug}:${i}`, number: i, title: "" });
        }
        gogoEpisodeCache.set(slug, episodes);
        return episodes;
    } catch { return []; }
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
