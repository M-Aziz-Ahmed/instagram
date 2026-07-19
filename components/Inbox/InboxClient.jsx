"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter, useSearchParams } from "next/navigation";
import ChatBox from "./ChatBox";
import GroupChatBox from "./GroupChatBox";
import CreateGroup from "./CreateGroup";
import { useSidebar } from "@/context/SidebarContext";
import UserBadges from "@/components/shared/UserBadges";
import { setActiveChat } from "@/utils/activeChat";
import { timeAgo } from "@/utils/timeAgo";
import { ConversationSkeleton } from "@/components/shared/Skeleton";

function OnlineDot({ username, onlineMap }) {
    const online = onlineMap?.[username]?.isOnline;
    if (!online) return null;
    return <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" title="Online" />;
}

export default function InboxClient() {
    const { user, ready } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const targetUser = searchParams.get("user");
    const targetGroup = searchParams.get("group");
    const [view, setView] = useState("list");
    const [tab, setTab] = useState("dm"); // "dm" | "groups"
    const [conversations, setConversations] = useState([]);
    const [groups, setGroups] = useState([]);
    const [onlineMap, setOnlineMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [selectedConvo, setSelectedConvo] = useState(null);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const { openSidebar } = useSidebar();
    const prevTargetRef = useRef(null);

    useEffect(() => {
        if (!user) return;
        if (selectedConvo) {
            setActiveChat(selectedConvo.username);
        } else if (selectedGroup) {
            setActiveChat(`group:${selectedGroup._id}`);
        }
        const clearTyping = () => {
            fetch("/api/typing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, typingTo: "" }),
            }).catch(() => {});
        };
        return () => {
            setActiveChat(null);
            clearTyping();
        };
    }, [user, selectedConvo?.username, selectedGroup?._id]);

    const fetchConversations = useCallback(async () => {
        if (!user?.username) return;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            const res = await fetch(`/api/messages?username=${encodeURIComponent(user.username)}`, {
                credentials: "include", signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                setConversations(data);
            }
        } catch {
            clearTimeout(timeoutId);
        } finally { setLoading(false); }
    }, [user]);

    const fetchGroups = useCallback(async () => {
        if (!user?.username) return;
        try {
            const res = await fetch(`/api/groups?username=${encodeURIComponent(user.username)}`);
            if (res.ok) {
                const data = await res.json();
                setGroups(data);
            }
        } catch {}
    }, [user]);

    useEffect(() => {
        queueMicrotask(() => {
            fetchConversations();
            fetchGroups();
        });
    }, [fetchConversations, fetchGroups]);

    useEffect(() => {
        const interval = setInterval(() => {
            fetchConversations();
            fetchGroups();
        }, 15000);
        return () => clearInterval(interval);
    }, [fetchConversations, fetchGroups]);

    useEffect(() => {
        const handleGroupUpdate = (e) => {
            const updated = e.detail;
            if (updated?._id) {
                setGroups(prev => prev.map(g => g._id === updated._id ? { ...g, ...updated } : g));
                if (selectedGroup?._id === updated._id) {
                    setSelectedGroup(prev => prev ? { ...prev, ...updated } : prev);
                }
            }
        };
        window.addEventListener("groupUpdated", handleGroupUpdate);
        return () => window.removeEventListener("groupUpdated", handleGroupUpdate);
    }, [selectedGroup?._id]);

    // Online status polling
    useEffect(() => {
        if (conversations.length === 0) return;
        const usernames = conversations.map(c => c.username).join(",");
        const fetchOnline = async () => {
            try {
                const res = await fetch(`/api/users/online?usernames=${encodeURIComponent(usernames)}`);
                if (res.ok) {
                    const data = await res.json();
                    setOnlineMap(data.users || {});
                }
            } catch {}
        };
        fetchOnline();
        const id = setInterval(fetchOnline, 30000);
        return () => clearInterval(id);
    }, [conversations]);

    // Deep linking
    useEffect(() => {
        if (targetUser && targetUser !== prevTargetRef.current) {
            prevTargetRef.current = targetUser;
            const existing = conversations.find(c => c.username === targetUser);
            if (existing) {
                queueMicrotask(() => { setSelectedConvo(existing); setSelectedGroup(null); setView("chat"); });
            } else {
                queueMicrotask(() => {
                    setSelectedConvo({ username: targetUser, user: { username: targetUser, avatarUrl: "", color: "#3b82f6" }, lastMessage: null, unreadCount: 0 });
                    setSelectedGroup(null);
                    setView("chat");
                });
            }
        }
        if (targetGroup && targetGroup !== prevTargetRef.current) {
            prevTargetRef.current = targetGroup;
            const existing = groups.find(g => g._id === targetGroup);
            if (existing) {
                queueMicrotask(() => { setSelectedGroup(existing); setSelectedConvo(null); setTab("groups"); setView("chat"); });
            } else {
                // Fetch group details
                fetch(`/api/groups/${targetGroup}`).then(r => r.json()).then(data => {
                    if (data._id) {
                        queueMicrotask(() => { setSelectedGroup(data); setSelectedConvo(null); setTab("groups"); setView("chat"); });
                    }
                }).catch(() => {});
            }
        }
    }, [targetUser, targetGroup, conversations, groups]);

    if (!ready) {
        return (
            <div className="flex h-dvh items-center justify-center bg-white dark:bg-gray-950">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    const handleSelectConvo = (convo) => {
        setSelectedConvo(convo);
        setSelectedGroup(null);
        setView("chat");
        const url = new URL(window.location.href);
        url.searchParams.set("user", convo.username);
        url.searchParams.delete("group");
        router.replace(url.pathname + url.search, { scroll: false });
    };

    const handleSelectGroup = (group) => {
        setSelectedGroup(group);
        setSelectedConvo(null);
        setView("chat");
        const url = new URL(window.location.href);
        url.searchParams.set("group", group._id);
        url.searchParams.delete("user");
        router.replace(url.pathname + url.search, { scroll: false });
    };

    const handleBack = () => {
        setView("list");
        setSelectedConvo(null);
        setSelectedGroup(null);
        prevTargetRef.current = null;
        const url = new URL(window.location.href);
        url.searchParams.delete("user");
        url.searchParams.delete("group");
        router.replace(url.pathname, { scroll: false });
    };

    const filteredConversations = searchQuery.trim()
        ? conversations.filter(c => c.username.toLowerCase().includes(searchQuery.toLowerCase()))
        : conversations;

    const filteredGroups = searchQuery.trim()
        ? groups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()) || g.members?.some(m => m.username.toLowerCase().includes(searchQuery.toLowerCase())))
        : groups;

    return (
        <div className="flex h-dvh bg-white dark:bg-gray-950 overflow-hidden">
            <aside className={`
                flex flex-col shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950
                w-full md:w-80
                ${view === "chat" ? "hidden md:flex" : "flex"}
            `}>
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                    <span className="font-semibold text-base tracking-tight text-gray-900 dark:text-gray-100">Inbox</span>
                    <div className="flex items-center gap-1">
                        {tab === "groups" && (
                            <button
                                onClick={() => setShowCreateGroup(true)}
                                className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                                aria-label="Create group"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                            </button>
                        )}
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
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-800">
                    <button
                        onClick={() => setTab("dm")}
                        className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                            tab === "dm"
                                ? "text-gray-900 dark:text-gray-100 border-b-2 border-gray-900 dark:border-gray-100"
                                : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                        }`}
                    >
                        Messages
                    </button>
                    <button
                        onClick={() => setTab("groups")}
                        className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                            tab === "groups"
                                ? "text-gray-900 dark:text-gray-100 border-b-2 border-gray-900 dark:border-gray-100"
                                : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                        }`}
                    >
                        Groups {groups.length > 0 && <span className="ml-1 text-gray-400">({groups.length})</span>}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Search */}
                    <div className="px-4 py-2">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder={tab === "dm" ? "Search conversations..." : "Search groups..."}
                            className="w-full bg-gray-100 dark:bg-gray-800 rounded-full px-4 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                        />
                    </div>
                    {loading ? (
                        <ConversationSkeleton />
                    ) : tab === "dm" ? (
                        filteredConversations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mb-2 opacity-40">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                                </svg>
                                <p className="text-sm">{searchQuery ? "No matching conversations" : "No conversations yet"}</p>
                            </div>
                        ) : (
                            filteredConversations.map(convo => (
                                <button
                                    key={convo.username}
                                    onClick={() => handleSelectConvo(convo)}
                                    className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-700 transition-colors text-left ${
                                        selectedConvo?.username === convo.username ? "bg-gray-100 dark:bg-gray-800" : ""
                                    }`}
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
                                            <UserBadges isVerified={convo.user?.isVerified} isAdmin={convo.user?.isAdmin} roles={convo.user?.roles || []} size="sm" />
                                            <OnlineDot username={convo.username} onlineMap={onlineMap} />
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                            {convo.lastMessage?.sender === user?.username ? "You: " : ""}
                                            {convo.lastMessage?.audioUrl && !convo.lastMessage?.text ? "\uD83C\uDFA4 Voice message" : convo.lastMessage?.imageUrl && !convo.lastMessage?.text ? "\uD83D\uDCF7 Photo" : convo.lastMessage?.text?.slice(0, 30) || "Message"} · {timeAgo(convo.lastMessage?.timeStamp)}
                                        </p>
                                    </div>
                                    {convo.unreadCount > 0 && (
                                        <span className="bg-blue-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                                            {convo.unreadCount > 9 ? "9+" : convo.unreadCount}
                                        </span>
                                    )}
                                </button>
                            ))
                        )
                    ) : (
                        filteredGroups.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mb-2 opacity-40">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                                </svg>
                                <p className="text-sm">{searchQuery ? "No matching groups" : "No groups yet"}</p>
                                <button
                                    onClick={() => setShowCreateGroup(true)}
                                    className="mt-2 text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors"
                                >
                                    Create a group
                                </button>
                            </div>
                        ) : (
                            filteredGroups.map(group => (
                                <button
                                    key={group._id}
                                    onClick={() => handleSelectGroup(group)}
                                    className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-700 transition-colors text-left ${
                                        selectedGroup?._id === group._id ? "bg-gray-100 dark:bg-gray-800" : ""
                                    }`}
                                >
                                    <div
                                        className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg select-none shrink-0"
                                        style={{ backgroundColor: group.members?.[0]?.color || "#3b82f6" }}
                                    >
                                        {group.avatarUrl ? (
                                            <img src={group.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                                        ) : (
                                            group.name?.[0]?.toUpperCase() ?? "G"
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{group.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                            {group.members?.length || 0} members
                                            {group.lastMessage?.text ? ` · ${group.lastMessage.sender}: ${group.lastMessage.text.slice(0, 25)}` : ""}
                                        </p>
                                    </div>
                                </button>
                            ))
                        )
                    )}
                </div>
            </aside>

            <main className={`
                flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-950
                ${view === "list" ? "hidden md:flex" : "flex"}
            `}>
                {selectedGroup ? (
                    <GroupChatBox
                        groupId={selectedGroup._id}
                        user={user}
                        group={selectedGroup}
                        onBack={handleBack}
                    />
                ) : (
                    <ChatBox
                        onBack={handleBack}
                        recipient={selectedConvo?.username}
                        recipientUser={selectedConvo?.user}
                    />
                )}
            </main>

            {showCreateGroup && (
                <CreateGroup
                    user={user}
                    onClose={() => setShowCreateGroup(false)}
                    onCreated={(group) => {
                        setGroups(prev => [group, ...prev]);
                        handleSelectGroup(group);
                    }}
                />
            )}
        </div>
    );
}
