"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import MediaCard from "./MediaCard";
import MediaPlayer from "./MediaPlayer";
import Tabs from "@/components/ui/Tabs";
import ImportDataButton from "@/components/common/ImportDataButton";
import MediaBookmarkButton from "@/components/shared/MediaBookmarkButton";

const fmtNum = (n) => (n == null ? "?" : n.toLocaleString());

const EMBED_HOSTS = ["vidsrc.to", "vidsrc.in", "vidsrc.su", "vidsrc.me", "2embed.cc", "vidsrc.xyz"];

const ROUTE_BY_TYPE = {
    movie: "movies",
    kdrama: "kdramas",
    season: "seasons",
    cdrama: "cdramas",
    cartoon: "cartoons",
};

function buildEmbedList(url, urls) {
    const list = [];
    const push = (u) => {
        if (u && !list.includes(u)) list.push(u);
    };
    (Array.isArray(urls) ? urls : []).forEach(push);
    push(url);
    if (url) {
        try {
            const u = new URL(url);
            const path = u.pathname + u.search;
            // Mirrors of the same embed path. vidsrc rotates which of its hosts
            // is actually serving, so a single host is a coin flip.
            for (const host of EMBED_HOSTS) push(`https://${host}${path}`);
        } catch {}
    }
    return list;
}

