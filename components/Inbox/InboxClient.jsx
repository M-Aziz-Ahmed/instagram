"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter, useSearchParams } from "next/navigation";
import ChatBox from "./ChatBox";
import Sidebar from "@/components/Layout/Sidebar";
import UserBadges from "@/components/shared/UserBadges";

function timeAgo(date) {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 60)    return `${Math.floor(diff)}s`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return new Date(date).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function InboxClient() {
    const { user, ready } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const targetUser = searchParams.get("user");
    const [view, setView] = useState("list");
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedConvo, setSelectedConvo] = useState(null);
    const [sidebarOpen, setSidebarOpen]     = useState(false);

    const fetchConversations = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch(`/api/messages?username=${encodeURIComponent(user.username)}`);
            if (res.ok) setConversations(await res.json());
        } catch (err) {
            console.error("Failed to fetch conversations:", err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => { fetchConversations(); }, [fetchConversations]);

    useEffect(() => {
        if (!targetUser || selectedConvo?.username === targetUser) return;

        const existing = conversations.find((c) => c.username === targetUser);
        if (existing) {
            handleSelectConvo(existing);
            return;
        }

        const newConvo = {
            username: targetUser,
            user: { username: targetUser, avatarUrl: "", color: "#3b82f6" },
            lastMessage: null,
            unreadCount: 0,
        };
        handleSelectConvo(newConvo);
    }, [targetUser, conversations, selectedConvo]);

    useEffect(() => {
        const interval = setInterval(fetchConversations, 5000);
        return () => clearInterval(interval);
    }, [fetchConversations]);

    const handleSelectConvo = (convo) => {
        const url = new URL(window.location.href);
        url.searchParams.set("user", convo.username);
        router.replace(url.pathname + url.search, { scroll: false });
        setSelectedConvo(convo);
        setView("chat");
    };

    if (!ready) {
        return (
            <div className="flex h-dvh items-center justify-center bg-white dark:bg-gray-950">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex h-dvh bg-white dark:bg-gray-950 overflow-hidden lg:pl-72">
            <aside className={`
                flex flex-col shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950
                w-full md:w-80
                ${view === "chat" ? "hidden md:flex" : "flex"}
            `}>
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                    <span className="font-semibold text-base tracking-tight text-gray-900 dark:text-gray-100">Inbox</span>
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

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mb-2 opacity-40">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                            </svg>
                            <p className="text-sm">No conversations yet</p>
                        </div>
                    ) : (
                        conversations.map((convo) => (
                            <button
                                key={convo.username}
                                onClick={() => handleSelectConvo(convo)}
                                className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-700 transition-colors text-left ${
                                    selectedConvo?.username === convo.username ? "bg-gray-100 dark:bg-gray-800" : ""
                                } ${targetUser === convo.username ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                            >
                                {convo.user?.avatarUrl ? (
                                    <img src={convo.user.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
                                ) : (
                                    <div
                                        className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl select-none shrink-0"
                                        style={{ backgroundColor: convo.user?.color || "#3b82f6" }}
                                    >
                                        {convo.username?.[0]?.toUpperCase() ?? "?"}
                                    </div>
                                )}

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{convo.username}</p>
                                        <UserBadges isVerified={convo.user?.isVerified} roles={convo.user?.roles || []} size="sm" />
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                        {convo.lastMessage?.sender === user?.username ? "You: " : ""}
                                        {convo.lastMessage?.imageUrl && !convo.lastMessage?.text ? "📷 Photo" : convo.lastMessage?.text?.slice(0, 30) || "Message"} · {timeAgo(convo.lastMessage?.timeStamp)}
                                    </p>
                                </div>

                                {convo.unreadCount > 0 && (
                                    <span className="bg-blue-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                                        {convo.unreadCount > 9 ? "9+" : convo.unreadCount}
                                    </span>
                                )}
                            </button>
                        ))
                    )}
                </div>
            </aside>

            <main className={`
                flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-950
                ${view === "list" ? "hidden md:flex" : "flex"}
            `}>
                <ChatBox
                    onBack={() => setView("list")}
                    recipient={selectedConvo?.username}
                    recipientUser={selectedConvo?.user}
                />
            </main>

            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </div>
    );
}
