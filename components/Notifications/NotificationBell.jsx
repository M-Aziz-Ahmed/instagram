"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import UserBadges from "@/components/shared/UserBadges";
import { playNotificationSound, initAudio, toggleNotificationSound, isSoundEnabled } from "@/utils/notificationSound";
import { getActiveChat } from "@/utils/activeChat";

function timeAgo(date) {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 60)    return `${Math.floor(diff)}s`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return new Date(date).toLocaleDateString([], { month: "short", day: "numeric" });
}

const TYPE_LABEL = {
    like:    "liked your post",
    love:    "loved your post",
    laugh:   "laughed at your post",
    fire:    "reacted \ud83d\udd25 to your post",
    sad:     "reacted \ud83d\ude22 to your post",
    angry:   "reacted \ud83d\ude20 to your post",
    comment: "commented on your post",
    mention: "mentioned you",
    message: "sent you a message",
    repost:  "reposted your post",
    follow:  "started following you",
    reply:   "replied to your comment",
    live:    "went live",
};

export default function NotificationBell({ onNavigate }) {
    const { user } = useUser();
    const router = useRouter();
    const [notifs, setNotifs]   = useState([]);
    const [open, setOpen]       = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const panelRef              = useRef(null);
    const prevUnreadCount       = useRef(-1); // -1 = uninitialized, skip first poll

    const unread = notifs.filter((n) => !n.read).length;

    // Initialize audio on first user interaction
    useEffect(() => {
        const handleInteraction = () => {
            initAudio();
            setSoundEnabled(isSoundEnabled());
        };
        document.addEventListener('click', handleInteraction, { once: true });
        return () => document.removeEventListener('click', handleInteraction);
    }, []);

    const fetchNotifs = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch(`/api/notifications?username=${encodeURIComponent(user.username)}`);
            if (res.ok) {
                const newNotifs = await res.json();
                const activeChat = getActiveChat();
                
                // Filter out message notifications from the person we're actively chatting with
                const visibleNotifs = newNotifs.filter((n) => {
                    if (n.type === "message" && activeChat && n.fromUser === activeChat) return false;
                    return true;
                });

                const newUnreadCount = visibleNotifs.filter((n) => !n.read).length;
                
                // Play sound if new unread notifications arrived
                // Skip first poll (prevUnreadCount === -1) to avoid playing sounds for stale notifications
                if (prevUnreadCount.current >= 0 && newUnreadCount > prevUnreadCount.current) {
                    const latestNotif = visibleNotifs.find(n => !n.read);
                    const soundType = latestNotif?.type || 'default';
                    playNotificationSound(soundType);
                }
                
                prevUnreadCount.current = newUnreadCount;
                setNotifs(visibleNotifs);
            }
        } catch { /* silent */ }
    }, [user]);

    useEffect(() => {
        fetchNotifs();
        const id = setInterval(fetchNotifs, 15000);
        return () => clearInterval(id);
    }, [fetchNotifs]);

    useEffect(() => {
        const handler = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
        };
        if (open) document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const handleOpen = async () => {
        setOpen((v) => !v);
        if (!open && unread > 0 && user) {
            await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            });
            setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
            prevUnreadCount.current = 0;
        }
    };

    const handleToggleSound = () => {
        const newState = toggleNotificationSound();
        setSoundEnabled(newState);
        // Play a test sound
        if (newState) {
            playNotificationSound('default');
        }
    };

    return (
        <div className="relative" ref={panelRef}>
            <button
                onClick={handleOpen}
                aria-label="Notifications"
                className="relative p-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                    strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round"
                        d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
                {unread > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-gray-900 dark:text-gray-100">Notifications</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleToggleSound}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                title={soundEnabled ? "Mute notifications" : "Unmute notifications"}
                                aria-label={soundEnabled ? "Mute" : "Unmute"}
                            >
                                {soundEnabled ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-blue-500">
                                        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
                                        <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-400">
                                        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" />
                                    </svg>
                                )}
                            </button>
                            {notifs.length > 0 && (
                                <button
                                    onClick={async () => {
                                        if (!user) return;
                                        await fetch("/api/notifications", {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ username: user.username }),
                                        });
                                        setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
                                        prevUnreadCount.current = 0;
                                    }}
                                    className="text-xs text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap"
                                >
                                    Mark all read
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {notifs.length === 0 ? (
                            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No notifications yet</p>
                        ) : notifs.map((n) => (
                            <button
                                key={n._id}
                                onClick={() => {
                                    setOpen(false);
                                    if (n.type === "message") {
                                        router.push(`/inbox?user=${encodeURIComponent(n.fromUser)}`);
                                    } else if (n.postId) {
                                        router.push(`/`);
                                    }
                                }}
                                className={`w-full flex items-start gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left ${!n.read ? "bg-blue-50/40 dark:bg-blue-900/10" : ""}`}
                            >
                                <div
                                    className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold select-none"
                                    style={{ backgroundColor: n.fromColor }}
                                >
                                    {n.fromUser?.[0]?.toUpperCase()}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-900 dark:text-gray-100 leading-snug">
                                        <span className="font-semibold">{n.fromUser}</span>
                                        <UserBadges isVerified={n.fromUserDoc?.isVerified} isAdmin={n.fromUserDoc?.isAdmin} roles={n.fromUserDoc?.roles || []} size="xs" />
                                        {" "}{TYPE_LABEL[n.type] ?? n.type}
                                        {n.text && (n.type === "comment" || n.type === "repost") && (
                                            <span className="text-gray-500 dark:text-gray-400">: &ldquo;{n.text.slice(0, 60)}{n.text.length > 60 ? "\u2026" : ""}&rdquo;</span>
                                        )}
                                    </p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{timeAgo(n.createdAt)}</p>
                                </div>

                                {!n.read && (
                                    <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-1.5" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
