"use client";

import { useRef, useState, useEffect, useCallback } from "react";

export default function AudioPlayer({ src, isMine = false }) {
    const audioRef                        = useRef(null);
    const seekRef                         = useRef(null);
    const [playing, setPlaying]           = useState(false);
    const [progress, setProgress]         = useState(0);
    const [duration, setDuration]         = useState(0);
    const [seeking, setSeeking]           = useState(false);
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

    // The bar used to carry `cursor-pointer` and no handler at all: it looked
    // draggable and was completely inert, and on touch, where there is no cursor,
    // it was just a dead 4px strip. Seeking is now real. `currentTime` is written
    // straight onto the element instead of going out through a prop — the <audio>
    // node is right here, and a prop would only add a second source of truth that
    // can disagree with it.
    const seekTo = useCallback((clientX) => {
        const el = audioRef.current;
        const track = seekRef.current;
        if (!el || !track || !el.duration || !isFinite(el.duration)) return;
        const rect = track.getBoundingClientRect();
        if (!rect.width) return;
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        el.currentTime = ratio * el.duration;
        setProgress(ratio * 100);
    }, []);

    // Pointer events rather than click/mousedown so a finger drag seeks exactly
    // like a cursor drag. The capture keeps the drag alive once the pointer leaves
    // the 4px bar, which it always does: the finger covers what it is pressing.
    const handleSeekDown = (e) => {
        if (!audioRef.current?.duration) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setSeeking(true);
        seekTo(e.clientX);
    };

    const handleSeekMove = (e) => {
        if (!seeking) return;
        seekTo(e.clientX);
    };

    const handleSeekUp = (e) => {
        if (!seeking) return;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        setSeeking(false);
    };

    // A 24px-tall draggable strip is a mouse affordance; keyboard needs the same
    // thing exposed as a real control.
    const handleSeekKey = (e) => {
        const el = audioRef.current;
        if (!el || !el.duration) return;
        const step = 5;
        let next = el.currentTime;
        if (e.key === "ArrowRight") next += step;
        else if (e.key === "ArrowLeft") next -= step;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = el.duration;
        else return;
        e.preventDefault();
        el.currentTime = Math.min(el.duration, Math.max(0, next));
        setProgress((el.currentTime / el.duration) * 100);
    };

    const bubbleBg = isMine
        ? "bg-blue-400/30"
        : "bg-gray-200 dark:bg-gray-700";

    return (
        <div className={`flex items-center gap-2.5 px-3 py-2 rounded-2xl min-w-[180px] ${bubbleBg}`}>
            <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

            <button
                onClick={togglePlay}
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors bg-white/20 hover:bg-white/30 dark:bg-white/10 dark:hover:bg-white/20 touch-manipulation"
                aria-label={playing ? "Pause" : "Play"}
            >
                {playing ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9ZM6.75 6a.75.75 0 0 0-.75.75v10.5a.75.75 0 0 0 1.5 0V6.75A.75.75 0 0 0 6.75 6Zm10.5 0a.75.75 0 0 0-.75.75v10.5a.75.75 0 0 0 1.5 0V6.75a.75.75 0 0 0-.75-.75Z" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                    </svg>
                )}
            </button>

            <div className="flex-1 flex flex-col gap-1 min-w-0">
                {/* The bar itself stays 4px so the bubble keeps its size; the hit
                    area around it is 24px so it is reachable with a thumb.
                    `touch-none` is what makes a horizontal drag seek instead of
                    scrolling the feed out from under it. */}
                <div
                    ref={seekRef}
                    onPointerDown={handleSeekDown}
                    onPointerMove={handleSeekMove}
                    onPointerUp={handleSeekUp}
                    onPointerCancel={handleSeekUp}
                    onKeyDown={handleSeekKey}
                    role="slider"
                    tabIndex={0}
                    aria-label="Seek"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    aria-valuenow={Math.round(duration * (progress / 100))}
                    aria-valuetext={formatTime(duration * (progress / 100))}
                    className="h-6 flex items-center cursor-pointer touch-none select-none"
                >
                    <div className="h-1 w-full bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-current rounded-full transition-[width] duration-100"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
                <div className="flex justify-between">
                    <span className="text-[10px] opacity-60 font-mono">{formatTime(duration * (progress / 100))}</span>
                    <span className="text-[10px] opacity-60 font-mono">{formatTime(duration)}</span>
                </div>
            </div>
        </div>
    );
}
