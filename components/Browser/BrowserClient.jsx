"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Tauri detection ──────────────────────────────────────────────────────────

function isTauri() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

// ─── Shortcuts ────────────────────────────────────────────────────────────────

// Web proxy shortcuts — only sites that don't aggressively block datacenter IPs
const WEB_SHORTCUTS = [
  { name: "Wikipedia",      emoji: "🌐", url: "https://www.wikipedia.org",        gradient: "from-gray-500 to-slate-700" },
  { name: "DuckDuckGo",     emoji: "🦆", url: "https://duckduckgo.com",           gradient: "from-red-500 to-orange-600" },
  { name: "Hacker News",    emoji: "🎓", url: "https://news.ycombinator.com",     gradient: "from-orange-600 to-red-700" },
  { name: "Stack Overflow", emoji: "📚", url: "https://stackoverflow.com",        gradient: "from-amber-500 to-orange-700" },
  { name: "BBC News",       emoji: "📰", url: "https://www.bbc.com",              gradient: "from-red-600 to-rose-700" },
  { name: "GitHub",         emoji: "🐙", url: "https://github.com",               gradient: "from-slate-700 to-slate-900" },
  { name: "Bing",           emoji: "🎯", url: "https://www.bing.com",             gradient: "from-teal-500 to-cyan-600" },
  { name: "Archive",        emoji: "📦", url: "https://web.archive.org",          gradient: "from-indigo-500 to-blue-700" },
  { name: "MDN",            emoji: "🔧", url: "https://developer.mozilla.org",    gradient: "from-blue-600 to-violet-700" },
  { name: "Dev.to",         emoji: "💻", url: "https://dev.to",                   gradient: "from-gray-700 to-gray-900" },
  { name: "NPM",            emoji: "📦", url: "https://www.npmjs.com",            gradient: "from-red-500 to-rose-700" },
  { name: "Crates.io",      emoji: "🦀", url: "https://crates.io",               gradient: "from-orange-600 to-amber-700" },
];

// Native desktop shortcuts — all sites work since it's a real browser
const NATIVE_SHORTCUTS = [
  { name: "Google",         emoji: "🔍", url: "https://www.google.com",           gradient: "from-blue-500 to-indigo-600" },
  { name: "YouTube",        emoji: "▶️",  url: "https://www.youtube.com",          gradient: "from-red-500 to-rose-600" },
  { name: "Reddit",         emoji: "👽", url: "https://www.reddit.com",            gradient: "from-orange-500 to-amber-600" },
  { name: "X",              emoji: "𝕏",  url: "https://x.com",                    gradient: "from-gray-900 to-gray-700" },
  { name: "Wikipedia",      emoji: "🌐", url: "https://www.wikipedia.org",         gradient: "from-gray-500 to-slate-700" },
  { name: "GitHub",         emoji: "🐙", url: "https://github.com",                gradient: "from-slate-700 to-slate-900" },
  { name: "ChatGPT",        emoji: "💬", url: "https://chatgpt.com",               gradient: "from-emerald-500 to-teal-700" },
  { name: "DuckDuckGo",     emoji: "🦆", url: "https://duckduckgo.com",            gradient: "from-red-500 to-orange-600" },
  { name: "Stack Overflow", emoji: "📚", url: "https://stackoverflow.com",         gradient: "from-amber-500 to-orange-700" },
  { name: "BBC News",       emoji: "📰", url: "https://www.bbc.com",               gradient: "from-red-600 to-rose-700" },
  { name: "Hacker News",    emoji: "🎓", url: "https://news.ycombinator.com",      gradient: "from-orange-600 to-red-700" },
  { name: "Twitch",         emoji: "🎮", url: "https://www.twitch.tv",             gradient: "from-purple-600 to-violet-700" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeInput(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9-]+:\/\//i.test(s)) return null;
  if (s.includes(".") && !s.includes(" ")) return "https://" + s;
  return "https://www.google.com/search?q=" + encodeURIComponent(s);
}

function extractRealUrl(proxyHref) {
  try {
    const param = new URL(proxyHref).searchParams.get("url");
    return param || null;
  } catch {
    return null;
  }
}

function urlLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ─── Tab model ────────────────────────────────────────────────────────────────

let _tabCounter = 0;
const newTabId = () => `tab-${++_tabCounter}`;

function makeTab(overrides = {}) {
  return {
    id: newTabId(),
    url: "",
    display: "",
    title: "",
    history: [],
    histIndex: -1,
    loading: false,
    error: false,
    ...overrides,
  };
}

// ─── Tauri native window manager ──────────────────────────────────────────────

// Tracks open native browser windows: windowLabel → { webview, url }
const nativeWindows = new Map();
let nativeWinCounter = 0;

async function openNativeWindow(url, onNav) {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

  const label = `browser-${++nativeWinCounter}`;

  const win = new WebviewWindow(label, {
    url,
    title: urlLabel(url),
    width: 1280,
    height: 800,
    minWidth: 400,
    minHeight: 400,
    resizable: true,
    center: true,
    decorations: true,
    focus: true,
  });

  // Listen for navigation events (title bar sync)
  const unlisten = await win.listen("tauri://navigation", (event) => {
    onNav?.(label, event.payload?.url || url);
  });

  // Listen for title changes
  const unlistenTitle = await win.listen("tauri://title-changed", (event) => {
    onNav?.(label, null, event.payload?.title || "");
  });

  // Clean up on close
  win.once("tauri://destroyed", () => {
    nativeWindows.delete(label);
    unlisten();
    unlistenTitle();
  });

  nativeWindows.set(label, { win, url, label });
  return { win, label };
}

async function focusNativeWindow(label) {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const win = await WebviewWindow.getByLabel(label);
    if (win) {
      await win.show();
      await win.setFocus();
    }
  } catch {}
}

