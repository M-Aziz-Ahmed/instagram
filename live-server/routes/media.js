const express = require("express");
const fetch = require("node-fetch");
const dns = require("dns");
const router = express.Router();

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const TVMAZE_BASE = "https://api.tvmaze.com";

const {
    MediaSource,
    getMediaSource,
} = require("../utils/mediaSources");

const PLURAL_TO_SINGULAR = {
    movies: "movie",
    kdramas: "kdrama",
    cdramas: "cdrama",
    cartoons: "cartoon",
    seasons: "season",
};

function normalizeType(type) {
    return PLURAL_TO_SINGULAR[type] || type;
}

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
        vote_average: show.rating?.average ? show.rating.average / 2 : 0,
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
        episodes: (show._embedded?.episodes || []).filter(e => e.season === 1).map(formatTVMazeEpisode),
        externals: show.externals || {},
        schedule: show.schedule || {},
    };
}

function formatTVMazeEpisode(ep) {
    return {
        id: ep.id.toString(),
        episodeNumber: ep.number,
        episode_number: ep.number,
        seasonNumber: ep.season,
        name: ep.name,
        overview: ep.summary ? ep.summary.replace(/<[^>]*>/g, "") : "",
        airDate: ep.airdate,
        air_date: ep.airdate,
        runtime: ep.runtime,
        voteAverage: ep.rating?.average ? ep.rating.average / 2 : 0,
        vote_average: ep.rating?.average ? ep.rating.average / 2 : 0,
        stillPath: ep.image?.medium || ep.image?.original || "",
    };
}

async function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
}

