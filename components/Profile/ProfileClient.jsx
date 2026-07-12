"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import PostCard from "@/components/Feed/PostCard";
import UserBadges from "@/components/shared/UserBadges";
import Link from "next/link";

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

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
                className={`${dim} rounded-full object-cover shrink-0 border-2 border-gray-100`} />
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
    const { user, reloadUser } = useUser();
    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(true);
    const [expanded, setExpanded] = useState(null);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef(null);

    const isOwn = user?.username === username;

    const fetchProfile = useCallback(async () => {
        try {
            const res = await fetch(`/api/posts/user/${encodeURIComponent(username)}`);
            if (res.ok) setData(await res.json());
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, [username]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    // Use the public profile data for other users, own session data for self
    const profile = isOwn
        ? { username, bio: user?.bio, avatarColor: user?.avatarColor ?? user?.color, avatarUrl: user?.avatarUrl,
            isVerified: user?.isVerified, roles: user?.roles ?? [] }
        : (data?.profile ?? {
            username, bio: "", avatarColor: colorFromUsername(username), avatarUrl: "",
            isVerified: false, roles: [],
          });

    // ── Profile pic upload ────────────────────────────────────────────────────
    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !isOwn) return;
        if (file.size > 10 * 1024 * 1024) { alert("Image must be under 10 MB"); return; }

        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("upload_preset", UPLOAD_PRESET);
            fd.append("folder", "anon-avatars");
            const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: fd });
            const { secure_url } = await res.json();

            await fetch("/api/auth/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bio: user?.bio, avatarColor: user?.avatarColor, avatarUrl: secure_url }),
            });
            await reloadUser();
        } catch (err) { console.error(err); alert("Upload failed."); }
        finally { setUploading(false); }
    };

    const expandedPost = expanded ? data?.posts?.find((p) => p._id === expanded) : null;

    return (
        <div className="min-h-dvh bg-white">
            {/* Nav */}
            <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
                <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
                    <Link href="/" className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
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
                        {/* Profile header */}
                        <div className="flex items-start gap-5 mb-6">
                            {/* Avatar — clickable to upload if own */}
                            <div className="relative shrink-0">
                                <Avatar username={username} avatarUrl={profile.avatarUrl} color={profile.avatarColor} size="lg" />
                                {isOwn && (
                                    <>
                                        <button
                                            onClick={() => fileRef.current?.click()}
                                            disabled={uploading}
                                            title="Change photo"
                                            className="absolute inset-0 rounded-full bg-black/30 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity disabled:cursor-wait"
                                        >
                                            {uploading
                                                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-6 h-6">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                                                  </svg>}
                                        </button>
                                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                                    </>
                                )}
                            </div>

                            <div className="flex-1 min-w-0 pt-1">
                                {/* Username + badges + edit */}
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <h1 className="font-black text-xl text-gray-900">@{username}</h1>
                                    <UserBadges isVerified={profile.isVerified} roles={profile.roles} />
                                    {isOwn && (
                                        <Link href="/" className="ml-1 text-xs border border-gray-300 rounded-full px-3 py-1 hover:bg-gray-50 transition-colors text-gray-600">
                                            Edit profile
                                        </Link>
                                    )}
                                    {user?.isAdmin && !isOwn && (
                                        <Link href="/admin" className="text-xs text-purple-600 border border-purple-200 rounded-full px-3 py-1 hover:bg-purple-50 transition-colors">
                                            Manage in admin
                                        </Link>
                                    )}
                                </div>

                                {/* Bio — single render */}
                                {profile.bio && (
                                    <p className="text-sm text-gray-700 leading-relaxed mb-3">{profile.bio}</p>
                                )}

                                {/* Stats */}
                                <div className="flex gap-6">
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

                        {/* Posts */}
                        {!data?.posts?.length ? (
                            <div className="flex flex-col items-center py-20 text-gray-400 select-none">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3 opacity-40">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                                </svg>
                                <p className="text-sm">No posts yet.</p>
                            </div>
                        ) : (
                            <>
                                {data.posts.some((p) => p.imageUrl) && (
                                    <div className="mb-6">
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Photos</p>
                                        <div className="grid grid-cols-3 gap-1">
                                            {data.posts.filter((p) => p.imageUrl).map((p) => (
                                                <button key={p._id} onClick={() => setExpanded(p._id)}
                                                    className="aspect-square overflow-hidden rounded-lg bg-gray-100 hover:opacity-90 transition-opacity">
                                                    <img src={p.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">All Posts</p>
                                    <div className="border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100">
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

            {/* Image modal */}
            {expandedPost && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setExpanded(null)}>
                    <div className="bg-white rounded-2xl overflow-hidden max-w-lg w-full max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <span className="font-bold text-sm">{expandedPost.sender}</span>
                            <button onClick={() => setExpanded(null)} className="text-gray-400 hover:text-gray-700 p-1">
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
        </div>
    );
}