// ─── Loading bar ──────────────────────────────────────────────────────────────

function LoadingBar({ active }) {
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (active) {
      doneRef.current = false;
      setVisible(true);
      setWidth(0);
      let w = 0;
      const tick = () => {
        if (doneRef.current) return;
        w = w < 70 ? w + Math.random() * 14 : w < 88 ? w + Math.random() * 2 : w + 0.2;
        if (w > 90) w = 90;
        setWidth(w);
        timerRef.current = setTimeout(tick, w < 70 ? 100 : 280);
      };
      timerRef.current = setTimeout(tick, 50);
    } else {
      doneRef.current = true;
      clearTimeout(timerRef.current);
      setWidth(100);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 300);
    }
    return () => clearTimeout(timerRef.current);
  }, [active]);

  if (!visible) return null;
  return (
    <div
      className="absolute top-0 left-0 h-[3px] bg-blue-500 z-50 rounded-r-full pointer-events-none"
      style={{
        width: `${width}%`,
        transition: `width ${width === 100 ? 200 : 150}ms ${width === 100 ? "ease-out" : "linear"}`,
        boxShadow: "0 0 6px rgba(59,130,246,0.9)",
      }}
    />
  );
}

// ─── Favicon fallback ─────────────────────────────────────────────────────────

function SiteDot({ loading }) {
  if (loading) {
    return (
      <svg className="w-3 h-3 shrink-0 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
    );
  }
  return <span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />;
}

// ─── NavButton ────────────────────────────────────────────────────────────────

function NavButton({ children, disabled, title, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:pointer-events-none shrink-0"
    >
      {children}
    </button>
  );
}

// ─── Native Tab item (Tauri) ─────────────────────────────────────────────────

function NativeTabItem({ tab, isActive, onSelect, onClose }) {
  return (
    <div
      role="tab"
      aria-selected={isActive}
      onClick={onSelect}
      className={`
        group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-t-lg text-xs
        max-w-[180px] min-w-[100px] cursor-pointer border border-b-0 shrink-0 transition-colors
        ${isActive
          ? "bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700 shadow-sm"
          : "bg-transparent text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-200/60 dark:hover:bg-gray-800/60"
        }
      `}
    >
      {tab.loading
        ? <svg className="w-3 h-3 shrink-0 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
        : <span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
      }
      <span className="truncate flex-1 font-medium">{tab.title || (tab.url ? urlLabel(tab.url) : "New Tab")}</span>
      <button
        aria-label="Close tab"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="w-4 h-4 flex items-center justify-center rounded-full text-[10px] opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-opacity shrink-0"
      >✕</button>
    </div>
  );
}

// ─── NATIVE BROWSER (Tauri desktop) ──────────────────────────────────────────

