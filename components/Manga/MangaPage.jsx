"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const COVER_URL = (id, fileName) =>
    fileName ? `https://uploads.mangadex.org/covers/${id}/${fileName}.256.jpg` : "";
const fmtNum = (n) => (n == null ? "?" : n.toLocaleString());

function MangaReader({ pages, title, chapterNum, onPrevChapter, onNextChapter, hasPrev, hasNext }) {
    const [currentPage, setCurrentPage] = useState(0);
    const [mode, setMode] = useState("page");
    const touchStart = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => { setCurrentPage(0); }, [pages]);

    useEffect(() => {
        const handler = (e) => {
            if (e.key === "ArrowRight" || e.key === " ") {
                e.preventDefault();
                setCurrentPage((p) => Math.min(p + 1, pages.length - 1));
            }
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                setCurrentPage((p) => Math.max(p - 1, 0));
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [pages.length]);

    const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
    const handleTouchEnd = (e) => {
        if (touchStart.current == null) return;
        const diff = touchStart.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) setCurrentPage((p) => Math.min(p + 1, pages.length - 1));
            else setCurrentPage((p) => Math.max(p - 1, 0));
        }
        touchStart.current = null;
    };

    if (!pages || pages.length === 0) return <div className="text-center py-8 text-gray-400 text-sm">No pages available</div>;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Ch. {chapterNum}</span>
                <div className="flex items-center gap-2">
                    <button onClick={() => setMode(mode === "page" ? "scroll" : "page")} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        {mode === "page" ? "📄 Page" : "📜 Scroll"}
                    </button>
                    <span className="text-gray-400">{currentPage + 1} / {pages.length}</span>
                </div>
            </div>

            {mode === "page" ? (
                <div
                    ref={containerRef}
                    className="flex justify-center bg-gray-900 rounded-xl overflow-hidden select-none"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    <img
                        src={pages[currentPage]}
                        alt={`Page ${currentPage + 1}`}
                        className="max-h-[80vh] w-auto object-contain"
                        draggable={false}
                    />
                </div>
            ) : (
                <div className="space-y-1">
                    {pages.map((url, i) => (
                        <img key={i} src={url} alt={`Page ${i + 1}`} className="w-full" loading="lazy" />
                    ))}
                </div>
            )}

            {mode === "page" && (
                <div className="flex items-center gap-2">
                    <input
                        type="range"
                        min={0}
                        max={pages.length - 1}
                        value={currentPage}
                        onChange={(e) => setCurrentPage(Number(e.target.value))}
                        className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
                    />
                </div>
            )}

            <div className="flex gap-2">
                <button
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 0))}
                    disabled={currentPage === 0}
                    className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 disabled:opacity-40 transition-colors"
                >
                    ← Prev
                </button>
                <button
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, pages.length - 1))}
                    disabled={currentPage === pages.length - 1}
                    className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 disabled:opacity-40 transition-colors"
                >
                    Next →
                </button>
            </div>
            <div className="flex gap-2">
                <button onClick={onPrevChapter} disabled={!hasPrev} className="flex-1 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-medium disabled:opacity-40 transition-colors">
                    ← Prev Chapter
                </button>
                <button onClick={onNextChapter} disabled={!hasNext} className="flex-1 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-medium disabled:opacity-40 transition-colors">
                    Next Chapter →
                </button>
            </div>
        </div>
    );
}

