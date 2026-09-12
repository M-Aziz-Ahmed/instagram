"use client";

import { useEffect, useRef, useState } from "react";

const SHORTCUTS = [
    { name: "Google", emoji: "🔍", url: "https://www.google.com", gradient: "from-blue-500 to-indigo-600" },
    { name: "YouTube", emoji: "▶️", url: "https://www.youtube.com", gradient: "from-red-500 to-rose-600" },
    { name: "Wikipedia", emoji: "🌐", url: "https://www.wikipedia.org", gradient: "from-gray-500 to-slate-700" },
    { name: "GitHub", emoji: "🐙", url: "https://github.com", gradient: "from-slate-700 to-slate-900" },
    { name: "Reddit", emoji: "👽", url: "https://www.reddit.com", gradient: "from-orange-500 to-amber-600" },
    { name: "X", emoji: "𝕏", url: "https://x.com", gradient: "from-gray-900 to-gray-700" },
    { name: "Bing", emoji: "🎯", url: "https://www.bing.com", gradient: "from-teal-500 to-cyan-600" },
    { name: "DuckDuckGo", emoji: "🦆", url: "https://duckduckgo.com", gradient: "from-red-500 to-orange-600" },
    { name: "ChatGPT", emoji: "💬", url: "https://chatgpt.com", gradient: "from-emerald-500 to-teal-700" },
    { name: "Stack Overflow", emoji: "📚", url: "https://stackoverflow.com", gradient: "from-amber-500 to-orange-700" },
    { name: "BBC News", emoji: "📰", url: "https://www.bbc.com", gradient: "from-red-600 to-rose-700" },
    { name: "Hacker News", emoji: "🎓", url: "https://news.ycombinator.com", gradient: "from-orange-600 to-red-700" },
];

function normalizeInput(raw) {
    let s = (raw || "").trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.includes(".") && !s.includes(" ")) return "https://" + s;
    return "https://www.google.com/search?q=" + encodeURIComponent(s);
}

let tabCounter = 0;
const newTabId = () => `tab-${++tabCounter}`;

function makeTab() {
    return { id: newTabId(), url: "", display: "", title: "", history: [], index: -1 };
}

