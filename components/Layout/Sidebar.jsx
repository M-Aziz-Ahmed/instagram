"use client";

import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { useTheme } from "@/context/ThemeContext";
import { useSidebar } from "@/context/SidebarContext";
import { useVoiceChat } from "@/context/VoiceChatContext";
import { useRouter, usePathname } from "next/navigation";
import EditProfileModal from "@/components/Auth/EditProfileModal";
import Link from "next/link";
import UserBadges from "@/components/shared/UserBadges";
import CloseFriendsModal from "@/components/Settings/CloseFriendsModal";
import MutedWordsModal from "@/components/Settings/MutedWordsModal";

function NavItem({ href, icon, label, active, onClick, badge }) {
    const { collapsed } = useSidebar();
    const classes = `flex items-center ${collapsed ? "justify-center gap-0 px-2" : "gap-3 px-4"} py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px] ${
        active
            ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-100"
    }`;

    const content = (
        <>
                {icon}
                <span className={collapsed ? "sr-only" : "flex-1"}>{label}</span>
                {badge > 0 && !collapsed && (
                    <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center leading-none px-1">
                        {badge > 99 ? "99+" : badge}
                    </span>
                )}
        </>
    );

    if (href) {
        return (
            <Link href={href} onClick={onClick} className={classes}>
                {content}
            </Link>
        );
    }

        return (
            <button onClick={onClick} className={`${classes} w-full ${collapsed ? "" : "text-left"}`}>
                {content}
            </button>
        );
}

function HomeIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
    );
}

function ProfileIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0zM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
    );
}

function InboxIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
        </svg>
    );
}

function AdminIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
        </svg>
    );
}

function BookmarkIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
        </svg>
    );
}

function VoiceChatIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
        </svg>
    );
}

function ChessIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M12 2L9 5H5v3l-2 2 2 2v3h4l3 3 3-3h4v-3l2-2-2-2V5h-4L12 2z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

function AnimeIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v.375" />
        </svg>
    );
}

function MangaIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
        </svg>
    );
}

function SunIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
    );
}

function SettingsIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
    );
}

function LogoutIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
        </svg>
    );
}

