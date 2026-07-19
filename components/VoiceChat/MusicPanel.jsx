"use client";

import { useState, useCallback, useEffect } from "react";

const YTMUSIC_THUMB = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

function formatDuration(sec) {
    if (!sec) return "";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

function SearchIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
    );
}

function PlayIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
        </svg>
    );
}

function PauseIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H13v1.25a.75.75 0 0 1-1.5 0V18H9v1.25a.75.75 0 0 1-1.5 0V18H5.75A2.75 2.75 0 0 1 3 15.25v-8.5A2.75 2.75 0 0 1 5.75 4H6V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
        </svg>
    );
}

function SkipIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
    );
}

function MusicNoteIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
        </svg>
    );
}

function QueueIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
    );
}

function Spinner() {
    return <div className="w-4 h-4 border-2 border-gray-500 border-t-white rounded-full animate-spin" />;
}

export default function MusicPanel({ socket, channelId, user }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [musicState, setMusicState] = useState(null);
    const [activeTab, setActiveTab] = useState("search");

    const isDJ = musicState?.dj === user?.username;
    const current = musicState?.current;
    const queue = musicState?.queue || [];
    const playing = musicState?.playing || false;

    useEffect(() => {
        if (!socket || !channelId) return;
        const handleState = (state) => setMusicState(state);
        socket.on("voice:music:state", handleState);
        return () => socket.off("voice:music:state", handleState);
    }, [socket, channelId]);

    const search = async () => {
        if (!query.trim() || searching) return;
        setSearching(true);
        try {
            const res = await fetch(`/api/music/search?q=${encodeURIComponent(query.trim())}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data.results || []);
                setActiveTab("search");
            }
        } catch {}
        setSearching(false);
    };

    const addSong = (song) => {
        if (!socket || !channelId) return;
        socket.emit("voice:music:add", { channelId, song });
    };

    const playSong = (songId) => {
        if (!socket || !channelId || !isDJ) return;
        socket.emit("voice:music:play", { channelId, songId });
    };

    const togglePlayPause = () => {
        if (!socket || !channelId || !isDJ) return;
        if (playing) {
            socket.emit("voice:music:pause", { channelId });
        } else if (current) {
            socket.emit("voice:music:play", { channelId });
        } else if (queue.length > 0) {
            socket.emit("voice:music:play", { channelId, songId: queue[0].id });
        }
    };

    const skip = () => {
        if (!socket || !channelId || !isDJ) return;
        socket.emit("voice:music:skip", { channelId });
    };

    const removeSong = (songId) => {
        if (!socket || !channelId) return;
        socket.emit("voice:music:remove", { channelId, songId });
    };

    const clearQueue = () => {
        if (!socket || !channelId || !isDJ) return;
        socket.emit("voice:music:clear", { channelId });
    };

    if (!channelId) return null;

    return (
        <div className="flex flex-col h-full bg-gray-950">
            {/* Tabs */}
            <div className="flex border-b border-white/10 shrink-0">
                <button
                    onClick={() => setActiveTab("search")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                        activeTab === "search" ? "text-green-400 border-b-2 border-green-400" : "text-gray-500 hover:text-gray-300"
                    }`}
                >
                    <MusicNoteIcon /> Search
                </button>
                <button
                    onClick={() => setActiveTab("queue")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors relative ${
                        activeTab === "queue" ? "text-green-400 border-b-2 border-green-400" : "text-gray-500 hover:text-gray-300"
                    }`}
                >
                    <QueueIcon /> Queue
                    {queue.length > 0 && (
                        <span className="absolute top-1.5 right-4 w-4 h-4 rounded-full bg-green-500/20 text-green-400 text-[10px] flex items-center justify-center font-bold">
                            {queue.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Currently Playing */}
            {current && (
                <div className="px-3 py-3 border-b border-white/10 shrink-0">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Now Playing</p>
                    <div className="flex items-center gap-3">
                        <img
                            src={current.thumbnail || YTMUSIC_THUMB(current.videoId)}
                            alt=""
                            className="w-12 h-12 rounded-lg object-cover bg-white/5"
                        />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{current.title}</p>
                            <p className="text-[10px] text-gray-500 truncate">{current.addedBy ? `Added by @${current.addedBy}` : ""}</p>
                        </div>
                        {isDJ && (
                            <div className="flex items-center gap-1">
                                <button onClick={togglePlayPause} className="p-1.5 rounded-full bg-green-500 hover:bg-green-400 text-white transition-colors">
                                    {playing ? <PauseIcon /> : <PlayIcon />}
                                </button>
                                <button onClick={skip} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                                    <SkipIcon />
                                </button>
                            </div>
                        )}
                    </div>
                    {/* Volume for DJ */}
                    {isDJ && (
                        <div className="flex items-center gap-2 mt-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 text-gray-500">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                            </svg>
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={musicState?.volume ?? 0.7}
                                onChange={(e) => socket?.emit("voice:music:volume", { channelId, volume: parseFloat(e.target.value) })}
                                className="flex-1 h-1 accent-green-500"
                            />
                        </div>
                    )}
                    {!isDJ && musicState?.dj && (
                        <p className="text-[10px] text-gray-600 mt-1">DJ: @{musicState.dj}</p>
                    )}
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === "search" ? (
                    <div className="p-3">
                        {/* Search bar */}
                        <div className="flex gap-2 mb-3">
                            <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                                <SearchIcon />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && search()}
                                    placeholder="Search YouTube..."
                                    className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 outline-none"
                                />
                            </div>
                            <button
                                onClick={search}
                                disabled={!query.trim() || searching}
                                className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded-xl transition-colors"
                            >
                                {searching ? <Spinner /> : "Search"}
                            </button>
                        </div>

                        {/* Results */}
                        {results.length > 0 ? (
                            <div className="space-y-1">
                                {results.map((r) => (
                                    <div key={r.videoId} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 transition-colors group">
                                        <div className="relative shrink-0">
                                            <img src={r.thumbnail} alt="" className="w-16 h-10 rounded-lg object-cover bg-white/5" loading="lazy" />
                                            {r.durationText && (
                                                <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[9px] px-1 rounded font-medium">
                                                    {r.durationText}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-gray-200 truncate">{r.title}</p>
                                            <p className="text-[10px] text-gray-500 truncate">{r.channelName} {r.viewCount ? `· ${r.viewCount}` : ""}</p>
                                        </div>
                                        <button
                                            onClick={() => addSong(r)}
                                            className="p-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                            title="Add to queue"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : !searching && query.trim() ? (
                            <p className="text-xs text-gray-500 text-center py-8">No results found</p>
                        ) : !searching ? (
                            <div className="text-center py-8">
                                <MusicNoteIcon />
                                <p className="text-xs text-gray-500 mt-2">Search for songs to add to the queue</p>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className="p-3">
                        {queue.length > 0 ? (
                            <>
                                {isDJ && (
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] text-gray-500">{queue.length} song{queue.length !== 1 ? "s" : ""} in queue</span>
                                        <button onClick={clearQueue} className="text-[10px] text-red-400 hover:text-red-300 transition-colors">Clear all</button>
                                    </div>
                                )}
                                <div className="space-y-1">
                                    {queue.map((song, idx) => (
                                        <div key={song.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 transition-colors group">
                                            <span className="text-[10px] text-gray-600 w-4 text-center shrink-0">{idx + 1}</span>
                                            <img src={song.thumbnail || YTMUSIC_THUMB(song.videoId)} alt="" className="w-10 h-7 rounded object-cover bg-white/5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-gray-200 truncate">{song.title}</p>
                                                <p className="text-[10px] text-gray-500">@{song.addedBy} {song.durationText ? `· ${song.durationText}` : ""}</p>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                {isDJ && (
                                                    <button onClick={() => playSong(song.id)} className="p-1 rounded bg-green-600/20 text-green-400 hover:bg-green-600/40 transition-colors" title="Play now">
                                                        <PlayIcon />
                                                    </button>
                                                )}
                                                {(isDJ || song.addedBy === user?.username) && (
                                                    <button onClick={() => removeSong(song.id)} className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors" title="Remove">
                                                        <TrashIcon />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-xs text-gray-500 text-center py-8">Queue is empty. Search and add songs!</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
