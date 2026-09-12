"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/context/UserContext";

const TABS = [
    {
        key: "chats",
        label: "Chats",
        href: "/inbox",
        routes: ["/inbox"],
        unread: true,
        icon: (active) => (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={active ? 2.1 : 1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
            </svg>
        ),
    },
    {
        key: "social",
        label: "Social",
        href: "/social",
        routes: ["/social", "/post", "/search", "/trending", "/communities", "/bookmarks"],
        icon: (active) => (
            <svg xmlns="http://www.w3.org/2000/svg" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="m13.666 14.755-3.04.658 2.576-2.762 3.039-.658-2.575 2.762Z" />
            </svg>
        ),
    },
    {
        key: "browser",
        label: "Browser",
        href: "/browser",
        routes: ["/browser"],
        icon: (active) => (
            <svg xmlns="http://www.w3.org/2000/svg" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
        ),
    },
    {
        key: "entertainment",
        label: "Entertainment",
        href: "/entertainment",
        routes: [
            "/entertainment", "/movies", "/anime", "/manga", "/kdramas", "/seasons", "/cdramas", "/cartoons", "/channels",
            "/games", "/chess", "/connect4", "/tictactoe", "/checkers", "/reversi", "/battleship", "/hangman",
            "/reactionduel", "/game2048", "/minesweeper", "/sudoku", "/leaderboard",
        ],
        icon: (active) => (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3" />
            </svg>
        ),
    },
    {
        key: "me",
        label: "Me",
        href: "/me",
        routes: ["/me", "/profile", "/library", "/referrals", "/download", "/admin", "/analytics", "/invite"],
        profile: true,
        icon: (active) => (
            <svg xmlns="http://www.w3.org/2000/svg" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
        ),
    },
];

export default function BottomNav({ unreadCount = 0 }) {
    const { user } = useUser();
    const pathname = usePathname();

    const isActive = (routes) =>
        routes.some((r) => pathname === r || pathname.startsWith(r + "/"));

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 safe-bottom lg:hidden">
            <div className="flex items-stretch h-16 max-w-[720px] mx-auto">
                {TABS.map(({ key, label, href, routes, icon, unread, profile }) => {
                    const active = isActive(routes);
                    const textColor = active
                        ? "text-blue-500"
                        : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400";

                    const badge = unread && unreadCount > 0
                        ? <span className="absolute -top-0.5 left-1/2 -translate-x-3 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center leading-none shadow">
                              {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        : null;

                    let content = (
                        <>
                            <span className="relative flex items-center justify-center">
                                {profile && user?.avatarUrl ? (
                                    <img
                                        src={user.avatarUrl}
                                        alt=""
                                        className="w-6 h-6 rounded-full object-cover bg-gray-200 dark:bg-gray-800"
                                    />
                                ) : profile && user ? (
                                    <span
                                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                        style={{ backgroundColor: user.avatarColor || "#3b82f6" }}
                                    >
                                        {user.username?.[0]?.toUpperCase() || "?"}
                                    </span>
                                ) : (
                                    icon(active)
                                )}
                                {badge}
                            </span>
                            <span className="text-[10px] font-medium leading-tight">{label}</span>
                        </>
                    );

                    return (
                        <Link
                            key={key}
                            href={href}
                            aria-label={label}
                            className={`relative flex flex-col items-center justify-center gap-1 flex-1 min-h-[44px] min-w-[44px] transition-colors ${textColor}`}
                        >
                            {content}
                            <span className={`absolute top-0 ${active ? "w-1/2 h-0.5 rounded-b-full bg-blue-500" : "w-0"}`} />
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}