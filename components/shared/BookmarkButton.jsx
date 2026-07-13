"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";

export default function BookmarkButton({ postId,初始 }) {
    const { user, reloadUser } = useUser();
    const { showToast } = useToast();
    const [saving, setSaving] = useState(false);
    const isBookmarked = user?.bookmarks?.includes(postId) || false;

    const toggle = async () => {
        if (!user || saving) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/posts/${postId}/bookmark`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.bookmarked) {
                    reloadUser({ ...user, bookmarks: [...(user.bookmarks || []), postId] });
                    showToast("Post saved", "success");
                } else {
                    reloadUser({ ...user, bookmarks: (user.bookmarks || []).filter((id) => id !== postId) });
                    showToast("Bookmark removed", "info");
                }
            }
        } catch {
            showToast("Failed to save bookmark", "error");
        }
        setSaving(false);
    };

    if (!user) return null;

    return (
        <button
            onClick={toggle}
            disabled={saving}
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
            className={`p-2.5 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${
                isBookmarked
                    ? "text-yellow-500"
                    : "text-gray-400 dark:text-gray-500 hover:text-yellow-500"
            }`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill={isBookmarked ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            </svg>
        </button>
    );
}
