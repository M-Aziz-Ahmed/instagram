"use client";

import { useEffect, useRef, useState } from "react";

const REACTIONS = [
    { emoji: "❤️", label: "Love" },
    { emoji: "😂", label: "Haha" },
    { emoji: "😮", label: "Wow" },
    { emoji: "😢", label: "Sad" },
    { emoji: "🔥", label: "Fire" },
    { emoji: "👍", label: "Like" },
];

export default function ReactionPicker({ onSelect, visible, onClose }) {
    const ref = useRef(null);

    useEffect(() => {
        if (!visible) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) onClose();
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [visible, onClose]);

    if (!visible) return null;

    return (
        <div
            ref={ref}
            className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-800 rounded-full shadow-xl border border-gray-200 dark:border-gray-700 px-2 py-1.5 flex gap-0.5 z-30 animate-in"
        >
            {REACTIONS.map(({ emoji, label }) => (
                <button
                    key={emoji}
                    onClick={() => { onSelect(emoji); onClose(); }}
                    title={label}
                    className="w-10 h-10 flex items-center justify-center text-xl hover:scale-125 transition-transform rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                    {emoji}
                </button>
            ))}
        </div>
    );
}

export { REACTIONS };
