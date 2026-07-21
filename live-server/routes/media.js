const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

const {
    MediaSource,
    getMediaSource,
} = require("../utils/mediaSources");

const MediaBookmark = require("../models/mediaBookmark");
const User = require("../models/user");

function optionalAuth(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.af_session;
    if (!token) return next();
    try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
        req.userId = decoded.userId;
    } catch {}
    next();
}

function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.af_session;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
        req.userId = decoded.userId;
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
    next();
}

async function getUsername(req) {
    if (!req.userId) return null;
    const user = await User.findById(req.userId).select("username").lean();
    return user?.username;
}

function formatTMDBMedia(item, mediaType) {
    const source = getMediaSource(mediaType);
    return {
        id: item.id.toString(),
        title: item.title || item.name || "Unknown",
        originalTitle: item.original_title || item.original_name || "",
        overview: item.overview || "",
        posterPath: item.poster_path ? TMDB_IMG + item.poster_path : "",
        backdropPath: item.backdrop_path ? TMDB_IMG + item.backdrop_path : "",
        releaseDate: item.release_date || item.first_air_date || "",
        firstAirDate: item.first_air_date || "",
        voteAverage: item.vote_average || 0,
        voteCount: item.vote_count || 0,
        popularity: item.popularity || 0,
        genreIds: item.genre_ids || [],
        adult: item.adult || false,
        originalLanguage: item.original_language || "",
        mediaType: mediaType,
        source: source.label,
    };
}

function formatTMDBDetail(data, mediaType) {
    const source = getMediaSource(mediaType);
    return {
        id: data.id.toString(),
        title: data.title || data.name || "Unknown",
        originalTitle: data.original_title || data.original_name || "",
        overview: data.overview || "",
        posterPath: data.poster_path ? TMDB_IMG + data.poster_path : "",
        backdropPath: data.backdrop_path ? TMDB_IMG + data.backdrop_path : "",
        releaseDate: data.release_date || data.first_air_date || "",
        firstAirDate: data.first_air_date || "",
        lastAirDate: data.last_air_date || "",
        voteAverage: data.vote_average || 0,
        voteCount: data.vote_count || 0,
        popularity: data.popularity || 0,
        genres: (data.genres || []).map(g => g.name),
        genreIds: (data.genres || []).map(g => g.id),
        adult: data.adult || false,
        originalLanguage: data.original_language || "",
        status: data.status || "",
        numberOfSeasons: data.number_of_seasons || null,
        numberOfEpisodes: data.number_of_episodes || null,
        episodeRunTime: data.episode_run_time || [],
        languages: data.languages || [],
        networks: (data.networks || []).map(n => n.name),
        productionCompanies: (data.production_companies || []).map(c => c.name),
        productionCountries: (data.production_countries || []).map(c => c.name),
        spokenLanguages: (data.spoken_languages || []).map(l => l.english_name),
        mediaType: mediaType,
        source: source.label,
        externalIds: data.external_ids || {},
    };
}

async function tmdbSearch(query, mediaType, page = 1) {
    const source = getMediaSource(mediaType);
    let endpoint;
    let type;

    if (mediaType === "movie") {
        endpoint = "/search/movie";
        type = "movie";
    } else {
        endpoint = "/search/tv";
        type = "tv";
    }

    const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=${page}&language=en-US`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB search failed: ${res.status}`);
    const data = await res.json();

    return {
        results: (data.results || []).map(item => formatTMDBMedia(item, type)),
        totalPages: data.total_pages || 1,
        totalResults: data.total_results || 0,
        page: data.page || 1,
    };
}

async function tmdbDiscover(mediaType, options = {}) {
    const {
        page = 1,
        sortBy = "popularity.desc",
        withGenres,
        withKeywords,
        year,
        language = "en",
        region,
        includeAdult = false,
    } = options;

    let endpoint;
    if (mediaType === "movie") endpoint = "/discover/movie";
    else endpoint = "/discover/tv";

    const params = new URLSearchParams({
        api_key: TMDB_KEY,
        page,
        sort_by: sortBy,
        language: "en-US",
        include_adult: includeAdult,
    });

    if (withGenres) params.append("with_genres", withGenres);
    if (withKeywords) params.append("with_keywords", withKeywords);
    if (year) params.append("year", year);
    if (language) params.append("with_original_language", language);
    if (region) params.append("with_origin_country", region);

    const url = `${TMDB_BASE}${endpoint}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB discover failed: ${res.status}`);
    const data = await res.json();

    return {
        results: (data.results || []).map(item => formatTMDBMedia(item, mediaType === "movie" ? "movie" : "tv")),
        totalPages: data.total_pages || 1,
        totalResults: data.total_results || 0,
        page: data.page || 1,
    };
}

