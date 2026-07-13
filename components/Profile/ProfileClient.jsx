"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import PostCard from "@/components/Feed/PostCard";
import UserBadges from "@/components/shared/UserBadges";
import EditProfileModal from "@/components/Auth/EditProfileModal";
import Sidebar from "@/components/Layout/Sidebar";
import Link from "next/link";

function colorFromUsername(name = "") {
    const palette = ["#f97316","#ec4899","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#3b82f6"];
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
    return palette[Math.abs(hash) % palette.length];
}

function Avatar({ username, avatarUrl, color, size = "lg" }) {
    const dim = size === "lg" ? "w-20 h-20 text-3xl" : "w-10 h-10 text-base";
    if (avatarUrl) {
        return (
            <img src={avatarUrl} alt={username}
                className={`${dim} rounded-full object-cover shrink-0 border-2 border-gray-100 dark:border-gray-800`} />
        );
    }
    return (
        <div className={`${dim} rounded-full flex items-center justify-center text-white font-black select-none shrink-0`}
            style={{ backgroundColor: color || "#94a3b8" }}>
            {username?.[0]?.toUpperCase() ?? "?"}
        </div>
    );
}

export default function ProfileClient({ username }) {
    const { user } = useUser();
    const [data, setData]                     = useState(null);
    const [loading, setLoading]               = useState(true);
    const [expanded, setExpanded]             = useState(null);
    const [editingProfile, setEditingProfile] = useState(false);
    const [sidebarOpen, setSidebarOpen]       = useState(false);

    const isOwn = user?.username === username;

    const fetchProfile = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/posts/user/${encodeURIComponent(username)}`);
            if (res.ok) setData(await res.json());
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, [username]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    const profile = isOwn
        ? {
            username,
            bio:         user?.bio ?? "",
            avatarColor: user?.avatarColor ?? user?.color,
            avatarUrl:   user?.avatarUrl ?? "",
            isVerified:  user?.isVerified ?? false,
            roles:       user?.roles ?? [],
          }
        : (data?.profile ?? {
            username,
            bio:         "",
            avatarColor: colorFromUsername(username),
            avatarUrl:   "",
            isVerified:  false,
            roles:       [],
          });

    const expandedPost = expanded ? data?.posts?.find((p) => p._id === expanded) : null;

    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950 lg:pl-72">
            {/* Nav */}
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-2xl mx-auto px-4 h-12 sm:h-14 flex items-center gap-3">
                    <Link href="/" className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </Link>
                    <span className="font-bold text-base text-gray-900 dark:text-gray-100 truncate flex-1">{username}</span>
                    <button
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Open menu"
                        className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                    </button>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 py-6">
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Profile header */}
                        <div className="flex items-start gap-5 mb-6">
                            <div className="relative shrink-0">
                                <Avatar username={username} avatarUrl={profile.avatarUrl} color={profile.avatarColor} size="lg" />
                                {isOwn && (
                                    <button
                                        onClick={() => setEditingProfile(true)}
                                        title="Change photo"
                                        aria-label="Change profile photo"
                                        className="absolute inset-0 rounded-full bg-black/30 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-6 h-6">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            <div className="flex-1 min-w-0 pt-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <h1 className="font-black text-xl text-gray-900 dark:text-gray-100">@{username}</h1>
                                    <UserBadges isVerified={profile.isVerified} roles={profile.roles} />
                                    {!isOwn && user && (
                                        <Link
                                            href={`/inbox?user=${encodeURIComponent(username)}`}
                                            className="ml-1 text-xs border border-gray-300 dark:border-gray-700 rounded-full px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400 min-h-[36px] inline-flex items-center"
                                        >
                                            Message
                                        </Link>
                                    )}
                                    {user?.isAdmin && !isOwn && (
                                        <Link href="/admin" className="text-xs text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 rounded-full px-3 py-1 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors">
                                            Manage in admin
                                        </Link>
                                    )}
                                </div>

                                {profile.bio && (
                                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">{profile.bio}</p>
                                )}

                                <div className="flex gap-6">
                                    <div>
                                        <span className="font-black text-gray-900 dark:text-gray-100">{data?.postCount ?? 0}</span>
                                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">posts</span>
                                    </div>
                                    <div>
                                        <span className="font-black text-gray-900 dark:text-gray-100">{data?.totalLikes ?? 0}</span>
                                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">likes</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Posts grid + list */}
                        {!data?.posts?.length ? (
                            <div className="flex flex-col items-center py-20 text-gray-400 dark:text-gray-600 select-none">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3 opacity-40">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                                </svg>
                                <p className="text-sm">No posts yet.</p>
                            </div>
                        ) : (
                            <>
                                {data.posts.some((p) => p.imageUrl) && (
                                    <div className="mb-6">
                                        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Photos</p>
                                        <div className="grid grid-cols-3 gap-1">
                                            {data.posts.filter((p) => p.imageUrl).map((p) => (
                                                <button key={p._id} onClick={() => setExpanded(p._id)}
                                                    className="aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 hover:opacity-90 transition-opacity">
                                                    <img src={p.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">All Posts</p>
                                    <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                                        {data.posts.map((p) => (
                                            <PostCard key={p._id} post={p} onDeleted={fetchProfile}
                                                onHashtag={(tag) => { window.location.href = `/?tag=${tag}`; }} />
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}
            </main>

            {/* Expanded image modal */}
            {expandedPost && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setExpanded(null)}>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden max-w-lg w-full max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                            <span className="font-bold text-sm">{expandedPost.sender}</span>
                            <button onClick={() => setExpanded(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <PostCard post={expandedPost} onDeleted={() => { setExpanded(null); fetchProfile(); }}
                            onHashtag={(tag) => { setExpanded(null); window.location.href = `/?tag=${tag}`; }} />
                    </div>
                </div>
            )}

            {editingProfile && (
                <EditProfileModal onClose={() => { setEditingProfile(false); fetchProfile(); }} />
            )}

            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </div>
    );
}
