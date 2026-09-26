"use client";

import { useEffect, useRef, useState } from "react";

// Shared video renderer for post video.
//
// Two modes, because the two surfaces have genuinely different requirements:
//   "inline" — a post in the feed or on its detail page. Plays only when the
//              viewer asks it to, keeps the native controls.
//   "reel"   — the /reels feed. Autoplays muted when it is the reel in view
//              and pauses as soon as it scrolls away, so only one video is ever
//              playing and a background tab is not left decoding video.
//
// Autoplay is muted by design: browsers block audible autoplay without a user
// gesture, so a "sound on by default" reel would simply never start. The
// unmute control is therefore always visible rather than shown on failure.
export default function VideoPlayer({
    src,
    duration = 0,
    width = 0,
    height = 0,
    mode = "inline",
    className = "",
}) {
    const ref = useRef(null);
    const [muted, setMuted] = useState(true);
    const [playing, setPlaying] = useState(false);

    const isReel = mode === "reel";

    // Reels: drive playback from visibility so scrolling away pauses the video
    // instead of leaving several playing (and downloading) at once.
    useEffect(() => {
        if (!isReel || !ref.current) return;
        const el = ref.current;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                    // Autoplay rejection is expected and not worth surfacing;
                    // the poster frame and the tap-to-play affordance remain.
                    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
                } else {
                    el.pause();
                    setPlaying(false);
                }
            },
            { threshold: [0, 0.6, 1] }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [isReel, src]);

    // Pause when the tab is hidden: a reel should not keep playing in the
    // background just because the user switched tabs.
    useEffect(() => {
        if (!isReel) return;
        const onVisibility = () => {
            const el = ref.current;
            if (!el) return;
            if (document.hidden) {
                el.pause();
                setPlaying(false);
            }
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [isReel]);

    // Reserve the right box before the video loads so the feed does not jump.
    const ratio = width > 0 && height > 0 ? `${width} / ${height}` : undefined;

    return (
        <div className={`relative bg-black ${className}`}>
            <div
                className="w-full h-full flex items-center justify-center"
                style={ratio ? { aspectRatio: ratio } : undefined}
            >
                <video
                    ref={ref}
                    src={src}
                    controls={!isReel}
                    muted={muted}
                    loop={isReel}
                    playsInline
                    preload="metadata"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onClick={() => {
                        const el = ref.current;
                        if (!el) return;
                        if (el.paused) el.play().catch(() => {});
                        else el.pause();
                    }}
                    className={`w-full h-full ${isReel ? "object-contain" : "max-h-[560px] object-contain"}`}
                />
            </div>

            {isReel && (
                <button
                    onClick={() => setMuted(m => !m)}
                    aria-label={muted ? "Unmute" : "Mute"}
                    className="absolute bottom-3 right-3 bg-black/55 text-white rounded-full p-2 hover:bg-black/75 transition-colors"
                >
                    {muted ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="m2 2 20 20" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                        </svg>
                    )}
                </button>
            )}

            {isReel && !playing && (
                <button
                    onClick={() => ref.current?.play().catch(() => {})}
                    aria-label="Play video"
                    className="absolute inset-0 flex items-center justify-center"
                >
                    <span className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-white ml-0.5">
                            <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                        </svg>
                    </span>
                </button>
            )}

            {duration > 0 && (
                <span className="absolute top-2 left-2 text-[10px] text-white/85 bg-black/55 rounded px-1.5 py-0.5">
                    {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, "0")}
                </span>
            )}
        </div>
    );
}
