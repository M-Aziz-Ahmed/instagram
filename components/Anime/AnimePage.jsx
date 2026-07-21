"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Hls from "hls.js";

const fmtNum = (n) => (n == null ? "?" : n.toLocaleString());

function StarIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-yellow-400">
            <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
        </svg>
    );
}

function VideoPlayer({ src, title, poster, onBack }) {
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

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;

        if (src.endsWith(".m3u8") || src.includes(".m3u8")) {
            if (Hls.isSupported()) {
                const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
                hlsRef.current = hls;
                hls.loadSource(src);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setLoading(false);
                    video.play().catch(() => {});
                });
                hls.on(Hls.Events.ERROR, (_e, data) => {
                    if (data.fatal) {
                        setError("Playback error");
                        setLoading(false);
                    }
                });
                return () => { hls.destroy(); hlsRef.current = null; };
            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                video.src = src;
                video.addEventListener("loadedmetadata", () => {
                    setLoading(false);
                    video.play().catch(() => {});
                });
            }
        } else {
            video.src = src;
            video.addEventListener("loadeddata", () => {
                setLoading(false);
                video.play().catch(() => {});
            });
        }
    }, [src]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTime = () => {
            if (video.duration) {
                setProgress(video.currentTime);
                setDuration(video.duration);
            }
        };
        video.addEventListener("timeupdate", onTime);
        video.addEventListener("play", () => setPlaying(true));
        video.addEventListener("pause", () => setPlaying(false));
        return () => {
            video.removeEventListener("timeupdate", onTime);
        };
    }, []);

    const togglePlay = () => {
        const v = videoRef.current;
        if (!v) return;
        v.paused ? v.play() : v.pause();
    };

    const toggleFs = () => {
        const el = containerRef.current;
        if (!el) return;
        if (!document.fullscreenElement) {
            el.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
        }
    };

    const formatTime = (s) => {
        if (!s || !isFinite(s)) return "0:00";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    return (
        <div ref={containerRef} className="relative bg-black rounded-xl overflow-hidden group">
            {loading && !error && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
            )}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/80">
                    <div className="text-center">
                        <p className="text-white text-sm mb-2">{error}</p>
                        <button onClick={onBack} className="text-blue-400 text-sm hover:underline">Go back</button>
                    </div>
                </div>
            )}
            <video
                ref={videoRef}
                className="w-full aspect-video cursor-pointer"
                onClick={togglePlay}
                playsInline
                poster={poster}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    value={progress}
                    onChange={(e) => {
                        const v = videoRef.current;
                        if (v) v.currentTime = Number(e.target.value);
                    }}
                    className="w-full h-1 mb-2 accent-blue-500 cursor-pointer"
                />
                <div className="flex items-center justify-between text-white text-xs">
                    <div className="flex items-center gap-3">
                        <button onClick={togglePlay} className="hover:text-blue-400 transition-colors">
                            {playing ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                    <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H13v1.25a.75.75 0 0 1-1.5 0V18H9v1.25a.75.75 0 0 1-1.5 0V18H5.75A2.75 2.75 0 0 1 3 15.25v-8.5A2.75 2.75 0 0 1 5.75 4H6V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                    <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                                </svg>
                            )}
                        </button>
                        <span>{formatTime(progress)} / {formatTime(duration)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={volume}
                            onChange={(e) => {
                                const v = videoRef.current;
                                if (v) { v.volume = Number(e.target.value); setVolume(Number(e.target.value)); }
                            }}
                            className="w-20 h-1 accent-white cursor-pointer"
                        />
                        <button onClick={toggleFs} className="hover:text-blue-400 transition-colors">
                            {fullscreen ? (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
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

export default function AnimePage() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [spotlight, setSpotlight] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [streamingLinks, setStreamingLinks] = useState([]);
    const [currentEp, setCurrentEp] = useState(null);
    const [streamUrl, setStreamUrl] = useState("");
    const [streamTitle, setStreamTitle] = useState("");
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const searchTimer = useRef(null);

    useEffect(() => {
        fetch("/api/anime/spotlight")
            .then((r) => r.json())
            .then((d) => { if (d?.results) setSpotlight(d.results.slice(0, 12)); })
            .catch(() => {});
    }, []);

    const doSearch = useCallback(async (q, p = 1, append = false) => {
        if (!q.trim()) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}&page=${p}`);
            const data = await res.json();
            const items = data?.results || [];
            setResults((prev) => (append ? [...prev, ...items] : items));
            setHasMore(items.length > 0);
            setPage(p);
        } catch { /* silent */ }
        setLoading(false);
    }, []);

    const handleSearchChange = (val) => {
        setQuery(val);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            if (val.trim()) doSearch(val, 1, false);
            else setResults([]);
        }, 400);
    };

    const handleSelect = async (item) => {
        setSelected(item);
        setStreamingLinks([]);
        setCurrentEp(null);
        setStreamUrl("");
        try {
            const res = await fetch(`/api/anime/info/${encodeURIComponent(item.id)}`);
            const data = await res.json();
            if (data?.streamingEpisodes) setStreamingLinks(data.streamingEpisodes);
            if (data?.description) {
                setSelected((prev) => ({ ...prev, description: data.description, genres: data.genres, status: data.status, totalEpisodes: data.totalEpisodes, releaseDate: data.releaseDate, otherNames: data.otherNames }));
            }
        } catch { /* silent */ }
    };

    const handlePlayEpisode = async (ep) => {
        if (ep.url) window.open(ep.url, "_blank", "noopener,noreferrer");
    };

    const streamLinks = selected ? [
        { name: "Tubi", url: `https://tubitv.com/search/${encodeURIComponent(selected.title)}`, title: "Free on Tubi" },
        { name: "Crunchyroll", url: `https://www.crunchyroll.com/search?q=${encodeURIComponent(selected.title)}`, title: "Search Crunchyroll" },
        { name: "Anime-Planet", url: `https://www.anime-planet.com/anime/all?q=${encodeURIComponent(selected.title)}`, title: "Anime-Planet" },
    ] : [];

    const handleBack = () => {
        if (streamUrl) { setStreamUrl(""); setCurrentEp(null); }
        else if (selected) { setSelected(null); setStreamingLinks([]); }
    };

    const view = streamUrl ? "player" : selected ? "detail" : "grid";

    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950">
            {/* Header */}
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
                <div className="max-w-6xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center gap-3">
                    {view !== "grid" && (
                        <button onClick={handleBack} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 p-1 -ml-1 shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                    )}
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-lg">🎬</span>
                        <h1 className="font-black text-lg text-gray-900 dark:text-gray-100">Anime</h1>
                    </div>
                    <div className="flex-1 max-w-lg">
                        <input
                            type="text"
                            placeholder="Search anime..."
                            value={query}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) doSearch(query, 1, false); }}
                            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-full text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-400"
                        />
                    </div>
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4">
                {/* Player View */}
                {view === "player" && (
                    <div className="space-y-4">
                        <VideoPlayer src={streamUrl} title={streamTitle} poster={selected?.image} onBack={handleBack} />
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{streamTitle}</p>
                    </div>
                )}

                {/* Detail View */}
                {view === "detail" && selected && (
                    <div className="flex flex-col lg:flex-row gap-6">
                        <div className="lg:w-1/3 shrink-0">
                            <img src={selected.image} alt={selected.title} className="w-full max-w-xs mx-auto lg:mx-0 rounded-xl shadow-lg" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-3">
                            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100">{selected.title}</h2>
                            {selected.otherNames?.length > 0 && (
                                <p className="text-xs text-gray-400">{selected.otherNames.slice(0, 3).join(" / ")}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                                {selected.rating && <span className="flex items-center gap-1"><StarIcon /> {selected.rating}</span>}
                                {selected.status && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs">{selected.status}</span>}
                                {selected.releaseDate && <span>{selected.releaseDate}</span>}
                                {selected.totalEpisodes && <span>{selected.totalEpisodes} eps</span>}
                            </div>
                            {selected.genres?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {selected.genres.map((g) => (
                                        <span key={g} className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-xs font-medium">{g}</span>
                                    ))}
                                </div>
                            )}
                            {selected.description && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line line-clamp-6">{selected.description}</p>
                            )}
                            {/* Streaming Links */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Watch Now</h3>
                                {streamingLinks.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {streamingLinks.map((ep, i) => (
                                            <a
                                                key={i}
                                                href={ep.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors group"
                                            >
                                                {ep.thumbnail && <img src={ep.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{ep.title}</p>
                                                    {ep.site && <p className="text-[10px] text-gray-400">{ep.site}</p>}
                                                </div>
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 shrink-0 transition-colors">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                                </svg>
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-xs text-gray-400">No streaming links available from AniList. Try these:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {streamLinks.map((link) => (
                                                <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-full transition-colors">
                                                    {link.title}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Grid View */}
                {view === "grid" && (
                    <>
                        {results.length === 0 && spotlight.length === 0 && !loading && (
                            <div className="text-center py-16">
                                <span className="text-5xl mb-4 block">🎬</span>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">Search for your favorite anime to start watching</p>
                            </div>
                        )}
                        {results.length === 0 && spotlight.length > 0 && !query && (
                            <div className="mb-8">
                                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Trending Now</h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {spotlight.map((item) => (
                                        <button key={item.id} onClick={() => handleSelect(item)} className="group text-left">
                                            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                                                <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                                                {item.sub && <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded">SUB</span>}
                                                {item.dub && <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-purple-500 text-white text-[10px] font-bold rounded">DUB</span>}
                                            </div>
                                            <p className="mt-1.5 text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{item.title}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {results.length > 0 && (
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">{query ? `Results for "${query}"` : "Browse"}</h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {results.map((item) => (
                                        <button key={item.id} onClick={() => handleSelect(item)} className="group text-left">
                                            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                                                <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                                                {item.sub && <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded">SUB</span>}
                                                {item.dub && <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-purple-500 text-white text-[10px] font-bold rounded">DUB</span>}
                                            </div>
                                            <p className="mt-1.5 text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{item.title}</p>
                                        </button>
                                    ))}
                                </div>
                                {hasMore && (
                                    <div className="flex justify-center mt-6">
                                        <button
                                            onClick={() => doSearch(query, page + 1, true)}
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

            {/* Footer ad / support */}
            <div className="max-w-6xl mx-auto px-4 py-6 text-center border-t border-gray-100 dark:border-gray-800 mt-8">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                    Free anime streaming powered by community.{" "}
                    <a href="https://www.crunchyroll.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Watch ad-free on Crunchyroll</a>
                </p>
            </div>
        </div>
    );
}