export default function Sidebar({ open, onClose, unreadCount = 0 }) {
    const { user, logout } = useUser();
    const { theme, toggleTheme } = useTheme();
    const { collapsed, toggleCollapsed } = useSidebar();
    const { voiceOpen, openVoiceChat, closeVoiceChat } = useVoiceChat();
    const router = useRouter();
    const pathname = usePathname();
    const [editingProfile, setEditingProfile] = useState(false);
    const [showCloseFriends, setShowCloseFriends] = useState(false);
    const [showMutedWords, setShowMutedWords] = useState(false);

    const handleLogout = async () => {
        if (onClose) onClose();
        try {
            await logout();
            router.replace("/login");
        } catch (err) {
            console.error("Logout failed:", err);
            // Force navigation anyway
            router.replace("/login");
        }
    };

    const handleNavClick = () => {
        onClose();
    };

    const isActive = (path) => {
        if (path === "/") return pathname === "/";
        return pathname.startsWith(path);
    };

    // Escape key to close mobile sidebar + body scroll lock
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [open, onClose]);

    return (
        <>
            {/* Backdrop */}
            {open && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 transition-opacity lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar panel */}
            <aside
                className={`fixed top-0 left-0 h-full ${collapsed ? "w-20" : "w-72"} bg-white dark:bg-gray-900 z-50 shadow-xl transition-all duration-300 ease-in-out lg:translate-x-0 lg:shadow-none lg:border-r lg:border-gray-200 dark:lg:border-gray-800 ${
                    open ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                <div className="flex flex-col h-full">
                    {/* User profile header */}
                    <div className="px-5 pt-6 pb-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg select-none shrink-0 overflow-hidden"
                                    style={{ backgroundColor: user?.avatarColor }}
                                >
                                    {user?.avatarUrl ? (
                                        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        user?.username?.[0]?.toUpperCase()
                                    )}
                                </div>

                                {!collapsed && (
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <p className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">@{user?.username}</p>
                                            <UserBadges isVerified={user?.isVerified} isAdmin={user?.isAdmin} roles={user?.roles || []} size="sm" />
                                        </div>
                                        {user?.bio && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{user.bio}</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={onClose}
                                    aria-label="Close sidebar"
                                    className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors lg:hidden"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                                <button
                                    onClick={toggleCollapsed}
                                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                                    className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors hidden lg:flex"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                                        {collapsed ? (
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                                        ) : (
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
                                        )}
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
                        <NavItem
                            href="/"
                            icon={<HomeIcon />}
                            label="Home"
                            active={isActive("/")}
                            onClick={handleNavClick}
                        />
                        <NavItem
                            href={`/profile/${encodeURIComponent(user?.username || "")}`}
                            icon={<ProfileIcon />}
                            label="Profile"
                            active={isActive("/profile")}
                            onClick={handleNavClick}
                        />
                        <NavItem
                            href="/bookmarks"
                            icon={<BookmarkIcon />}
                            label="Bookmarks"
                            active={isActive("/bookmarks")}
                            onClick={handleNavClick}
                        />
                        <NavItem
                            href="/inbox"
                            icon={<InboxIcon />}
                            label="Inbox"
                            active={isActive("/inbox")}
                            onClick={handleNavClick}
                            badge={unreadCount}
                        />
                        <NavItem
                            icon={<VoiceChatIcon />}
                            label="Voice Chat"
                            active={voiceOpen}
                            onClick={() => {
                                if (voiceOpen) {
                                    closeVoiceChat();
                                } else {
                                    openVoiceChat();
                                }
                            }}
                        />
                        <NavItem
                            href="/games"
                            icon={<ChessIcon />}
                            label="Games"
                            active={["/games", "/chess", "/connect4", "/tictactoe", "/checkers", "/reversi", "/battleship", "/hangman", "/reactionduel", "/game2048", "/minesweeper", "/sudoku"].some((p) => isActive(p))}
                            onClick={handleNavClick}
                        />
                        <NavItem
                            href="/anime"
                            icon={<AnimeIcon />}
                            label="Anime"
                            active={isActive("/anime")}
                            onClick={handleNavClick}
                        />
                        <NavItem
                            href="/manga"
                            icon={<MangaIcon />}
                            label="Manga"
                            active={isActive("/manga")}
                            onClick={handleNavClick}
                        />
                        {user?.isAdmin && (
                            <NavItem
                                href="/admin"
                                icon={<AdminIcon />}
                                label="Admin"
                                active={isActive("/admin")}
                                onClick={handleNavClick}
                            />
                        )}
                    </nav>

                    {/* Settings section */}
                    <div className="border-t border-gray-200 dark:border-gray-800 px-3 py-3 space-y-1">
                        {!collapsed && (
                            <p className="px-4 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Settings</p>
                        )}
                        <NavItem
                            icon={<SettingsIcon />}
                            label="Edit Profile"
                            onClick={() => { handleNavClick(); setEditingProfile(true); }}
                        />
                        <NavItem
                            icon={theme === "dark" ? <SunIcon /> : <MoonIcon />}
                            label={theme === "dark" ? "Light mode" : "Dark mode"}
                            onClick={() => { toggleTheme(); }}
                        />
                        <button
                            onClick={() => { 
                                setShowCloseFriends(true); 
                                if (onClose) onClose(); 
                            }}
                            className={`w-full flex items-center ${collapsed ? "justify-center gap-0 px-2" : "gap-3 px-4"} py-3 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-100 transition-colors min-h-[48px] ${collapsed ? "" : "text-left"}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                            </svg>
                            {!collapsed && <span className="flex-1">Close Friends</span>}
                        </button>

                        <button
                            onClick={() => { 
                                setShowMutedWords(true); 
                                if (onClose) onClose(); 
                            }}
                            className={`w-full flex items-center ${collapsed ? "justify-center gap-0 px-2" : "gap-3 px-4"} py-3 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-100 transition-colors min-h-[48px] ${collapsed ? "" : "text-left"}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                            </svg>
                            {!collapsed && <span className="flex-1">Muted Words</span>}
                        </button>
                        <NavItem
                            icon={<LogoutIcon />}
                            label="Log Out"
                            onClick={handleLogout}
                        />
                    </div>
                </div>
            </aside>

            {/* Edit profile modal */}
            {editingProfile && (
                <EditProfileModal onClose={() => setEditingProfile(false)} />
            )}
            {showCloseFriends && <CloseFriendsModal onClose={() => setShowCloseFriends(false)} />}
            {showMutedWords && <MutedWordsModal onClose={() => setShowMutedWords(false)} />}
        </>
    );
}
