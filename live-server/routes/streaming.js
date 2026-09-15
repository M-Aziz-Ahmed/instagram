const express = require("express");
const dns = require("dns");
const { MOVIES, StreamingServers } = require("@consumet/extensions");
const { AsianLoad, MixDrop, StreamTape, StreamWish } = require("@consumet/extensions/dist/extractors");

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const router = express.Router();

const dramaCool = new MOVIES.DramaCool();
const flixhq = new MOVIES.FlixHQ();
const sflix = new MOVIES.SFlix();
const hiMovies = new MOVIES.HiMovies();
const goku = new MOVIES.Goku();

const SUPPORTED_DRAMA_SERVERS = new Set([
    StreamingServers.AsianLoad,
    StreamingServers.MixDrop,
    StreamingServers.StreamTape,
    StreamingServers.StreamWish,
]);

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
}

function extractorFor(name) {
    const n = String(name || "").toLowerCase();
    if (n.includes("asianload") || n.includes("serverwithtoken") || n.includes("standard")) {
        return AsianLoad;
    }
    if (n.includes("mixdrop")) return MixDrop;
    if (n.includes("streamtape")) return StreamTape;
    if (n.includes("streamwish")) return StreamWish;
    return null;
}

function normalizeSources(sources, serverName) {
    const seen = new Set();
    const out = [];
    for (const s of sources || []) {
        const url = String(s?.url || "").trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        out.push({
            url,
            quality: s?.quality || "auto",
            isM3U8: Boolean(s?.isM3U8) || /\.m3u8|master\.m3u8/i.test(url),
            server: serverName || "auto",
        });
    }
    return out;
}

function normalizeSubtitles(subtitles) {
    const seen = new Set();
    const out = [];
    for (const t of subtitles || []) {
        const url = String(t?.url || "").trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        out.push({ url, lang: String(t?.lang || t?.label || "English").trim() });
    }
    return out;
}

function pickServer(list, preferred) {
    const wanted = String(preferred || "").toLowerCase();
    const rank = (name) => {
        const n = String(name || "").toLowerCase();
        if (wanted && n.includes(wanted)) return 0;
        if (n.includes("asianload") || n.includes("serverwithtoken") || n.includes("standard")) return 1;
        if (n.includes("streamwish")) return 2;
        if (n.includes("mixdrop")) return 3;
        if (n.includes("streamtape")) return 4;
        return 100;
    };
    return [...list]
        .filter((s) => extractorFor(s.name))
        .sort((a, b) => rank(a.name) - rank(b.name));
}

async function resolveDramaEpisode(episodeId, preferredServer) {
    const servers = await withTimeout(dramaCool.fetchEpisodeServers(episodeId), 12000);
    const candidates = pickServer(servers, preferredServer);

    let lastError = null;
    for (const server of candidates) {
        try {
            const Extractor = extractorFor(server.name);
            const url = server.url.startsWith("http") ? server.url : `https:${server.url}`;
            const res = await withTimeout(new Extractor().extract(new URL(url)), 15000);
            const sources = normalizeSources(res.sources, server.name);
            if (sources.length > 0) {
                return {
                    sources,
                    subtitles: normalizeSubtitles(res.subtitles),
                    headers: { Referer: new URL(url).origin },
                    serverUsed: server.name,
                    embedUrl: "",
                };
            }
        } catch (err) {
            lastError = err;
        }
    }

    // Fallback: let the provider try its own default path (often AsianLoad -> throws for unsupported extractors)
    try {
        const res = await withTimeout(dramaCool.fetchEpisodeSources(episodeId), 12000);
        const sources = normalizeSources(res.sources);
        if (sources.length > 0) {
            return {
                sources,
                subtitles: normalizeSubtitles(res.subtitles),
                headers: res.headers || {},
                serverUsed: "provider-default",
                embedUrl: "",
            };
        }
    } catch (err) {
        lastError = err;
    }

    throw new Error(lastError?.message || "No playable server found");
}

// ── DramaCool (K/C dramas) ─────────────────────────────────────

// GET /api/streaming/dramas/search?q=&page=
router.get("/dramas/search", async (req, res) => {
    try {
        const { q, page = 1 } = req.query;
        if (!q) return res.status(400).json({ error: "Query required" });
        const data = await withTimeout(dramaCool.search(String(q), Math.max(1, Number(page) || 1)), 15000);
        res.json({
            results: (data.results || []).map((r) => ({
                id: r.id,
                title: r.title,
                image: r.image,
                url: r.url,
            })),
            currentPage: data.currentPage,
            totalPages: data.totalPages,
            hasNextPage: data.hasNextPage,
        });
    } catch (err) {
        console.error("Drama search error:", err.message);
        res.status(502).json({ error: "Drama search unavailable" });
    }
});