export default function BrowserClient() {
    const [tabs, setTabs] = useState(() => [makeTab()]);
    const [activeId, setActiveId] = useState(tabs[0] ? tabs[0].id : "tab-0");
    const [input, setInput] = useState("");
    const iframeRef = useRef(null);

    const activeTab = tabs.find((t) => t.id === activeId) || tabs[0];

    useEffect(() => {
        const onMessage = (e) => {
            const target = e.data?.__browser?.newTab;
            if (!target || /^https?:$/.test(String(target).split(":")[0]) === false) return;
            const t = { ...makeTab(), url: target, display: target };
            setTabs((prev) => [...prev, t]);
            setActiveId(t.id);
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

    const navigate = (raw) => {
        const url = normalizeInput(raw);
        if (!url) return;
        setInput(url);
        setTabs((prev) =>
            prev.map((t) => {
                if (t.id !== activeId) return t;
                const history = t.history.slice(0, t.index + 1);
                history.push(url);
                return { ...t, url, display: url, title: "", history, index: history.length - 1 };
            })
        );
    };

    const goBack = () => {
        if (activeTab.index <= 0) return;
        const index = activeTab.index - 1;
        const url = activeTab.history[index];
        setInput(url);
        setTabs((prev) =>
            prev.map((t) => (t.id === activeId ? { ...t, index, url, display: url } : t))
        );
    };

    const goForward = () => {
        if (activeTab.index >= activeTab.history.length - 1) return;
        const index = activeTab.index + 1;
        const url = activeTab.history[index];
        setInput(url);
        setTabs((prev) =>
            prev.map((t) => (t.id === activeId ? { ...t, index, url, display: url } : t))
        );
    };

    const reload = () => {
        if (!activeTab?.url) return;
        const iframe = iframeRef.current;
        if (iframe?.contentWindow) {
            try {
                iframe.contentWindow.location.reload();
                return;
            } catch {
                // cross-origin or un-injected error page — fall through to a proxied reload
            }
        }
        navigate(activeTab.url);
    };

    const goHome = () => {
        setInput("");
        setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, url: "", display: "", title: "" } : t)));
    };

    const addTab = () => {
        const t = makeTab();
        setTabs((prev) => [...prev, t]);
        setActiveId(t.id);
        setInput("");
    };

    const closeTab = (id) => {
        setTabs((prev) => {
            const idx = prev.findIndex((t) => t.id === id);
            const next = prev.filter((t) => t.id !== id);
            if (next.length === 0) {
                const fresh = makeTab();
                setActiveId(fresh.id);
                setInput("");
                return [fresh];
            }
            if (id === activeId) {
                const neighbor = next[Math.min(idx, next.length - 1)];
                setActiveId(neighbor.id);
                setInput(neighbor.display);
            }
            return next;
        });
    };

    const selectTab = (id) => {
        setActiveId(id);
        const tab = tabs.find((t) => t.id === id);
        if (tab) setInput(tab.display);
    };

    const handleLoad = (e) => {
        const iframe = e.target;
        let realUrl = null;
        let title = "";
        try {
            const loc = new URL(iframe.contentWindow.location.href);
            realUrl = loc.searchParams.get("url");
            title = iframe.contentDocument.title || "";
        } catch {
            return;
        }
        if (!realUrl) return;
        setTabs((prev) =>
            prev.map((t) => {
                if (t.id !== activeId) return t;
                const history = t.history.slice(0, t.index + 1);
                if (history[t.index] === realUrl) {
                    return { ...t, display: realUrl, title };
                }
                history.push(realUrl);
                return { ...t, url: realUrl, display: realUrl, title, history, index: history.length - 1 };
            })
        );
        setInput(realUrl);
    };

    const iframeSrc = activeTab?.url ? `/api/browser?url=${encodeURIComponent(activeTab.url)}` : null;

    return (
        <div className="h-dvh flex flex-col bg-white dark:bg-gray-950 safe-top">
            {/* ── Tab strip ─────────────────────────────────────────── */}
            <div className="flex items-center gap-1 px-2 pt-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 overflow-x-auto scrollbar-hide shrink-0">
                {tabs.map((t) => (
                    <div
                        key={t.id}
                        className={`group flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-t-lg text-sm max-w-[160px] min-w-[90px] cursor-pointer border border-b-0 transition-colors ${
                            t.id === activeId
                                ? "bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700"
                                : "bg-transparent text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300"
                        }`}
                        onClick={() => selectTab(t.id)}
                    >
                        <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 truncate shrink-0" />
                        <span className="truncate flex-1">
                            {t.title || t.display || "New Tab"}
                        </span>
                        <span
                            role="button"
                            tabIndex={0}
                            aria-label="Close tab"
                            onClick={(ev) => {
                                ev.stopPropagation();
                                closeTab(t.id);
                            }}
                            className="hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full w-4 h-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        >
                            ✕
                        </span>
                    </div>
                ))}
                <button
                    onClick={addTab}
                    aria-label="New tab"
                    className="ml-1 p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors shrink-0"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                </button>
            </div>

            {/* ── Address bar ───────────────────────────────────────── */}
            <div className="flex items-center gap-1 px-2 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
                <div className="flex items-center gap-0.5 shrink-0">
                        <button
                            onClick={goBack}
                            disabled={!activeTab || activeTab.index <= 0}
                            aria-label="Back"
                            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                            </svg>
                        </button>
                        <button
                            onClick={goForward}
                            disabled={!activeTab || activeTab.index >= activeTab.history.length - 1}
                            aria-label="Forward"
                            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l6 6m0 0-6 6m6-6H9a6 6 0 0 0 0 12h3" />
                            </svg>
                        </button>
                        <button
                            onClick={reload}
                            aria-label="Reload"
                            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                        </button>
                        <button
                            onClick={goHome}
                            aria-label="Home"
                            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                            </svg>
                        </button>
                    </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        navigate(input);
                    }}
                    className="flex-1 flex items-center gap-2 min-w-0"
                >
                    <div className="flex-1 flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-full px-4 h-10 min-w-0">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Search Google or type a URL"
                            enterKeyHint="go"
                            className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-w-0"
                        />
                        {input && (
                            <button
                                type="button"
                                onClick={() => setInput("")}
                                aria-label="Clear"
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {/* ── Content ───────────────────────────────────────────── */}
            <div className="flex-1 min-h-0 bg-white dark:bg-gray-950">
                {iframeSrc ? (
                    <iframe
                        ref={iframeRef}
                        key={activeTab.id}
                        src={iframeSrc}
                        title={activeTab.title || "Browser"}
                        onLoad={handleLoad}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-presentation"
                        className="w-full h-full border-0"
                    />
                ) : (
                    <div className="h-full overflow-y-auto">
                        <div className="max-w-2xl mx-auto px-4 py-8">
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">AnonTweet Browser</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                                A real in-app web browser. Tabs, back/forward history and an unframed-web proxy included.
                            </p>

                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    navigate(input);
                                }}
                                className="mb-8"
                            >
                                <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-full px-4 h-12">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder="Search Google or type a URL"
                                        className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-w-0"
                                    />
                                </div>
                            </form>

                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                {SHORTCUTS.map((s) => (
                                    <button
                                        key={s.name}
                                        onClick={() => navigate(s.url)}
                                        className={`rounded-2xl p-4 flex flex-col items-center gap-2 bg-gradient-to-br ${s.gradient} text-white hover:scale-[1.03] transition-transform shadow`}
                                    >
                                        <span className="text-2xl">{s.emoji}</span>
                                        <span className="text-xs font-semibold">{s.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}