const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

const TVMAZE_BASE = "https://api.tvmaze.com";

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

function formatTVMazeShow(show, mediaType) {
    const source = getMediaSource(mediaType);
    const genres = show.genres || [];
    const network = show.network?.name || show.webChannel?.name || "";
    const status = show.status || "";
    const runtime = show.runtime || 0;
    const premiered = show.premiered || "";
    const ended = show.ended || "";
    const image = show.image ? { medium: show.image.medium, original: show.image.original } : null;

    return {
        id: show.id.toString(),
        tvmazeId: show.id,
        title: show.name,
        originalTitle: show.name,
        overview: show.summary ? show.summary.replace(/<[^>]*>/g, "") : "",
        posterPath: image?.medium || "",
        backdropPath: image?.original || "",
        releaseDate: premiered,
        firstAirDate: premiered,
        lastAirDate: ended,
        voteAverage: show.rating?.average ? show.rating.average / 2 : 0,
        voteCount: show.rating?.average ? 1 : 0,
        popularity: show.weight || 0,
        genreIds: genres.map(g => g.toLowerCase().replace(/[^a-z]/g, "")),
        genres: genres,
        adult: false,
        originalLanguage: show.language || "en",
        mediaType: mediaType === "movie" ? "movie" : "tv",
        source: source.label,
        status,
        network,
        runtime,
        numberOfSeasons: show._embedded?.episodes ? [...new Set(show._embedded.episodes.map(e => e.season))].length : null,
        numberOfEpisodes: show._embedded?.episodes?.length || null,
        externals: show.externals || {},
        schedule: show.schedule || {},
    };
}

function formatTVMazeEpisode(ep) {
    return {
        id: ep.id.toString(),
        episodeNumber: ep.number,
        seasonNumber: ep.season,
        name: ep.name,
        overview: ep.summary ? ep.summary.replace(/<[^>]*>/g, "") : "",
        airDate: ep.airdate,
        runtime: ep.runtime,
        voteAverage: ep.rating?.average ? ep.rating.average / 2 : 0,
        stillPath: ep.image?.medium || ep.image?.original || "",
    };
}

async function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
}

function getStreamUrl(mediaType, id, season, episode) {
    if (mediaType === "movie") {
        return `https://vidsrc.xyz/embed/movie/${id}`;
    } else {
        if (season && episode) {
            return `https://vidsrc.xyz/embed/tv/${id}/${season}/${episode}`;
        }
        return `https://vidsrc.xyz/embed/tv/${id}`;
    }
}

// ── Search ─────────────────────────────────────────────────────────
router.get("/:type/search", async (req, res) => {
    try {
        const { type } = req.params;
        const { q, page = 1 } = req.query;
        if (!q) return res.status(400).json({ error: "Query required" });

        const source = getMediaSource(type);
        if (!source || source.type === "anime") {
            return res.status(400).json({ error: "Use /api/anime/search for anime" });
        }

        const results = await withTimeout(
            fetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(q)}`).then(r => r.json()),
            10000
        );

        const formatted = results
            .filter(r => r.show && (type === "movie" || r.show.type === "Scripted"))
            .map(r => formatTVMazeShow(r.show, type))
            .slice(0, 20);

        res.json({ type, results: formatted, page: parseInt(page), totalPages: 1, totalResults: formatted.length });
    } catch (err) {
        console.error(`${req.params.type} search error:`, err.message);
        res.status(502).json({ error: "Search unavailable" });
    }
});

// ── Discover / Browse ──────────────────────────────────────────────
router.get("/:type/discover", async (req, res) => {
    try {
        const { type } = req.params;
        const { page = 1, genre, country, sort = "popularity" } = req.query;

        const source = getMediaSource(type);
        if (!source || source.type === "anime") {
            return res.status(400).json({ error: "Use /api/anime for anime" });
        }

        // TVMaze doesn't have discover - use search with genre terms or schedule
        let results;
        if (country) {
            const schedule = await withTimeout(
                fetch(`${TVMAZE_BASE}/schedule?country=${country}`).then(r => r.json()),
                10000
            );
            const uniqueShows = [];
            const seen = new Set();
            for (const item of schedule) {
                if (item.show && !seen.has(item.show.id)) {
                    seen.add(item.show.id);
                    uniqueShows.push(item.show);
                    if (uniqueShows.length >= 20) break;
                }
            }
            results = uniqueShows;
        } else if (genre) {
            const searchResults = await withTimeout(
                fetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(genre)}`).then(r => r.json()),
                10000
            );
            results = searchResults.map(r => r.show).filter(s => s.genres?.includes(genre));
        } else {
            // Fallback: popular search
            const popular = ["game of thrones", "breaking bad", "stranger things", "the office", "friends", "the witcher", "mandalorian", "squid game", "attack on titan", "one piece"];
            const promises = popular.slice(0, 10).map(q =>
                fetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(q)}`).then(r => r.json())
            );
            const allResults = await Promise.all(promises);
            results = allResults.flatMap(r => r.map(x => x.show)).filter((s, i, a) => a.findIndex(x => x.id === s.id) === i);
        }

        const formatted = (results || []).map(s => formatTVMazeShow(s, type)).slice(0, 20);
        res.json({ type, results: formatted, page: parseInt(page), totalPages: 1, totalResults: formatted.length });
    } catch (err) {
        console.error(`${req.params.type} discover error:`, err.message);
        res.status(502).json({ error: "Discover unavailable" });
    }
});

// ── Trending ───────────────────────────────────────────────────────
router.get("/:type/trending", async (req, res) => {
    try {
        const { type } = req.params;
        const { time_window = "week" } = req.query;

        const source = getMediaSource(type);
        if (!source || source.type === "anime") {
            return res.status(400).json({ error: "Use /api/anime/trending for anime" });
        }

        // TVMaze doesn't have trending - use a curated popular list
        const popularQueries = ["game of thrones", "breaking bad", "stranger things", "the office", "friends", "the witcher", "mandalorian", "squid game", "attack on titan", "one piece", "the last of us", "house of the dragon", "better call saul", "chernobyl", "the boys"];
        const promises = popularQueries.slice(0, 12).map(q =>
            fetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(q)}`).then(r => r.json())
        );
        const allResults = await Promise.all(promises);
        const shows = allResults.flatMap(r => r.map(x => x.show)).filter((s, i, a) => a.findIndex(x => x.id === s.id) === i);

        const formatted = shows.slice(0, 18).map(s => formatTVMazeShow(s, type));
        res.json({ type, results: formatted, totalResults: formatted.length });
    } catch (err) {
        console.error(`${req.params.type} trending error:`, err.message);
        res.status(502).json({ error: "Trending unavailable" });
    }
});