// GET /api/streaming/dramas/info?id=drama-detail/penthouse
router.get("/dramas/info", async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id required" });
        const info = await withTimeout(dramaCool.fetchMediaInfo(String(id)), 15000);
        const episodes = (info.episodes || []).map((ep, i) => ({
            id: ep.id,
            number: Number.isFinite(ep.episode) ? ep.episode : i + 1,
            title: ep.title || "",
            subtype: String(ep.subType || "sub").toLowerCase(),
            releaseDate: ep.releaseDate || "",
        }));
        const subtypes = [...new Set(episodes.map((e) => e.subtype))];
        res.json({
            id: info.id,
            title: info.title,
            image: info.image || "",
            description: info.description || "",
            genres: info.genres || [],
            status: info.status,
            releaseDate: info.releaseDate || "",
            otherNames: info.otherNames || [],
            episodes,
            hasSub: subtypes.includes("sub") || subtypes.length === 0,
            hasDub: subtypes.includes("dub"),
            availableSubtypes: subtypes,
            source: "dramacool",
        });
    } catch (err) {
        console.error("Drama info error:", err.message);
        res.status(502).json({ error: "Drama info unavailable" });
    }
});

// GET /api/streaming/dramas/watch?episodeId=...&server=&subOrDub=
router.get("/dramas/watch", async (req, res) => {
    try {
        const episodeId = String(req.query.episodeId || "").trim();
        if (!episodeId) return res.status(400).json({ error: "episodeId required" });
        const server = String(req.query.server || "").trim();
        const data = await resolveDramaEpisode(episodeId, server);
        res.json({ ...data, qualifies: String(req.query.subOrDub || "sub") });
    } catch (err) {
        console.error("Drama watch error:", err.message);
        res.status(502).json({ error: "Drama streaming unavailable", detail: err.message });
    }
});

// GET /api/streaming/dramas/servers?episodeId=...
router.get("/dramas/servers", async (req, res) => {
    try {
        const episodeId = String(req.query.episodeId || "").trim();
        if (!episodeId) return res.status(400).json({ error: "episodeId required" });
        const servers = (await withTimeout(dramaCool.fetchEpisodeServers(episodeId), 12000)).map((s) => ({
            name: s.name,
        }));
        res.json({ servers });
    } catch (err) {
        console.error("Drama servers error:", err.message);
        res.status(502).json({ error: "Servers unavailable" });
    }
});

// GET /api/streaming/dramas/recent?type=movie|show&page=
router.get("/dramas/recent", async (req, res) => {
    try {
        const { type = "show", page = 1 } = req.query;
        const fn = type === "movie" ? dramaCool.fetchRecentMovies : dramaCool.fetchRecentTvShows;
        const data = await withTimeout(fn(Math.max(1, Number(page) || 1)), 15000);
        res.json({
            results: (data.results || []).map((r) => ({
                id: r.id,
                title: r.title,
                image: r.image,
                url: r.url,
                episodeNumber: r.episodeNumber || null,
            })),
            hasNextPage: data.hasNextPage,
        });
    } catch (err) {
        console.error("Drama recent error:", err.message);
        res.status(502).json({ error: "Recent dramas unavailable" });
    }
});

// GET /api/streaming/dramas/spotlight
router.get("/dramas/spotlight", async (req, res) => {
    try {
        const data = await withTimeout(dramaCool.fetchSpotlight(), 15000);
        res.json({ results: (data.results || []).map((r) => ({ id: r.id, title: r.title, image: r.image, url: r.url })) });
    } catch (err) {
        console.error("Drama spotlight error:", err.message);
        res.status(502).json({ error: "Spotlight unavailable" });
    }
});

// ── FlixHQ (movies) ────────────────────────────────────────────

// GET /api/streaming/movies/search?q=&page=
router.get("/movies/search", async (req, res) => {
    try {
        const { q, page = 1 } = req.query;
        if (!q) return res.status(400).json({ error: "Query required" });

        const providers = [flixhq, sflix, hiMovies, goku];
        let lastError = null;

        for (const provider of providers) {
            try {
                const data = await withTimeout(provider.search(String(q), Math.max(1, Number(page) || 1)), 15000);
                if (data?.results?.length) {
                    return res.json({
                        results: (data.results || []).map((r) => ({
                            id: r.id,
                            title: r.title,
                            image: r.image,
                            type: r.type,
                            quality: r.quality,
                            episodeNumber: r.episodeNumber,
                            duration: r.duration,
                        })),
                        totalResults: data.totalResults,
                        hasNextPage: data.hasNextPage,
                    });
                }
            } catch (err) {
                lastError = err;
                continue;
            }
        }

        console.error("Movie search failed on all providers:", lastError?.message);
        res.status(502).json({ error: "Movie search unavailable" });
    } catch (err) {
        console.error("Movie search error:", err.message);
        res.status(502).json({ error: "Movie search unavailable" });
    }
});

