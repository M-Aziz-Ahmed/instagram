"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Hls from "hls.js";
import MediaBookmarkButton from "@/components/shared/MediaBookmarkButton";
import ImportDataButton from "@/components/common/ImportDataButton";

const fmtNum = (n) => (n == null ? "?" : n.toLocaleString());

const PROXIED_HOSTS = ["megacloud.tv", "embtaku.pro", "embtaku.com", "gayu-server.com", "cdnz.space", "radeon.top", "vstreamcdn.com", "fj-cdn.com", "f4-cdn.com", "gogoanimehd.to"];

function proxyStreamUrl(url) {
    if (!url) return url;
    try {
        const parsed = new URL(url);
        const host = parsed.hostname;
        const needsProxy = PROXIED_HOSTS.some((h) => host === h || host.endsWith("." + h));
        const isMedia = /\.(m3u8|mp4|m4v|ts)(\?.*)?$/i.test(parsed.pathname);
        if (needsProxy) return `/api/anime-proxy?url=${encodeURIComponent(url)}`;
        if (!needsProxy && isMedia && !url.startsWith("/")) return `/api/anime-proxy?url=${encodeURIComponent(url)}`;
    } catch {}
    return url;
}

function StarIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-yellow-400">
            <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
        </svg>
    );
}

// ─── VideoPlayer ──────────────────────────────────────────────────────────────
// Accepts a `sources` array. When a source fails it automatically tries the
// next one. A source-switcher overlay lets the user pick manually.

