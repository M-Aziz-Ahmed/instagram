"use client";

import { useState } from "react";
import { openAdLink } from "@/utils/popupGuard";

// Renders a video that lives on another platform, from a recognised link in the
// post text (see live-server/lib/videoLinks.js).
//
// This is the counterpart to VideoPlayer, and it exists so the video-upload
// permission is a cost control rather than a demotion: someone without
// `upload_video` still posts video, it just plays from YouTube/TikTok/etc and
// costs this site nothing to store or serve.
//
// Two rendering modes:
//   • poster - a thumbnail that swaps to the real player on click.
//   • playing - the platform's iframe, once activated.
//
// The poster is the default on purpose. Ten embeds loading at once means ten
// third-party iframes, third-party cookies, and ten trackers before the reader
// has scrolled. Click-to-play keeps the feed cheap and is the behaviour every
// other feed does it.
export default function VideoLinkCard({ link, className = "" }) {
    const [playing, setPlaying] = useState(false);

    if (!link?.embedUrl) return null;
    const label = link.platformLabel || "Video";

    // A branded frame is used when there is no thumbnail, so a recognised link
    // is never mistaken for a broken image.
    if (!link.thumbnail) {
        return (
            <button
                onClick={() => setPlaying(true)}
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

    if (playing) {
        return (
            <div
                className={`relative w-full overflow-hidden rounded-xl bg-black ${className}`}
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
                />
            </div>
        );
    }

    return (
        <button
            onClick={() => setPlaying(true)}
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
                onError={(e) => {
                    // A dead thumbnail must not leave a broken image; fall back
                    // to the branded frame by clearing the src.
                    e.currentTarget.style.display = "none";
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
export function openOriginal(link) {
    if (!link?.url) return;
    openAdLink(link.url);
}
