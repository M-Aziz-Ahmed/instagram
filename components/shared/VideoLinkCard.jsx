"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openAdLink } from "@/utils/popupGuard";

// Renders a video that lives on another platform, from a recognised link in the
// post text (see live-server/lib/videoLinks.js).
//
// This is the counterpart to VideoPlayer, and it exists so the video-upload
// permission is a cost control rather than a demotion: someone without
// `upload_video` still posts video, it just plays from YouTube/TikTok/etc and
// costs this site nothing to store or serve.
//
// Three rendering modes:
//   • poster  - a thumbnail that swaps to the real player on click.
//   • playing - the platform's iframe, once activated.
//   • blocked - what the iframe degrades to when it never loads.
//
// The poster is the default on purpose. Ten embeds loading at once means ten
// third-party iframes, third-party cookies, and ten trackers before the reader
// has scrolled. Click-to-play keeps the feed cheap and is the behaviour every
// other feed does it.
//
// `blocked` exists because the embed host is not always reachable. Every
// platform this accepts is a third party, and all of them are subject to
// network-level blocking — DNS filtering, censorship, a corporate proxy, an
// offline plane. When the iframe cannot load, the container is a 16:9 `bg-black`
// box, so a blocked embed and a loaded one look identical until the user has
// already clicked: a black rectangle with no controls and no explanation. The
// load timeout detects that case and swaps in a real, labelled way out.

const EMBED_LOAD_TIMEOUT_MS = 6000;

export default function VideoLinkCard({ link, className = "" }) {
    const [playing, setPlaying] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const [thumbBroken, setThumbBroken] = useState(false);
    const loadTimer = useRef(null);

    const label = link?.platformLabel || "Video";

    useEffect(() => {
        // Never leave a timer running across an unmount: this component is
        // rendered once per ad-bearing post and the feed unmounts constantly.
        return () => {
            if (loadTimer.current) clearTimeout(loadTimer.current);
        };
    }, []);

    // A cross-origin iframe fires `load` for whatever document it managed to
    // retrieve, so this cannot prove the *player* works — but a request that is
    // blocked or dead-ended never loads at all. The timeout is therefore the
    // signal, and `load` is only used to cancel it. Guessing wrong in either
    // direction is cheap: a false positive shows a working "open it on
    // <platform>" button underneath the player, and a false negative is the
    // status quo this replaces.
    const handleLoad = useCallback(() => {
        if (loadTimer.current) {
            clearTimeout(loadTimer.current);
            loadTimer.current = null;
        }
        setLoaded(true);
    }, []);

    const startPlaying = useCallback(() => {
        setLoaded(false);
        setFailed(false);
        setPlaying(true);
        if (loadTimer.current) clearTimeout(loadTimer.current);
        loadTimer.current = setTimeout(() => {
            loadTimer.current = null;
            setFailed(true);
        }, EMBED_LOAD_TIMEOUT_MS);
    }, []);

    if (!link?.embedUrl) return null;

    const openOnPlatform = () => openOriginal(link);

    // Blocked. The player never arrived, so offer the destination instead of a
    // black rectangle. Retry is offered because the common cause is transient
    // (a VPN coming up, a captive portal, a flaky mobile connection).
    if (playing && failed) {
        return (
            <div
                className={`relative w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] ${className}`}
                style={{ aspectRatio: "16 / 9" }}
            >
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                    <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                        style={{ backgroundColor: link.color || "#334155" }}
                    >
                        {label}
                    </span>
                    <p className="text-xs text-[var(--text-muted)] max-w-xs">
                        The {label} player could not be reached. Your network may be blocking it.
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={openOnPlatform}
                            className="rounded-lg bg-[var(--brand-600)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                        >
                            Open on {label}
                        </button>
                        <button
                            onClick={startPlaying}
                            className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--surface-raised)]"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (playing) {
        return (
            <div className={className}>
                <div
                    className="relative w-full overflow-hidden rounded-xl bg-black"
                    style={{ aspectRatio: "16 / 9" }}
                >
                    <iframe
                        // The embed URL is built server-side from a fixed
                        // per-platform template plus a validated id, and the client
                        // re-checks the scheme here, so no author-supplied string
                        // reaches the src attribute.
                        src={safeEmbed(link.embedUrl)}
                        title={`${label} video`}
                        className="absolute inset-0 h-full w-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                        onLoad={handleLoad}
                    />
                </div>
                {/* Kept even on success. `load` firing proves the document was
                    retrieved, not that playback works, and a player that stalls
                    on a region block or an age gate gives the user nothing to
                    click. This is a one-line escape hatch rather than a
                    diagnostic. */}
                <button
                    onClick={openOnPlatform}
                    className="mt-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--brand-600)] hover:underline"
                >
                    Watch on {label}
                </button>
            </div>
        );
    }

    // A branded frame is used when there is no thumbnail, so a recognised link
    // is never mistaken for a broken image.
    if (!link.thumbnail || thumbBroken) {
        return (
            <button
                onClick={startPlaying}
                className={`group relative block w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] ${className}`}
                style={{ aspectRatio: "16 / 9" }}
                aria-label={`Play ${label} video`}
            >
                <span
                    className="absolute inset-0 opacity-90 transition-opacity group-hover:opacity-100"
                    style={{ background: `linear-gradient(135deg, ${link.color || "#334155"}, #0f172a)` }}
                />
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
                    <PlayGlyph />
                    <span className="text-xs font-bold tracking-wide drop-shadow">{label.toUpperCase()}</span>
                </span>
            </button>
        );
    }

    return (
        <button
            onClick={startPlaying}
            className={`group relative block w-full overflow-hidden rounded-xl bg-black ${className}`}
            style={{ aspectRatio: "16 / 9" }}
            aria-label={`Play ${label} video`}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={link.thumbnail}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-opacity group-hover:opacity-80"
                onError={() => {
                    // A dead thumbnail must not leave a broken image. This used
                    // to only hide the <img>, which left the play button sitting
                    // on a bare black rectangle — indistinguishable from a
                    // loading video. Switching to the branded frame instead makes
                    // a blocked thumbnail host (i.ytimg.com is unreachable from
                    // some networks) look deliberate rather than broken.
                    setThumbBroken(true);
                }}
            />
            <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 backdrop-blur transition-transform group-hover:scale-110">
                    <PlayGlyph />
                </span>
            </span>
            <span
                className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ backgroundColor: link.color || "#334155" }}
            >
                {label}
            </span>
        </button>
    );
}

function PlayGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 translate-x-0.5 text-white" aria-hidden="true">
            <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.1-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
        </svg>
    );
}

// Defence in depth. The server only ever emits https embeds it built itself,
// but the value still round-trips through the database and out to an iframe
// src, so it is re-validated here rather than trusted because "it came from us".
function safeEmbed(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== "https:") return "about:blank";
        return u.toString();
    } catch {
        return "about:blank";
    }
}

// Opens the original page in a new tab, for people whose browser or network
// blocks the embed.
function openOriginal(link) {
    if (!link?.url) return;
    openAdLink(link.url);
}
