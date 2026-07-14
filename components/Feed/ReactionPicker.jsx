"use client";

import { useState } from "react";

const REACTIONS = [
    { type: "like", emoji: "👍", label: "Like" },
    { type: "love", emoji: "❤️", label: "Love" },
    { type: "laugh", emoji: "😂", label: "Laugh" },
    { type: "fire", emoji: "🔥", label: "Fire" },
    { type: "sad", emoji: "😢", label: "Sad" },
    { type: "angry", emoji: "😠", label: "Angry" },
];

export default function ReactionPicker({ onReact, currentReaction, className = "" }) {
    const [show, setShow] = useState(false);

    const handleReaction = (type) => {
        onReact(type);
        setShow(false);
    };

    return (
        <div className={`relative ${className}`}>
            {/* Main button */}
            <button
                onClick={() => setShow(!show)}
                onBlur={() => setTimeout(() => setShow(false), 200)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="React"
            >
                {currentReaction ? (
                    <span className="text-xl">
                        {REACTIONS.find(r => r.type === currentReaction)?.emoji || "👍"}
                    </span>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-gray-600 dark:text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
                    </svg>
                )}
            </button>

            {/* Reaction picker popup */}
            {show && (
                <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-900 rounded-full shadow-2xl border border-gray-200 dark:border-gray-700 px-2 py-2 flex gap-1 z-10 animate-scale-in">
                    {REACTIONS.map((reaction) => (
                        <button
                            key={reaction.type}
                            onClick={() => handleReaction(reaction.type)}
                            className={`text-2xl p-2 hover:scale-125 transition-transform rounded-full ${
                                currentReaction === reaction.type ? "bg-blue-100 dark:bg-blue-900/30" : "hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                            title={reaction.label}
                            aria-label={reaction.label}
                        >
                            {reaction.emoji}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// Show reaction counts
export function ReactionCounts({ reactions, onReactionClick }) {
    if (!reactions) return null;

    const counts = REACTIONS.map(r => ({
        ...r,
        count: reactions[r.type]?.length || 0,
        users: reactions[r.type] || [],
    })).filter(r => r.count > 0);

    if (counts.length === 0) return null;

    return (
        <div className="flex gap-1.5 flex-wrap">
            {counts.map((reaction) => (
                <button
                    key={reaction.type}
                    onClick={() => onReactionClick?.(reaction)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs font-medium"
                    title={`${reaction.count} ${reaction.label}`}
                >
                    <span className="text-base leading-none">{reaction.emoji}</span>
                    <span className="text-gray-700 dark:text-gray-300">{reaction.count}</span>
                </button>
            ))}
        </div>
    );
}
