"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@/context/UserContext";
import { timeAgo } from "@/utils/timeAgo";

const STORY_DURATION = 5000;

export default function StoryViewer({ groups, initialIdx, onClose, onSeen }) {
    const { user } = useUser();
    const [groupIdx, setGroupIdx] = useState(initialIdx || 0);
    const [storyIdx, setStoryIdx] = useState(0);
    const [progress, setProgress] = useState(0);
    const [replyText, setReplyText] = useState("");
    const [sending, setSending] = useState(false);
    const timerRef = useRef(null);
    const startRef = useRef(null);

    const group = groups[groupIdx];
    const story = group?.stories[storyIdx];

    const advance = useCallback(() => {
        if (!group) return;
        if (storyIdx < group.stories.length - 1) {
            setStoryIdx((i) => i + 1);
            setProgress(0);
        } else if (groupIdx < groups.length - 1) {
            setGroupIdx((i) => i + 1);
            setStoryIdx(0);
            setProgress(0);
        } else {
            onClose();
        }
    }, [group, storyIdx, groupIdx, groups.length, onClose]);

    const goBack = useCallback(() => {
        if (storyIdx > 0) {
            setStoryIdx((i) => i - 1);
            setProgress(0);
        } else if (groupIdx > 0) {
            setGroupIdx((i) => i - 1);
            setStoryIdx(groups[groupIdx - 1]?.stories.length - 1 || 0);
            setProgress(0);
        }
    }, [storyIdx, groupIdx, groups]);

    useEffect(() => {
        if (!story) return;
        startRef.current = Date.now();
        setProgress(0);

        if (user && story.sender !== user.username && !story.views?.includes(user.username)) {
            fetch(`/api/stories/${story._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, action: "view" }),
            }).then(() => onSeen?.());
        }

        const tick = () => {
            const elapsed = Date.now() - startRef.current;
            const pct = Math.min(elapsed / STORY_DURATION, 1);
            setProgress(pct);
            if (pct >= 1) {
                advance();
            } else {
                timerRef.current = requestAnimationFrame(tick);
            }
        };
        timerRef.current = requestAnimationFrame(tick);
        
        // Ensure cleanup happens properly
        return () => {
            if (timerRef.current) {
                cancelAnimationFrame(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [story, advance, onSeen, user]);

    const handleReply = async () => {
        if (!replyText.trim() || sending || !story) return;
        setSending(true);
        try {
            await fetch(`/api/stories/${story._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, action: "reply", text: replyText.trim() }),
            });
            setReplyText("");
            advance();
        } catch { /* silent */ }
        setSending(false);
    };

    if (!group || !story) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* Close/Back button */}
            <button 
                onClick={onClose} 
                className="absolute top-4 left-4 z-50 text-white/80 hover:text-white p-2 flex items-center gap-2"
                aria-label="Close story viewer"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
                <span className="text-sm font-medium">Back</span>
            </button>

            {/* Progress bars */}
            <div className="absolute top-3 left-3 right-3 z-50 flex gap-1">
                {group.stories.map((s, i) => (
                    <div key={s._id} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-white rounded-full transition-none"
                            style={{
                                width: i < storyIdx ? "100%" : i === storyIdx ? `${progress * 100}%` : "0%",
                            }}
                        />
                    </div>
                ))}
            </div>

            {/* Header */}
            <div className="absolute top-6 left-3 right-3 z-50 flex items-center gap-2">
                {group.avatarUrl ? (
                    <img src={group.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-white/30" />
                ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: group.color }}>
                        {group.sender[0]?.toUpperCase()}
                    </div>
                )}
                <span className="text-white text-sm font-semibold">{group.sender}</span>
                <span className="text-white/50 text-xs">{timeAgo(story.createdAt)}</span>
            </div>

            {/* Content */}
            <div className="w-full h-full flex items-center justify-center">
                {story.imageUrl ? (
                    <img src={story.imageUrl} alt="" className="w-full h-full object-contain" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center p-8" style={{ backgroundColor: story.bgColor || "#1a1a2e" }}>
                        <p className="text-white text-xl font-medium text-center leading-relaxed whitespace-pre-wrap">{story.text}</p>
                    </div>
                )}
            </div>

            {/* Tap zones */}
            <button onClick={goBack} className="absolute left-0 top-0 bottom-0 w-1/3 z-40" aria-label="Previous" />
            <button onClick={advance} className="absolute right-0 top-0 bottom-0 w-1/3 z-40" aria-label="Next" />

            {/* Reply input */}
            {user && (
                <div className="absolute bottom-4 left-3 right-3 z-50 flex gap-2">
                    <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleReply()}
                        placeholder={`Reply to ${group.sender}...`}
                        className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-4 py-2.5 text-white text-sm placeholder-white/50 outline-none focus:border-white/40"
                    />
                    {replyText.trim() && (
                        <button
                            onClick={handleReply}
                            disabled={sending}
                            className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-full transition-colors"
                        >
                            Send
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
