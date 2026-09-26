"use client";

import Image from "next/image";
import Link from "next/link";

// Placeholder art per category. A grey box reads as a broken image; a coloured
// tile with the category glyph reads as intentional.
const FALLBACK_ART = {
    movie: { from: "from-violet-500/25", to: "to-indigo-600/25", glyph: "🎥" },
    anime: { from: "from-pink-500/25", to: "to-fuchsia-600/25", glyph: "🍥" },
    kdrama: { from: "from-rose-500/25", to: "to-pink-600/25", glyph: "🎎" },
    cdrama: { from: "from-amber-500/25", to: "to-red-600/25", glyph: "🏮" },
    cartoon: { from: "from-teal-500/25", to: "to-cyan-600/25", glyph: "🧸" },
    season: { from: "from-blue-500/25", to: "to-sky-600/25", glyph: "📺" },
    channel: { from: "from-sky-500/25", to: "to-blue-600/25", glyph: "📡" },
    manga: { from: "from-cyan-500/25", to: "to-teal-600/25", glyph: "📖" },
};
const FALLBACK_DEFAULT = { from: "from-gray-400/25", to: "to-gray-600/25", glyph: "🎬" };

export default function MediaCard({ item, mediaType, href, showRating = true, showType = false, onClick }) {
    // TVMaze API returns full URLs in posterPath/backdropPath
    const imageUrl = item.posterPath || item.backdropPath || "";
    const title = item.title || item.name || "Unknown";
    const year = (
        item.releaseDate ||
        item.firstAirDate ||
        item.release_date ||
        item.first_air_date ||
        ""
    )?.slice(0, 4);
    const rating = item.vote_average ? (item.vote_average / 2).toFixed(1) : null;

    // Map mediaType to correct route (plural routes)
    const routeMap = {
        movie: "movies",
        kdrama: "kdramas",
        season: "seasons",
        cdrama: "cdramas",
        cartoon: "cartoons",
        anime: "anime",
        manga: "manga",
    };
    const route = routeMap[mediaType] || mediaType;

    const hasImage = imageUrl && imageUrl.startsWith("http");
    const art = FALLBACK_ART[mediaType] || FALLBACK_DEFAULT;

    const content = (
        <>
            <div className="poster-tile">
                {hasImage ? (
                    <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 15vw"
                    />
                ) : (
                    <div
                        className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${art.from} ${art.to}`}
                    >
                        <span className="text-3xl sm:text-4xl">{art.glyph}</span>
                    </div>
                )}

                {/* Badges sit above the hover scrim so they stay legible. */}
                <div className="absolute top-2 left-2 right-2 z-10 flex items-start justify-between gap-1.5">
                    {item.media_type && showType ? (
                        <span className="bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase backdrop-blur-sm">
                            {item.media_type}
                        </span>
                    ) : (
                        <span />
                    )}
                    {rating && showRating ? (
                        <span className="ml-auto flex items-center gap-0.5 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums backdrop-blur-sm">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5 text-amber-400">
                                <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" />
                            </svg>
                            {rating}
                        </span>
                    ) : null}
                </div>

                {/* Play affordance revealed on hover — signals "this is video". */}
                <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-white/95 text-gray-900 shadow-lg">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 ml-0.5">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </span>
                </div>
            </div>

            <div className="mt-2 space-y-0.5">
                <h3 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 group-hover:text-[var(--brand-600)] dark:group-hover:text-[var(--brand-300)] transition-colors">
                    {title}
                </h3>
                {(year || (rating && showRating)) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                        {year && <span className="tabular-nums">{year}</span>}
                    </div>
                )}
            </div>
        </>
    );

    if (onClick) {
        return (
            <button onClick={() => onClick(item)} className="group block text-left w-full focus-visible:outline-offset-4">
                {content}
            </button>
        );
    }

    return (
        <Link href={href || `/${route}?id=${item.id}`} className="group block">
            {content}
        </Link>
    );
}
