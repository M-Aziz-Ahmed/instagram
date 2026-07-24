"use client";

import { useState, useEffect, useMemo } from "react";

let cachedFilter = null;
let fetchPromise = null;

function fetchFilter() {
    if (fetchPromise) return fetchPromise;
    fetchPromise = fetch("/api/admin/content-filter/public")
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null)
        .then((data) => {
            cachedFilter = data;
            return data;
        });
    return fetchPromise;
}

export default function ToxicText({ text, className = "" }) {
    const [filter, setFilter] = useState(cachedFilter);
    const [hovered, setHovered] = useState(false);

    useEffect(() => {
        if (!cachedFilter) {
            fetchFilter().then(setFilter);
        }
    }, []);

    const toxicWords = useMemo(() => {
        if (!filter?.toxicWords?.length || !filter?.blurToxicWords) return [];
        return filter.toxicWords.map((w) => w.toLowerCase());
    }, [filter]);

    if (!text || toxicWords.length === 0) {
        return <span className={className}>{text}</span>;
    }

    const parts = [];
    let remaining = text;
    let key = 0;

    const pattern = new RegExp(`(${toxicWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    const segments = text.split(pattern);

    for (const segment of segments) {
        if (!segment) continue;
        const isToxic = toxicWords.some((w) => segment.toLowerCase() === w);
        if (isToxic) {
            parts.push(
                <span
                    key={key++}
                    className={`inline-block transition-all duration-200 cursor-pointer select-none rounded ${
                        hovered
                            ? "blur-none text-red-500 dark:text-red-400 font-semibold"
                            : "blur-[5px] bg-gray-400/30 dark:bg-gray-500/30 text-transparent"
                    }`}
                    title={hovered ? segment : "Hover to reveal"}
                >
                    {segment}
                </span>
            );
        } else {
            parts.push(<span key={key++}>{segment}</span>);
        }
    }

    return (
        <span
            className={className}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {parts}
        </span>
    );
}
