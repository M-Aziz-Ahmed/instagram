"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";

export default function MediaBookmarkButton({ mediaType, mediaId, title, coverUrl, status, totalChapters, className = "" }) {
    const { user } = useUser();
    const { showToast } = useToast();
    const [bookmarked, setBookmarked] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!user?.username || !mediaId) return;
        fetch(`/api/media-bookmarks/check?ids=${mediaId}&mediaType=${mediaType}`, { credentials: "include" })
            .then(r => r.json())
            .then(d => setBookmarked(!!d.bookmarked?.[mediaId]))
            .catch(() => {});
    }, [user?.username, mediaId, mediaType]);

    const toggle = useCallback(async () => {
        if (!user?.username) {
            showToast("Sign in to bookmark", "error");
            return;
        }
        if (loading) return;
        setLoading(true);
        try {
            if (bookmarked) {
                const res = await fetch(`/api/media-bookmarks/${mediaType}/${mediaId}`, {
                    method: "DELETE",
                    credentials: "include",
                });
                if (res.ok) {
                    setBookmarked(false);
                    showToast("Bookmark removed", "success");
                }
            } else {
                const res = await fetch("/api/media-bookmarks", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mediaType, mediaId, title, coverUrl, status, totalChapters }),
                });
                if (res.ok) {
                    setBookmarked(true);
                    showToast("Bookmarked!", "success");
                }
            }
        } catch {
            showToast("Failed to update bookmark", "error");
        }
        setLoading(false);
    }, [user, bookmarked, loading, mediaType, mediaId, title, coverUrl, status, totalChapters, showToast]);

    return (
        <button
            onClick={toggle}
            disabled={loading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                bookmarked
                    ? "bg-yellow-500/15 text-yellow-500 border border-yellow-500/30 hover:bg-yellow-500/25"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
            } ${className}`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill={bookmarked ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            </svg>
            {bookmarked ? "Saved" : "Save"}
        </button>
    );
}