async function fetchTVMaze(path, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await withTimeout(
                fetch(`${TVMAZE_BASE}${path}`, { family: 4, timeout: 10000 }),
                12000
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            if (i === retries) throw err;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

// Helper functions for type-specific filtering
function getTypeCountry(type) {
    const countries = { kdrama: "KR", cdrama: "CN" };
    return countries[type];
}

function getTypeGenre(type) {
    const genres = { cartoon: "Animation", kdrama: "Drama", cdrama: "Drama" };
    return genres[type];
}

function getTypeQueries(type) {
    const queries = {
        kdrama: ["korean drama", "k-drama", "korean series"],
        cdrama: ["chinese drama", "c-drama", "mandarin series"],
        cartoon: ["animation", "cartoon", "animated series"],
        season: ["tv series", "television series"],
    };
    return queries[type] || [];
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

async function resolveImdbId(type, id) {
    if (type === "movie") return id;
    try {
        const show = await fetchTVMaze(`/shows/${id}`);
        return show?.externals?.imdb || id;
    } catch {
        return id;
    }
}

// ── Search ─────────────────────────────────────────────────────────
router.get("/:type/search", async (req, res) => {
    try {
        const type = normalizeType(req.params.type);
        const { q, page = 1 } = req.query;
        if (!q) return res.status(400).json({ error: "Query required" });

        const source = getMediaSource(type);
        if (!source || source.type === "anime") {
            return res.status(400).json({ error: "Use /api/anime/search for anime" });
        }

        const results = await fetchTVMaze(`/search/shows?q=${encodeURIComponent(q)}`);

        // Filter by type-specific criteria
        const typeQueries = getTypeQueries(type);
        const typeCountry = getTypeCountry(type);
        const typeGenre = getTypeGenre(type);

        const formatted = results
            .filter(r => r.show)
            .filter(r => {
                const show = r.show;
                // Filter by type-specific criteria
                if (type === "movie") return true; // Movies don't have a specific type in TVMaze
                if (typeCountry && show.network?.country?.code === typeCountry) return true;
                if (typeGenre && show.genres?.includes(typeGenre)) return true;
                if (type === "cartoon" && show.genres?.some(g => g.toLowerCase().includes("animat"))) return true;
                if (type === "kdrama" && show.language === "Korean") return true;
                if (type === "cdrama" && (show.language === "Chinese" || show.language === "Mandarin")) return true;
                if (type === "season" && show.type === "Scripted") return true;
                return true; // fallback
            })
            .map(r => formatTVMazeShow(r.show, type))
            .slice(0, 20);

        res.json({ type, results: formatted, page: parseInt(page), totalPages: 1, totalResults: formatted.length });
    } catch (err) {
        console.error(`${req.params.type} search error:`, err.message);
        res.status(502).json({ error: "Search unavailable" });
    }
});

function getTypeQueries(type) {
    const queries = {
        movie: ["movie", "film", "cinema"],
        kdrama: ["korean drama", "kdrama", "korean series"],
        cdrama: ["chinese drama", "cdrama", "chinese series", "mandarin drama"],
        cartoon: ["animation", "cartoon", "animated series", "kids animation"],
        season: ["series", "tv series", "tv show", "television"],
    };
    return queries[type] || ["tv series"];
}

function getTypeCountry(type) {
    const countries = {
        kdrama: "KR",
        cdrama: "CN",
    };
    return countries[type];
}

function getTypeGenre(type) {
    const genres = {
        cartoon: "Animation",
        movie: "Movie",
    };
    return genres[type];
}

// ── Discover / Browse ──────────────────────────────────────────────
router.get("/:type/discover", async (req, res) => {
    try {
        const type = normalizeType(req.params.type);
        const { page = 1, genre, country, sort = "popularity" } = req.query;

        const source = getMediaSource(type);
        if (!source || source.type === "anime") {
            return res.status(400).json({ error: "Use /api/anime for anime" });
        }

        // TVMaze doesn't have discover - use search with genre terms or schedule
        let results;
        const typeCountry = getTypeCountry(type);
        const typeGenre = getTypeGenre(type);
        const typeQueries = getTypeQueries(type);

        if (typeCountry) {
            // Use country-specific schedule for K-Dramas, C-Dramas
            const schedule = await fetchTVMaze(`/schedule?country=${typeCountry}`);
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
        } else if (typeGenre) {
            // Use genre search for cartoons (Animation)
            const searchResults = await fetchTVMaze(`/search/shows?q=${encodeURIComponent(typeGenre)}`);
            results = searchResults.map(r => r.show).filter(s => s.genres?.includes(typeGenre));
        } else {
            // Use type-specific search queries
            const promises = typeQueries.slice(0, 8).map(q =>
                fetchTVMaze(`/search/shows?q=${encodeURIComponent(q)}`)
            );
            const allResults = await Promise.allSettled(promises);
            results = allResults
                .filter(r => r.status === "fulfilled")
                .flatMap(r => r.value.map(x => x.show))
                .filter((s, i, a) => a.findIndex(x => x.id === s.id) === i);
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
        const type = normalizeType(req.params.type);
        const { time_window = "week" } = req.query;

        const source = getMediaSource(type);
        if (!source || source.type === "anime") {
            return res.status(400).json({ error: "Use /api/anime/trending for anime" });
        }

        // Type-specific trending queries
        const trendingQueries = {
            kdrama: ["korean drama", "squid game", "vincenzo", "crash landing on you", "goblin", "itaewon class", "hospital playlist", "reply 1988", "moon lovers"],
            cdrama: ["chinese drama", "the untamed", "nirvana in fire", "story of yanxi palace", "eternal love", "ashes of love", "love between fairy and devil"],
            cartoon: ["animation", "avatar the last airbender", "rick and morty", "adventure time", "steven universe", "gravity falls", "the owl house", "amphibia", "bluey"],
            season: ["game of thrones", "breaking bad", "stranger things", "the office", "friends", "the witcher", "mandalorian", "squid game", "attack on titan", "one piece", "the last of us", "house of the dragon"],
            movie: ["movie", "film", "marvel", "dc", "disney", "pixar", "animation", "superhero"],
        };

        const queries = trendingQueries[type] || ["tv series"];
        const promises = queries.slice(0, 12).map(q =>
            fetchTVMaze(`/search/shows?q=${encodeURIComponent(q)}`).catch(() => [])
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
        const type = normalizeType(req.params.type);
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
        const type = normalizeType(req.params.type);
        const { id } = req.params;
        const source = getMediaSource(type);
        if (!source || source.type === "anime") {
            return res.status(400).json({ error: "Use /api/anime/:id for anime" });
        }

        // TVMaze only has TV shows - return 404 for movie type
        if (type === "movie") {
            return res.status(404).json({ error: "Movies not available via TVMaze" });
        }

        // Try direct ID lookup first
        let show;
        try {
            show = await fetchTVMaze(`/shows/${id}?embed=episodes,cast,images`);
        } catch (directErr) {
            // If direct ID fails, try searching by title from query param
            const { title } = req.query;
            if (title) {
                try {
                    const searchResults = await fetchTVMaze(`/search/shows?q=${encodeURIComponent(title)}`);
                    const match = searchResults.find(r => r.show && r.show.id.toString() === id) || searchResults[0];
                    if (match?.show) show = match.show;
                } catch {}
            }
            if (!show) return res.status(404).json({ error: "Show not found in TVMaze" });
        }

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
        const type = normalizeType(req.params.type);
        const { id, season } = req.params;
        const source = getMediaSource(type);
        if (!source || source.searchType !== "TV") {
            return res.status(400).json({ error: "Seasons only available for TV series" });
        }

        const show = await fetchTVMaze(`/shows/${id}/seasons`);

        const seasonData = show.find(s => s.number === parseInt(season));
        if (!seasonData) return res.status(404).json({ error: "Season not found" });

        const episodes = await fetchTVMaze(`/shows/${id}/episodes`);

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
        const type = normalizeType(req.params.type);
        const { id, season, episode } = req.params;
        const source = getMediaSource(type);
        if (!source || source.searchType !== "TV") {
            return res.status(400).json({ error: "Episodes only available for TV series" });
        }

        const episodes = await fetchTVMaze(`/shows/${id}/episodes`);

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
        const type = normalizeType(req.params.type);
        const { id } = req.params;
        const { season, episode, imdb } = req.query;
        const source = getMediaSource(type);

        if (!source) return res.status(400).json({ error: "Invalid media type" });

        const resolvedId = imdb || await resolveImdbId(type, id);
        const streamUrl = getStreamUrl(type, resolvedId, season ? parseInt(season) : null, episode ? parseInt(episode) : null);

        res.json({ url: streamUrl, type, id, season: season ? parseInt(season) : null, episode: episode ? parseInt(episode) : null });
    } catch (err) {
        console.error(`${req.params.type} stream error:`, err.message);
        res.status(502).json({ error: "Stream unavailable" });
    }
});

// ── Recommendations ────────────────────────────────────────────────
router.get("/:type/:id/recommendations", async (req, res) => {
    try {
        const type = normalizeType(req.params.type);
        const { id } = req.params;
        const source = getMediaSource(type);
        if (!source) return res.status(400).json({ error: "Invalid media type" });

        // TVMaze doesn't have recommendations - search similar by genre
        const show = await fetchTVMaze(`/shows/${id}`);
        const genres = show.genres || [];
        if (!genres.length) return res.json({ type, results: [] });

        const genre = genres[0];
        const searchResults = await fetchTVMaze(`/search/shows?q=${encodeURIComponent(genre)}`).catch(() => []);

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
        const type = normalizeType(req.params.type);
        const { id } = req.params;
        const source = getMediaSource(type);
        if (!source) return res.status(400).json({ error: "Invalid media type" });

        // Same as recommendations for TVMaze
        const show = await fetchTVMaze(`/shows/${id}`);
        const genres = show.genres || [];
        if (!genres.length) return res.json({ type, results: [] });

        const genre = genres[0];
        const searchResults = await fetchTVMaze(`/search/shows?q=${encodeURIComponent(genre)}`).catch(() => []);

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
        const type = normalizeType(req.params.type);
        const { id } = req.params;
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
        const type = normalizeType(req.params.type);
        const { id } = req.params;
        const source = getMediaSource(type);
        if (!source) return res.status(400).json({ error: "Invalid media type" });

        const cast = await fetchTVMaze(`/shows/${id}/cast`).catch(() => []);

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