export default function MediaPage({
    mediaType,
    config,
    embedded = false,
    baseQuery = "",
    basePath: basePathProp,
}) {
    const { label, emoji, apiRoute, streamSource } = config;
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [trending, setTrending] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [details, setDetails] = useState(null);
    const [episodes, setEpisodes] = useState([]);
    const [currentEp, setCurrentEp] = useState(null);
    const [streamUrl, setStreamUrl] = useState("");
    const [streamTitle, setStreamTitle] = useState("");
    const [subOrDub, setSubOrDub] = useState("sub");
    const [streamSources, setStreamSources] = useState([]);
    const [streamSubtitles, setStreamSubtitles] = useState([]);
    const [streamHeaders, setStreamHeaders] = useState(null);
    const [streamEmbedUrls, setStreamEmbedUrls] = useState([]);
    const [drama, setDrama] = useState(null);

    // ── Resolving state ──────────────────────────────────────────
    // A drama used to have no loading state at all. Clicking Play while the
    // DramaCool probe was still in flight fell through to the TVMaze/vidsrc
    // embed, which serves a "media unavailable" page — so the first click of
    // a session was dead and only worked on the second attempt.
    const [resolving, setResolving] = useState(false);
    const [streamError, setStreamError] = useState("");
    const [probingDrama, setProbingDrama] = useState(false);

    const searchTimer = useRef(null);
    const searchParams = useSearchParams();
    const initialId = searchParams.get("id");
    const initialEp = searchParams.get("ep");
    const didInit = useRef(false);

    // `drama` is read from inside async handlers that can outlive the render
    // that started them, so the authoritative copy lives in a ref too.
    const dramaRef = useRef(null);
    const dramaProbeRef = useRef(null);
    // Monotonic token: only the newest resolve request is allowed to write to
    // state. Without it, a slow ep-1 request could land after a fast ep-2
    // request and overwrite it with the wrong video.
    const resolveToken = useRef(0);
    // Same idea for the title → provider probe, which is keyed by title rather
    // than by episode.
    const probeToken = useRef(0);

    const isDrama = mediaType === "kdrama" || mediaType === "cdrama";
    const route = ROUTE_BY_TYPE[mediaType] || mediaType;

    // Inside the hub this component is one tab of a larger page, so it must
    // not own the URL prefix or render its own chrome.
    const basePath = basePathProp || (embedded ? "/watch" : `/${route}`);
    const pushLocation = useCallback(
        (params) => {
            const search = new URLSearchParams(embedded ? baseQuery : "");
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
            }
            const qs = search.toString();
            window.history.pushState({}, "", qs ? `${basePath}?${qs}` : basePath);
        },
        [basePath, baseQuery, embedded],
    );

    const applyDrama = useCallback((value) => {
        dramaRef.current = value || null;
        setDrama(value || null);
    }, []);

    /**
     * Resolve a title against DramaCool, which is the only provider that gives
     * us real per-episode sources for K/C-dramas. The returned promise is
     * cached in `dramaProbeRef` so `handlePlayEpisode` can await the in-flight
     * request instead of racing it.
     */
    const probeDrama = useCallback(
        (title) => {
            if (!isDrama || !title) {
                dramaProbeRef.current = Promise.resolve(null);
                return dramaProbeRef.current;
            }
            // Title generation guard. Picking drama A then quickly picking
            // drama B would otherwise let A's slower probe land last and
            // overwrite B's episode list — including in the ref that
            // handlePlayEpisode reads.
            const gen = ++probeToken.current;
            const isCurrent = () => probeToken.current === gen;
            const task = (async () => {
                setProbingDrama(true);
                try {
                    const sres = await fetch(`/api/streaming/dramas/search?q=${encodeURIComponent(title)}`);
                    if (!sres.ok || !isCurrent()) return null;
                    const sdata = await sres.json();
                    const lowered = title.trim().toLowerCase();
                    const found =
                        (sdata.results || []).find((r) => r.title?.trim().toLowerCase() === lowered) ||
                        sdata.results?.[0];
                    if (!found?.id) return null;
                    const ires = await fetch(`/api/streaming/dramas/info?id=${encodeURIComponent(found.id)}`);
                    if (!ires.ok || !isCurrent()) return null;
                    const d = await ires.json();
                    if (d && Array.isArray(d.episodes) && d.episodes.length > 0) {
                        applyDrama(d);
                        return d;
                    }
                    return null;
                } catch {
                    return null;
                } finally {
                    // Only the newest probe clears the loading flag, so an
                    // abandoned request can't switch the panel back to an
                    // interactive-but-wrong episode list.
                    if (isCurrent()) setProbingDrama(false);
                }
            })();
            dramaProbeRef.current = task;
            return task;
        },
        [isDrama, applyDrama],
    );

    // Fetched inline rather than through a callback: the setState lives in the
    // promise continuation, which is where a network response actually belongs.
    // Wrapping it in a useCallback made it look like a synchronous state write
    // during render.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const routePath =
                    mediaType === "movie"
                        ? `/api/media/movies/trending?time_window=week`
                        : `${apiRoute}/${route}/trending?time_window=week`;
                const res = await fetch(routePath);
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && data?.results) setTrending(data.results.slice(0, 18));
            } catch {
                // Trending is decorative; a failure shouldn't surface an error.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [apiRoute, mediaType, route]);

    const doSearch = useCallback(
        async (q, page = 1, append = false) => {
            if (!q.trim()) return;
            setLoading(true);
            setTrending([]);
            try {
                const searchPath =
                    mediaType === "movie"
                        ? `/api/media/movies/search?q=${encodeURIComponent(q)}&page=${page}`
                        : `${apiRoute}/${mediaType}/search?q=${encodeURIComponent(q)}&page=${page}`;
                const res = await fetch(searchPath);
                const data = await res.json();
                if (data?.results) {
                    setResults((prev) => (append ? [...prev, ...data.results] : data.results));
                }
            } catch {
                // Leave the previous grid in place; an empty screen is a worse
                // answer than stale results.
            }
            setLoading(false);
        },
        [apiRoute, mediaType],
    );

    const handleSearchChange = (val) => {
        setQuery(val);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            if (val.trim()) {
                doSearch(val, 1, false);
            } else {
                setResults([]);
                // Clearing the box restores the trending shelf.
                (async () => {
                    try {
                        const routePath =
                            mediaType === "movie"
                                ? `/api/media/movies/trending?time_window=week`
                                : `${apiRoute}/${route}/trending?time_window=week`;
                        const res = await fetch(routePath);
                        if (!res.ok) return;
                        const data = await res.json();
                        if (data?.results) setTrending(data.results.slice(0, 18));
                    } catch {}
                })();
            }
        }, 400);
    };

    const resetStream = useCallback(() => {
        setStreamUrl("");
        setStreamSources([]);
        setStreamSubtitles([]);
        setStreamHeaders(null);
        setStreamEmbedUrls([]);
        setStreamError("");
    }, []);

    const handleSelect = async (item) => {
        setSelected(item);
        setDetails(item);
        setEpisodes(item.episodes || []);
        setCurrentEp(null);
        resetStream();
        applyDrama(null);
        pushLocation({ id: item.id });
        // Kick the provider probe off immediately but don't await it: the grid
        // and the poster should paint now. handlePlayEpisode awaits the cached
        // promise, so the user can hit Play at any point and still get the
        // real sources.
        probeDrama(item.title || item.name);
        try {
            const detailPath =
                mediaType === "movie"
                    ? null
                    : `${apiRoute}/${mediaType}/${item.id}?title=${encodeURIComponent(item.title || "")}`;
            const res = detailPath ? await fetch(detailPath) : null;
            if (res?.ok) {
                const data = await res.json();
                if (data) {
                    setDetails(data);
                    if (data.episodes?.length > 0) setEpisodes(data.episodes);
                }
            }
        } catch (err) {
            console.warn("Detail fetch failed, using search data:", err.message);
        }
    };

    const handlePlayEpisode = async (ep) => {
        const token = ++resolveToken.current;
        const isCurrent = () => resolveToken.current === token;

        setCurrentEp(ep);
        resetStream();
        setResolving(true);
        setStreamTitle(
            mediaType === "movie"
                ? details?.title || selected?.title
                : `Episode ${ep.episode_number}${ep.name ? " - " + ep.name : ""}`,
        );
        pushLocation({ id: selected?.id, ep: ep.episode_number });

        const bookmark = () => {
            if (!selected?.id) return;
            fetch(`/api/media-bookmarks/${mediaType}/${selected.id}/history`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    episodeNum: ep.episode_number,
                    title: selected.title,
                    coverUrl: selected.posterPath,
                }),
            }).catch(() => {});
        };

        const commit = (apply) => {
            if (!isCurrent()) return false;
            apply();
            setResolving(false);
            bookmark();
            return true;
        };

        const fetchDirect = (url) => fetch(url, { signal: AbortSignal.timeout(15000) });

        // ── Primary: provider with real per-episode sources ──────
        if (isDrama) {
            // The critical fix: if the title probe is still running, wait for
            // it. Previously this read `drama` immediately, saw null on a cold
            // load, and dropped the user into the vidsrc embed that renders
            // "media unavailable".
            if (!dramaRef.current && dramaProbeRef.current) {
                await dramaProbeRef.current;
                if (!isCurrent()) return;
            }

            const found = dramaRef.current;
            if (found?.episodes?.length > 0) {
                const candidates = found.episodes.filter((d) => d.number === ep.episode_number);
                const match =
                    candidates.find((d) => d.subtype === subOrDub) || candidates[0];
                if (match?.id) {
                    try {
                        const res = await fetchDirect(
                            `/api/streaming/dramas/watch?episodeId=${encodeURIComponent(match.id)}&subOrDub=${subOrDub}`,
                        );
                        if (res.ok) {
                            const data = await res.json();
                            if (data.sources?.length > 0 || data.url) {
                                commit(() => {
                                    if (data.sources?.length > 0) {
                                        setStreamSources(data.sources);
                                        setStreamSubtitles(data.subtitles || []);
                                        setStreamHeaders(data.headers || null);
                                    } else {
                                        setStreamUrl(data.url);
                                    }
                                });
                                return;
                            }
                        }
                    } catch {
                        // fall through to the embed path
                    }
                }
            }
        } else if (mediaType === "movie") {
            const mtitle = details?.title || selected?.title;
            const myear = details?.releaseDate || selected?.releaseDate || "";
            if (mtitle) {
                try {
                    const res = await fetchDirect(
                        `/api/streaming/movies/resolve?q=${encodeURIComponent(mtitle)}&year=${encodeURIComponent(myear)}`,
                    );
                    if (res.ok) {
                        const data = await res.json();
                        if (data.sources?.length > 0 || data.url) {
                            commit(() => {
                                if (data.sources?.length > 0) {
                                    setStreamSources(data.sources);
                                    setStreamSubtitles(data.subtitles || []);
                                    setStreamHeaders(data.headers || null);
                                } else {
                                    setStreamUrl(data.url);
                                }
                            });
                            return;
                        }
                    }
                } catch {
                    // fall through
                }
            }
        }

        // ── Fallback: mirror embed ───────────────────────────────
        // Only reached when the real providers gave us nothing. A 200 here
        // means "an embed frame is on screen", not "it will play" — the
        // player owns detecting that and surfacing a retry.
        if (!isCurrent()) return;
        try {
            const imdbId = selected?.externals?.imdb || details?.imdbId;
            const streamQuery =
                mediaType === "movie"
                    ? ""
                    : `?season=1&episode=${ep.episode_number}` + (imdbId ? `&imdb=${imdbId}` : "");
            const streamId = selected?.id || ep.id;
            const res = await fetch(`${apiRoute}/${mediaType}/${streamId}/stream${streamQuery}`);
            if (!res.ok) {
                if (isCurrent()) {
                    setResolving(false);
                    setStreamError(
                        res.status === 404
                            ? "This title isn't available for streaming yet."
                            : "We couldn't reach the streaming provider. Please try again.",
                    );
                }
                return;
            }
            const data = await res.json();
            if (!isCurrent()) return;
            if (data?.url) {
                setStreamUrl(data.url);
                setStreamEmbedUrls(buildEmbedList(data.url, data.urls));
                setResolving(false);
                bookmark();
            } else {
                setResolving(false);
                setStreamError("No playable source was found for this episode.");
            }
        } catch {
            if (!isCurrent()) return;
            setResolving(false);
            setStreamError("Network error while loading this episode. Please try again.");
        }
    };

    const hasStream = Boolean(streamUrl) || streamSources.length > 0;
    const showPlayerView = resolving || hasStream || Boolean(streamError);

    const handleBack = () => {
        resolveToken.current++;
        setResolving(false);
        if (hasStream || streamError) {
            resetStream();
            setCurrentEp(null);
            pushLocation({ id: selected?.id });
        } else if (selected) {
            setSelected(null);
            setDetails(null);
            setEpisodes([]);
            applyDrama(null);
            pushLocation({});
        }
    };

    const view = showPlayerView ? "player" : selected ? "detail" : "grid";

    // ── Deep link ───────────────────────────────────────────────
    // Declared after handlePlayEpisode so the reference resolves to the current
    // render's closure. Reading it from above would pin a stale function and
    // the episode a shared link points at could silently fail to start.
    useEffect(() => {
        if (!initialId || didInit.current) return;
        didInit.current = true;
        let cancelled = false;
        (async () => {
            try {
                const detailPath =
                    mediaType === "movie" ? null : `${apiRoute}/${mediaType}/${initialId}`;
                const res = detailPath ? await fetch(detailPath) : null;
                if (cancelled) return;
                if (res && !res.ok) {
                    console.warn(`Media ${initialId} not found (${res.status})`);
                    return;
                }
                const data = res ? await res.json() : null;
                if (!data || cancelled) return;
                setSelected(data);
                probeDrama(data.title || data.name);
                if (data.episodes?.length > 0) {
                    setEpisodes(data.episodes);
                    if (initialEp) {
                        const match = data.episodes.find((e) => e.episode_number == initialEp);
                        // handlePlayEpisode awaits the drama probe itself, so a
                        // cold deep link works on the first try.
                        if (match) handlePlayEpisode(match);
                    }
                }
            } catch (err) {
                console.error("Failed to load media:", err);
            }
        })();
        return () => {
            cancelled = true;
        };
        // Deep links are a one-shot initialisation keyed on the id in the URL;
        // re-running when handlePlayEpisode changes identity would restart it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialId, initialEp, apiRoute, mediaType, probeDrama]);

    // Render reads `drama` (state), not `dramaRef` — the ref exists only so
    // async handlers can see the latest value without re-subscribing.
    const displayEpisodes = useMemo(() => {
        if (isDrama && drama?.episodes?.length > 0) {
            const filtered = drama.episodes
                .filter((e) => (drama.hasDub ? e.subtype === subOrDub : true))
                .map((e) => ({ id: e.id, episode_number: e.number, name: e.title }));
            if (filtered.length > 0) return filtered;
        }
        return episodes;
    }, [isDrama, drama, subOrDub, episodes]);

    // While the drama probe is running, the TVMaze episode list is a decoy:
    // its ids aren't valid provider ids, so tapping one dead-ends. Show a
    // placeholder instead of an interactive-but-wrong list.
    const episodePanelBusy = isDrama && probingDrama && !drama;

    return (
        <div className={embedded ? "" : "min-h-dvh app-bg"}>
            {embedded ? (
                // Inside the hub the sticky chrome belongs to the shell, so this
                // is just the per-category controls row. Search state stays
                // local to the tab, which is what makes each category remember
                // its own query.
                <div className="flex items-center gap-2 mb-4">
                    <div className="flex-1 max-w-lg">
                        <input
                            type="text"
                            placeholder={`Search ${label.toLowerCase()}...`}
                            value={query}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && query.trim()) doSearch(query, 1, false);
                            }}
                            aria-label={`Search ${label}`}
                            className="input"
                        />
                    </div>
                    <ImportDataButton size="sm" onSuccess={() => window.location.reload()} />
                </div>
            ) : (
                <PageHeader
                    emoji={emoji}
                    label={label}
                    query={query}
                    onSearchChange={handleSearchChange}
                    onSearchSubmit={() => doSearch(query, 1, false)}
                    onBack={handleBack}
                    showBack={view !== "grid"}
                    onImport={() => window.location.reload()}
                />
            )}

            <div className="space-y-4">
                {view === "player" && (
                    <>
                        {resolving && <ResolvingPanel title={streamTitle} />}
                        {streamError && !resolving && (
                            <ErrorPanel
                                message={streamError}
                                onRetry={() => currentEp && handlePlayEpisode(currentEp)}
                                onBack={handleBack}
                            />
                        )}
                        {hasStream && !resolving && (
                            <>
                                <MediaPlayer
                                    src={streamUrl}
                                    title={streamTitle}
                                    poster={details?.posterPath || selected?.posterPath}
                                    onBack={handleBack}
                                    sources={streamSources.length > 0 ? streamSources : undefined}
                                    subtitles={streamSubtitles.length > 0 ? streamSubtitles : undefined}
                                    headers={streamHeaders || undefined}
                                    embedUrls={streamEmbedUrls.length > 0 ? streamEmbedUrls : undefined}
                                />
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                        {streamTitle}
                                    </p>
                                    {isDrama && drama?.hasDub && (
                                        <SubDubToggle value={subOrDub} onChange={setSubOrDub} />
                                    )}
                                </div>
                                <EpisodePanel
                                    episodes={displayEpisodes}
                                    currentId={currentEp?.episode_number}
                                    onSelect={handlePlayEpisode}
                                    busy={episodePanelBusy}
                                    header={
                                        isDrama && drama?.hasDub ? (
                                            <SubDubToggle value={subOrDub} onChange={setSubOrDub} />
                                        ) : null
                                    }
                                />
                            </>
                        )}
                    </>
                )}

                {view === "detail" && selected && (
                    <DetailView
                        mediaType={mediaType}
                        emoji={emoji}
                        selected={selected}
                        details={details}
                        episodes={displayEpisodes}
                        currentId={currentEp?.episode_number}
                        onPlayEpisode={handlePlayEpisode}
                        episodePanelBusy={episodePanelBusy}
                        subOrDub={subOrDub}
                        setSubOrDub={setSubOrDub}
                        showDubToggle={isDrama && Boolean(drama?.hasDub)}
                        onClose={handleBack}
                    />
                )}

                {view === "grid" && (
                    <GridView
                        emoji={emoji}
                        label={label}
                        mediaType={mediaType}
                        query={query}
                        trending={trending}
                        results={results}
                        loading={loading}
                        onSearchChange={handleSearchChange}
                        onSearchSubmit={() => doSearch(query, 1, false)}
                        onSelect={handleSelect}
                    />
                )}
            </div>

            {!embedded && (
                <div className="max-w-6xl mx-auto px-4 py-6 text-center border-t border-gray-100 dark:border-gray-800 mt-8">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                        {label} streaming powered by TMDB & {streamSource}.{" "}
                        <a
                            href="https://www.themoviedb.org"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                        >
                            TMDB
                        </a>{" "}
                        |{" "}
                        <a
                            href="https://www.netflix.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                        >
                            Watch official releases
                        </a>
                    </p>
                </div>
            )}
        </div>
    );
}

