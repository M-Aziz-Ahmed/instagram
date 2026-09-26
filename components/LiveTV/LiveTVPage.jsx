"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import MediaPlayer from "@/components/Media/MediaPlayer";
import ImportDataButton from "@/components/common/ImportDataButton";
import MediaBookmarkButton from "@/components/shared/MediaBookmarkButton";

const fmtNum = (n) => (n == null ? "?" : n.toLocaleString());

export default function LiveTVPage({ embedded = false }) {
    const [query, setQuery] = useState("");
    const [channels, setChannels] = useState([]);
    const [filteredChannels, setFilteredChannels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [streamUrl, setStreamUrl] = useState("");
    const [streamTitle, setStreamTitle] = useState("");
    const [streamSources, setStreamSources] = useState([]);
    const [streamSubtitles, setStreamSubtitles] = useState([]);
    const [streamHeaders, setStreamHeaders] = useState(null);
    const [streamEmbedUrls, setStreamEmbedUrls] = useState([]);
    const searchTimer = useRef(null);
    const searchParams = useSearchParams();
    const initialId = searchParams.get("id");
    const didInit = useRef(false);

    const fetchChannels = useCallback(async () => {
        const res = await fetch("/api/media/iptv/playlist");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data?.channels?.length > 0) {
            const formatted = data.channels.map((ch, i) => ({
                id: `iptv:${i}`,
                name: ch.name,
                title: ch.name,
                logo: ch.logo,
                group: ch.group,
                url: ch.url,
            }));
            return formatted;
        }
        return [];
    }, []);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                setLoading(true);
                const formatted = await fetchChannels();
                if (mounted) {
                    setChannels(formatted);
                    setFilteredChannels(formatted);
                }
            } catch (err) {
                console.error("Failed to load IPTV channels:", err);
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [fetchChannels]);

    const handleSelect = useCallback((item) => {
        setSelected(item);
        setStreamUrl(item.url);
        setStreamTitle(item.name);
        setStreamSources([]);
        setStreamSubtitles([]);
        setStreamHeaders(null);
        setStreamEmbedUrls([]);
        window.history.pushState({}, "", `/live-tv?id=${item.id}`);
    }, []);

    useEffect(() => {
        if (!initialId || didInit.current) return;
        didInit.current = true;
        const channel = channels.find(c => c.id === initialId);
        if (channel) {
            // Defer to avoid setState in effect warning
            setTimeout(() => handleSelect(channel), 0);
        }
    }, [initialId, channels, handleSelect]);

    const handleSearchChange = (val) => {
        setQuery(val);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            if (val.trim()) {
                const filtered = channels.filter(c =>
                    c.name.toLowerCase().includes(val.toLowerCase()) ||
                    c.group.toLowerCase().includes(val.toLowerCase())
                );
                setFilteredChannels(filtered);
            } else {
                setFilteredChannels(channels);
            }
        }, 200);
    };

    const handleBack = () => {
        if (streamUrl) {
            setStreamUrl("");
            setStreamSources([]);
            setStreamSubtitles([]);
            setStreamHeaders(null);
            setStreamEmbedUrls([]);
            if (selected?.id) window.history.pushState({}, "", `/live-tv?id=${selected.id}`);
        } else if (selected) {
            setSelected(null);
            window.history.pushState({}, "", "/live-tv");
        }
    };

    const hasStream = Boolean(streamUrl) || (streamSources && streamSources.length > 0);
    const view = hasStream ? "player" : selected ? "detail" : "grid";

    const groupChannels = (chList) => {
        const groups = {};
        chList.forEach(ch => {
            const group = ch.group || "Other";
            if (!groups[group]) groups[group] = [];
            groups[group].push(ch);
        });
        return groups;
    };

    return (
        <div className={embedded ? "" : "min-h-dvh app-bg"}>
            {embedded ? (
                <div className="flex items-center gap-2 mb-4">
                    <div className="flex-1 max-w-lg">
                        <input
                            type="text"
                            placeholder="Search channels..."
                            value={query}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            aria-label="Search channels"
                            className="input"
                        />
                    </div>
                    <ImportDataButton size="sm" onSuccess={() => window.location.reload()} />
                </div>
            ) : (
                <header className="app-header">
                    <div className="max-w-6xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center gap-3">
                        {view !== "grid" && (
                            <button onClick={handleBack} className="btn-ghost p-1.5 -ml-1 shrink-0" aria-label="Back">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                </svg>
                            </button>
                        )}
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-lg">📺</span>
                            <h1 className="app-title text-lg text-gray-900 dark:text-gray-100">Live TV</h1>
                        </div>
                        <div className="flex-1 max-w-lg">
                            <input
                                type="text"
                                placeholder="Search channels..."
                                value={query}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                className="input"
                            />
                        </div>
                        <ImportDataButton size="sm" onSuccess={() => window.location.reload()} />
                    </div>
                </header>
            )}

            <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4">
                {/* Player View */}
                {view === "player" && (
                    <div className="space-y-4">
                        <MediaPlayer
                            src={streamUrl}
                            title={streamTitle}
                            poster={selected?.logo}
                            onBack={handleBack}
                            sources={streamSources.length > 0 ? streamSources : undefined}
                            subtitles={streamSubtitles.length > 0 ? streamSubtitles : undefined}
                            headers={streamHeaders || undefined}
                            embedUrls={streamEmbedUrls.length > 0 ? streamEmbedUrls : undefined}
                        />
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{streamTitle}</p>
                        <div className="max-h-[50vh] overflow-y-auto space-y-1 pr-1">
                            {filteredChannels.map((ch) => (
                                <button
                                    key={ch.id}
                                    onClick={() => handleSelect(ch)}
                                    className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                                        selected?.id === ch.id
                                            ? "bg-blue-500 text-white"
                                            : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{ch.name}</span>
                                        <span className="text-xs text-gray-400">{ch.group}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Detail View */}
                {view === "detail" && selected && (
                    <div className="flex flex-col lg:flex-row gap-6">
                        <div className="lg:w-1/3 shrink-0">
                            {selected.logo && (
                                <img
                                    src={selected.logo}
                                    alt={selected.name}
                                    className="w-full max-w-xs mx-auto lg:mx-0 rounded-xl shadow-lg aspect-[16/9] object-cover bg-gray-100 dark:bg-gray-800"
                                />
                            )}
                            <button
                                onClick={() => {
                                    setStreamUrl(selected.url);
                                    setStreamTitle(selected.name);
                                    setStreamEmbedUrls([]);
                                }}
                                className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors text-sm"
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                                Watch Live
                            </button>
                        </div>
                        <div className="flex-1 min-w-0 space-y-3">
                            <div className="flex items-start gap-3">
                                <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 flex-1">{selected.name}</h2>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                                <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs capitalize">{selected.group}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Grid View */}
                {view === "grid" && (
                    <>
                        {loading && (
                            <div className="flex justify-center py-12">
                                <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
                            </div>
                        )}
                        {!loading && filteredChannels.length === 0 && (
                            <div className="text-center py-16">
                                <span className="text-5xl mb-4 block">📺</span>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">No channels found</p>
                            </div>
                        )}
                        {!loading && filteredChannels.length > 0 && (
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">
                                    {query ? `Results for "${query}"` : "All Channels"} ({filteredChannels.length})
                                </h2>
                                {Object.entries(groupChannels(filteredChannels)).map(([group, chs]) => (
                                    <div key={group} className="mb-8">
                                        <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">{group}</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                            {chs.map((item) => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => handleSelect(item)}
                                                    className="group text-left"
                                                >
                                                    <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                                                        {item.logo ? (
                                                            <img src={item.logo} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-3xl">📺</div>
                                                        )}
                                                    </div>
                                                    <p className="mt-1.5 text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-1">{item.name}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {!embedded && (
                <div className="max-w-6xl mx-auto px-4 py-6 text-center border-t border-gray-100 dark:border-gray-800 mt-8">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                        Live TV channels from <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">iptv-org</a>
                    </p>
                </div>
            )}
        </div>
    );
}