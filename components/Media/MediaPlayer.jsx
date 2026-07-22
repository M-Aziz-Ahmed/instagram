"use client";

import { useState, useRef, useEffect } from "react";
import Hls from "hls.js";

export default function MediaPlayer({ src, title, poster, onBack, onNext, onPrev, autoPlay = true }) {
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

    const isIframeSrc = src && (src.includes("vidsrc.xyz") || src.includes("embed"));

    useEffect(() => {
        if (isIframeSrc || !src) return;
        const video = videoRef.current;
        if (!video) return;

        if (src.endsWith(".m3u8") || src.includes(".m3u8")) {
            if (Hls.isSupported()) {
                const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
                hlsRef.current = hls;
                hls.loadSource(src);
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
                video.src = src;
                video.addEventListener("loadedmetadata", () => {
                    setLoading(false);
                    if (autoPlay) video.play().catch(() => {});
                });
            }
        } else {
            video.src = src;
            video.addEventListener("loadeddata", () => {
                setLoading(false);
                if (autoPlay) video.play().catch(() => {});
            });
        }
    }, [src, autoPlay]);

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

    if (error) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-6 text-center">
                <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
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
            />
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
                        <div className="flex-1" />
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