async function tmdbDetail(id, mediaType) {
    let endpoint;
    if (mediaType === "movie") endpoint = `/movie/${id}`;
    else endpoint = `/tv/${id}`;

    const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_KEY}&language=en-US&append_to_response=external_ids,credits,videos,images,keywords,recommendations,similar,translations`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB detail failed: ${res.status}`);
    const data = await res.json();
    return formatTMDBDetail(data, mediaType === "movie" ? "movie" : "tv");
}

async function tmdbSeasonDetail(seriesId, seasonNumber) {
    const url = `${TMDB_BASE}/tv/${seriesId}/season/${seasonNumber}?api_key=${TMDB_KEY}&language=en-US`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB season detail failed: ${res.status}`);
    return await res.json();
}

async function tmdbEpisodeDetail(seriesId, seasonNumber, episodeNumber) {
    const url = `${TMDB_BASE}/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}?api_key=${TMDB_KEY}&language=en-US`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB episode detail failed: ${res.status}`);
    return await res.json();
}

async function tmdbGenres(mediaType) {
    let endpoint;
    if (mediaType === "movie") endpoint = "/genre/movie/list";
    else endpoint = "/genre/tv/list";

    const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_KEY}&language=en-US`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB genres failed: ${res.status}`);
    const data = await res.json();
    return data.genres || [];
}

function getStreamUrl(mediaType, id, season, episode) {
    const source = getMediaSource(mediaType);
    const baseUrl = process.env.STREAM_BASE || "https://vidsrc.xyz";

    if (mediaType === "movie") {
        return `${baseUrl}/embed/movie/${id}`;
    } else {
        if (season && episode) {
            return `${baseUrl}/embed/tv/${id}/${season}/${episode}`;
        }
        return `${baseUrl}/embed/tv/${id}`;
    }
}

async function getTMDBExternalIds(id, mediaType) {
    let endpoint;
    if (mediaType === "movie") endpoint = `/movie/${id}/external_ids`;
    else endpoint = `/tv/${id}/external_ids`;

    const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    return await res.json();
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
}

router.get("/:type/search", async (req, res) => {
    try {
        const { type } = req.params;
        const { q, page = 1 } = req.query;

        if (!q) return res.status(400).json({ error: "Query required" });

        const source = getMediaSource(type);
        if (!source || source.type === "anime") {
            return res.status(400).json({ error: "Use /api/anime/search for anime" });
        }

        const result = await withTimeout(
            tmdbSearch(q, source.searchType.toLowerCase(), parseInt(page)),
            10000
        );

        res.json({
            type,
            ...result,
        });
    } catch (err) {
        console.error(`${req.params.type} search error:`, err.message);
        res.status(502).json({ error: "Search unavailable" });
    }
});

router.get("/:type/discover", async (req, res) => {
    try {
        const { type } = req.params;
        const {
            page = 1,
            sort = "popularity.desc",
            genre,
            year,
            language,
            region,
            adult = false,
        } = req.query;

        const source = getMediaSource(type);
        if (!source || source.type === "anime") {
            return res.status(400).json({ error: "Use /api/anime for anime" });
        }

        const result = await withTimeout(
            tmdbDiscover(source.searchType.toLowerCase(), {
                page: parseInt(page),
                sortBy: sort,
                withGenres: genre,
                year: year ? parseInt(year) : undefined,
                language,
                region,
                includeAdult: adult === "true",
            }),
            10000
        );

        res.json({
            type,
            ...result,
        });
    } catch (err) {
        console.error(`${req.params.type} discover error:`, err.message);
        res.status(502).json({ error: "Discover unavailable" });
    }
});

