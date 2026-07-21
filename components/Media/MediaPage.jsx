"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import MediaCard from "./MediaCard";
import MediaPlayer from "./MediaPlayer";
import ImportDataButton from "@/components/common/ImportDataButton";
import MediaBookmarkButton from "@/components/shared/MediaBookmarkButton";

const fmtNum = (n) => (n == null ? "?" : n.toLocaleString());

export default function MediaPage({ mediaType, config }) {
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
    const searchTimer = useRef(null);
    const searchParams = useSearchParams();
    const initialId = searchParams.get("id");
    const initialEp = searchParams.get("ep");
    const didInit = useRef(false);

    const fetchTrending = useCallback(async () => {
        try {
            const res = await fetch(`${apiRoute}/${mediaType}/trending?time_window=week`);
            const data = await res.json();
            if (data?.results) setTrending(data.results.slice(0, 18));
        } catch {}
    }, [apiRoute, mediaType]);

    useEffect(() => {
        fetchTrending();
    }, [fetchTrending]);

    useEffect(() => {
        if (!initialId || didInit.current) return;
        didInit.current = true;
        (async () => {
            try {
                const res = await fetch(`${apiRoute}/${mediaType}/${initialId}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (data) {
                    setSelected(data);
                    if (mediaType !== "movie" && data.numberOfEpisodes) {
                        const epsRes = await fetch(`${apiRoute}/${mediaType}/${initialId}/season/1`);
                        if (epsRes.ok) {
                            const epsData = await epsRes.json();
                            setEpisodes(epsData?.episodes || []);
                            if (initialEp) {
                                const match = (epsData?.episodes || []).find(e => e.episode_number == initialEp);
                                if (match) handlePlayEpisode(match);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to load media:", err);
            }
        })();
    }, [initialId, initialEp, apiRoute, mediaType]);

    const doSearch = useCallback(async (q, page = 1, append = false) => {
        if (!q.trim()) return;
        setLoading(true);
        setTrending([]);
        try {
            const res = await fetch(`${apiRoute}/${mediaType}/search?q=${encodeURIComponent(q)}&page=${page}`);
            const data = await res.json();
            if (data?.results) {
                setResults(append ? [...results, ...data.results] : data.results);
            }
        } catch {}
        setLoading(false);
    }, [apiRoute, mediaType, results]);

    const handleSearchChange = (val) => {
        setQuery(val);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            if (val.trim()) doSearch(val, 1, false);
            else { setResults([]); fetchTrending(); }
        }, 400);
    };

    const handleSelect = async (item) => {
        setSelected(item);
        setDetails(null);
        setEpisodes([]);
        setCurrentEp(null);
        setStreamUrl("");
        const routeMap = { movie: "movies", kdrama: "kdramas", season: "seasons", cdrama: "cdramas", cartoon: "cartoons" };
        const route = routeMap[mediaType] || mediaType;
        window.history.pushState({}, "", `/${route}?id=${item.id}`);
        try {
            const res = await fetch(`${apiRoute}/${mediaType}/${item.id}`);
            const data = await res.json();
            if (data) {
                setDetails(data);
                if (mediaType !== "movie" && data.numberOfSeasons > 0) {
                    const epsRes = await fetch(`${apiRoute}/${mediaType}/${item.id}/season/1`);
                    const epsData = await epsRes.json();
                    setEpisodes(epsData?.episodes || []);
                }
            }
        } catch {}
    };

    const handlePlayEpisode = async (ep) => {
        setCurrentEp(ep);
        setStreamUrl("");
        setStreamTitle(`Episode ${ep.episode_number}${ep.name ? " - " + ep.name : ""}`);
        if (selected?.id) {
            const routeMap = { movie: "movies", kdrama: "kdramas", season: "seasons", cdrama: "cdramas", cartoon: "cartoons" };
            const route = routeMap[mediaType] || mediaType;
            window.history.pushState({}, "", `/${route}?id=${selected.id}&ep=${ep.episode_number}`);
        }
        try {
            const res = await fetch(`${apiRoute}/${mediaType}/${ep.id}/stream?season=1&episode=${ep.episode_number}`);
            const data = await res.json();
            if (data?.url) setStreamUrl(data.url);
        } catch {}
        if (selected?.id) {
            fetch(`/api/media-bookmarks/${mediaType}/${selected.id}/history`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ episodeNum: ep.episode_number, title: selected.title, coverUrl: selected.posterPath }),
            }).catch(() => {});
        }
    };

    const handleBack = () => {
        if (streamUrl) {
            setStreamUrl("");
            setCurrentEp(null);
            if (selected?.id) window.history.pushState({}, "", `/${route}?id=${selected.id}`);
        } else if (selected) {
            setSelected(null);
            setDetails(null);
            setEpisodes([]);
            window.history.pushState({}, "", `/${route}`);
        }
    };

    const view = streamUrl ? "player" : selected ? "detail" : "grid";

    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950">
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
                <div className="max-w-6xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center gap-3">
                    {view !== "grid" && (
                        <button onClick={handleBack} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 p-1 -ml-1 shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                    )}
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-lg">{emoji}</span>
                        <h1 className="font-black text-lg text-gray-900 dark:text-gray-100">{label}</h1>
                    </div>
                    <div className="flex-1 max-w-lg">
                        <input
                            type="text"
                            placeholder={`Search ${label.toLowerCase()}...`}
                            value={query}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) doSearch(query, 1, false); }}
                            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-full text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-400"
                        />
                    </div>
                    <ImportDataButton size="sm" onSuccess={() => window.location.reload()} />
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4">
                {/* Player View */}
                {view === "player" && (
                    <div className="space-y-4">
                        <MediaPlayer
                            src={streamUrl}
                            title={streamTitle}
                            poster={details?.posterPath || selected?.posterPath}
                            onBack={handleBack}
                        />
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{streamTitle}</p>
                        <EpisodeList episodes={episodes} currentId={currentEp?.episode_number} onSelect={handlePlayEpisode} />
                    </div>
                )}

                {/* Detail View */}
                {view === "detail" && selected && (
                    <div className="flex flex-col lg:flex-row gap-6">
                        <div className="lg:w-1/3 shrink-0">
                            <img
                                src={details?.posterPath || selected?.posterPath ? `https://image.tmdb.org/t/p/w500${details?.posterPath || selected?.posterPath}` : ""}
                                alt={selected.title}
                                className="w-full max-w-xs mx-auto lg:mx-0 rounded-xl shadow-lg aspect-[2/3] object-cover bg-gray-100 dark:bg-gray-800"
                            />
                        </div>
                        <div className="flex-1 min-w-0 space-y-3">
                            <div className="flex items-start gap-3">
                                <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 flex-1">
                                    {details?.title || selected.title}
                                    {details?.originalTitle && <span className="text-gray-400 dark:text-gray-500 font-normal ml-2">{details.originalTitle}</span>}
                                </h2>
                                <MediaBookmarkButton
                                    mediaType={mediaType}
                                    mediaId={String(selected.id)}
                                    title={selected.title}
                                    coverUrl={selected.posterPath ? `https://image.tmdb.org/t/p/w500${selected.posterPath}` : ""}
                                    status={details?.status}
                                />
                            </div>
                            {details?.originalTitle && <p className="text-xs text-gray-400">{details.originalTitle}</p>}
                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                                {details?.releaseDate && <span>{details.releaseDate.slice(0, 4)}</span>}
                                {details?.firstAirDate && <span>{details.firstAirDate.slice(0, 4)}</span>}
                                {details?.status && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs capitalize">{details.status.toLowerCase()}</span>}
                                {details?.numberOfSeasons && <span>{details.numberOfSeasons} Seasons</span>}
                                {details?.numberOfEpisodes && <span>{details.numberOfEpisodes} Episodes</span>}
                                {details?.voteAverage && (
                                    <span className="flex items-center gap-0.5">
                                        <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" /></svg>
                                        {(details.voteAverage / 2).toFixed(1)}
                                    </span>
                                )}
                            </div>
                            {details?.genres?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {details.genres.map((g) => (
                                        <span key={g} className="px-2.5 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-full text-xs font-medium">{g}</span>
                                    ))}
                                </div>
                            )}
                            {details?.overview && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line line-clamp-6">{details.overview}</p>
                            )}
                        </div>
                        {mediaType !== "movie" && episodes.length > 0 && (
                            <div className="lg:w-72 shrink-0">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">Episodes ({episodes.length})</h3>
                                <EpisodeList episodes={episodes} currentId={currentEp?.episode_number} onSelect={handlePlayEpisode} />
                            </div>
                        )}
                    </div>
                )}

                {/* Grid View */}
                {view === "grid" && (
                    <>
                        {trending.length > 0 && !query && (
                            <div className="mb-8">
                                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Trending {label}</h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {trending.map((item) => (
                                        <MediaCard key={item.id} item={item} mediaType={mediaType} />
                                    ))}
                                </div>
                            </div>
                        )}
                        {results.length === 0 && trending.length === 0 && !loading && !query && (
                            <div className="text-center py-16">
                                <span className="text-5xl mb-4 block">{emoji}</span>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">Search for {label.toLowerCase()} to start watching</p>
                            </div>
                        )}
                        {results.length > 0 && (
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">
                                    {query ? `Results for "${query}"` : "Browse"}
                                </h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {results.map((item) => (
                                        <MediaCard key={item.id} item={item} mediaType={mediaType} />
                                    ))}
                                </div>
                                {loading && <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" /></div>}
                            </div>
                        )}
                        {loading && (
                            <div className="flex justify-center py-12">
                                <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="max-w-6xl mx-auto px-4 py-6 text-center border-t border-gray-100 dark:border-gray-800 mt-8">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                    {label} streaming powered by TMDB & {streamSource}.{" "}
                    <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">TMDB</a>{" "}
                    |{" "}
                    <a href="https://www.netflix.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Watch official releases</a>
                </p>
            </div>
        </div>
    );
}

function EpisodeList({ episodes, currentId, onSelect, loadingId }) {
    return (
        <div className="max-h-[50vh] overflow-y-auto space-y-1 pr-1">
            {episodes.map((ep) => (
                <button
                    key={ep.id}
                    onClick={() => onSelect(ep)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                        currentId === ep.episode_number
                            ? "bg-blue-500 text-white"
                            : loadingId === ep.id
                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600"
                            : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="font-medium">Ep. {ep.episode_number}</span>
                        {ep.vote_average && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-500">{ep.vote_average.toFixed(1)}</span>}
                    </div>
                    {ep.name && <p className="text-xs opacity-70 truncate mt-0.5">{ep.name}</p>}
                    {ep.air_date && <p className="text-[10px] text-gray-400 mt-0.5">{ep.air_date}</p>}
                </button>
            ))}
        </div>
    );
}