"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || "dc6zaTOxFJmzC";
const GIPHY_BASE = "https://api.giphy.com/v1/gifs";

export default function GifPicker({ onSelect, onClose, className = "" }) {
    const [query, setQuery]       = useState("");
    const [gifs, setGifs]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [tab, setTab]           = useState("trending");
    const containerRef = useRef(null);
    const inputRef     = useRef(null);
    const abortRef     = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    useEffect(() => {
        const handleKey = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);

    const fetchGifs = useCallback(async (searchTerm, offset = 0) => {
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        setLoading(true);
        try {
            const url = searchTerm
                ? `${GIPHY_BASE}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(searchTerm)}&limit=24&offset=${offset}&rating=g&lang=en`
                : `${GIPHY_BASE}/trending?api_key=${GIPHY_KEY}&limit=24&offset=${offset}&rating=g`;
            const res = await fetch(url, { signal: abortRef.current.signal });
            const data = await res.json();
            setGifs(prev => offset === 0 ? (data.data || []) : [...prev, ...(data.data || [])]);
        } catch (e) {
            if (e.name !== "AbortError") {
                console.error("GIPHY fetch error:", e);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchGifs("", 0);
    }, [fetchGifs]);

    const handleSearch = (val) => {
        setQuery(val);
        setTab(val ? "search" : "trending");
        fetchGifs(val, 0);
    };

    const handleSelect = (gif) => {
        onSelect(gif.images?.fixed_height?.url || gif.images?.original?.url || gif.url);
    };

    return (
        <div
            ref={containerRef}
            className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}
            style={{ maxWidth: 340, width: '100%', maxHeight: 400 }}
        >
            {/* Search */}
            <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                <div className="relative">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
                        className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Search GIFs..."
                        className="w-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 rounded-xl pl-9 pr-3 py-2 outline-none"
                    />
                    {query && (
                        <button
                            onClick={() => handleSearch("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                <button
                    onClick={() => { setTab("trending"); setQuery(""); fetchGifs("", 0); }}
                    className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                        tab === "trending"
                            ? "bg-blue-500 text-white"
                            : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                >
                    Trending
                </button>
                <button
                    onClick={() => { setTab("reactions"); setQuery(""); fetchGifs("reactions", 0); }}
                    className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                        tab === "reactions"
                            ? "bg-blue-500 text-white"
                            : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                >
                    Reactions
                </button>
                <button
                    onClick={() => { setTab("animals"); setQuery(""); fetchGifs("cute animals", 0); }}
                    className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                        tab === "animals"
                            ? "bg-blue-500 text-white"
                            : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                >
                    Animals
                </button>
            </div>

            {/* GIF grid */}
            <div className="p-2 overflow-y-auto" style={{ maxHeight: 300 }}>
                {loading && gifs.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : gifs.length === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-8">No GIFs found</div>
                ) : (
                    <div className="grid grid-cols-2 gap-1">
                        {gifs.map((gif) => (
                            <button
                                key={gif.id}
                                onClick={() => handleSelect(gif)}
                                className="rounded-xl overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all relative group"
                            >
                                <img
                                    src={gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url}
                                    alt={gif.title || "GIF"}
                                    className="w-full h-auto block"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                            </button>
                        ))}
                    </div>
                )}
                {loading && gifs.length > 0 && (
                    <div className="flex items-center justify-center py-3">
                        <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                )}
            </div>

            {/* Powered by GIPHY */}
            <div className="px-3 py-1.5 border-t border-gray-100 dark:border-gray-800 text-center">
                <span className="text-[10px] text-gray-400">Powered by GIPHY</span>
            </div>
        </div>
    );
}