router.get("/:type/trending", async (req, res) => {
    try {
        const { type } = req.params;
        const { time_window = "week" } = req.query;

        const source = getMediaSource(type);
        if (!source || source.type === "anime") {
            return res.status(400).json({ error: "Use /api/anime/trending for anime" });
        }

        const endpoint = source.searchType.toLowerCase() === "movie"
            ? `/trending/movie/${time_window}`
            : `/trending/tv/${time_window}`;

        const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_KEY}`;
        const res_tmdb = await fetch(url);
        if (!res_tmdb.ok) throw new Error(`TMDB trending failed: ${res_tmdb.status}`);
        const data = await res_tmdb.json();

        const results = (data.results || []).map(item => formatTMDBMedia(item, source.searchType.toLowerCase()));

        res.json({ type, results, totalResults: data.total_results || 0 });
    } catch (err) {
        console.error(`${req.params.type} trending error:`, err.message);
        res.status(502).json({ error: "Trending unavailable" });
    }
});

router.get("/:type/genres", async (req, res) => {
    try {
        const { type } = req.params;
        const source = getMediaSource(type);
        if (!source || source.type === "anime") {
            return res.status(400).json({ error: "Use /api/anime/genres for anime" });
        }

        const genres = await withTimeout(
            tmdbGenres(source.searchType.toLowerCase()),
            8000
        );

        res.json({ type, genres });
    } catch (err) {
        console.error(`${req.params.type} genres error:`, err.message);
        res.status(502).json({ error: "Genres unavailable" });
    }
});

router.get("/:type/:id", async (req, res) => {
    try {
        const { type, id } = req.params;
        const source = getMediaSource(type);
        if (!source || source.type === "anime") {
            return res.status(400).json({ error: "Use /api/anime/:id for anime" });
        }

        const detail = await withTimeout(
            tmdbDetail(id, source.searchType.toLowerCase()),
            10000
        );

        res.json({ type, ...detail });
    } catch (err) {
        console.error(`${req.params.type} detail error:`, err.message);
        res.status(502).json({ error: "Detail unavailable" });
    }
});

router.get("/:type/:id/season/:season", async (req, res) => {
    try {
        const { type, id, season } = req.params;
        const source = getMediaSource(type);
        if (!source || source.searchType !== "TV") {
            return res.status(400).json({ error: "Seasons only available for TV series" });
        }

        const detail = await withTimeout(
            tmdbSeasonDetail(id, parseInt(season)),
            10000
        );

        res.json({ type, season: parseInt(season), ...detail });
    } catch (err) {
        console.error(`${req.params.type} season error:`, err.message);
        res.status(502).json({ error: "Season detail unavailable" });
    }
});

router.get("/:type/:id/season/:season/episode/:episode", async (req, res) => {
    try {
        const { type, id, season, episode } = req.params;
        const source = getMediaSource(type);
        if (!source || source.searchType !== "TV") {
            return res.status(400).json({ error: "Episodes only available for TV series" });
        }

        const detail = await withTimeout(
            tmdbEpisodeDetail(id, parseInt(season), parseInt(episode)),
            10000
        );

        res.json({ type, season: parseInt(season), episode: parseInt(episode), ...detail });
    } catch (err) {
        console.error(`${req.params.type} episode error:`, err.message);
        res.status(502).json({ error: "Episode detail unavailable" });
    }
});

router.get("/:type/:id/stream", async (req, res) => {
    try {
        const { type, id } = req.params;
        const { season, episode } = req.query;
        const source = getMediaSource(type);

        if (!source) {
            return res.status(400).json({ error: "Invalid media type" });
        }

        const streamUrl = getStreamUrl(type, id, season ? parseInt(season) : null, episode ? parseInt(episode) : null);

        const externalIds = await getTMDBExternalIds(id, source.searchType.toLowerCase());

        const sources = [
            {
                name: "VidSrc",
                url: streamUrl,
                quality: "auto",
                type: "iframe",
            },
        ];

        if (type !== "movie" && source.streamSource === "VIDSRC") {
            sources.push({
                name: "VidSrc (Season/Episode selector)",
                url: `https://vidsrc.xyz/embed/tv/${id}`,
                quality: "auto",
                type: "iframe",
            });
        }

        res.json({
            type,
            id,
            season: season ? parseInt(season) : null,
            episode: episode ? parseInt(episode) : null,
            sources,
            externalIds,
        });
    } catch (err) {
        console.error(`${req.params.type} stream error:`, err.message);
        res.status(502).json({ error: "Stream unavailable" });
    }
});

