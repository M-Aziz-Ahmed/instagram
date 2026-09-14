"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Hls from "hls.js";

function toProxy(url, headers) {
    if (!url) return url;
    if (!headers || !headers.Referer) return url;
    if (url.startsWith("/api/media-proxy")) return url;
    const params = new URLSearchParams({ url });
    params.set("ref", headers.Referer);
    if (headers["User-Agent"]) params.set("ua", headers["User-Agent"]);
    return `/api/media-proxy?${params.toString()}`;
}

function sortQuality(a, b) {
    const score = (s) => {
        const n = parseInt(s.quality, 10);
        if (!isNaN(n)) return n;
        if (s.isM3U8) return 1000000;
        return 999000;
    };
    return score(b) - score(a);
}

export default function MediaPlayer({ src, title, poster, onBack, onNext, onPrev, autoPlay = true, sources, subtitles, headers }) {
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
    const [showControls, setShowControls] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [sourceIndex, setSourceIndex] = useState(0);
    const [subIndex, setSubIndex] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    const [iframeIndex, setIframeIndex] = useState(0);
    const [iframeFailed, setIframeFailed] = useState(false);

    const sourceList = useMemo(() => {
        if (Array.isArray(sources) && sources.length > 0) return [...sources].sort(sortQuality);
        return null;
    }, [sources]);

    const subtitleList = useMemo(() => (Array.isArray(subtitles) ? subtitles : null), [subtitles]);

    const isIframeSrc = src && (src.includes("vidsrc.xyz") || src.includes("embed"));

    const activeSource = sourceList && sourceList.length > 0 ? sourceList[Math.min(sourceIndex, sourceList.length - 1)] : null;
    const activeSrc = activeSource ? activeSource.url : src;

    // Build player source (proxied when a Referer is required)
    const playerSrc = useMemo(() => {
        if (!activeSrc || activeSrc.includes("vidsrc.xyz") || activeSrc.includes("embed")) return activeSrc || "";
        return toProxy(activeSrc, headers);
    }, [activeSrc, headers]);

    // (Re)initialise video / HLS whenever the active source changes
    useEffect(() => {
        if (!playerSrc) return;
        const video = videoRef.current;
        if (!video) return;

        setLoading(true);
        setError("");

        if (playerSrc.endsWith(".m3u8") || playerSrc.includes(".m3u8")) {
            if (Hls.isSupported()) {
                const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
                hlsRef.current = hls;
                hls.loadSource(playerSrc);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setLoading(false);
                    if (autoPlay) video.play().catch(() => {});
                });
                hls.on(Hls.Events.ERROR, (_e, data) => {
                    if (data.fatal) {
                        setError("Playback error");
                        setLoading(false);
                    }
                });
                return () => { hls.destroy(); hlsRef.current = null; };
            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                video.src = playerSrc;
                const onMeta = () => {
                    setLoading(false);
                    if (autoPlay) video.play().catch(() => {});
                };
                video.addEventListener("loadedmetadata", onMeta);
                return () => video.removeEventListener("loadedmetadata", onMeta);
            }
        } else {
            video.src = playerSrc;
            const onData = () => {
                setLoading(false);
                if (autoPlay) video.play().catch(() => {});
            };
            video.addEventListener("loadeddata", onData);
            return () => video.removeEventListener("loadeddata", onData);
        }
    }, [playerSrc, autoPlay]);

    // Apply subtitle selection to the <track> elements
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !subtitleList) return;
        const apply = () => {
            const tracks = video.textTracks;
            for (let i = 0; i < tracks.length; i++) {
                tracks[i].mode = i === subIndex - 1 ? "showing" : "hidden";
            }
        };
        if (video.readyState >= 1) apply();
        video.addEventListener("loadedmetadata", apply);
        return () => video.removeEventListener("loadedmetadata", apply);
    }, [subtitleList, subIndex, playerSrc]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTime = () => {
            if (video.duration) {
                setProgress(video.currentTime);
                setDuration(video.duration);
                setCurrentTime(video.currentTime);
            }
        };
        video.addEventListener("timeupdate", onTime);
        video.addEventListener("play", () => setPlaying(true));
        video.addEventListener("pause", () => setPlaying(false));
        return () => { video.removeEventListener("timeupdate", onTime); };
    }, []);

    const togglePlay = () => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); };
    const toggleFs = () => {
        const el = containerRef.current;
        if (!el) return;
        if (!document.fullscreenElement) {
            el.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
        }
    };
    const handleSeek = (e) => { const v = videoRef.current; if (!v) return; v.currentTime = (e.target.value / 100) * v.duration; };
    const handleVol = (e) => { const v = videoRef.current; if (!v) return; v.volume = e.target.value; setVolume(e.target.value); };
    const formatTime = (s) => { if (!s || isNaN(s)) return "0:00"; const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = Math.floor(s % 60); return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}` : `${m}:${sec.toString().padStart(2, "0")}`; };

    const currentSourceLabel = activeSource
        ? `${activeSource.server || "server"}${activeSource.quality && activeSource.quality !== "auto" ? " · " + activeSource.quality : ""}`
        : "";

    if (error) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-6 text-center">
                <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
                {sourceList && sourceList.length > 1 && (
                    <button onClick={() => { setSourceIndex((i) => (i + 1) % sourceList.length); setError(""); }} className="mb-2 mr-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-xl text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors">
                        Try another server
                    </button>
                )}
                <button onClick={onBack} className="px-4 py-2 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-xl text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors">
                    ← Back
                </button>
            </div>
        );
    }

    if (isIframeSrc) {
        return (
            <div ref={containerRef} className="relative bg-gray-900 rounded-xl overflow-hidden">
                <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                    <iframe
                        src={src}
                        title={title}
                        className="absolute inset-0 w-full h-full border-0"
                        allowFullScreen
                        allow="autoplay; fullscreen; picture-in-picture"
                    />
                </div>
                <div className="absolute top-3 left-3 z-10">
                    <button onClick={onBack} className="p-2 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors" title="Back">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="relative bg-gray-900 rounded-xl overflow-hidden" onMouseEnter={() => setShowControls(true)} onMouseLeave={() => setShowControls(false)}>
            <video
                ref={videoRef}
                className="w-full h-auto"
                poster={poster}
                playsInline
                onClick={togglePlay}
                onDoubleClick={toggleFs}
            >
                {subtitleList && subtitleList.map((s, i) => (
                    <track
                        key={`${s.url}-${i}`}
                        src={toProxy(s.url, headers)}
                        kind="subtitles"
                        label={s.lang || "Subtitles"}
                        srcLang={i === 0 ? "en" : undefined}
                        default={i === 0 && subIndex === 1}
                    />
                ))}
            </video>
            {loading && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" /></div>}

            {showControls && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={(progress / (duration || 1)) * 100}
                            onChange={handleSeek}
                            className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
                            aria-label="Seek"
                        />
                        <span className="text-xs text-white/80 font-mono w-20 text-right">{formatTime(currentTime)} / {formatTime(duration)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        {onPrev && <button onClick={onPrev} className="p-1.5 text-white/80 hover:text-white transition-colors" title="Previous"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0l7.5-7.5M3 12h18" /></svg></button>}
                        <button onClick={togglePlay} className="p-2 bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors" title={playing ? "Pause" : "Play"}>
                            {playing ? (
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                            ) : (
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 ml-1"><path d="M8 5v14l11-7z" /></svg>
                            )}
                        </button>
                        {onNext && <button onClick={onNext} className="p-1.5 text-white/80 hover:text-white transition-colors" title="Next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5l7.5 7.5-7.5 7.5M21 12H3" /></svg></button>}
                        <span className="text-[11px] text-white/70 truncate max-w-[120px]">{currentSourceLabel}</span>
                        <div className="flex-1" />
                        {(sourceList && sourceList.length > 1 || subtitleList && subtitleList.length > 0) && (
                            <div className="relative">
                                <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 text-white/80 hover:text-white transition-colors" title="Settings">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                                </button>
                                {showSettings && (
                                    <div className="absolute bottom-full right-0 mb-1 w-48 bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur rounded-xl border border-gray-700 shadow-xl overflow-hidden z-30">
                                        <div className="max-h-56 overflow-y-auto py-1">
                                            {sourceList && sourceList.length > 1 && (
                                                <div className="px-3 pt-2 pb-1">
                                                    <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Server</p>
                                                    {sourceList.map((s, i) => (
                                                        <button
                                                            key={`${s.url}-${i}`}
                                                            onClick={() => { setSourceIndex(i); setShowSettings(false); }}
                                                            className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${i === sourceIndex ? "bg-blue-600 text-white" : "text-gray-200 hover:bg-gray-800"}`}
                                                        >
                                                            {s.server || "server"}{s.quality && s.quality !== "auto" ? ` · ${s.quality}` : ""}
                                                        </button>
                                                    ))}
                                                    <div className="my-1 h-px bg-gray-800" />
                                                </div>
                                            )}
                                            {subtitleList && subtitleList.length > 0 && (
                                                <div className="px-3 pt-1 pb-2">
                                                    <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Subtitles</p>
                                                    {["Off", ...subtitleList.map((s) => s.lang || "Subtitles")].map((label, i) => (
                                                        <button
                                                            key={label + i}
                                                            onClick={() => { setSubIndex(i); setShowSettings(false); }}
                                                            className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${i === subIndex ? "bg-blue-600 text-white" : "text-gray-200 hover:bg-gray-800"}`}
                                                        >
                                                            {label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <input type="range" min={0} max={1} step={0.1} value={volume} onChange={handleVol} className="w-24 h-1.5 accent-blue-500 cursor-pointer" aria-label="Volume" />
                        <button onClick={toggleFs} className="p-1.5 text-white/80 hover:text-white transition-colors" title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
                            {fullscreen ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                            ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                            )}
                        </button>
                        <button onClick={onBack} className="p-1.5 text-white/80 hover:text-white transition-colors" title="Back">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}