// GET /api/streaming/movies/resolve?q=&year=&movieId=&episodeId=&server=
router.get("/movies/resolve", async (req, res) => {
    try {
        const { q, year, movieId, episodeId, server } = req.query;

        let mediaId = String(movieId || "").trim();
        let epId = String(episodeId || "").trim();
        let matched = null;

        const providers = [
            { name: "flixhq", instance: flixhq },
            { name: "sflix", instance: sflix },
            { name: "himovies", instance: hiMovies },
            { name: "goku", instance: goku },
        ];

        const findMediaId = async (provider, query) => {
            const data = await withTimeout(provider.search(String(query), 1), 15000);
            const results = data.results || [];
            if (!results.length) return null;

            const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
            const wantedYear = year ? String(year).match(/\d{4}/)?.[0] : null;
            let candidates = results.filter((r) => r.type === "Movie");
            if (candidates.length === 0) candidates = results;

            const qNorm = norm(query);
            let match = candidates.find((r) => norm(r.title) === qNorm);
            if (!match && wantedYear) {
                match = candidates.find((r) => String(r.title).includes(wantedYear));
            }
            if (!match) match = candidates.find((r) => norm(r.title).includes(qNorm.slice(0, Math.max(6, Math.floor(qNorm.length / 2)))));
            if (!match) match = candidates[0];

            return match;
        };

        const getEpisodeId = async (provider, id) => {
            try {
                const info = await withTimeout(provider.fetchMediaInfo(id), 15000);
                return info.episodes?.[0]?.id || id;
            } catch {
                return id;
            }
        };

        const tryProvider = async (provider) => {
            let localMediaId = mediaId;
            let localEpId = epId;
            let localMatched = matched;

            if (!localMediaId && q) {
                const match = await findMediaId(provider.instance, q);
                if (!match) return null;
                localMediaId = match.id;
                localMatched = {
                    id: match.id,
                    title: match.title,
                    image: match.image,
                    type: match.type,
                };
                localEpId = await getEpisodeId(provider.instance, localMediaId);
            } else if (!localEpId && localMediaId) {
                localEpId = await getEpisodeId(provider.instance, localMediaId);
            }

            if (!localEpId) localEpId = localMediaId;

            const wantedServer = String(server || "").toLowerCase();
            const order = [wantedServer, StreamingServers.UpCloud, StreamingServers.VidCloud, StreamingServers.MixDrop]
                .filter(Boolean);

            for (const candidate of order) {
                try {
                    const data = await withTimeout(provider.instance.fetchEpisodeSources(localEpId, localMediaId, candidate), 15000);
                    const sources = normalizeSources(data.sources, candidate);
                    if (sources.length > 0) {
                        return {
                            sources,
                            subtitles: normalizeSubtitles(data.subtitles),
                            headers: data.headers || {},
                            embedUrl: "",
                            serverUsed: candidate,
                            matched: localMatched,
                            provider: provider.name,
                        };
                    }
                } catch (err) {
                    // try next server
                }
            }
            return null;
        };

        for (const provider of providers) {
            try {
                const result = await tryProvider(provider);
                if (result) {
                    return res.json(result);
                }
            } catch (err) {
                console.error(`${provider.name} resolve failed:`, err.message);
            }
        }

        res.status(502).json({ error: "Movie streaming unavailable on all providers" });
    } catch (err) {
        console.error("Movie resolve error:", err.message);
        res.status(502).json({ error: "Movie streaming unavailable" });
    }
});

// GET /api/streaming/movies/recent?type=movie|tv
router.get("/movies/recent", async (req, res) => {
    try {
        const { type = "movie" } = req.query;

        const providers = [flixhq, sflix, hiMovies, goku];
        let lastError = null;

        for (const provider of providers) {
            try {
                const data = type === "tv"
                    ? await withTimeout(provider.fetchRecentTvShows(), 15000)
                    : await withTimeout(provider.fetchRecentMovies(), 15000);
                if (data?.results?.length) {
                    return res.json({
                        results: (data.results || []).map((r) => ({
                            id: r.id,
                            title: r.title,
                            image: r.image,
                            type: r.type,
                            quality: r.quality,
                        })),
                    });
                }
            } catch (err) {
                lastError = err;
                continue;
            }
        }

        console.error("Movie recent failed on all providers:", lastError?.message);
        res.status(502).json({ error: "Recent movies unavailable" });
    } catch (err) {
        console.error("Movie recent error:", err.message);
        res.status(502).json({ error: "Recent movies unavailable" });
    }
});

module.exports = router;