function ChapterList({ chapters, currentId, onSelect, loadingId }) {
    const [search, setSearch] = useState("");
    const [reversed, setReversed] = useState(false);
    const sorted = [...chapters].sort((a, b) => {
        const na = parseFloat(a.attributes?.chapter || "0");
        const nb = parseFloat(b.attributes?.chapter || "0");
        return reversed ? na - nb : nb - na;
    });
    const filtered = sorted.filter((ch) => {
        const q = search.toLowerCase();
        if (!q) return true;
        const num = ch.attributes?.chapter || "";
        const title = ch.attributes?.title || "";
        return num.includes(q) || title.toLowerCase().includes(q);
    });

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Search chapters..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button onClick={() => setReversed(!reversed)} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0">
                    {reversed ? "↑ Oldest" : "↓ Newest"}
                </button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-1 pr-1">
                {filtered.map((ch) => {
                    const attrs = ch.attributes || {};
                    const langs = (attrs.translatedLanguage || "").toUpperCase();
                    return (
                        <button
                            key={ch.id}
                            onClick={() => onSelect(ch)}
                            className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                                currentId === ch.id
                                    ? "bg-blue-500 text-white"
                                    : loadingId === ch.id
                                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600"
                                    : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-medium">{attrs.chapter ? `Ch. ${attrs.chapter}` : "?"}</span>
                                {langs && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-500 dark:text-gray-400">{langs}</span>}
                            </div>
                            {attrs.title && <p className="text-xs opacity-70 truncate mt-0.5">{attrs.title}</p>}
                        </button>
                    );
                })}
                {filtered.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No chapters found</p>
                )}
            </div>
        </div>
    );
}

