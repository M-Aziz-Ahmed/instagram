"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";

function timeAgo(date) {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 60)   return `${Math.floor(diff)}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return new Date(date).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function PostCard({ post, onDeleted, onLiked }) {
    const { user } = useUser();
    const [liking, setLiking]   = useState(false);
    const [deleting, setDeleting] = useState(false);

    const liked    = user ? post.likes.includes(user.username) : false;
    const isOwn    = user?.username === post.sender;

    const handleLike = async () => {
        if (!user || liking) return;
        setLiking(true);
        try {
            const res = await fetch(`/api/posts/${post._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            });
            if (res.ok) onLiked?.();
        } finally {
            setLiking(false);
        }
    };

    const handleDelete = async () => {
        if (!user || deleting) return;
        if (!confirm("Delete this post?")) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/posts/${post._id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            });
            if (res.ok) onDeleted?.();
        } finally {
            setDeleting(false);
        }
    };

    return (
        <article className="border-b border-gray-200 px-4 py-4 hover:bg-gray-50 transition-colors">
            <div className="flex gap-3">
                {/* Avatar */}
                <div
                    className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm select-none"
                    style={{ backgroundColor: post.color }}
                >
                    {post.sender?.[0]?.toUpperCase() ?? "?"}
                </div>

                <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-gray-900">{post.sender}</span>
                        <span className="text-gray-400 text-xs">·</span>
                        <span className="text-gray-400 text-xs">{timeAgo(post.timeStamp)}</span>

                        {/* Delete — only own posts */}
                        {isOwn && (
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                aria-label="Delete post"
                                className="ml-auto text-gray-400 hover:text-red-500 transition-colors p-1 -mr-1"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                    strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round"
                                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* Text */}
                    {post.text && (
                        <p className="text-sm text-gray-900 mt-1 leading-relaxed whitespace-pre-wrap">
                            {post.text}
                        </p>
                    )}

                    {/* Image */}
                    {post.imageUrl && (
                        <div className="mt-3 rounded-2xl overflow-hidden border border-gray-200">
                            <img
                                src={post.imageUrl}
                                alt="Post image"
                                className="w-full max-h-125 object-cover"
                                loading="lazy"
                            />
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-6 mt-3">
                        {/* Like */}
                        <button
                            onClick={handleLike}
                            disabled={liking || !user}
                            aria-label={liked ? "Unlike" : "Like"}
                            className={`flex items-center gap-1.5 text-sm transition-colors group disabled:cursor-not-allowed ${
                                liked ? "text-red-500" : "text-gray-500 hover:text-red-500"
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg"
                                fill={liked ? "currentColor" : "none"}
                                viewBox="0 0 24 24"
                                strokeWidth={1.8} stroke="currentColor"
                                className="w-5 h-5 transition-transform group-hover:scale-110">
                                <path strokeLinecap="round" strokeLinejoin="round"
                                    d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                            </svg>
                            {post.likes.length > 0 && (
                                <span>{post.likes.length}</span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </article>
    );
}
