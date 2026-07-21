"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import PostCard from "@/components/Feed/PostCard";
import UserBadges from "@/components/shared/UserBadges";
import { ProfileSkeleton } from "@/components/shared/Skeleton";
import FollowButton from "@/components/shared/FollowButton";
import ImageLightbox from "@/components/shared/ImageLightbox";
import EditProfileModal from "@/components/Auth/EditProfileModal";
import InviteManager from "@/components/shared/InviteManager";
import { useSidebar } from "@/context/SidebarContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Compose from "@/components/Feed/Compose";

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

function FollowListModal({ username, type, onClose }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/users/${encodeURIComponent(username)}/followers?type=${type}`);
                if (res.ok) {
                    const data = await res.json();
                    if (!cancelled) setUsers(data.users || []);
                }
            } catch { /* silent */ }
            if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [username, type]);

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden max-w-md w-full max-h-[80dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                        {type === "followers" ? "Followers" : "Following"}
                    </span>
                    <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                        </div>
                    ) : users.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">
                            {type === "followers" ? "No followers yet" : "Not following anyone"}
                        </p>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {users.map((u) => (
                                <Link
                                    key={u._id || u.username}
                                    href={`/profile/${encodeURIComponent(u.username)}`}
                                    onClick={onClose}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors min-h-[56px]"
                                >
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                                        style={{ backgroundColor: u.avatarColor }}
                                    >
                                        {u.avatarUrl ? (
                                            <img src={u.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                                        ) : (
                                            u.username?.[0]?.toUpperCase()
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{u.username}</span>
                                        <UserBadges isVerified={u.isVerified} isAdmin={u.isAdmin} roles={u.roles || []} size="sm" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ActiveIndicator({ username }) {
    const [online, setOnline] = useState(false);
    useEffect(() => {
        let cancelled = false;
        const check = async () => {
            try {
                const res = await fetch(`/api/users/online?usernames=${encodeURIComponent(username)}`);
                if (res.ok && !cancelled) {
                    const data = await res.json();
                    setOnline(data.users?.[username]?.isOnline || false);
                }
            } catch { /* silent */ }
        };
        check();
        const id = setInterval(check, 30000);
        return () => { cancelled = true; clearInterval(id); };
    }, [username]);

    if (!online) return null;
    return (
        <span className="inline-flex items-center gap-1 text-xs text-green-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Active now
        </span>
    );
}

function FollowRequestsModal({ requests, username, onClose, onRequestHandled }) {
    const [processing, setProcessing] = useState(null);

    const handleAccept = async (requester) => {
        setProcessing(requester);
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(username)}/follow/accept`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requester }),
            });
            if (res.ok) {
                onRequestHandled(requester);
            }
        } catch {}
        setProcessing(null);
    };

    const handleDeny = async (requester) => {
        setProcessing(requester);
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(username)}/follow/deny`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requester }),
            });
            if (res.ok) {
                onRequestHandled(requester);
            }
        } catch {}
        setProcessing(null);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden max-w-md w-full max-h-[80dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100">Follow Requests</span>
                    <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {requests.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">No pending requests</p>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {requests.map((u) => (
                                <div key={u._id || u.username} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                                        style={{ backgroundColor: u.avatarColor }}
                                    >
                                        {u.avatarUrl ? (
                                            <img src={u.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                                        ) : (
                                            u.username?.[0]?.toUpperCase()
                                        )}
                                    </div>
                                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100 flex-1 truncate">{u.username}</span>
                                    <button
                                        onClick={() => handleAccept(u.username)}
                                        disabled={processing === u.username}
                                        className="text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                                    >
                                        {processing === u.username ? "\u2026" : "Accept"}
                                    </button>
                                    <button
                                        onClick={() => handleDeny(u.username)}
                                        disabled={processing === u.username}
                                        className="text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                                    >
                                        Deny
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function ProfileClient({ username }) {
    const { user } = useUser();
    const router = useRouter();
    const [data, setData]                     = useState(null);
    const [loading, setLoading]               = useState(true);
    const [expanded, setExpanded]             = useState(null);
    const [editingProfile, setEditingProfile] = useState(false);
    const { openSidebar }                     = useSidebar();
    const [avatarLightbox, setAvatarLightbox] = useState(false);
    const [listModal, setListModal]           = useState(null);
    const [showCompose, setShowCompose]       = useState(false);
    const [showInviteManager, setShowInviteManager] = useState(false);
    const [showFollowRequests, setShowFollowRequests] = useState(false);
    const [pendingRequests, setPendingRequests] = useState([]);

    const isOwn = user?.username === username;
    const isPrivateProfile = !isOwn && data?.profile?.isPrivate && !user?.following?.includes(username);
    const isPrivateAdmin = !isOwn && data?.profile?.isPrivate && user?.isAdmin;

    useEffect(() => {
        if (!user || !isOwn) return;
        const ping = () => {
            fetch(`/api/users/${encodeURIComponent(user.username)}/active`, { method: "POST" }).catch(() => {});
        };
        ping();
        const id = setInterval(ping, 60000);
        return () => clearInterval(id);
    }, [user, isOwn]);

    const fetchProfile = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/posts/user/${encodeURIComponent(username)}`);
            if (res.ok) setData(await res.json());
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, [username]);

    const handleDeletePost = useCallback((postId) => {
        setData((prev) => prev ? { ...prev, posts: prev.posts.filter((p) => p._id !== postId) } : prev);
    }, []);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    useEffect(() => {
        if (!isOwn || !user) return;
        fetch(`/api/users/${encodeURIComponent(username)}/follow-requests`, {
            credentials: "include",
        })
            .then((r) => r.ok ? r.json() : { users: [] })
            .then((data) => setPendingRequests(data.users || []))
            .catch(() => {});
    }, [isOwn, user, username]);

    const handleFollowToggle = useCallback(({ followersCount, followingCount }) => {
        setData((prev) => {
            if (!prev?.profile) return prev;
            return {
                ...prev,
                profile: {
                    ...prev.profile,
                    followersCount,
                    followingCount,
                },
            };
        });
    }, []);

    const profile = isOwn
        ? {
            username,
            bio:         user?.bio ?? "",
            avatarColor: user?.avatarColor ?? user?.color,
            avatarUrl:   user?.avatarUrl ?? "",
            isVerified:  user?.isVerified ?? false,
            isAdmin:     user?.isAdmin ?? false,
            roles:       user?.roles ?? [],
            followersCount: user?.followers?.length ?? 0,
            followingCount: user?.following?.length ?? 0,
          }
        : (data?.profile ?? {
            username,
            bio:         "",
            avatarColor: colorFromUsername(username),
            avatarUrl:   "",
            isVerified:  false,
            isAdmin:     false,
            roles:       [],
            followersCount: 0,
            followingCount: 0,
          });

    const expandedPost = expanded ? data?.posts?.find((p) => p._id === expanded) : null;

    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950">
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
                        onClick={openSidebar}
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
                    <ProfileSkeleton />
                ) : (
                    <>
                        {/* Profile header */}
                        <div className="flex items-start gap-5 mb-6">
                            <div className="relative shrink-0 cursor-pointer" onClick={() => { if (profile.avatarUrl) setAvatarLightbox(true); }}>
                                <Avatar username={username} avatarUrl={profile.avatarUrl} color={profile.avatarColor} size="lg" />
                                {isOwn && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setEditingProfile(true); }}
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
                                    <UserBadges isVerified={profile.isVerified} isAdmin={profile.isAdmin} roles={profile.roles} />
                                    {!isOwn && <ActiveIndicator username={username} />}
                                    {!isOwn && user && (
                                        <>
                                            <FollowButton username={username} onToggle={handleFollowToggle} />
                                            <Link
                                                href={`/inbox?user=${encodeURIComponent(username)}`}
                                                className="text-xs border border-gray-300 dark:border-gray-700 rounded-full px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400 min-h-[36px] inline-flex items-center"
                                            >
                                                Message
                                            </Link>
                                        </>
                                    )}
                                    {user?.isAdmin && !isOwn && (
                                        <Link href="/admin" className="text-xs text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 rounded-full px-3 py-1 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors">
                                            Manage in admin
                                        </Link>
                                    )}
                                </div>

                                {isOwn && (
                                    <div className="mt-3 flex items-center gap-2">
                                        {pendingRequests.length > 0 && (
                                            <button
                                                onClick={() => setShowFollowRequests(true)}
                                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-orange-500 hover:text-orange-600 border border-orange-200 dark:border-orange-800 rounded-xl hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                                                </svg>
                                                Follow Requests ({pendingRequests.length})
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setShowInviteManager(true)}
                                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                                            </svg>
                                            Invite Friends
                                        </button>
                                        <Link
                                            href="/referrals"
                                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                                            </svg>
                                            Stats
                                        </Link>
                                    </div>
                                )}

                                {profile.bio && (
                                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">{profile.bio}</p>
                                )}

                                <div className="grid grid-cols-4 gap-2 w-full">
                                    <div className="text-center">
                                        <span className="font-black text-gray-900 dark:text-gray-100 block">{data?.postCount ?? 0}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">posts</span>
                                    </div>
                                    <div className="text-center">
                                        <span className="font-black text-gray-900 dark:text-gray-100 block">{data?.totalLikes ?? 0}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">likes</span>
                                    </div>
                                    <button
                                        onClick={() => setListModal("followers")}
                                        className="text-center hover:opacity-70 transition-opacity"
                                    >
                                        <span className="font-black text-gray-900 dark:text-gray-100 block">{profile.followersCount ?? 0}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">followers</span>
                                    </button>
                                    <button
                                        onClick={() => setListModal("following")}
                                        className="text-center hover:opacity-70 transition-opacity"
                                    >
                                        <span className="font-black text-gray-900 dark:text-gray-100 block">{profile.followingCount ?? 0}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">following</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Posts grid + list */}
                        {isPrivateProfile ? (
                            <div className="flex flex-col items-center py-20 text-gray-400 dark:text-gray-600 select-none">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3 opacity-40">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                                </svg>
                                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">This account is private</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Follow this account to see their posts</p>
                            </div>
                        ) : !data?.posts?.length ? (
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
                                            <PostCard key={p._id} post={p} onDelete={handleDeletePost}
                                                onHashtag={(tag) => { router.push(`/?tag=${tag}`); }} />
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
                            <span className="font-bold text-sm text-gray-900 dark:text-gray-100">{expandedPost.sender}</span>
                            <button onClick={() => setExpanded(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <PostCard post={expandedPost} onDelete={(id) => { setExpanded(null); handleDeletePost(id); }}
                            onHashtag={(tag) => { setExpanded(null); router.push(`/?tag=${tag}`); }} />
                    </div>
                </div>
            )}

            {editingProfile && (
                <EditProfileModal onClose={() => { setEditingProfile(false); fetchProfile(); }} />
            )}

            {avatarLightbox && profile.avatarUrl && (
                <ImageLightbox src={profile.avatarUrl} alt={username} onClose={() => setAvatarLightbox(false)} />
            )}

            {listModal && (
                <FollowListModal
                    username={username}
                    type={listModal}
                    onClose={() => setListModal(null)}
                />
            )}

            {isOwn && (
                <button
                    onClick={() => setShowCompose(true)}
                    className="fixed bottom-24 right-5 z-30 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg shadow-blue-500/30 flex items-center justify-center transition-all active:scale-95"
                    aria-label="New post"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                </button>
            )}

            {showFollowRequests && (
                <FollowRequestsModal
                    requests={pendingRequests}
                    username={username}
                    onClose={() => setShowFollowRequests(false)}
                    onRequestHandled={(handledUsername) => {
                        setPendingRequests((prev) => prev.filter((u) => u.username !== handledUsername));
                        fetchProfile();
                    }}
                />
            )}

            {showInviteManager && (
                <InviteManager isOpen={showInviteManager} onClose={() => setShowInviteManager(false)} />
            )}

            {isOwn && showCompose && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center" onClick={() => setShowCompose(false)}>
                    <div
                        className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85dvh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
                            <span className="font-bold text-sm text-gray-900 dark:text-gray-100">New Post</span>
                            <button
                                onClick={() => setShowCompose(false)}
                                className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                aria-label="Close"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <Compose onPosted={() => { setShowCompose(false); fetchProfile(); }} />
                    </div>
                </div>
            )}
        </div>
    );
}
