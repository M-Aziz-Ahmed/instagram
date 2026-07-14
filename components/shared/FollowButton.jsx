"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";

export default function FollowButton({ username, size = "sm", onToggle }) {
    const { user, reloadUser } = useUser();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);

    if (!user || user.username === username) return null;

    const isFollowing = user.following?.includes(username) || false;

    const toggle = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(username)}/follow`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.following) {
                    reloadUser({ ...user, following: [...(user.following || []), username] });
                    showToast(`Following @${username}`, "success");
                } else {
                    reloadUser({ ...user, following: (user.following || []).filter((u) => u !== username) });
                    showToast(`Unfollowed @${username}`, "info");
                }
                onToggle?.({ following: data.following, followersCount: data.followersCount, followingCount: data.followingCount });
            }
        } catch {
            showToast("Something went wrong", "error");
        }
        setLoading(false);
    };

    if (size === "xs") {
        return (
            <button
                onClick={toggle}
                disabled={loading}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors min-h-[32px] ${
                    isFollowing
                        ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500"
                        : "bg-blue-500 text-white hover:bg-blue-600"
                } disabled:opacity-50`}
            >
                {isFollowing ? "Following" : "Follow"}
            </button>
        );
    }

    return (
        <button
            onClick={toggle}
            disabled={loading}
            className={`text-sm font-semibold px-5 py-2 rounded-full transition-colors min-h-[40px] ${
                isFollowing
                    ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500"
                    : "bg-blue-500 text-white hover:bg-blue-600"
            } disabled:opacity-50`}
        >
            {isFollowing ? "Following" : "Follow"}
        </button>
    );
}
