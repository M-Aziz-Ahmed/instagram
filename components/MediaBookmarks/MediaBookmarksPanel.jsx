"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import ImportDataButton from "@/components/common/ImportDataButton";

function HistoryBadge({ mediaType, bookmark }) {
    if (mediaType === "manga") {
        if (!bookmark.lastReadChapter) return null;
        return (
            <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
                Last: {bookmark.lastReadChapter}
                {bookmark.readChapters?.length > 0 && <span className="text-gray-400 dark:text-gray-500"> · {bookmark.readChapters.length} read</span>}
            </div>
        );
    }
    if (mediaType === "anime") {
        if (bookmark.lastWatchedEpisode == null) return null;
        return (
            <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
                Up to Ep. {bookmark.lastWatchedEpisode}
            </div>
        );
    }
    return null;
}

function BookmarkCard({ bookmark, onRemove }) {
    const [removing, setRemoving] = useState(false);
    const isAnime = bookmark.mediaType === "anime";
    const linkPath = isAnime ? "/anime" : "/manga";
    const chapterParam = !isAnime && bookmark.lastReadChapterId ? `&ch=${bookmark.lastReadChapterId}` : "";

    const handleRemove = async () => {
        if (removing) return;
        setRemoving(true);
        try {
            const res = await fetch(`/api/media-bookmarks/${bookmark.mediaType}/${bookmark.mediaId}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (res.ok) onRemove?.(bookmark);
        } catch { /* keep the row, the user can retry */ }
        setRemoving(false);
    };

    const handleDismiss = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await fetch(`/api/media-bookmarks/${bookmark.mediaType}/${bookmark.mediaId}/dismiss`, {
                method: "PATCH",
                credentials: "include",
            });
            onRemove?.(bookmark);
        } catch { /* non-critical */ }
    };

    return (
        <Link
            href={`${linkPath}?id=${bookmark.mediaId}${chapterParam}`}
            className="group relative flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
        >
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0 relative">
                {bookmark.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bookmark.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg">{isAnime ? "🎬" : "📖"}</div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{bookmark.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{bookmark.mediaType}</p>
                <div className="mt-1 flex items-center gap-1.5">
                    <HistoryBadge mediaType={bookmark.mediaType} bookmark={bookmark} />
                    {bookmark.newReleaseAvailable && (
                        <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-full px-2 py-0.5">
                            New
                        </span>
                    )}
                </div>
            </div>
            {bookmark.newReleaseAvailable && (
                <button
                    onClick={handleDismiss}
                    aria-label="Dismiss new release notice"
                    className="absolute top-1.5 left-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-1"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                </button>
            )}
            <button
                onClick={handleRemove}
                disabled={removing}
                className="absolute top-2 right-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 p-1"
                title="Remove bookmark"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
            </button>
        </Link>
    );
}

/**
 * Saved anime and manga, with no page chrome.
 *
 * `SavedClient` owns the auth gate, header and tab bar; this panel owns the
 * media filter, the release check and the list.
 */
export default function MediaBookmarksPanel() {
    const { user } = useUser();
    const username = user?.username;

    const [bookmarks, setBookmarks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        if (!username) return;
        let cancelled = false;

        (async () => {
            try {
                const res = await fetch("/api/media-bookmarks", { credentials: "include" });
                const data = await res.json();
                if (!cancelled) setBookmarks(Array.isArray(data) ? data : []);
            } catch {
                if (!cancelled) setBookmarks([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [username]);

    const checkReleases = async () => {
        if (checking || !username) return;
        setChecking(true);
        try {
            const res = await fetch("/api/media-bookmarks/check-releases", {
                method: "POST",
                credentials: "include",
            });
            const data = await res.json();
            if (data.bookmarks) setBookmarks(data.bookmarks);
        } catch { /* non-critical */ }
        setChecking(false);
    };

    const handleRemove = (removed) => {
        setBookmarks((prev) =>
            prev.filter((b) => !(b.mediaType === removed.mediaType && b.mediaId === removed.mediaId))
        );
    };

    const filtered = filter === "all" ? bookmarks : bookmarks.filter((b) => b.mediaType === filter);
    const newReleases = bookmarks.filter((b) => b.newReleaseAvailable).length;

    return (
        <div>
            <div className="flex items-center justify-end gap-2 mb-4">
                <ImportDataButton
                    size="sm"
                    onSuccess={() => { window.location.reload(); }}
                />
                <button
                    onClick={checkReleases}
                    disabled={checking}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                    {checking ? (
                        <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                        </svg>
                    )}
                    Check updates
                </button>
            </div>

            {newReleases > 0 && (
                <div className="mb-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <p className="text-xs font-medium text-green-700 dark:text-green-400">
                        {newReleases} bookmark{newReleases !== 1 ? "s" : ""} with new releases available!
                    </p>
                </div>
            )}

            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {[
                    { id: "all", label: "All" },
                    { id: "manga", label: "Manga" },
                    { id: "anime", label: "Anime" },
                ].map((f) => (
                    <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                            filter === f.id
                                ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                    <p className="text-4xl">{filter === "anime" ? "🎬" : filter === "manga" ? "📖" : "📚"}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {filter === "all" ? "No bookmarks yet" : `No ${filter} bookmarks yet`}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                        Browse <Link href="/anime" className="text-blue-500 hover:underline">anime</Link> or{" "}
                        <Link href="/manga" className="text-blue-500 hover:underline">manga</Link> and save them here
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((b) => (
                        <BookmarkCard key={`${b.mediaType}-${b.mediaId}`} bookmark={b} onRemove={handleRemove} />
                    ))}
                </div>
            )}
        </div>
    );
}