function NativeBrowserClient() {
  // Virtual tab list — each tab corresponds to a real native WebviewWindow
  const [tabs, setTabs] = useState([{ id: "native-1", url: "", title: "New Tab", loading: false }]);
  const [activeId, setActiveId] = useState("native-1");
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef(null);
  const activeIdRef = useRef(activeId);
  const tabWindowMap = useRef(new Map()); // tabId → windowLabel

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const updateTab = useCallback((id, patch) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  // Open/focus a native window for the given tab
  const launchWindow = useCallback(async (tabId, url) => {
    const existingLabel = tabWindowMap.current.get(tabId);
    if (existingLabel && nativeWindows.has(existingLabel)) {
      // Window already open — navigate it
      try {
        const entry = nativeWindows.get(existingLabel);
        await entry.win.navigate(url);
        await focusNativeWindow(existingLabel);
        updateTab(tabId, { url, display: url, title: urlLabel(url), loading: true });
        setInput(url);
      } catch {}
      return;
    }

    updateTab(tabId, { url, display: url, title: urlLabel(url), loading: true });
    setInput(url);

    try {
      const { label } = await openNativeWindow(url, (lbl, navUrl, navTitle) => {
        // Find which tab owns this window
        for (const [tid, wlabel] of tabWindowMap.current.entries()) {
          if (wlabel === lbl) {
            const patch = {};
            if (navUrl) { patch.url = navUrl; patch.display = navUrl; }
            if (navTitle) patch.title = navTitle;
            patch.loading = false;
            setTabs((prev) => prev.map((t) => (t.id === tid ? { ...t, ...patch } : t)));
            if (tid === activeIdRef.current && navUrl) setInput(navUrl);
            break;
          }
        }
      });
      tabWindowMap.current.set(tabId, label);
      updateTab(tabId, { loading: false });
    } catch (err) {
      updateTab(tabId, { loading: false, error: true });
    }
  }, [updateTab]);

  const navigate = useCallback((raw) => {
    const url = normalizeInput(raw);
    if (!url) return;
    launchWindow(activeIdRef.current, url);
  }, [launchWindow]);

  const addTab = useCallback(() => {
    const id = `native-${Date.now()}`;
    setTabs((prev) => [...prev, { id, url: "", title: "New Tab", loading: false }]);
    setActiveId(id);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const closeTab = useCallback((id, e) => {
    e?.stopPropagation();
    // Close native window if open
    const label = tabWindowMap.current.get(id);
    if (label) {
      focusNativeWindow(label).then(async () => {
        try {
          const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
          const win = await WebviewWindow.getByLabel(label);
          await win?.close();
        } catch {}
      }).catch(() => {});
      tabWindowMap.current.delete(id);
    }
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh = { id: `native-${Date.now()}`, url: "", title: "New Tab", loading: false };
        setActiveId(fresh.id);
        setInput("");
        return [fresh];
      }
      if (id === activeIdRef.current) {
        const neighbor = next[Math.min(idx, next.length - 1)];
        setActiveId(neighbor.id);
        setInput(neighbor.url || "");
      }
      return next;
    });
  }, []);

  const selectTab = useCallback((id) => {
    setActiveId(id);
    const t = tabs.find((x) => x.id === id);
    setInput(t?.url || "");
    // Focus the native window for this tab
    const label = tabWindowMap.current.get(id);
    if (label) focusNativeWindow(label).catch(() => {});
  }, [tabs]);

  const focusCurrentWindow = useCallback(() => {
    const label = tabWindowMap.current.get(activeIdRef.current);
    if (label) focusNativeWindow(label).catch(() => {});
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "l") { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "t") { e.preventDefault(); addTab(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "w") { e.preventDefault(); closeTab(activeIdRef.current); }
      else if (e.key === "Escape" && inputFocused) inputRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addTab, closeTab, inputFocused]);

  const showingHomePage = !activeTab?.url;

  return (
    <div className="h-dvh flex flex-col bg-white dark:bg-gray-950 overflow-hidden">

      {/* ── Tab strip ── */}
      <div className="flex items-center gap-0.5 px-1.5 pt-1.5 border-b border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 overflow-x-auto scrollbar-hide shrink-0 select-none">
        {tabs.map((t) => (
          <NativeTabItem
            key={t.id}
            tab={t}
            isActive={t.id === activeId}
            onSelect={() => selectTab(t.id)}
            onClose={() => closeTab(t.id)}
          />
        ))}
        <button
          onClick={addTab}
          title="New tab (Ctrl+T)"
          className="ml-0.5 p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* ── Address bar ── */}
      <div className="relative flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
        <form
          className="flex-1 min-w-0"
          onSubmit={(e) => { e.preventDefault(); navigate(input); inputRef.current?.blur(); }}
        >
          <div className={`
            flex items-center gap-2 rounded-full px-3 h-9 transition-all
            ${inputFocused
              ? "bg-white dark:bg-gray-900 ring-2 ring-blue-500 shadow-sm"
              : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200/70 dark:hover:bg-gray-700/70"
            }
          `}>
            {/* Native indicator */}
            <span title="Native browser window — no proxy" className="shrink-0">
              {activeTab?.url ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-green-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-gray-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              )}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => { setInputFocused(true); requestAnimationFrame(() => inputRef.current?.select()); }}
              onBlur={() => setInputFocused(false)}
              placeholder="Search or enter URL — opens a native window"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              enterKeyHint="go"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
            {input && inputFocused && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setInput(""); inputRef.current?.focus(); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 text-xs"
              >✕</button>
            )}
          </div>
        </form>

        {/* Focus current window button — only show when a window is open */}
        {activeTab?.url && (
          <button
            onClick={focusCurrentWindow}
            title="Bring browser window to front"
            className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-950">
        {showingHomePage ? (
          <NativeHomePage navigate={navigate} input={input} setInput={setInput} inputRef={inputRef} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-white">
                <path d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
              </svg>
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Native window opened
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                <span className="font-medium text-blue-500">{urlLabel(activeTab.url)}</span> is loading in a native Chromium window — no proxy, no restrictions.
              </p>
            </div>
            <button
              onClick={focusCurrentWindow}
              className="mt-1 px-4 py-2 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors shadow"
            >
              Bring to front
            </button>
            <button
              onClick={() => navigate(activeTab.url)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline transition-colors"
            >
              Reload in new window
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PROXY BROWSER (web) ──────────────────────────────────────────────────────

function ProxyBrowserClient() {
  const [tabs, setTabs] = useState(() => [makeTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);

  const iframeRef = useRef(null);
  const inputRef = useRef(null);
  const activeIdRef = useRef(activeId);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const iframeSrc = activeTab?.url
    ? `/api/browser?url=${encodeURIComponent(activeTab.url)}`
    : null;

  const updateTab = useCallback((id, patch) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  // ── Navigation ──────────────────────────────────────────────────────────

  const navigate = useCallback((raw, tabId) => {
    const url = normalizeInput(raw);
    if (!url) return;
    const id = tabId ?? activeIdRef.current;
    setInput(url);
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const hist = t.history.slice(0, t.histIndex + 1);
        if (hist[hist.length - 1] !== url) hist.push(url);
        return { ...t, url, display: url, title: urlLabel(url), loading: true, error: false, history: hist, histIndex: hist.length - 1 };
      })
    );
  }, []);

  const goBack = useCallback(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t || t.histIndex <= 0) return;
    const histIndex = t.histIndex - 1;
    const url = t.history[histIndex];
    setInput(url);
    setTabs((prev) => prev.map((x) => x.id === activeId ? { ...x, histIndex, url, display: url, loading: true, error: false } : x));
  }, [tabs, activeId]);

  const goForward = useCallback(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t || t.histIndex >= t.history.length - 1) return;
    const histIndex = t.histIndex + 1;
    const url = t.history[histIndex];
    setInput(url);
    setTabs((prev) => prev.map((x) => x.id === activeId ? { ...x, histIndex, url, display: url, loading: true, error: false } : x));
  }, [tabs, activeId]);

  const reload = useCallback(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t?.url) return;
    setTabs((prev) => prev.map((x) => x.id === activeId ? { ...x, loading: true, error: false, _reloadKey: (x._reloadKey || 0) + 1 } : x));
  }, [activeId]);

  const goHome = useCallback(() => {
    setInput("");
    setTabs((prev) => prev.map((t) => t.id === activeId ? { ...t, url: "", display: "", title: "", loading: false, error: false } : t));
  }, [activeId]);

  // ── Tabs ────────────────────────────────────────────────────────────────

  const addTab = useCallback(() => {
    const t = makeTab();
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const closeTab = useCallback((id, e) => {
    e?.stopPropagation();
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh = makeTab();
        setActiveId(fresh.id);
        setInput("");
        return [fresh];
      }
      if (id === activeIdRef.current) {
        const neighbor = next[Math.min(idx, next.length - 1)];
        setActiveId(neighbor.id);
        setInput(neighbor.display);
      }
      return next;
    });
  }, []);

  const selectTab = useCallback((id) => {
    setActiveId(id);
    const t = tabs.find((x) => x.id === id);
    if (t) setInput(t.display);
  }, [tabs]);

  // ── iframe events ───────────────────────────────────────────────────────

  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let realUrl = null, title = "";
    try {
      realUrl = extractRealUrl(iframe.contentWindow?.location?.href);
      title = iframe.contentDocument?.title || "";
    } catch {}
    const id = activeIdRef.current;
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const display = realUrl || t.display;
        const hist = t.history.slice(0, t.histIndex + 1);
        if (realUrl && hist[hist.length - 1] !== realUrl) {
          hist.push(realUrl);
          return { ...t, url: realUrl, display, title: title || urlLabel(display), loading: false, error: false, history: hist, histIndex: hist.length - 1 };
        }
        return { ...t, display, title: title || urlLabel(display), loading: false, error: false };
      })
    );
    if (realUrl) setInput(realUrl);
  }, []);

  const handleError = useCallback(() => {
    updateTab(activeIdRef.current, { loading: false, error: true });
  }, [updateTab]);

  // ── postMessage from injected script ────────────────────────────────────

  useEffect(() => {
    const onMessage = (e) => {
      const data = e.data?.__browser;
      if (!data) return;
      if (data.type === "newTab" && data.url) {
        const t = makeTab({ url: data.url, display: data.url, loading: true });
        setTabs((prev) => [...prev, t]);
        setActiveId(t.id);
        setInput(data.url);
        return;
      }
      if (data.type === "nav") {
        const id = activeIdRef.current;
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== id) return t;
            const newUrl = data.url || t.url;
            const newTitle = data.title || t.title || urlLabel(newUrl);
            if (data.url && data.url !== t.display) {
              setInput(data.url);
              const hist = t.history.slice(0, t.histIndex + 1);
              if (hist[hist.length - 1] !== newUrl) {
                hist.push(newUrl);
                return { ...t, url: newUrl, display: newUrl, title: newTitle, loading: false, history: hist, histIndex: hist.length - 1 };
              }
            }
            return { ...t, title: newTitle, loading: false };
          })
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "l") { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "t") { e.preventDefault(); addTab(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "w") { e.preventDefault(); closeTab(activeIdRef.current); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "r") { e.preventDefault(); reload(); }
      else if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); goBack(); }
      else if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); goForward(); }
      else if (e.key === "Escape" && inputFocused) inputRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addTab, closeTab, reload, goBack, goForward, inputFocused]);

  // Sync address bar on tab switch
  useEffect(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (t) setInput(t.display);
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const canBack = activeTab && activeTab.histIndex > 0;
  const canForward = activeTab && activeTab.histIndex < activeTab.history.length - 1;
  const isLoading = activeTab?.loading ?? false;

  return (
    <div className="h-dvh flex flex-col bg-white dark:bg-gray-950 overflow-hidden">

      {/* ── Tab strip ── */}
      <div className="flex items-center gap-0.5 px-1.5 pt-1.5 border-b border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 overflow-x-auto scrollbar-hide shrink-0 select-none">
        {tabs.map((t) => {
          const isActive = t.id === activeId;
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(t.id)}
              className={`
                group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-t-lg text-xs
                max-w-[180px] min-w-[100px] cursor-pointer border border-b-0 shrink-0 transition-colors
                ${isActive
                  ? "bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700 shadow-sm"
                  : "bg-transparent text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-200/60 dark:hover:bg-gray-800/60"
                }
              `}
            >
              <SiteDot loading={t.loading} />
              <span className="truncate flex-1 font-medium">
                {t.title || (t.display ? urlLabel(t.display) : "New Tab")}
              </span>
              <button
                aria-label="Close tab"
                onClick={(e) => closeTab(t.id, e)}
                className={`w-4 h-4 flex items-center justify-center rounded-full text-[10px] transition-opacity shrink-0
                  ${isActive ? "opacity-50 hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700" : "opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
              >✕</button>
            </div>
          );
        })}
        <button
          onClick={addTab}
          title="New tab (Ctrl+T)"
          className="ml-0.5 p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* ── Address bar ── */}
      <div className="relative flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
        <LoadingBar active={isLoading} />

        <div className="flex items-center gap-0 shrink-0">
          <NavButton onClick={goBack} disabled={!canBack} title="Back (Alt+←)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </NavButton>
          <NavButton onClick={goForward} disabled={!canForward} title="Forward (Alt+→)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </NavButton>
          <NavButton onClick={isLoading ? () => updateTab(activeId, { loading: false }) : reload} title={isLoading ? "Stop" : "Reload (Ctrl+R)"}>
            {isLoading
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
            }
          </NavButton>
          <NavButton onClick={goHome} title="Home">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
            </svg>
          </NavButton>
        </div>

        <form
          className="flex-1 min-w-0"
          onSubmit={(e) => { e.preventDefault(); navigate(input); inputRef.current?.blur(); }}
        >
          <div className={`
            flex items-center gap-2 rounded-full px-3 h-9 transition-all
            ${inputFocused
              ? "bg-white dark:bg-gray-900 ring-2 ring-blue-500 shadow-sm"
              : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200/70 dark:hover:bg-gray-700/70"
            }
          `}>
            {!inputFocused && activeTab?.url
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-green-500 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-gray-400 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            }
            <input
              ref={inputRef}
              type="text"
              value={inputFocused ? input : (activeTab?.display || input)}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => { setInputFocused(true); requestAnimationFrame(() => inputRef.current?.select()); }}
              onBlur={() => setInputFocused(false)}
              placeholder="Search or enter URL   (Ctrl+L)"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              enterKeyHint="go"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
            {input && inputFocused && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setInput(""); inputRef.current?.focus(); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 text-xs"
              >✕</button>
            )}
          </div>
        </form>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 relative bg-white dark:bg-gray-950">
        {iframeSrc ? (
          <iframe
            ref={iframeRef}
            key={`${activeTab.id}-${activeTab._reloadKey ?? 0}`}
            src={iframeSrc}
            title={activeTab.title || "Browser"}
            onLoad={handleLoad}
            onError={handleError}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-presentation allow-pointer-lock"
            allow="autoplay; fullscreen; clipboard-read; clipboard-write"
            className="absolute inset-0 w-full h-full border-0"
          />
        ) : (
          <WebHomePage navigate={navigate} input={input} setInput={setInput} inputRef={inputRef} />
        )}
      </div>
    </div>
  );
}

// ─── Root export — picks the right implementation ─────────────────────────────

export default function BrowserClient() {
  const [inTauri, setInTauri] = useState(false);

  useEffect(() => {
    setInTauri(isTauri());
  }, []);

  return inTauri ? <NativeBrowserClient /> : <ProxyBrowserClient />;
}

// ─── Home pages ───────────────────────────────────────────────────────────────

function NativeHomePage({ navigate, input, setInput, inputRef }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 mb-4 shadow-lg">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-white">
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM6.262 6.072a8.25 8.25 0 1 0 10.562-.766 4.5 4.5 0 0 1-1.318 1.357L14.25 7.5l.165.33a.809.809 0 0 1-1.086 1.085l-.604-.302a1.125 1.125 0 0 0-1.298.21l-.132.131c-.439.44-.439 1.152 0 1.591l.296.296c.256.257.622.374.98.314l1.17-.195c.323-.054.654.036.905.245l1.33 1.108c.32.267.46.694.358 1.1a8.7 8.7 0 0 1-2.288 4.04l-.723.724a1.125 1.125 0 0 1-1.298.21l-.153-.076a1.125 1.125 0 0 1-.622-1.006v-1.089c0-.298-.119-.585-.33-.796l-1.347-1.347a1.125 1.125 0 0 1 1.591-1.591L8 14.25v.093c0 .498.198.975.55 1.327l.15.15c.282.283.664.443 1.063.443h.465a.375.375 0 0 0 .375-.375v-.405a.375.375 0 0 0-.215-.343l-.62-.31a.75.75 0 0 1-.41-.65V8.57a.75.75 0 0 1 .298-.599l2.048-1.536z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">AnonTweet Browser</h1>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Native Chromium · No proxy · All sites work
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); navigate(input); }} className="mb-8">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 h-12 ring-1 ring-transparent focus-within:ring-blue-500 focus-within:bg-white dark:focus-within:bg-gray-900 transition-all shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-gray-400 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search Google or type a URL…"
              spellCheck={false}
              autoComplete="off"
              className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
            {input && (
              <button type="button" onClick={() => setInput("")} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            )}
          </div>
        </form>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {NATIVE_SHORTCUTS.map((s) => (
            <button
              key={s.name}
              onClick={() => navigate(s.url)}
              className={`rounded-2xl p-4 flex flex-col items-center gap-2 bg-gradient-to-br ${s.gradient} text-white hover:scale-[1.04] active:scale-[0.98] transition-transform shadow-md`}
            >
              <span className="text-2xl leading-none">{s.emoji}</span>
              <span className="text-xs font-semibold tracking-wide">{s.name}</span>
            </button>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
          {[["Ctrl+L","Focus URL"],["Ctrl+T","New tab"],["Ctrl+W","Close tab"]].map(([k,d]) => (
            <div key={k} className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-mono text-[10px] border border-gray-200 dark:border-gray-700">{k}</kbd>
              <span>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WebHomePage({ navigate, input, setInput, inputRef }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-600 to-slate-800 mb-4 shadow-lg">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-white">
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM6.262 6.072a8.25 8.25 0 1 0 10.562-.766 4.5 4.5 0 0 1-1.318 1.357L14.25 7.5l.165.33a.809.809 0 0 1-1.086 1.085l-.604-.302a1.125 1.125 0 0 0-1.298.21l-.132.131c-.439.44-.439 1.152 0 1.591l.296.296c.256.257.622.374.98.314l1.17-.195c.323-.054.654.036.905.245l1.33 1.108c.32.267.46.694.358 1.1a8.7 8.7 0 0 1-2.288 4.04l-.723.724a1.125 1.125 0 0 1-1.298.21l-.153-.076a1.125 1.125 0 0 1-.622-1.006v-1.089c0-.298-.119-.585-.33-.796l-1.347-1.347a1.125 1.125 0 0 1 1.591-1.591L8 14.25v.093c0 .498.198.975.55 1.327l.15.15c.282.283.664.443 1.063.443h.465a.375.375 0 0 0 .375-.375v-.405a.375.375 0 0 0-.215-.343l-.62-.31a.75.75 0 0 1-.41-.65V8.57a.75.75 0 0 1 .298-.599l2.048-1.536z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">AnonTweet Browser</h1>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Web proxy mode · Some sites may be restricted
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); navigate(input); }} className="mb-8">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 h-12 ring-1 ring-transparent focus-within:ring-blue-500 focus-within:bg-white dark:focus-within:bg-gray-900 transition-all shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-gray-400 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search or enter URL…"
              spellCheck={false}
              autoComplete="off"
              className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
            {input && (
              <button type="button" onClick={() => setInput("")} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            )}
          </div>
        </form>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {WEB_SHORTCUTS.map((s) => (
            <button
              key={s.name}
              onClick={() => navigate(s.url)}
              className={`rounded-2xl p-4 flex flex-col items-center gap-2 bg-gradient-to-br ${s.gradient} text-white hover:scale-[1.04] active:scale-[0.98] transition-transform shadow-md`}
            >
              <span className="text-2xl leading-none">{s.emoji}</span>
              <span className="text-xs font-semibold tracking-wide">{s.name}</span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          Download the <span className="font-medium text-gray-600 dark:text-gray-300">AnonTweet desktop app</span> for a native browser that works on all sites.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
          {[["Ctrl+L","Focus URL"],["Ctrl+T","New tab"],["Ctrl+W","Close tab"],["Ctrl+R","Reload"],["Alt+←/→","Back/Forward"]].map(([k,d]) => (
            <div key={k} className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-mono text-[10px] border border-gray-200 dark:border-gray-700">{k}</kbd>
              <span>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
