"use client";

import { useRef, useState, useEffect, useCallback } from "react";

export default function AudioPlayer({ src, isMine = false }) {
    const audioRef                        = useRef(null);
    const [playing, setPlaying]           = useState(false);
    const [progress, setProgress]         = useState(0);
    const [duration, setDuration]         = useState(0);
    const animRef                         = useRef(null);

    useEffect(() => {
        const el = audioRef.current;
        if (!el) return;
        const onLoaded = () => setDuration(el.duration || 0);
        const onEnded  = () => { setPlaying(false); setProgress(0); cancelAnimationFrame(animRef.current); };
        el.addEventListener("loadedmetadata", onLoaded);
        el.addEventListener("ended", onEnded);
        return () => {
            el.removeEventListener("loadedmetadata", onLoaded);
            el.removeEventListener("ended", onEnded);
        };
    }, [src]);

    const tick = useCallback(() => {
        const el = audioRef.current;
        if (el && el.duration) {
            setProgress((el.currentTime / el.duration) * 100);
        }
        animRef.current = requestAnimationFrame(tick);
    }, []);

    const togglePlay = async () => {
        const el = audioRef.current;
        if (!el) return;
        if (playing) {
            el.pause();
            setPlaying(false);
            cancelAnimationFrame(animRef.current);
        } else {
            try {
                await el.play();
                setPlaying(true);
                animRef.current = requestAnimationFrame(tick);
            } catch {}
        }
    };

    const formatTime = (s) => {
        if (!s || !isFinite(s)) return "0:00";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    const bubbleBg = isMine
        ? "bg-blue-400/30"
        : "bg-gray-200 dark:bg-gray-700";

    return (
        <div className={`flex items-center gap-2.5 px-3 py-2 rounded-2xl min-w-[180px] ${bubbleBg}`}>
            <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

            <button
                onClick={togglePlay}
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors bg-white/20 hover:bg-white/30 dark:bg-white/10 dark:hover:bg-white/20"
                aria-label={playing ? "Pause" : "Play"}
            >
                {playing ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9ZM6.75 6a.75.75 0 0 0-.75.75v10.5a.75.75 0 0 0 1.5 0V6.75A.75.75 0 0 0 6.75 6Zm10.5 0a.75.75 0 0 0-.75.75v10.5a.75.75 0 0 0 1.5 0V6.75a.75.75 0 0 0-.75-.75Z" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                    </svg>
                )}
            </button>

            <div className="flex-1 flex flex-col gap-1 min-w-0">
                <div className="h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden cursor-pointer">
                    <div
                        className="h-full bg-current rounded-full transition-[width] duration-100"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <div className="flex justify-between">
                    <span className="text-[10px] opacity-60 font-mono">{formatTime(duration * (progress / 100))}</span>
                    <span className="text-[10px] opacity-60 font-mono">{formatTime(duration)}</span>
                </div>
            </div>
        </div>
    );
}
