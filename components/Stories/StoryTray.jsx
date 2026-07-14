"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import StoryViewer from "./StoryViewer";
import CreateStory from "./CreateStory";

export default function StoryTray() {
    const { user } = useUser();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeIdx, setActiveIdx] = useState(null);
    const [showCreate, setShowCreate] = useState(false);

    const fetchStories = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch(`/api/stories?username=${encodeURIComponent(user.username)}`);
            if (res.ok) setGroups(await res.json());
        } catch { /* silent */ }
        setLoading(false);
    }, [user]);

    useEffect(() => {
        fetchStories();
        const id = setInterval(fetchStories, 30000);
        return () => clearInterval(id);
    }, [fetchStories]);

    const myGroup = groups.find((g) => g.sender === user?.username);
    const otherGroups = groups.filter((g) => g.sender !== user?.username);

    if (loading) {
        return (
            <div className="flex gap-4 px-4 py-4 overflow-x-auto">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
                        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
                        <div className="w-10 h-2.5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <>
            <div className="flex gap-4 px-4 py-4 overflow-x-auto scrollbar-hide">
                {/* Create story button */}
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex flex-col items-center gap-1.5 shrink-0 group"
                >
                    <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden border-2 border-gray-200 dark:border-gray-700">
                            {myGroup ? (
                                <div className="w-full h-full rounded-full overflow-hidden">
                                    {myGroup.stories[0]?.imageUrl ? (
                                        <img src={myGroup.stories[0].imageUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: myGroup.color || user?.avatarColor || "#3b82f6" }}>
                                            {user?.username?.[0]?.toUpperCase()}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                                    {user?.avatarUrl ? (
                                        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-lg font-bold text-white" style={{ backgroundColor: user?.avatarColor || "#3b82f6" }}>{user?.username?.[0]?.toUpperCase()}</span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white border-2 border-white dark:border-gray-950">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                        </div>
                    </div>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                        {myGroup ? "Your story" : "Create"}
                    </span>
                </button>

                {/* Other stories */}
                {otherGroups.map((group, i) => {
                    const globalIdx = groups.indexOf(group);
                    return (
                        <button
                            key={group.sender}
                            onClick={() => setActiveIdx(globalIdx)}
                            className="flex flex-col items-center gap-1.5 shrink-0"
                        >
                            <div className={`w-16 h-16 rounded-full p-0.5 ${group.seen ? "bg-gray-200 dark:bg-gray-700" : "bg-gradient-to-br from-yellow-400 via-red-500 to-purple-500"}`}>
                                <div className="w-full h-full rounded-full overflow-hidden border-2 border-white dark:border-gray-950">
                                    {group.avatarUrl ? (
                                        <img src={group.avatarUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: group.color || "#3b82f6" }}>
                                            {group.sender[0]?.toUpperCase()}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span className={`text-[11px] font-medium truncate max-w-[64px] ${group.seen ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-gray-100"}`}>
                                {group.sender}
                            </span>
                        </button>
                    );
                })}
            </div>

            {activeIdx !== null && (
                <StoryViewer
                    groups={otherGroups}
                    initialIdx={otherGroups.indexOf(groups[activeIdx])}
                    onClose={() => setActiveIdx(null)}
                    onSeen={fetchStories}
                />
            )}

            {showCreate && (
                <CreateStory onClose={() => { setShowCreate(false); fetchStories(); }} />
            )}
        </>
    );
}