function VideoPlayer({ src, sources, title, poster, onBack }) {
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const hlsRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [fullscreen, setFullscreen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showSources, setShowSources] = useState(false);
    const [activeSrc, setActiveSrc] = useState(src);

    // When parent gives a new src (new episode), reset
    useEffect(() => {
        setActiveSrc(src);
        setError("");
        setShowSources(false);
    }, [src]);

    const allSources = sources && sources.length > 0
        ? sources
        : (src ? [{ url: src, quality: "auto" }] : []);

    const activeIdx = allSources.findIndex((s) => s.url === activeSrc);

    const tryNextSource = useCallback(() => {
        const next = activeIdx + 1;
        if (next < allSources.length) {
            setActiveSrc(allSources[next].url);
            setError("");
        } else {
            setError("All sources failed. Please try another episode or go back.");
        }
    }, [activeIdx, allSources]);

    // Load and play
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !activeSrc) return;

        setLoading(true);
        setError("");
        setProgress(0);
        setDuration(0);

        const proxiedSrc = proxyStreamUrl(activeSrc);

        const cleanup = () => {
            if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
        };

        if (proxiedSrc.includes(".m3u8")) {
            if (Hls.isSupported()) {
                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    retryDelay: 1000,
                    maxRetryDelay: 5000,
                    maxLoadTimeout: 30000,
                    maxRetry: 3,
                });
                hlsRef.current = hls;
                hls.loadSource(proxiedSrc);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => { setLoading(false); video.play().catch(() => {}); });
                hls.on(Hls.Events.ERROR, (_e, data) => {
                    if (data.fatal) {
                        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
                        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
                        else { setLoading(false); tryNextSource(); }
                    }
                });
                return cleanup;
            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                video.src = proxiedSrc;
                const onMeta = () => { setLoading(false); video.play().catch(() => {}); };
                video.addEventListener("loadedmetadata", onMeta);
                return () => video.removeEventListener("loadedmetadata", onMeta);
            }
        } else {
            cleanup();
            video.src = proxiedSrc;
            const onData = () => { setLoading(false); video.play().catch(() => {}); };
            const onError = () => { setLoading(false); tryNextSource(); };
            video.addEventListener("loadeddata", onData);
            video.addEventListener("error", onError);
            return () => {
                video.removeEventListener("loadeddata", onData);
                video.removeEventListener("error", onError);
            };
        }
    }, [activeSrc, tryNextSource]);

    // Playback event listeners
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTime = () => { if (video.duration) { setProgress(video.currentTime); setDuration(video.duration); } };
        video.addEventListener("timeupdate", onTime);
        video.addEventListener("play", () => setPlaying(true));
        video.addEventListener("pause", () => setPlaying(false));
        return () => { video.removeEventListener("timeupdate", onTime); };
    }, []);

    const togglePlay = () => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); };
    const toggleFs = () => {
        const el = containerRef.current;
        if (!el) return;
        if (!document.fullscreenElement) el.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
        else document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    };
    const fmt = (s) => {
        if (!s || !isFinite(s)) return "0:00";
        return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
    };
    const srcLabel = (s) => {
        if (!s) return "?";
        if (s.quality && s.quality !== "auto") return s.quality;
        if (s.server) return s.server;
        return "Source";
    };

    return (
        <div ref={containerRef} className="relative bg-black rounded-xl overflow-hidden group">
            {/* Spinner */}
            {loading && !error && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/60">
                    <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
            )}

            {/* Error overlay */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/85">
                    <div className="text-center px-6 space-y-3">
                        <p className="text-red-400 text-sm font-medium">⚠ {error}</p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <button onClick={onBack} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-full transition-colors">
                                ← Go back
                            </button>
                            {allSources.length > 1 && (
                                <button onClick={() => setShowSources(true)} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-full transition-colors">
                                    Switch source ({activeIdx + 1}/{allSources.length})
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Source picker overlay */}
            {showSources && (
                <div className="absolute inset-0 z-20 bg-black/92 flex items-center justify-center p-4">
                    <div className="w-full max-w-xs bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                            <span className="text-sm font-semibold text-white">Choose Source</span>
                            <button onClick={() => setShowSources(false)} className="text-gray-400 hover:text-white transition-colors text-xl leading-none w-8 h-8 flex items-center justify-center">×</button>
                        </div>
                        <div className="max-h-72 overflow-y-auto p-2 space-y-1">
                            {allSources.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => { setActiveSrc(s.url); setError(""); setShowSources(false); }}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                                        activeSrc === s.url
                                            ? "bg-blue-600 text-white"
                                            : "text-gray-200 hover:bg-white/10"
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        {activeSrc === s.url && <span className="text-[10px]">▶</span>}
                                        <span className="font-medium">{srcLabel(s)}</span>
                                    </div>
                                    <span className="text-[10px] opacity-50 font-mono">{s.isM3U8 ? "HLS" : "MP4"}{s.server ? ` · ${s.server}` : ""}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <video ref={videoRef} className="w-full aspect-video cursor-pointer" onClick={togglePlay} playsInline poster={poster} />

            {/* Controls bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <input
                    type="range" min={0} max={duration || 0} value={progress}
                    onChange={(e) => { const v = videoRef.current; if (v) v.currentTime = Number(e.target.value); }}
                    className="w-full h-1 mb-2 accent-blue-500 cursor-pointer"
                />
                <div className="flex items-center justify-between text-white text-xs">
                    <div className="flex items-center gap-3">
                        <button onClick={togglePlay} className="hover:text-blue-400 transition-colors">
                            {playing ? (
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                    <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
                                </svg>
                            ) : (
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                    <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                                </svg>
                            )}
                        </button>
                        <span>{fmt(progress)} / {fmt(duration)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Source switcher button */}
                        {allSources.length > 1 && (
                            <button
                                onClick={() => setShowSources(true)}
                                className="flex items-center gap-1 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] font-medium transition-colors"
                                title="Switch source"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                                </svg>
                                {activeIdx + 1}/{allSources.length}
                            </button>
                        )}
                        <input
                            type="range" min={0} max={1} step={0.05} value={volume}
                            onChange={(e) => { const v = videoRef.current; if (v) { v.volume = Number(e.target.value); setVolume(Number(e.target.value)); } }}
                            className="w-20 h-1 accent-white cursor-pointer"
                        />
                        <button onClick={toggleFs} className="hover:text-blue-400 transition-colors">
                            {fullscreen ? (
                                <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                                </svg>
                            ) : (
                                <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── EpisodeList ──────────────────────────────────────────────────────────────

function EpisodeList({ episodes, currentId, onSelect }) {
    const [search, setSearch] = useState("");
    const filtered = episodes.filter((ep) => {
        const q = search.toLowerCase();
        return !q || String(ep.number).includes(q) || (ep.title || "").toLowerCase().includes(q);
    });

    return (
        <div className="space-y-2">
            <input
                type="text"
                placeholder="Search episodes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-1 focus:ring-blue-400"
            />
            <div className="max-h-[50vh] overflow-y-auto space-y-1 pr-1">
                {filtered.map((ep) => (
                    <button
                        key={ep.id}
                        onClick={() => onSelect(ep)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                            currentId === ep.id
                                ? "bg-blue-500 text-white"
                                : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                        }`}
                    >
                        <span className="font-medium">Ep {ep.number}</span>
                        {ep.title && <span className="ml-2 opacity-70 truncate">{ep.title}</span>}
                    </button>
                ))}
                {filtered.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No episodes found</p>
                )}
            </div>
        </div>
    );
}

// ─── AnimePage ────────────────────────────────────────────────────────────────

export default function AnimePage({ embedded = false }) {
    const searchParams = useSearchParams();
    const initialId = searchParams.get("id");
    const initialEp = searchParams.get("ep");
    const didInit = useRef(false);

    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [spotlight, setSpotlight] = useState([]);
    const [spotlightPage, setSpotlightPage] = useState(1);
    const [spotlightHasMore, setSpotlightHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [episodes, setEpisodes] = useState([]);
    const [loadingEpisodes, setLoadingEpisodes] = useState(false);
    const [currentEp, setCurrentEp] = useState(null);
    const [streamUrl, setStreamUrl] = useState("");
    const [streamSources, setStreamSources] = useState([]); // ← all sources from API
    const [streamTitle, setStreamTitle] = useState("");
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [genres, setGenres] = useState([]);
    const [activeGenre, setActiveGenre] = useState(null);
    const [subOrDub, setSubOrDub] = useState("sub");
    const searchTimer = useRef(null);
    const scrollRef = useRef(0);

    useEffect(() => {
        fetch("/api/anime/spotlight")
            .then((r) => r.json())
            .then((d) => {
                if (d?.results) {
                    setSpotlight(d.results);
                    setSpotlightHasMore(d.hasNextPage ?? false);
                    setSpotlightPage(1);
                }
            })
            .catch(() => {});
        fetch("/api/anime/genres")
            .then((r) => r.json())
            .then((d) => {
                if (d?.data) {
                    const popular = ["Action", "Romance", "Comedy", "Drama", "Fantasy", "Horror", "Sci-Fi", "Slice of Life", "Mystery", "Supernatural", "Adventure", "Sports", "Mecha", "Psychological", "Thriller", "Martial Arts", "Superhero", "Ecchi", "Harem", "Military"];
                    const sorted = d.data.sort((a, b) => {
                        const ai = popular.indexOf(a);
                        const bi = popular.indexOf(b);
                        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                    });
                    setGenres(sorted.slice(0, 20));
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!initialId || didInit.current) return;
        didInit.current = true;
        (async () => {
            try {
                const infoRes = await fetch(`/api/anime/info/${initialId}`);
                const infoData = await infoRes.json();
                if (infoData?.id) {
                    setSelected({ id: infoData.id, title: infoData.title, image: infoData.image, ...infoData });
                    if (infoData.episodes?.length) {
                        setEpisodes(infoData.episodes);
                        if (initialEp) {
                            const ep = infoData.episodes.find(e => String(e.id) === initialEp || String(e.number) === initialEp);
                            if (ep) {
                                setCurrentEp(ep);
                                setStreamTitle(`Episode ${ep.number}${ep.title ? " - " + ep.title : ""}`);
                                try {
                                    const watchRes = await fetch(`/api/anime/watch/${encodeURIComponent(ep.id)}?subOrDub=${subOrDub}`);
                                    const watchData = await watchRes.json();
                                    const sources = watchData?.sources || [];
                                    setStreamSources(sources);
                                    const best = sources.find((s) => s.quality === "1080p") || sources.find((s) => s.quality === "720p") || sources[0];
                                    if (best?.url) setStreamUrl(best.url);
                                } catch { /* silent */ }
                            }
                        }
                    } else {
                        const epRes = await fetch(`/api/anime/episodes/${initialId}?title=${encodeURIComponent(infoData.title || "")}`);
                        const epData = await epRes.json();
                        if (epData?.episodes) setEpisodes(epData.episodes);
                    }
                }
            } catch { /* silent */ }
        })();
    }, [initialId, initialEp]); // eslint-disable-line react-hooks/exhaustive-deps

    const doSearch = useCallback(async (q, p = 1, append = false) => {
        if (!q.trim()) return;
        setLoading(true);
        setActiveGenre(null);
        try {
            const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}&page=${p}`);
            const data = await res.json();
            const items = data?.results || [];
            setResults((prev) => (append ? [...prev, ...items] : items));
            setHasMore(data?.hasNextPage ?? items.length > 0);
            setPage(p);
        } catch { /* silent */ }
        setLoading(false);
    }, []);

    const handleGenreBrowse = async (genre, p = 1, append = false) => {
        setActiveGenre(genre);
        setQuery("");
        setLoading(true);
        try {
            const res = await fetch(`/api/anime/genre/${encodeURIComponent(genre)}?page=${p}`);
            const data = await res.json();
            const items = data?.results || [];
            setResults((prev) => (append ? [...prev, ...items] : items));
            setHasMore(data?.hasNextPage ?? items.length > 0);
            setPage(p);
        } catch { /* silent */ }
        setLoading(false);
    };

    const handleSearchChange = (val) => {
        setQuery(val);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            if (val.trim()) doSearch(val, 1, false);
            else setResults([]);
        }, 400);
    };

    const handleSelect = async (item) => {
        scrollRef.current = window.scrollY;
        setSelected(item);
        setEpisodes([]);
        setCurrentEp(null);
        setStreamUrl("");
        setStreamSources([]);
        setLoadingEpisodes(true);
        window.history.pushState({}, "", `/anime?id=${item.id}`);
        try {
            const res = await fetch(`/api/anime/info/${encodeURIComponent(item.id)}`);
            const data = await res.json();
            if (data?.description) {
                setSelected((prev) => ({ ...prev, description: data.description, genres: data.genres, status: data.status, totalEpisodes: data.totalEpisodes, releaseDate: data.releaseDate, otherNames: data.otherNames, hasDub: data.hasDub, source: data.source }));
            }
            if (data?.episodes?.length) {
                setEpisodes(data.episodes);
            } else {
                const epRes = await fetch(`/api/anime/episodes/${encodeURIComponent(item.id)}?title=${encodeURIComponent(item.title)}`);
                const epData = await epRes.json();
                if (epData?.episodes) setEpisodes(epData.episodes);
            }
        } catch { /* silent */ }
        setLoadingEpisodes(false);
    };

    const handlePlayEpisode = async (ep) => {
        setCurrentEp(ep);
        setStreamUrl("");
        setStreamSources([]);
        setStreamTitle(`Episode ${ep.number}${ep.title ? " - " + ep.title : ""}`);
        if (selected?.id) window.history.pushState({}, "", `/anime?id=${selected.id}&ep=${ep.id}`);
        try {
            const res = await fetch(`/api/anime/watch/${encodeURIComponent(ep.id)}?subOrDub=${subOrDub}`);
            const data = await res.json();
            const sources = data?.sources || [];
            setStreamSources(sources); // ← store ALL sources
            const best = sources.find((s) => s.quality === "1080p") || sources.find((s) => s.quality === "720p") || sources[0];
            if (best?.url) setStreamUrl(best.url);
        } catch { /* silent */ }
        if (selected?.id) {
            fetch(`/api/media-bookmarks/anime/${encodeURIComponent(String(selected.id))}/history`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ episodeNum: ep.number, title: selected.title, coverUrl: selected.image }),
            }).catch(() => {});
        }
    };

    // Re-fetch sources when sub/dub toggles
    useEffect(() => {
        if (!currentEp) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/anime/watch/${encodeURIComponent(currentEp.id)}?subOrDub=${subOrDub}`);
                const data = await res.json();
                const sources = data?.sources || [];
                if (cancelled) return;
                setStreamSources(sources);
                const best = sources.find((s) => s.quality === "1080p") || sources.find((s) => s.quality === "720p") || sources[0];
                if (best?.url) setStreamUrl(best.url);
            } catch { /* silent */ }
        })();
        return () => { cancelled = true; };
    }, [subOrDub]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleBack = () => {
        if (streamUrl) {
            setStreamUrl("");
            setStreamSources([]);
            setCurrentEp(null);
            if (selected?.id) window.history.pushState({}, "", `/anime?id=${selected.id}`);
        } else if (selected) {
            setSelected(null);
            setEpisodes([]);
            window.history.pushState({}, "", "/anime");
            requestAnimationFrame(() => window.scrollTo(0, scrollRef.current));
        }
    };

    const view = streamUrl ? "player" : selected ? "detail" : "grid";

    return (
        <div className={embedded ? "" : "min-h-dvh app-bg"}>
            {embedded ? (
                <div className="flex items-center gap-2 mb-4">
                    <div className="flex-1 max-w-lg">
                        <input
                            type="text"
                            placeholder="Search anime..."
                            value={query}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) doSearch(query, 1, false); }}
                            aria-label="Search anime"
                            className="input"
                        />
                    </div>
                    <ImportDataButton size="sm" />
                </div>
            ) : (
                <header className="app-header">
                    <div className="max-w-6xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center gap-3">
                        {view !== "grid" && (
                            <button onClick={handleBack} className="btn-ghost p-1.5 -ml-1 shrink-0" aria-label="Back">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                </svg>
                            </button>
                        )}
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-lg">🎬</span>
                            <h1 className="app-title text-lg text-gray-900 dark:text-gray-100">Anime</h1>
                        </div>
                        <div className="flex-1 max-w-lg">
                            <input
                                type="text"
                                placeholder="Search anime..."
                                value={query}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) doSearch(query, 1, false); }}
                                className="input"
                            />
                        </div>
                        <ImportDataButton size="sm" />
                    </div>
                </header>
            )}

            <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4">
                {/* ── Player ── */}
                {view === "player" && (
                    <div className="space-y-4">
                        <VideoPlayer
                            src={streamUrl}
                            sources={streamSources}
                            title={streamTitle}
                            poster={selected?.image}
                            onBack={handleBack}
                        />
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{streamTitle}</p>
                        <EpisodeList episodes={episodes} currentId={currentEp?.id} onSelect={handlePlayEpisode} />
                    </div>
                )}

                {/* ── Detail ── */}
                {view === "detail" && selected && (
                    <div className="flex flex-col lg:flex-row gap-6">
                        <div className="lg:w-1/3 shrink-0">
                            <img src={selected.image} alt={selected.title} className="w-full max-w-xs mx-auto lg:mx-0 rounded-xl shadow-lg" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-3">
                            <div className="flex items-start gap-3">
                                <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 flex-1">{selected.title}</h2>
                                <MediaBookmarkButton mediaType="anime" mediaId={String(selected.id)} title={selected.title} coverUrl={selected.image} status={selected.status} />
                            </div>
                            {selected.otherNames?.length > 0 && (
                                <p className="text-xs text-gray-400">{selected.otherNames.slice(0, 3).join(" / ")}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                                {selected.rating && <span className="flex items-center gap-1"><StarIcon /> {selected.rating}</span>}
                                {selected.status && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs">{selected.status}</span>}
                                {selected.releaseDate && <span>{selected.releaseDate}</span>}
                                {selected.totalEpisodes && <span>{selected.totalEpisodes} eps</span>}
                                {selected.source && selected.source !== "none" && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${selected.source === "animeunity" ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400" : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"}`}>
                                        {selected.source === "gogoanime" ? "Gogoanime (EN)" : selected.source === "hianime" ? "HiAnime (EN)" : "AnimeUnity (IT)"}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">Audio:</span>
                                <div className="flex gap-1">
                                    <button onClick={() => setSubOrDub("sub")} className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${subOrDub === "sub" ? "bg-blue-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"}`}>SUB</button>
                                    {selected.hasDub && <button onClick={() => setSubOrDub("dub")} className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${subOrDub === "dub" ? "bg-purple-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"}`}>DUB</button>}
                                </div>
                            </div>
                            {selected.genres?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {selected.genres.map((g) => (
                                        <span key={g} className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-xs font-medium">{g}</span>
                                    ))}
                                </div>
                            )}
                            {selected.description && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-6">{selected.description}</p>
                            )}
                        </div>
                        <div className="lg:w-72 shrink-0">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                                Episodes {loadingEpisodes ? "(loading...)" : `(${episodes.length})`}
                            </h3>
                            {loadingEpisodes && (
                                <div className="flex justify-center py-6">
                                    <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
                                </div>
                            )}
                            {!loadingEpisodes && episodes.length > 0 && (
                                <EpisodeList episodes={episodes} currentId={currentEp?.id} onSelect={handlePlayEpisode} />
                            )}
                            {!loadingEpisodes && episodes.length === 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs text-gray-400">No episodes available for streaming</p>
                                    <a href={`https://www.crunchyroll.com/search?q=${encodeURIComponent(selected.title)}`} target="_blank" rel="noopener noreferrer" className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-full transition-colors">
                                        Watch on Crunchyroll
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Grid / Browse ── */}
                {view === "grid" && (
                    <>
                        {!query && genres.length > 0 && (
                            <div className="mb-4">
                                <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Browse by Genre</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {genres.map((g) => (
                                        <button key={g} onClick={() => handleGenreBrowse(g)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeGenre === g ? "bg-blue-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
                                            {g}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {results.length === 0 && spotlight.length === 0 && !loading && (
                            <div className="text-center py-16">
                                <span className="text-5xl mb-4 block">🎬</span>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">Search for your favorite anime to start watching</p>
                            </div>
                        )}
                        {results.length === 0 && spotlight.length > 0 && !query && !activeGenre && (
                            <div className="mb-8">
                                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Trending Now</h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {spotlight.map((item) => (
                                        <button key={item.id} onClick={() => handleSelect(item)} className="group text-left">
                                            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                                                <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                                                {item.sub && <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded">SUB</span>}
                                            </div>
                                            <p className="mt-1.5 text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{item.title}</p>
                                        </button>
                                    ))}
                                </div>
                                {spotlightHasMore && (
                                    <div className="flex justify-center mt-6">
                                        <button
                                            onClick={async () => {
                                                setLoading(true);
                                                try {
                                                    const res = await fetch(`/api/anime/spotlight?page=${spotlightPage + 1}`);
                                                    const d = await res.json();
                                                    if (d?.results) {
                                                        setSpotlight((prev) => [...prev, ...d.results]);
                                                        setSpotlightPage((p) => p + 1);
                                                        setSpotlightHasMore(d.hasNextPage ?? false);
                                                    }
                                                } catch {}
                                                setLoading(false);
                                            }}
                                            disabled={loading}
                                            className="px-6 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-full transition-colors disabled:opacity-50"
                                        >
                                            {loading ? "Loading..." : "Load more"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        {results.length > 0 && (
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">
                                    {query ? `Results for "${query}"` : activeGenre || "Browse"}
                                </h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {results.map((item) => (
                                        <button key={item.id} onClick={() => handleSelect(item)} className="group text-left">
                                            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                                                <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                                                {item.sub && <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded">SUB</span>}
                                            </div>
                                            <p className="mt-1.5 text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{item.title}</p>
                                        </button>
                                    ))}
                                </div>
                                {hasMore && (
                                    <div className="flex justify-center mt-6">
                                        <button
                                            onClick={() => { if (activeGenre) handleGenreBrowse(activeGenre, page + 1, true); else if (query) doSearch(query, page + 1, true); }}
                                            disabled={loading}
                                            className="px-6 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-full transition-colors disabled:opacity-50"
                                        >
                                            {loading ? "Loading..." : "Load more"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        {loading && results.length === 0 && (
                            <div className="flex justify-center py-12">
                                <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
                            </div>
                        )}
                    </>
                )}
            </div>

            {!embedded && (
                <div className="max-w-6xl mx-auto px-4 py-6 text-center border-t border-gray-100 dark:border-gray-800 mt-8">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                        Free anime streaming powered by community.{" "}
                        <a href="https://www.crunchyroll.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Watch ad-free on Crunchyroll</a>
                    </p>
                </div>
            )}
        </div>
    );
}
