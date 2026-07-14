"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/context/UserContext";

const NAV_ITEMS = [
    {
        label: "Home",
        href: "/",
        icon: (active) => (
            <svg xmlns="http://www.w3.org/2000/svg" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
        ),
    },
    {
        label: "Search",
        href: "/search",
        icon: (active) => (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
        ),
    },
    {
        label: "Post",
        href: "/#compose",
        icon: (active) => (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
        ),
    },
    {
        label: "Inbox",
        href: "/inbox",
        icon: (active) => (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
            </svg>
        ),
    },
    {
        label: "Profile",
        href: null, // dynamic
        icon: (active) => (
            <svg xmlns="http://www.w3.org/2000/svg" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
        ),
    },
];

export default function BottomNav() {
    const { user } = useUser();
    const pathname = usePathname();
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchUnread = useCallback(async () => {
        if (!user?.username) return;
        try {
            const res = await fetch(`/api/messages/unread?username=${encodeURIComponent(user.username)}`, {
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
                setUnreadCount(data?.total || 0);
            } else if (res.status === 401) {
                console.warn("Unauthorized access to unread messages");
            }
        } catch (err) {
            console.error("Failed to fetch unread count:", err);
        }
    }, [user]);

    useEffect(() => {
        fetchUnread();
        const id = setInterval(fetchUnread, 10000);
        return () => clearInterval(id);
    }, [fetchUnread]);

    const profileHref = user?.username
        ? `/profile/${encodeURIComponent(user.username)}`
        : "/login";

    const isActive = (href) => {
        if (!href) return false;
        if (href === "/") return pathname === "/";
        return pathname.startsWith(href);
    };

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-t border-gray-200 dark:border-gray-800 lg:hidden safe-bottom">
            <div className="flex items-center justify-around h-14">
                {NAV_ITEMS.map(({ label, href, icon }) => {
                    const targetHref = label === "Profile" ? profileHref : href;
                    const active = label === "Profile"
                        ? pathname.startsWith("/profile/")
                        : isActive(href);

                    return (
                        <Link
                            key={label}
                            href={targetHref || "#"}
                            aria-label={label}
                            className={`relative flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors min-h-[44px] ${
                                active
                                    ? "text-gray-900 dark:text-gray-100"
                                    : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                            }`}
                        >
                            {icon(active)}
                            {label === "Inbox" && unreadCount > 0 && (
                                <span className="absolute top-1.5 right-1/2 translate-x-3 w-2 h-2 bg-blue-500 rounded-full" />
                            )}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