// ── Genres ─────────────────────────────────────────────────────────
router.get("/:type/genres", async (req, res) => {
    try {
        const { type } = req.params;
        const source = getMediaSource(type);
        if (!source) return res.status(400).json({ error: "Invalid media type" });

        // TVMaze genres are just strings in show.genres
        const commonGenres = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Drama", "Fantasy", "Horror", "Mystery", "Romance", "Sci-Fi", "Thriller", "Western", "Family", "Reality", "Documentary", "News", "Talk", "War", "Politics", "History", "Music", "Sport", "Kids", "Anime", "Superhero", "Medical", "Legal", "Food", "Travel", "Home", "Game Show"];
        res.json({ type, genres: commonGenres });
    } catch (err) {
        console.error(`${req.params.type} genres error:`, err.message);
        res.status(502).json({ error: "Genres unavailable" });
    }
});

// ── Detail ─────────────────────────────────────────────────────────
router.get("/:type/:id", async (req, res) => {
    try {
        const { type, id } = req.params;
        const source = getMediaSource(type);
        if (!source || source.type === "anime") {
            return res.status(400).json({ error: "Use /api/anime/:id for anime" });
        }

        const show = await withTimeout(
            fetch(`${TVMAZE_BASE}/shows/${id}?embed=episodes,cast,images`).then(r => {
                if (!r.ok) throw new Error("Not found");
                return r.json();
            }),
            10000
        );

        const formatted = formatTVMazeShow(show, type);
        res.json({ type, ...formatted });
    } catch (err) {
        console.error(`${req.params.type} detail error:`, err.message);
        res.status(502).json({ error: "Detail unavailable" });
    }
});

// ── Season ─────────────────────────────────────────────────────────
router.get("/:type/:id/season/:season", async (req, res) => {
    try {
        const { type, id, season } = req.params;
        const source = getMediaSource(type);
        if (!source || source.searchType !== "TV") {
            return res.status(400).json({ error: "Seasons only available for TV series" });
        }

        const show = await withTimeout(
            fetch(`${TVMAZE_BASE}/shows/${id}/seasons`).then(r => r.json()),
            10000
        );

        const seasonData = show.find(s => s.number === parseInt(season));
        if (!seasonData) return res.status(404).json({ error: "Season not found" });

        const episodes = await withTimeout(
            fetch(`${TVMAZE_BASE}/shows/${id}/episodes`).then(r => r.json()),
            10000
        );

        const seasonEpisodes = episodes
            .filter(e => e.season === parseInt(season))
            .map(formatTVMazeEpisode);

        res.json({ type, season: parseInt(season), episodes: seasonEpisodes, ...seasonData });
    } catch (err) {
        console.error(`${req.params.type} season error:`, err.message);
        res.status(502).json({ error: "Season unavailable" });
    }
});

// ── Episode ────────────────────────────────────────────────────────
router.get("/:type/:id/season/:season/episode/:episode", async (req, res) => {
    try {
        const { type, id, season, episode } = req.params;
        const source = getMediaSource(type);
        if (!source || source.searchType !== "TV") {
            return res.status(400).json({ error: "Episodes only available for TV series" });
        }

        const episodes = await withTimeout(
            fetch(`${TVMAZE_BASE}/shows/${id}/episodes`).then(r => r.json()),
            10000
        );

        const ep = episodes.find(e => e.season === parseInt(season) && e.number === parseInt(episode));
        if (!ep) return res.status(404).json({ error: "Episode not found" });

        res.json({ type, season: parseInt(season), episode: parseInt(episode), ...formatTVMazeEpisode(ep) });
    } catch (err) {
        console.error(`${req.params.type} episode error:`, err.message);
        res.status(502).json({ error: "Episode unavailable" });
    }
});

