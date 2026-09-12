"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";
import SettingsModal from "@/components/Auth/EditProfileModal";
import UserBadges from "@/components/shared/UserBadges";
import { useState } from "react";

function Item({ icon, label, href, onClick, chevron = true }) {
    const content = (
        <div className="flex items-center gap-4 py-4 px-4 w-full hover:bg-gray-50 dark:hover:bg-gray-800/60 active:bg-gray-100 dark:active:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0 min-h-[48px]">
            <span className="w-6 h-6 flex items-center justify-center text-gray-500 dark:text-gray-400 shrink-0">{icon}</span>
            <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{label}</span>
            {chevron && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0">
                    <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
            )}
        </div>
    );

    if (href) {
        return <Link href={href} className="block w-full">{content}</Link>;
    }
    return <button onClick={onClick} className="w-full text-left block">{content}</button>;
}

export default function MeHub() {
    const { user, logout } = useUser();
    const router = useRouter();
    const [showSettings, setShowSettings] = useState(false);

    const handleLogout = async () => {
        try {
            await logout();
            router.replace("/login");
        } catch {
            router.replace("/login");
        }
    };

    return (
        <div className="min-h-dvh bg-gray-50 dark:bg-gray-950">
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-2xl mx-auto px-4 h-12 sm:h-14 flex items-center justify-between">
                    <h1 className="font-black text-lg sm:text-xl tracking-tight text-gray-900 dark:text-gray-100">Me</h1>
                </div>
            </header>

            <div className="max-w-2xl mx-auto pb-20 lg:pb-4">
                {/* Profile card */}
                <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 mb-3">
                    <Link
                        href={user ? `/profile/${encodeURIComponent(user.username)}` : "/login"}
                        className="flex items-center gap-4 p-5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                    >
                        {user?.avatarUrl ? (
                            <img src={user.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover shrink-0" />
                        ) : (
                            <div
                                className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl shrink-0 select-none"
                                style={{ backgroundColor: user?.avatarColor || "#3b82f6" }}
                            >
                                {user?.username?.[0]?.toUpperCase() || "?"}
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                <p className="font-bold text-lg text-gray-900 dark:text-gray-100 truncate">@{user?.username || "guest"}</p>
                                <UserBadges isVerified={user?.isVerified} isAdmin={user?.isAdmin} roles={user?.roles || []} size="sm" />
                            </div>
                            {user?.bio ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">{user.bio}</p>
                            ) : (
                                <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5 italic">Tap to view profile</p>
                            )}
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0">
                            <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
                    </Link>
                    {user && (
                        <div className="grid grid-cols-3 border-t border-gray-100 dark:border-gray-800">
                            <Link href={`/profile/${encodeURIComponent(user.username)}?tab=followers`} className="py-3 border-r border-gray-100 dark:border-gray-800 text-center hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{user.followers?.length || 0}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">Followers</p>
                            </Link>
                            <Link href={`/profile/${encodeURIComponent(user.username)}?tab=following`} className="py-3 border-r border-gray-100 dark:border-gray-800 text-center hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{user.following?.length || 0}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">Following</p>
                            </Link>
                            <Link href={`/profile/${encodeURIComponent(user.username)}`} className="py-3 text-center hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{user.postsCount || 0}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">Posts</p>
                            </Link>
                        </div>
                    )}
                </div>

                {/* Sections */}
                <div className="bg-white dark:bg-gray-900 mb-3 rounded-2xl mx-4 overflow-hidden">
                    <Item icon="👤" label="My Profile" href={user ? `/profile/${encodeURIComponent(user.username)}` : "/login"} />
                    <Item icon="🔖" label="Bookmarks" href="/bookmarks" />
                    <Item icon="📚" label="Library" href="/library" />
                    <Item icon="👥" label="Communities" href="/communities" />
                    <Item icon="🏆" label="Leaderboard" href="/leaderboard" />
                </div>

                <div className="bg-white dark:bg-gray-900 mb-3 rounded-2xl mx-4 overflow-hidden">
                    <Item icon="🎁" label="Referrals" href="/referrals" />
                    <Item icon="📥" label="Download App" href="/download" />
                    <Item icon="⚙️" label="Settings" onClick={() => setShowSettings(true)} />
                    {user?.isAdmin && (
                        <Item icon="🛡️" label="Admin" href="/admin" />
                    )}
                </div>

                <div className="bg-white dark:bg-gray-900 mb-3 rounded-2xl mx-4 overflow-hidden">
                    <button
                        onClick={handleLogout}
                        className="w-full text-left block py-4 px-4 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 active:bg-red-100 dark:active:bg-red-900/20 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0 min-h-[48px]"
                    >
                        Log Out
                    </button>
                </div>
            </div>

            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </div>
    );
}