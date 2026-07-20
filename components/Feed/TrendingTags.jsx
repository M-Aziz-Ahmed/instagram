"use client";

import { useEffect, useState } from "react";

export default function TrendingTags({ activeTag, onTagClick }) {
    const [tags, setTags] = useState([]);

    useEffect(() => {
        fetch("/api/hashtags/trending")
            .then((r) => r.ok ? r.json() : [])
            .then(setTags)
            .catch(() => {});
    }, []);

    if (tags.length === 0) return null;

    return (
        <aside className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-20 bg-gray-50 dark:bg-gray-900 rounded-2xl p-4">
                <h2 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-3">Trending</h2>
                <ul className="flex flex-col gap-1">
                    {tags.map(({ tag, count }) => (
                        <li key={tag}>
                            <button
                                onClick={() => onTagClick(tag === activeTag ? null : tag)}
                                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors min-h-[44px] ${
                                    tag === activeTag
                                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                                        : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200"
                                }`}
                            >
                                <span className="font-bold text-sm">#{tag}</span>
                                <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">{count} post{count !== 1 ? "s" : ""}</span>
                            </button>
                        </li>
                    ))}
                </ul>

                {activeTag && (
                    <button
                        onClick={() => onTagClick(null)}
                        className="mt-3 w-full text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-center"
                    >
                        &#x2715; Clear filter
                    </button>
                )}
            </div>
        </aside>
    );
}
