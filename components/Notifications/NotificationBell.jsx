"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";

function timeAgo(date) {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 60)    return `${Math.floor(diff)}s`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return new Date(date).toLocaleDateString([], { month: "short", day: "numeric" });
}

const TYPE_LABEL = {
    like:    "liked your post",
    comment: "commented on your post",
    mention: "mentioned you",
};

export default function NotificationBell({ onNavigate }) {
    const { user } = useUser();
    const [notifs, setNotifs]   = useState([]);
    const [open, setOpen]       = useState(false);
    const panelRef              = useRef(null);

    const unread = notifs.filter((n) => !n.read).length;

    const fetchNotifs = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch(`/api/notifications?username=${encodeURIComponent(user.username)}`);
            if (res.ok) setNotifs(await res.json());
        } catch { /* silent */ }
    }, [user]);

    // Poll every 15s
    useEffect(() => {
        fetchNotifs();
        const id = setInterval(fetchNotifs, 15000);
        return () => clearInterval(id);
    }, [fetchNotifs]);

    // Close on outside click
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
            // Mark all read
            await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            });
            setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
        }
    };

    return (
        <div className="relative" ref={panelRef}>
            <button
                onClick={handleOpen}
                aria-label="Notifications"
                className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
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
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-200 z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <span className="font-bold text-sm text-gray-900">Notifications</span>
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
                                }}
                                className="text-xs text-blue-500 hover:text-blue-600"
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {notifs.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-8">No notifications yet</p>
                        ) : notifs.map((n) => (
                            <div
                                key={n._id}
                                className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!n.read ? "bg-blue-50/40" : ""}`}
                            >
                                {/* Avatar */}
                                <div
                                    className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold select-none"
                                    style={{ backgroundColor: n.fromColor }}
                                >
                                    {n.fromUser?.[0]?.toUpperCase()}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-900 leading-snug">
                                        <span className="font-semibold">{n.fromUser}</span>
                                        {" "}{TYPE_LABEL[n.type] ?? n.type}
                                        {n.type === "comment" && n.text && (
                                            <span className="text-gray-500">: "{n.text.slice(0, 60)}{n.text.length > 60 ? "…" : ""}"</span>
                                        )}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(n.createdAt)}</p>
                                </div>

                                {!n.read && (
                                    <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-1.5" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
