"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import PostCard from "@/components/Feed/PostCard";
import Link from "next/link";

function Avatar({ username, color, size = "lg" }) {
    const dim = size === "lg"
        ? "w-20 h-20 text-3xl"
        : "w-12 h-12 text-xl";
    return (
        <div
            className={`${dim} rounded-full flex items-center justify-center text-white font-black select-none shrink-0`}
            style={{ backgroundColor: color || "#94a3b8" }}
        >
            {username?.[0]?.toUpperCase() ?? "?"}
        </div>
    );
}

// Derive a stable color from a username string for users we haven't seen post yet
function colorFromUsername(name = "") {
    const palette = ["#f97316","#ec4899","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#3b82f6"];
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
    return palette[Math.abs(hash) % palette.length];
}

export default function ProfileClient({ username }) {
    const { user } = useUser();
    const [data, setData]       = useState(null);   // { posts, totalLikes, postCount }
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null); // post _id shown in modal

    const isOwn = user?.username === username;

    const fetchProfile = useCallback(async () => {
        try {
            const res = await fetch(`/api/posts/user/${encodeURIComponent(username)}`);
            if (res.ok) setData(await res.json());
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [username]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    // Pick avatar color: own user's saved color (avatarColor), or derive from username
    const avatarColor = isOwn
        ? (user?.avatarColor ?? user?.color)
        : (data?.posts?.[0]?.color ?? colorFromUsername(username));

    const expandedPost = expanded
        ? data?.posts?.find((p) => p._id === expanded)
        : null;

    return (
        <div className="min-h-dvh bg-white">
            {/* ── Nav ────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
                <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
                    <Link href="/" aria-label="Back to feed"
                        className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </Link>
                    <span className="font-bold text-base text-gray-900 truncate">{username}</span>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 py-6">
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* ── Profile header ─────────────────────────── */}
                        <div className="flex items-start gap-6 mb-6">
                            <Avatar username={username} color={avatarColor} size="lg" />

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="font-black text-xl text-gray-900">@{username}</h1>
                                    {isOwn && (
                                        <Link href="/"
                                            className="text-xs border border-gray-300 rounded-full px-3 py-1 hover:bg-gray-50 transition-colors text-gray-600">
                                            Edit profile
                                        </Link>
                                    )}
                                </div>

                                {/* Bio */}
                                {(isOwn ? user?.bio : data?.posts?.[0]?.bio) && (
                                    <p className="text-sm text-gray-700 mt-2 leading-relaxed">
                                        {isOwn ? user?.bio : ""}
                                    </p>
                                )}
                                {isOwn && user?.bio && (
                                    <p className="text-sm text-gray-700 mt-2 leading-relaxed">{user.bio}</p>
                                )}

                                {/* Stats */}
                                <div className="flex gap-6 mt-3">
                                    <div>
                                        <span className="font-black text-gray-900">{data?.postCount ?? 0}</span>
                                        <span className="text-sm text-gray-500 ml-1">posts</span>
                                    </div>
                                    <div>
                                        <span className="font-black text-gray-900">{data?.totalLikes ?? 0}</span>
                                        <span className="text-sm text-gray-500 ml-1">likes</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Posts ──────────────────────────────────── */}
                        {!data?.posts?.length ? (
                            <div className="flex flex-col items-center py-20 text-gray-400 select-none">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                    strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3 opacity-40">
                                    <path strokeLinecap="round" strokeLinejoin="round"
                                        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                                </svg>
                                <p className="text-sm">No posts yet.</p>
                            </div>
                        ) : (
                            <>
                                {/* Image grid — posts that have images */}
                                {data.posts.some((p) => p.imageUrl) && (
                                    <div className="mb-6">
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Photos</p>
                                        <div className="grid grid-cols-3 gap-1">
                                            {data.posts
                                                .filter((p) => p.imageUrl)
                                                .map((p) => (
                                                    <button
                                                        key={p._id}
                                                        onClick={() => setExpanded(p._id)}
                                                        className="aspect-square overflow-hidden rounded-lg bg-gray-100 hover:opacity-90 transition-opacity"
                                                    >
                                                        <img
                                                            src={p.imageUrl}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                            loading="lazy"
                                                        />
                                                    </button>
                                                ))}
                                        </div>
                                    </div>
                                )}

                                {/* All posts list */}
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">All Posts</p>
                                    <div className="border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100">
                                        {data.posts.map((p) => (
                                            <PostCard
                                                key={p._id}
                                                post={p}
                                                onDeleted={fetchProfile}
                                                onHashtag={(tag) => {
                                                    window.location.href = `/?tag=${tag}`;
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}
            </main>

            {/* ── Image modal ─────────────────────────────────────────── */}
            {expandedPost && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setExpanded(null)}
                >
                    <div
                        className="bg-white rounded-2xl overflow-hidden max-w-lg w-full max-h-[90dvh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <span className="font-bold text-sm">{expandedPost.sender}</span>
                            <button
                                onClick={() => setExpanded(null)}
                                className="text-gray-400 hover:text-gray-700 p-1"
                                aria-label="Close"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                    strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <PostCard
                            post={expandedPost}
                            onDeleted={() => { setExpanded(null); fetchProfile(); }}
                            onHashtag={(tag) => {
                                setExpanded(null);
                                window.location.href = `/?tag=${tag}`;
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