export default function MangaPage() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [recent, setRecent] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [currentCh, setCurrentCh] = useState(null);
    const [pages, setPages] = useState([]);
    const [loadingChapter, setLoadingChapter] = useState(null);
    const searchTimer = useRef(null);

    useEffect(() => {
        fetch("/api/manga/recent?limit=18")
            .then((r) => r.json())
            .then((d) => { if (d?.data) setRecent(d.data.slice(0, 18)); })
            .catch(() => {});
    }, []);

    const doSearch = useCallback(async (q) => {
        if (!q.trim()) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/manga/search?q=${encodeURIComponent(q)}&limit=30`);
            const data = await res.json();
            setResults(data?.data || []);
        } catch { /* silent */ }
        setLoading(false);
    }, []);

    const handleSearchChange = (val) => {
        setQuery(val);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            if (val.trim()) doSearch(val);
            else setResults([]);
        }, 400);
    };

    const handleSelect = async (item) => {
        setSelected(item);
        setChapters([]);
        setCurrentCh(null);
        setPages([]);
        try {
            const res = await fetch(`/api/manga/chapters/${item.id}?limit=500&order=asc`);
            const data = await res.json();
            setChapters(data?.data || []);
        } catch { /* silent */ }
    };

    const handleReadChapter = async (ch) => {
        setCurrentCh(ch);
        setPages([]);
        setLoadingChapter(ch.id);
        try {
            const res = await fetch(`/api/manga/chapter/${ch.id}`);
            const data = await res.json();
            setPages(data?.pages || []);
        } catch { /* silent */ }
        setLoadingChapter(null);
    };

    const getCover = (item) => {
        const rel = (item.relationships || []).find((r) => r.type === "cover_art");
        return COVER_URL(item.id, rel?.attributes?.fileName);
    };

    const getDesc = (item) => {
        const desc = item.attributes?.description;
        if (!desc) return "";
        return desc.en || Object.values(desc)[0] || "";
    };

    const getTags = (item) => {
        return (item.attributes?.tags || []).map((t) => t.attributes?.name?.en).filter(Boolean).slice(0, 6);
    };

    const handleBack = () => {
        if (pages.length > 0) { setPages([]); setCurrentCh(null); }
        else if (selected) { setSelected(null); setChapters([]); }
    };

    const chapterIdx = chapters.findIndex((c) => c.id === currentCh?.id);
    const view = pages.length > 0 ? "reader" : selected ? "detail" : "grid";

    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950">
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
                <div className="max-w-6xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center gap-3">
                    {view !== "grid" && (
                        <button onClick={handleBack} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 p-1 -ml-1 shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                    )}
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-lg">📚</span>
                        <h1 className="font-black text-lg text-gray-900 dark:text-gray-100">Manga</h1>
                    </div>
                    <div className="flex-1 max-w-lg">
                        <input
                            type="text"
                            placeholder="Search manga..."
                            value={query}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) doSearch(query); }}
                            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-full text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-400"
                        />
                    </div>
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4">
                {/* Reader View */}
                {view === "reader" && currentCh && (
                    <MangaReader
                        pages={pages}
                        title={selected?.attributes?.title?.en || ""}
                        chapterNum={currentCh.attributes?.chapter || "?"}
                        hasPrev={chapterIdx > 0}
                        hasNext={chapterIdx < chapters.length - 1}
                        onPrevChapter={() => chapterIdx > 0 && handleReadChapter(chapters[chapterIdx - 1])}
                        onNextChapter={() => chapterIdx < chapters.length - 1 && handleReadChapter(chapters[chapterIdx + 1])}
                    />
                )}

                {/* Detail View */}
                {view === "detail" && selected && (
                    <div className="flex flex-col lg:flex-row gap-6">
                        <div className="lg:w-1/3 shrink-0">
                            <img src={getCover(selected)} alt={selected.attributes?.title?.en || ""} className="w-full max-w-xs mx-auto lg:mx-0 rounded-xl shadow-lg" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-3">
                            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100">
                                {selected.attributes?.title?.en || Object.values(selected.attributes?.title || {})[0] || "Unknown"}
                            </h2>
                            {selected.attributes?.altTitles?.slice(0, 3).map((alt, i) => {
                                const val = alt.en || Object.values(alt)[0];
                                return val ? <p key={i} className="text-xs text-gray-400">{val}</p> : null;
                            })}
                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                                {selected.attributes?.status && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs capitalize">{selected.attributes.status}</span>}
                                {selected.attributes?.year && <span>{selected.attributes.year}</span>}
                                {selected.attributes?.originalLanguage && <span className="uppercase text-xs">{selected.attributes.originalLanguage}</span>}
                            </div>
                            {getTags(selected).length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {getTags(selected).map((g) => (
                                        <span key={g} className="px-2.5 py-1 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 rounded-full text-xs font-medium">{g}</span>
                                    ))}
                                </div>
                            )}
                            {getDesc(selected) && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line line-clamp-8">{getDesc(selected)}</p>
                            )}
                        </div>
                        <div className="lg:w-72 shrink-0">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">Chapters ({chapters.length})</h3>
                            <ChapterList chapters={chapters} currentId={currentCh?.id} onSelect={handleReadChapter} loadingId={loadingChapter} />
                        </div>
                    </div>
                )}

                {/* Grid View */}
                {view === "grid" && (
                    <>
                        {results.length === 0 && recent.length === 0 && !loading && (
                            <div className="text-center py-16">
                                <span className="text-5xl mb-4 block">📚</span>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">Search for manga to start reading</p>
                            </div>
                        )}
                        {results.length === 0 && recent.length > 0 && !query && (
                            <div className="mb-8">
                                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Recently Updated</h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {recent.map((item) => (
                                        <button key={item.id} onClick={() => handleSelect(item)} className="group text-left">
                                            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                                                <img src={getCover(item)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                                            </div>
                                            <p className="mt-1.5 text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                                                {item.attributes?.title?.en || Object.values(item.attributes?.title || {})[0] || ""}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {results.length > 0 && (
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">{query ? `Results for "${query}"` : "Browse"}</h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {results.map((item) => (
                                        <button key={item.id} onClick={() => handleSelect(item)} className="group text-left">
                                            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                                                <img src={getCover(item)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                                            </div>
                                            <p className="mt-1.5 text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                                                {item.attributes?.title?.en || Object.values(item.attributes?.title || {})[0] || ""}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {loading && (
                            <div className="flex justify-center py-12">
                                <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="max-w-6xl mx-auto px-4 py-6 text-center border-t border-gray-100 dark:border-gray-800 mt-8">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                    Free manga reading powered by MangaDex.{" "}
                    <a href="https://mangaplus.shueisha.co.jp" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Read official releases on MangaPlus</a>
                </p>
            </div>
        </div>
    );
}