// ── Chrome ──────────────────────────────────────────────────────

function PageHeader({ emoji, label, query, onSearchChange, onSearchSubmit, onBack, showBack, onImport }) {
    return (
        <header className="app-header">
            <div className="max-w-6xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center gap-3">
                {showBack && (
                    <button onClick={onBack} className="btn-ghost p-1.5 -ml-1 shrink-0" aria-label="Back">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                )}
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-lg">{emoji}</span>
                    <h1 className="app-title text-lg text-gray-900 dark:text-gray-100">{label}</h1>
                </div>
                <div className="flex-1 max-w-lg">
                    <input
                        type="text"
                        placeholder={`Search ${label.toLowerCase()}...`}
                        value={query}
                        onChange={(e) => onSearchChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && query.trim()) onSearchSubmit();
                        }}
                        className="input"
                    />
                </div>
                <ImportDataButton size="sm" onSuccess={onImport} />
            </div>
        </header>
    );
}

// ── Player states ───────────────────────────────────────────────

function ResolvingPanel({ title }) {
    return (
        <div className="surface overflow-hidden">
            <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black flex flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="h-10 w-10 rounded-full border-[3px] border-white/25 border-t-white animate-spin" />
                    <div>
                        <p className="text-sm font-semibold text-white">Finding the best server…</p>
                        {title && (
                            <p className="mt-0.5 text-xs text-white/60 truncate max-w-[80vw]">{title}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ErrorPanel({ message, onRetry, onBack }) {
    return (
        <div className="surface p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-6 w-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Playback unavailable</h3>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">{message}</p>
            <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
                <button onClick={onRetry} className="btn-primary px-5 py-2.5 text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    Try again
                </button>
                <button onClick={onBack} className="btn-secondary px-5 py-2.5 text-sm">
                    Back to episodes
                </button>
            </div>
        </div>
    );
}

// ── Views ───────────────────────────────────────────────────────

function DetailView({
    mediaType,
    emoji,
    selected,
    details,
    episodes,
    currentId,
    onPlayEpisode,
    episodePanelBusy,
    subOrDub,
    setSubOrDub,
    showDubToggle,
    onClose,
}) {
    const title = details?.title || selected.title;
    return (
        <div className="flex flex-col lg:flex-row gap-6">
            <div className="lg:w-1/3 shrink-0">
                <div className="poster-tile lg:sticky lg:top-24">
                    <img
                        src={details?.posterPath || selected?.posterPath || ""}
                        alt={title}
                        className="w-full h-full object-cover"
                    />
                </div>
                <button
                    onClick={() => {
                        if (mediaType === "movie") {
                            onPlayEpisode({
                                id: selected.id,
                                episode_number: 1,
                                name: selected.title,
                            });
                        } else {
                            const ep = episodes.length > 0 ? episodes[0] : null;
                            onPlayEpisode(
                                ep || { id: selected.id, episode_number: 1, name: selected.title },
                            );
                        }
                    }}
                    className="btn-brand-gradient w-full mt-4 px-6 py-3 text-sm"
                >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                    {mediaType === "movie" ? "Play Movie" : episodes.length > 0 ? "Play S1 E1" : "Play"}
                </button>
            </div>

            <div className="flex-1 min-w-0 space-y-3">
                <div className="flex items-start gap-3">
                    <h2 className="app-title text-xl sm:text-2xl text-gray-900 dark:text-gray-100 flex-1">
                        {title}
                    </h2>
                    <MediaBookmarkButton
                        mediaType={mediaType}
                        mediaId={String(selected.id)}
                        title={selected.title}
                        coverUrl={selected.posterPath || selected.backdropPath || ""}
                        status={details?.status}
                    />
                </div>
                {details?.originalTitle && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">{details.originalTitle}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-500 dark:text-gray-400">
                    {(details?.releaseDate || details?.firstAirDate) && (
                        <span>{(details.releaseDate || details.firstAirDate).slice(0, 4)}</span>
                    )}
                    {details?.status && (
                        <span className="px-2 py-0.5 app-sunken border border-[var(--border-subtle)] rounded-full text-xs capitalize">
                            {details.status.toLowerCase()}
                        </span>
                    )}
                    {details?.numberOfSeasons > 0 && <span>{details.numberOfSeasons} Seasons</span>}
                    {details?.numberOfEpisodes > 0 && <span>{details.numberOfEpisodes} Episodes</span>}
                    {details?.voteAverage > 0 && (
                        <span className="flex items-center gap-1">
                            <svg className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                                <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                            </svg>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">
                                {(details.voteAverage / 2).toFixed(1)}
                            </span>
                            <span className="text-xs text-gray-400">/10</span>
                        </span>
                    )}
                </div>
                {details?.genres?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {details.genres.map((g) => (
                            <span key={g} className="chip" data-active="false">
                                {g}
                            </span>
                        ))}
                    </div>
                )}
                {details?.overview && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line line-clamp-6">
                        {details.overview}
                    </p>
                )}
            </div>

            {mediaType !== "movie" && (
                <div className="lg:w-80 shrink-0">
                    <EpisodePanel
                        episodes={episodes}
                        currentId={currentId}
                        onSelect={onPlayEpisode}
                        busy={episodePanelBusy}
                        header={
                            showDubToggle ? (
                                <SubDubToggle value={subOrDub} onChange={setSubOrDub} />
                            ) : null
                        }
                    />
                </div>
            )}
        </div>
    );
}

function GridView({
    emoji,
    label,
    mediaType,
    query,
    trending,
    results,
    loading,
    onSearchChange,
    onSearchSubmit,
    onSelect,
}) {
    const showTrending = trending.length > 0 && !query;
    const showEmpty =
        results.length === 0 && trending.length === 0 && !loading && !query;

    return (
        <>
            {showTrending && (
                <section className="mb-8">
                    <div className="mb-3 flex items-end justify-between gap-3">
                        <div>
                            <p className="section-eyebrow">Handpicked</p>
                            <h2 className="app-title text-lg sm:text-xl text-gray-900 dark:text-gray-100">
                                Trending {label}
                            </h2>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                        {trending.map((item) => (
                            <MediaCard key={item.id} item={item} mediaType={mediaType} onClick={onSelect} />
                        ))}
                    </div>
                </section>
            )}

            {showEmpty && (
                <div className="text-center py-20">
                    <div className="mx-auto mb-4 h-14 w-14 rounded-2xl app-sunken border border-[var(--border-subtle)] flex items-center justify-center text-2xl">
                        {emoji}
                    </div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Search for {label.toLowerCase()} to start watching
                    </p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        Try a title, or browse what&rsquo;s trending above.
                    </p>
                </div>
            )}

            {results.length > 0 && (
                <section>
                    <p className="section-eyebrow">{query ? "Matches" : "Browse"}</p>
                    <h2 className="app-title text-lg sm:text-xl text-gray-900 dark:text-gray-100 mb-3">
                        {query ? `Results for "${query}"` : "All titles"}
                    </h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                        {results.map((item) => (
                            <MediaCard key={item.id} item={item} mediaType={mediaType} onClick={onSelect} />
                        ))}
                    </div>
                    {loading && <Spinner className="py-12" />}
                </section>
            )}

            {loading && results.length === 0 && <Spinner className="py-16" />}
        </>
    );
}

function Spinner({ className = "" }) {
    return (
        <div className={`flex justify-center ${className}`}>
            <div className="h-8 w-8 rounded-full border-2 border-gray-200 dark:border-gray-800 border-t-[var(--brand-500)] animate-spin" />
        </div>
    );
}

// ── Episode UI ──────────────────────────────────────────────────

function SubDubToggle({ value, onChange }) {
    return (
        <Tabs
            variant="pill"
            label="Subtitle or dubbed"
            value={value}
            onChange={onChange}
            tabs={[
                { id: "sub", label: "Sub" },
                { id: "dub", label: "Dub" },
            ]}
        />
    );
}

function EpisodePanel({ episodes, currentId, onSelect, busy, header, title }) {
    const [filter, setFilter] = useState("");
    const query = filter.trim().toLowerCase();

    const filtered = useMemo(() => {
        if (!query) return episodes;
        return episodes.filter(
            (ep) =>
                String(ep.episode_number).includes(query) ||
                (ep.name || "").toLowerCase().includes(query),
        );
    }, [episodes, query]);

    return (
        <div>
            <div className="mb-2.5 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                    <p className="section-eyebrow">Episodes</p>
                    <h3 className="app-title text-sm text-gray-900 dark:text-gray-100">
                        {title || (episodes.length > 0 ? `${episodes.length} available` : "Loading…")}
                    </h3>
                </div>
                {header}
            </div>

            {busy ? (
                <EpisodeSkeleton />
            ) : episodes.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 py-6 text-center">
                    No episodes available for this title.
                </p>
            ) : (
                <>
                    {episodes.length > 8 && (
                        <input
                            type="text"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="Jump to episode…"
                            className="input mb-2 !py-1.5 !text-xs"
                        />
                    )}
                    <div className="max-h-[60vh] overflow-y-auto space-y-1 pr-1">
                        {filtered.length === 0 ? (
                            <p className="text-xs text-gray-400 dark:text-gray-500 py-6 text-center">
                                No episode matches &ldquo;{filter}&rdquo;.
                            </p>
                        ) : (
                            filtered.map((ep) => {
                                const active = currentId === ep.episode_number;
                                return (
                                    <button
                                        key={ep.id}
                                        onClick={() => onSelect(ep)}
                                        aria-current={active ? "true" : undefined}
                                        className={`group w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                                            active
                                                ? "bg-[var(--brand-600)] text-white shadow-sm"
                                                : "hover:bg-[var(--surface-sunken)] border border-transparent hover:border-[var(--border-subtle)] text-gray-700 dark:text-gray-300"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-semibold">
                                                {active && (
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        viewBox="0 0 24 24"
                                                        fill="currentColor"
                                                        className="inline h-3 w-3 mr-1.5 -mt-px"
                                                    >
                                                        <path d="M8 5v14l11-7z" />
                                                    </svg>
                                                )}
                                                Ep. {ep.episode_number}
                                            </span>
                                            {ep.vote_average ? (
                                                <span
                                                    className={`text-[10px] px-1.5 py-0.5 rounded tabular-nums ${
                                                        active
                                                            ? "bg-white/20 text-white"
                                                            : "app-sunken text-gray-500 dark:text-gray-400"
                                                    }`}
                                                >
                                                    {ep.vote_average.toFixed(1)}
                                                </span>
                                            ) : null}
                                        </div>
                                        {ep.name && (
                                            <p
                                                className={`text-xs mt-0.5 truncate ${
                                                    active ? "text-white/80" : "text-gray-500 dark:text-gray-400"
                                                }`}
                                            >
                                                {ep.name}
                                            </p>
                                        )}
                                        {ep.air_date && (
                                            <p
                                                className={`text-[10px] mt-0.5 ${
                                                    active ? "text-white/60" : "text-gray-400 dark:text-gray-500"
                                                }`}
                                            >
                                                {ep.air_date}
                                            </p>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function EpisodeSkeleton() {
    return (
        <div className="space-y-1.5" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="skeleton skeleton-shimmer h-3.5 w-12" />
                    <div className="skeleton skeleton-shimmer h-3 flex-1" />
                </div>
            ))}
        </div>
    );
}