router.get("/:type/:id/recommendations", async (req, res) => {
    try {
        const { type, id } = req.params;
        const source = getMediaSource(type);
        if (!source) return res.status(400).json({ error: "Invalid media type" });

        let endpoint;
        if (source.searchType === "MOVIE") endpoint = `/movie/${id}/recommendations`;
        else endpoint = `/tv/${id}/recommendations`;

        const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_KEY}&language=en-US&page=1`;
        const res_tmdb = await fetch(url);
        if (!res_tmdb.ok) throw new Error(`TMDB recommendations failed: ${res_tmdb.status}`);
        const data = await res_tmdb.json();

        const results = (data.results || []).map(item => formatTMDBMedia(item, source.searchType.toLowerCase()));

        res.json({ type, results, totalResults: data.total_results || 0 });
    } catch (err) {
        console.error(`${req.params.type} recommendations error:`, err.message);
        res.status(502).json({ error: "Recommendations unavailable" });
    }
});

router.get("/:type/:id/similar", async (req, res) => {
    try {
        const { type, id } = req.params;
        const source = getMediaSource(type);
        if (!source) return res.status(400).json({ error: "Invalid media type" });

        let endpoint;
        if (source.searchType === "MOVIE") endpoint = `/movie/${id}/similar`;
        else endpoint = `/tv/${id}/similar`;

        const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_KEY}&language=en-US&page=1`;
        const res_tmdb = await fetch(url);
        if (!res_tmdb.ok) throw new Error(`TMDB similar failed: ${res_tmdb.status}`);
        const data = await res_tmdb.json();

        const results = (data.results || []).map(item => formatTMDBMedia(item, source.searchType.toLowerCase()));

        res.json({ type, results, totalResults: data.total_results || 0 });
    } catch (err) {
        console.error(`${req.params.type} similar error:`, err.message);
        res.status(502).json({ error: "Similar unavailable" });
    }
});

router.get("/:type/:id/videos", async (req, res) => {
    try {
        const { type, id } = req.params;
        const source = getMediaSource(type);
        if (!source) return res.status(400).json({ error: "Invalid media type" });

        let endpoint;
        if (source.searchType === "MOVIE") endpoint = `/movie/${id}/videos`;
        else endpoint = `/tv/${id}/videos`;

        const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_KEY}&language=en-US`;
        const res_tmdb = await fetch(url);
        if (!res_tmdb.ok) throw new Error(`TMDB videos failed: ${res_tmdb.status}`);
        const data = await res_tmdb.json();

        const videos = (data.results || []).filter(v => v.site === "YouTube" && v.type === "Trailer");

        res.json({ type, videos });
    } catch (err) {
        console.error(`${req.params.type} videos error:`, err.message);
        res.status(502).json({ error: "Videos unavailable" });
    }
});

router.get("/:type/:id/credits", async (req, res) => {
    try {
        const { type, id } = req.params;
        const source = getMediaSource(type);
        if (!source) return res.status(400).json({ error: "Invalid media type" });

        let endpoint;
        if (source.searchType === "MOVIE") endpoint = `/movie/${id}/credits`;
        else endpoint = `/tv/${id}/credits`;

        const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_KEY}&language=en-US`;
        const res_tmdb = await fetch(url);
        if (!res_tmdb.ok) throw new Error(`TMDB credits failed: ${res_tmdb.status}`);
        const data = await res_tmdb.json();

        res.json({
            type,
            cast: (data.cast || []).slice(0, 20).map(c => ({
                id: c.id,
                name: c.name,
                character: c.character,
                profilePath: c.profile_path ? TMDB_IMG + c.profile_path : "",
                order: c.order,
            })),
            crew: (data.crew || []).filter(c => ["Director", "Writer", "Creator", "Producer", "Executive Producer"].includes(c.job)).map(c => ({
                id: c.id,
                name: c.name,
                job: c.job,
                profilePath: c.profile_path ? TMDB_IMG + c.profile_path : "",
            })),
        });
    } catch (err) {
        console.error(`${req.params.type} credits error:`, err.message);
        res.status(502).json({ error: "Credits unavailable" });
    }
});

router.get("/types", (req, res) => {
    const types = Object.values(MediaSource).filter(s => s.type !== "anime").map(s => ({
        type: s.type,
        label: s.label,
        emoji: s.emoji,
        searchType: s.searchType,
    }));
    res.json({ types });
});

module.exports = router;