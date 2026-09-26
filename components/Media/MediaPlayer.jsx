"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
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

const EMBED_PATTERN = /vidsrc\.|2embed|\/embed\//i;

export default function MediaPlayer({
    src,
    title,
    poster,
    onBack,
    onNext,
    onPrev,
    autoPlay = true,
    sources,
    subtitles,
    headers,
    embedUrls,
}) {
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
    const [controlsIdle, setControlsIdle] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [sourceIndex, setSourceIndex] = useState(0);
    const [subIndex, setSubIndex] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    const [embedIndex, setEmbedIndex] = useState(0);
    const [hovering, setHovering] = useState(false);

    const sourceList = useMemo(() => {
        if (Array.isArray(sources) && sources.length > 0) return [...sources].sort(sortQuality);
        return null;
    }, [sources]);

    const subtitleList = useMemo(() => (Array.isArray(subtitles) ? subtitles : null), [subtitles]);

    // The caller hands us a primary embed plus a list of mirrors. Previously
    // only `src` was read and `embedUrls` was silently discarded, so a dead
    // mirror had nowhere to fall back to — the user got a frozen "media
    // unavailable" frame and a Back button. Now every mirror is reachable.
    const embedList = useMemo(() => {
        const list = [];
        const push = (u) => {
            if (u && !list.includes(u)) list.push(u);
        };
        (Array.isArray(embedUrls) ? embedUrls : []).forEach(push);
        if (src && EMBED_PATTERN.test(src)) push(src);
        return list;
    }, [embedUrls, src]);

    const isEmbed = embedList.length > 0 && (!src || EMBED_PATTERN.test(src));
    const activeEmbed = isEmbed ? embedList[Math.min(embedIndex, embedList.length - 1)] : null;

    const activeSource = sourceList && sourceList.length > 0 ? sourceList[Math.min(sourceIndex, sourceList.length - 1)] : null;
    const activeSrc = activeSource ? activeSource.url : src;

    // Build player source (proxied when a Referer is required)
    const playerSrc = useMemo(() => {
        if (!activeSrc || EMBED_PATTERN.test(activeSrc)) return activeSrc || "";
        return toProxy(activeSrc, headers);
    }, [activeSrc, headers]);

    // Reset per-source UI when the title or episode changes. This is React's
    // documented "adjust state during render" pattern: setting state while
    // rendering re-runs the component immediately without committing a frame,
    // so the player never renders once with the new URL and the old source
    // index. An effect here would paint that mismatched frame first.
    const [lastSrc, setLastSrc] = useState(src);
    if (src !== lastSrc) {
        setLastSrc(src);
        setSourceIndex(0);
        setEmbedIndex(0);
        setError("");
    }

    // ── Embed watchdog ──────────────────────────────────────────
    // A cross-origin embed gives us no way to inspect its document: `onLoad`
    // fires just as happily for an error page as for a playing video. So we
    // can't claim failure — but we also shouldn't leave the user staring at a
    // dead frame forever. After a grace period we offer the escape hatches
    // (another mirror, a new tab, back) without interrupting playback.
    // Keyed by URL rather than a boolean so switching servers clears it for
    // free.
    const [stalledEmbed, setStalledEmbed] = useState(null);
    useEffect(() => {
        if (!isEmbed) return;
        const id = setTimeout(() => setStalledEmbed(activeEmbed), 7000);
        return () => clearTimeout(id);
    }, [isEmbed, activeEmbed]);

    const embedStalled = isEmbed && stalledEmbed === activeEmbed;

    const nextEmbed = useCallback(() => {
        setEmbedStalled(false);
        setEmbedIndex((i) => (i + 1) % embedList.length);
    }, [embedList.length]);

    const switchSource = useCallback(() => {
        setError("");
        setLoading(true);
        if (sourceList && sourceList.length > 1) {
            setSourceIndex((i) => (i + 1) % sourceList.length);
        } else if (embedList.length > 1) {
            nextEmbed();
        }
    }, [sourceList, embedList.length, nextEmbed]);

    // (Re)initialise video / HLS whenever the active source changes
    useEffect(() => {
        if (!playerSrc || isEmbed) return;
        const video = videoRef.current;
        if (!video) return;

        setLoading(true);
        setError("");

        const cleanup = () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };

        if (playerSrc.endsWith(".m3u8") || playerSrc.includes(".m3u8")) {
            if (Hls.isSupported()) {
                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    retryDelay: 1000,
                    maxDelay: 5000,
                    maxMaxRetryDelay: 10000,
                    maxLoadTimeout: 20000,
                    maxRetry: 3,
                });
                hlsRef.current = hls;
                hls.loadSource(playerSrc);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setLoading(false);
                    if (autoPlay) video.play().catch(() => {});
                });
                hls.on(Hls.Events.ERROR, (_e, data) => {
                    if (!data.fatal) return;
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        // Recoverable in place: the manifest usually just needs
                        // another pass at the origin.
                        hls.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else {
                        setError("This server couldn't play the video.");
                        setLoading(false);
                    }
                });
                return cleanup;
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
            const onError = () => {
                setError("This server couldn't play the video.");
                setLoading(false);
            };
            video.addEventListener("loadeddata", onData);
            video.addEventListener("error", onError);
            return () => {
                video.removeEventListener("loadeddata", onData);
                video.removeEventListener("error", onError);
            };
        }
    }, [playerSrc, autoPlay, isEmbed]);

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

    // Auto-hide the control bar during playback. Without this it sits over the
    // video permanently and covers the bottom of the frame — the single most
    // obvious "this is a prototype" tell in a video player.
    //
    // The state write happens inside a timer, not in the effect body, and
    // visibility is derived at render time (paused or hovered always wins), so
    // pausing never needs a compensating effect.
    useEffect(() => {
        if (!playing) return;
        let timer;
        const arm = () => {
            clearTimeout(timer);
            setControlsIdle(false);
            timer = setTimeout(() => setControlsIdle(true), 2800);
        };
        arm();
        const el = containerRef.current;
        el?.addEventListener("mousemove", arm);
        el?.addEventListener("touchstart", arm);
        return () => {
            clearTimeout(timer);
            el?.removeEventListener("mousemove", arm);
            el?.removeEventListener("touchstart", arm);
        };
    }, [playing]);

    // Paused or hovered → always show. Only a playing, untouched player hides.
    const showControls = hovering || !playing || !controlsIdle;

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
        const canSwitch = (sourceList && sourceList.length > 1) || embedList.length > 1;
        return (
            <div className="surface p-8 text-center">
                <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-6 w-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Playback unavailable</h3>
                <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">{error}</p>
                <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
                    {canSwitch && (
                        <button onClick={switchSource} className="btn-primary px-5 py-2.5 text-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                            Try another server
                        </button>
                    )}
                    <button onClick={onBack} className="btn-secondary px-5 py-2.5 text-sm">
                        ← Back
                    </button>
                </div>
            </div>
        );
    }

    if (isEmbed) {
        return (
            <div>
                <div ref={containerRef} className="relative bg-black rounded-2xl overflow-hidden border border-[var(--border-subtle)]">
                    <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                        <iframe
                            key={activeEmbed}
                            src={activeEmbed}
                            title={title}
                            className="absolute inset-0 w-full h-full border-0"
                            allowFullScreen
                            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                            // Mirrors like vidsrc are third-party and were
                            // unsandboxed, which let them call window.open on a
                            // timer — the "ads popping before the video plays"
                            // behaviour. The sandbox keeps playback working
                            // (scripts + same-origin for its own player +
                            // presentation for fullscreen) while the browser
                            // refuses every navigation, popup and form submit
                            // originating inside the frame.
                            sandbox="allow-scripts allow-same-origin allow-presentation"
                            referrerPolicy="origin-when-cross-origin"
                        />
                    </div>
                    <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                        <button onClick={onBack} className="p-2 bg-black/70 text-white rounded-full hover:bg-black/90 transition-colors backdrop-blur" title="Back" aria-label="Back">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        {embedList.length > 1 && (
                            <span className="px-2.5 py-1.5 rounded-full bg-black/70 text-white/80 text-[11px] font-semibold tabular-nums backdrop-blur">
                                Server {embedIndex + 1}/{embedList.length}
                            </span>
                        )}
                    </div>
                </div>

                {/* Non-blocking recovery affordance. Only appears if the embed
                    hasn't been interacted with, so it never interrupts a video
                    that is playing fine. */}
                {embedStalled && (
                    <div className="mt-3 surface px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                        <p className="text-xs text-gray-600 dark:text-gray-400 flex-1 min-w-[200px]">
                            Not playing? This mirror may be down for this title.
                        </p>
                        <div className="flex items-center gap-2">
                            <button onClick={nextEmbed} className="btn-secondary px-3.5 py-2 text-xs">
                                Next server
                            </button>
                            <a
                                href={activeEmbed}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary px-3.5 py-2 text-xs"
                            >
                                Open in new tab
                            </a>
                            <button onClick={onBack} className="btn-ghost px-3.5 py-2 text-xs">
                                ← Back
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="relative bg-black rounded-2xl overflow-hidden border border-[var(--border-subtle)] group"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
        >
            <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-contain"
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
            </div>
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
                    <div className="h-10 w-10 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />
                </div>
            )}

            {showControls && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={(progress / (duration || 1)) * 100}
                            onChange={handleSeek}
                            className="flex-1 h-1.5 accent-[var(--brand-500)] cursor-pointer"
                            aria-label="Seek"
                        />
                        <span className="text-xs text-white/80 font-mono w-20 text-right tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>
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
                                                            className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${i === sourceIndex ? "bg-[var(--brand-600)] text-white" : "text-gray-200 hover:bg-gray-800"}`}
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
                                                            className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${i === subIndex ? "bg-[var(--brand-600)] text-white" : "text-gray-200 hover:bg-gray-800"}`}
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
                        <input type="range" min={0} max={1} step={0.1} value={volume} onChange={handleVol} className="w-24 h-1.5 accent-[var(--brand-500)] cursor-pointer" aria-label="Volume" />
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