"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";

function timeAgo(date) {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 60)    return `${Math.floor(diff)}s`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return new Date(date).toLocaleDateString([], { month: "short", day: "numeric" });
}

function HeartIcon({ filled }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill={filled ? "currentColor" : "none"}
            viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
    );
}

function CommentIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
            strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
        </svg>
    );
}

export default function PostCard({ post: initialPost, onDeleted, onRefresh }) {
    const { user } = useUser();
    const [post, setPost]           = useState(initialPost);
    const [liking, setLiking]       = useState(false);
    const [deleting, setDeleting]   = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText]   = useState("");
    const [submitting, setSubmitting]     = useState(false);

    const liked = user ? post.likes.includes(user.username) : false;
    const isOwn = user?.username === post.sender;

    // ── Like ──────────────────────────────────────────────────────────────────
    const handleLike = async () => {
        if (!user || liking) return;
        setLiking(true);
        try {
            const res = await fetch(`/api/posts/${post._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            });
            if (res.ok) setPost(await res.json());
        } finally {
            setLiking(false);
        }
    };

    // ── Comment ───────────────────────────────────────────────────────────────
    const handleComment = async (e) => {
        e.preventDefault();
        if (!user || !commentText.trim() || submitting) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/posts/${post._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action:   "comment",
                    username: user.username,
                    color:    user.color,
                    text:     commentText.trim(),
                }),
            });
            if (res.ok) {
                setPost(await res.json());
                setCommentText("");
                setShowComments(true);
            }
        } finally {
            setSubmitting(false);
        }
    };

    // ── Delete ────────────────────────────────────────────────────────────────
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
        <article className="border-b border-gray-200 px-4 py-4">
            <div className="flex gap-3">
                {/* Avatar */}
                <div
                    className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm select-none mt-0.5"
                    style={{ backgroundColor: post.color }}
                >
                    {post.sender?.[0]?.toUpperCase() ?? "?"}
                </div>

                <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-900">{post.sender}</span>
                        <span className="text-gray-400 text-xs">·</span>
                        <span className="text-gray-400 text-xs">{timeAgo(post.timeStamp)}</span>
                        {isOwn && (
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                aria-label="Delete post"
                                className="ml-auto text-gray-300 hover:text-red-500 transition-colors p-1 -mr-1"
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

                    {/* Image — full natural height, no cropping */}
                    {post.imageUrl && (
                        <div className="mt-3 rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
                            <img
                                src={post.imageUrl}
                                alt="Post image"
                                className="w-full h-auto block"
                                loading="lazy"
                            />
                        </div>
                    )}

                    {/* Action bar */}
                    <div className="flex items-center gap-5 mt-3">
                        {/* Like */}
                        <button
                            onClick={handleLike}
                            disabled={liking || !user}
                            aria-label={liked ? "Unlike" : "Like"}
                            className={`flex items-center gap-1.5 text-sm transition-colors group disabled:cursor-not-allowed ${
                                liked ? "text-red-500" : "text-gray-400 hover:text-red-500"
                            }`}
                        >
                            <HeartIcon filled={liked} />
                            {post.likes.length > 0 && <span>{post.likes.length}</span>}
                        </button>

                        {/* Comment toggle */}
                        <button
                            onClick={() => setShowComments((v) => !v)}
                            aria-label="Comments"
                            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-500 transition-colors"
                        >
                            <CommentIcon />
                            {post.comments?.length > 0 && <span>{post.comments.length}</span>}
                        </button>
                    </div>

                    {/* Comments section */}
                    {showComments && (
                        <div className="mt-3 flex flex-col gap-3">
                            {/* Existing comments */}
                            {post.comments?.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    {post.comments.map((c, i) => (
                                        <div key={i} className="flex gap-2 items-start">
                                            <div
                                                className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold select-none mt-0.5"
                                                style={{ backgroundColor: c.color }}
                                            >
                                                {c.sender?.[0]?.toUpperCase()}
                                            </div>
                                            <div className="flex-1 bg-gray-50 rounded-2xl px-3 py-2">
                                                <span className="font-semibold text-xs text-gray-900 mr-1.5">{c.sender}</span>
                                                <span className="text-xs text-gray-700">{c.text}</span>
                                                <span className="text-gray-300 text-xs ml-1.5">· {timeAgo(c.timeStamp)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add comment */}
                            {user && (
                                <form onSubmit={handleComment} className="flex gap-2 items-center">
                                    <div
                                        className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold select-none"
                                        style={{ backgroundColor: user.color }}
                                    >
                                        {user.username?.[0]?.toUpperCase()}
                                    </div>
                                    <div className="flex-1 flex items-center border border-gray-200 rounded-full px-3 py-1.5 focus-within:border-gray-400 transition-colors bg-gray-50">
                                        <input
                                            type="text"
                                            value={commentText}
                                            onChange={(e) => setCommentText(e.target.value)}
                                            placeholder="Add a comment…"
                                            maxLength={300}
                                            className="flex-1 bg-transparent text-xs text-gray-900 placeholder-gray-400 outline-none"
                                        />
                                        {commentText.trim() && (
                                            <button
                                                type="submit"
                                                disabled={submitting}
                                                className="ml-2 text-xs font-bold text-blue-500 hover:text-blue-600 disabled:opacity-50"
                                            >
                                                {submitting ? "…" : "Post"}
                                            </button>
                                        )}
                                    </div>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </article>
    );
}
