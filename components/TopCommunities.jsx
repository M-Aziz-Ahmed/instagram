"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function TopCommunities() {
    const [communities, setCommunities] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/communities?sort=memberCount&limit=5")
            .then((r) => r.json())
            .then((d) => { setCommunities(Array.isArray(d) ? d.slice(0, 5) : []); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    if (loading) return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex justify-center py-4">
                <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
        </div>
    );

    if (!communities.length) return null;

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">Top Communities</h3>
            </div>
            <div className="p-4 space-y-3">
                {communities.map((c, i) => (
                    <Link key={c._id} href={`/communities/${c._id}`}
                        className="flex items-center gap-3 group">
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-4 text-center shrink-0">{i + 1}</span>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden"
                            style={{ backgroundColor: c.color || "#3b82f6" }}>
                            {c.avatarUrl ? (
                                <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                c.name?.[0]?.toUpperCase()
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:underline">
                                {c.name}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                                {c.memberCount || 0} member{(c.memberCount || 0) !== 1 ? "s" : ""}
                            </p>
                        </div>
                    </Link>
                ))}
            </div>
            <Link href="/communities"
                className="block px-4 py-3 text-sm font-semibold text-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 transition-colors text-center">
                See All
            </Link>
        </div>
    );
}