// ── Stream ─────────────────────────────────────────────────────────
router.get("/:type/:id/stream", async (req, res) => {
    try {
        const { type, id } = req.params;
        const { season, episode } = req.query;
        const source = getMediaSource(type);

        if (!source) return res.status(400).json({ error: "Invalid media type" });

        const streamUrl = getStreamUrl(type, id, season ? parseInt(season) : null, episode ? parseInt(episode) : null);

        const sources = [
            { name: "VidSrc", url: streamUrl, quality: "auto", type: "iframe" },
        ];

        if (type !== "movie") {
            sources.push({
                name: "VidSrc (Selector)",
                url: `https://vidsrc.xyz/embed/tv/${id}`,
                quality: "auto",
                type: "iframe",
            });
        }

        res.json({ type, id, season: season ? parseInt(season) : null, episode: episode ? parseInt(episode) : null, sources });
    } catch (err) {
        console.error(`${req.params.type} stream error:`, err.message);
        res.status(502).json({ error: "Stream unavailable" });
    }
});

// ── Recommendations ────────────────────────────────────────────────
router.get("/:type/:id/recommendations", async (req, res) => {
    try {
        const { type, id } = req.params;
        const source = getMediaSource(type);
        if (!source) return res.status(400).json({ error: "Invalid media type" });

        // TVMaze doesn't have recommendations - search similar by genre
        const show = await withTimeout(
            fetch(`${TVMAZE_BASE}/shows/${id}`).then(r => r.json()),
            8000
        );
        const genres = show.genres || [];
        if (!genres.length) return res.json({ type, results: [] });

        const genre = genres[0];
        const searchResults = await withTimeout(
            fetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(genre)}`).then(r => r.json()),
            8000
        );

        const results = searchResults
            .map(r => r.show)
            .filter(s => s.id !== parseInt(id))
            .slice(0, 10)
            .map(s => formatTVMazeShow(s, type));

        res.json({ type, results, totalResults: results.length });
    } catch (err) {
        console.error(`${req.params.type} recommendations error:`, err.message);
        res.status(502).json({ error: "Recommendations unavailable" });
    }
});

// ── Similar ────────────────────────────────────────────────────────
router.get("/:type/:id/similar", async (req, res) => {
    try {
        const { type, id } = req.params;
        const source = getMediaSource(type);
        if (!source) return res.status(400).json({ error: "Invalid media type" });

        // Same as recommendations for TVMaze
        const show = await withTimeout(
            fetch(`${TVMAZE_BASE}/shows/${id}`).then(r => r.json()),
            8000
        );
        const genres = show.genres || [];
        if (!genres.length) return res.json({ type, results: [] });

        const genre = genres[0];
        const searchResults = await withTimeout(
            fetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(genre)}`).then(r => r.json()),
            8000
        );

        const results = searchResults
            .map(r => r.show)
            .filter(s => s.id !== parseInt(id))
            .slice(0, 10)
            .map(s => formatTVMazeShow(s, type));

        res.json({ type, results, totalResults: results.length });
    } catch (err) {
        console.error(`${req.params.type} similar error:`, err.message);
        res.status(502).json({ error: "Similar unavailable" });
    }
});

// ── Videos (Trailers) ──────────────────────────────────────────────
router.get("/:type/:id/videos", async (req, res) => {
    try {
        const { type, id } = req.params;
        const source = getMediaSource(type);
        if (!source) return res.status(400).json({ error: "Invalid media type" });

        // TVMaze doesn't have videos - return empty
        res.json({ type, videos: [] });
    } catch (err) {
        console.error(`${req.params.type} videos error:`, err.message);
        res.status(502).json({ error: "Videos unavailable" });
    }
});

// ── Credits ────────────────────────────────────────────────────────
router.get("/:type/:id/credits", async (req, res) => {
    try {
        const { type, id } = req.params;
        const source = getMediaSource(type);
        if (!source) return res.status(400).json({ error: "Invalid media type" });

        const cast = await withTimeout(
            fetch(`${TVMAZE_BASE}/shows/${id}/cast`).then(r => r.json()),
            8000
        );

        res.json({
            type,
            cast: (cast || []).slice(0, 20).map(c => ({
                id: c.person.id,
                name: c.person.name,
                character: c.character?.name || "",
                profilePath: c.person.image?.medium || "",
                order: 0,
            })),
            crew: [],
        });
    } catch (err) {
        console.error(`${req.params.type} credits error:`, err.message);
        res.status(502).json({ error: "Credits unavailable" });
    }
});

// ── Types List ─────────────────────────────────────────────────────
router.get("/types", (req, res) => {
    const types = Object.values(MediaSource)
        .filter(s => s.type !== "anime")
        .map(s => ({ type: s.type, label: s.label, emoji: s.emoji, searchType: s.searchType }));
    res.json({ types });
});

module.exports = router;