"use client";

import Image from "next/image";
import Link from "next/link";

export default function MediaCard({ item, mediaType, href, showRating = true, showType = false }) {
    // TVMaze API returns full URLs in posterPath/backdropPath
    const imageUrl = item.posterPath || item.backdropPath || "";
    const title = item.title || item.name || "Unknown";
    const rating = item.vote_average ? (item.vote_average / 2).toFixed(1) : null;
    const year = (item.releaseDate || item.firstAirDate || item.release_date || item.first_air_date || "")?.slice(0, 4);

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

    return (
        <Link
            href={href || `/${route}?id=${item.id}`}
            className="group block"
        >
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                {imageUrl ? (
                    <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-500/20 to-purple-500/20 dark:from-pink-500/10 dark:to-purple-500/10">
                        <span className="text-4xl">{mediaType === "anime" ? "🎬" : mediaType === "movie" ? "🎥" : mediaType === "kdrama" ? "🇰🇷" : mediaType === "cdrama" ? "🇨🇳" : mediaType === "cartoon" ? "🎨" : "📺"}</span>
                    </div>
                )}
                {(item.vote_average && showRating) && (
                    <div className="absolute top-2 right-2 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        {(item.vote_average / 2).toFixed(1)}
                    </div>
                )}
                {item.media_type && showType && (
                    <div className="absolute top-2 left-2 bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                        {item.media_type}
                    </div>
                )}
            </div>
            <div className="mt-2 space-y-1">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">{title}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    {item.releaseDate && <span>{item.releaseDate.slice(0, 4)}</span>}
                    {item.firstAirDate && <span>{item.firstAirDate.slice(0, 4)}</span>}
                    {item.release_date && <span>{item.release_date.slice(0, 4)}</span>}
                    {item.first_air_date && <span>{item.first_air_date.slice(0, 4)}</span>}
                    {item.vote_average && <span className="flex items-center gap-0.5"><svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" /></svg>{(item.vote_average / 2).toFixed(1)}</span>}
                </div>
            </div>
        </Link>
    );
}