"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Tauri detection ──────────────────────────────────────────────────────────

function isTauri() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

// ─── Shortcuts ────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    return new URL(proxyHref).searchParams.get("url") || null;
  } catch { return null; }
}

function urlLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

// ─── Proxy tab model ──────────────────────────────────────────────────────────

let _tabCounter = 0;
const newTabId = () => `tab-${++_tabCounter}`;

function makeTab(overrides = {}) {
  return {
    id: newTabId(), url: "", display: "", title: "",
    history: [], histIndex: -1, loading: false, error: false, ...overrides,
  };
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
      timerRef.current = setTimeout(() => { setVisible(false); setWidth(0); }, 300);
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

// ─── NavButton ────────────────────────────────────────────────────────────────

function NavButton({ children, disabled, title, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:pointer-events-none shrink-0">
      {children}
    </button>
  );
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

const IconBack = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);
const IconForward = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);
const IconReload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);
const IconStop = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const IconHome = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
  </svg>
);
const IconPopOut = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
  </svg>
);
const IconPopIn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
  </svg>
);
const IconLock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-green-500 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
  </svg>
);
const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-gray-400 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
  </svg>
);
const SpinnerIcon = () => (
  <svg className="w-3 h-3 shrink-0 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
  </svg>
);

// ═════════════════════════════════════════════════════════════════════════════
// NATIVE BROWSER — Tauri desktop
//
// Architecture: open a real WebviewWindow for each tab. The address bar lives
// in the main app window (here). The browser window is sized/positioned to
// cover the content area of the main window, giving an "embedded" feel.
// A pop-out button detaches it to a free-floating resizable window instead.
//
// Why not a true child webview: on Windows/WebView2, child webviews created
// inside an existing window always render behind the main webview (known
// Tauri bug #9798). The only reliable cross-platform approach is a separate
// OS window that we manually keep in sync.
// ═════════════════════════════════════════════════════════════════════════════

// Registry of open native browser windows: tabId → WebviewWindow
const nativeWinRegistry = new Map();

async function rustInvoke(cmd, args = {}) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(cmd, args);
}

/** Get main window bounds in physical pixels */
async function getMainWindowBounds() {
  const { invoke } = await import("@tauri-apps/api/core");
  const { x, y, scaleFactor } = await invoke("get_window_inner_pos");
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  const size = await win.innerSize(); // physical pixels
  return { x, y, width: size.width, height: size.height, scaleFactor };
}

/** Open (or focus) the native browser window for a tab */
async function openNativeBrowserWindow(url, tabId, onClose) {
  // If already open for this tab, just navigate it
  const existing = nativeWinRegistry.get(tabId);
  if (existing) {
    try {
      await existing.navigate(url);
      await existing.show();
      await existing.setFocus();
      return existing;
    } catch {
      nativeWinRegistry.delete(tabId);
    }
  }

  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

  // Get main window position so we can place the browser window on top of it
  let winX = 200, winY = 100, winW = 1024, winH = 700;
  try {
    const bounds = await getMainWindowBounds();
    const sf = bounds.scaleFactor || 1;
    // Convert physical to logical pixels for WebviewWindow
    winX = Math.round(bounds.x / sf);
    winY = Math.round(bounds.y / sf);
    winW = Math.round(bounds.width / sf);
    winH = Math.round(bounds.height / sf);
  } catch {}

  const label = `browser-win-${tabId.replace(/[^a-zA-Z0-9]/g, "-")}`;

  const win = new WebviewWindow(label, {
    url,
    title: urlLabel(url) + " — AnonTweet Browser",
    width: winW,
    height: winH,
    x: winX,
    y: winY,
    minWidth: 320,
    minHeight: 240,
    resizable: true,
    decorations: true,
    focus: true,
    center: false,
  });

  await new Promise((resolve, reject) => {
    win.once("tauri://created", resolve);
    win.once("tauri://error", (e) => reject(new Error(String(e.payload || "Failed to open browser window"))));
    setTimeout(resolve, 5000);
  });

  nativeWinRegistry.set(tabId, win);

  // Listen for window close
  const unlisten = await win.listen("tauri://close-requested", () => {
    nativeWinRegistry.delete(tabId);
    unlisten();
    onClose?.();
  });

  return win;
}

async function closeNativeBrowserWindow(tabId) {
  const win = nativeWinRegistry.get(tabId);
  if (win) {
    try { await win.close(); } catch {}
    nativeWinRegistry.delete(tabId);
  }
}

async function focusNativeBrowserWindow(tabId) {
  const win = nativeWinRegistry.get(tabId);
  if (win) {
    try { await win.show(); await win.setFocus(); } catch {}
  }
}

function NativeBrowserClient() {
  const [tabs, setTabs] = useState(() => [makeTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [openTabIds, setOpenTabIds] = useState(new Set()); // tabs with open windows
  const [loadingTabId, setLoadingTabId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const inputRef = useRef(null);
  const activeIdRef = useRef(activeId);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const hasOpenWindow = openTabIds.has(activeId);
  const isLoading = loadingTabId === activeId;

  // ── Open / navigate ─────────────────────────────────────────────────────

  const openBrowserWindow = useCallback(async (url, tabId) => {
    setLoadingTabId(tabId);
    setErrorMsg(null);
    try {
      await openNativeBrowserWindow(url, tabId, () => {
        setOpenTabIds((prev) => { const next = new Set(prev); next.delete(tabId); return next; });
        // If this was the active tab, mark it closed
        setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, loading: false } : t));
      });
      setOpenTabIds((prev) => new Set([...prev, tabId]));
      setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, loading: false } : t));
    } catch (err) {
      setErrorMsg(String(err?.message || err || "Failed to open browser window"));
    } finally {
      setLoadingTabId(null);
    }
  }, []);

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
    openBrowserWindow(url, id);
  }, [openBrowserWindow]);

  const goBack = useCallback(async () => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t || t.histIndex <= 0) return;
    const histIndex = t.histIndex - 1;
    const url = t.history[histIndex];
    setInput(url);
    setTabs((prev) => prev.map((x) => x.id === activeId ? { ...x, histIndex, url, display: url, loading: true } : x));
    const win = nativeWinRegistry.get(activeId);
    if (win) { try { await win.navigate(url); setTabs((p) => p.map((x) => x.id === activeId ? { ...x, loading: false } : x)); } catch {} }
  }, [tabs, activeId]);

  const goForward = useCallback(async () => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t || t.histIndex >= t.history.length - 1) return;
    const histIndex = t.histIndex + 1;
    const url = t.history[histIndex];
    setInput(url);
    setTabs((prev) => prev.map((x) => x.id === activeId ? { ...x, histIndex, url, display: url, loading: true } : x));
    const win = nativeWinRegistry.get(activeId);
    if (win) { try { await win.navigate(url); setTabs((p) => p.map((x) => x.id === activeId ? { ...x, loading: false } : x)); } catch {} }
  }, [tabs, activeId]);

  const reload = useCallback(async () => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t?.url) return;
    const win = nativeWinRegistry.get(activeId);
    if (win) { try { await win.navigate(t.url); } catch {} }
    else openBrowserWindow(t.url, activeId);
  }, [activeId, tabs, openBrowserWindow]);

  const goHome = useCallback(async () => {
    await closeNativeBrowserWindow(activeId);
    setOpenTabIds((prev) => { const next = new Set(prev); next.delete(activeId); return next; });
    setInput("");
    setErrorMsg(null);
    setTabs((prev) => prev.map((t) => t.id === activeId ? { ...t, url: "", display: "", title: "", loading: false, error: false } : t));
  }, [activeId]);

  const focusWindow = useCallback(() => focusNativeBrowserWindow(activeId), [activeId]);

  // ── Tabs ─────────────────────────────────────────────────────────────────

  const addTab = useCallback(() => {
    const t = makeTab();
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
    setInput("");
    setErrorMsg(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const closeTab = useCallback(async (id, e) => {
    e?.stopPropagation();
    await closeNativeBrowserWindow(id);
    setOpenTabIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) { const fresh = makeTab(); setActiveId(fresh.id); setInput(""); return [fresh]; }
      if (id === activeIdRef.current) { const n = next[Math.min(idx, next.length - 1)]; setActiveId(n.id); setInput(n.display || ""); }
      return next;
    });
  }, []);

  const selectTab = useCallback((id) => {
    setActiveId(id);
    const t = tabs.find((x) => x.id === id);
    setInput(t?.display || "");
    setErrorMsg(null);
    // Focus the window for that tab if it's open
    focusNativeBrowserWindow(id);
  }, [tabs]);

  // Cleanup all windows on unmount
  useEffect(() => {
    return () => {
      for (const id of nativeWinRegistry.keys()) {
        closeNativeBrowserWindow(id).catch(() => {});
      }
    };
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

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

  useEffect(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (t) setInput(t.display || "");
  }, [activeId]); // eslint-disable-line

  const canBack = activeTab && activeTab.histIndex > 0;
  const canForward = activeTab && activeTab.histIndex < activeTab.history.length - 1;

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
              {t.loading && !webviewReady ? <SpinnerIcon /> : <span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />}
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
        <button onClick={addTab} title="New tab (Ctrl+T)"
          className="ml-0.5 p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* ── Address bar ── */}
      <div className="relative flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
        <LoadingBar active={isLoading} />

        <div className="flex items-center gap-0 shrink-0">
          <NavButton onClick={goBack}    disabled={!canBack}    title="Back (Alt+←)"><IconBack /></NavButton>
          <NavButton onClick={goForward} disabled={!canForward} title="Forward (Alt+→)"><IconForward /></NavButton>
          <NavButton onClick={isLoading ? () => {} : reload} title={isLoading ? "Loading…" : "Reload (Ctrl+R)"}>
            {isLoading ? <IconStop /> : <IconReload />}
          </NavButton>
          <NavButton onClick={goHome} title="Home"><IconHome /></NavButton>
        </div>

        <form className="flex-1 min-w-0"
          onSubmit={(e) => { e.preventDefault(); navigate(input); inputRef.current?.blur(); }}>
          <div className={`flex items-center gap-2 rounded-full px-3 h-9 transition-all
            ${inputFocused ? "bg-white dark:bg-gray-900 ring-2 ring-blue-500 shadow-sm" : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200/70 dark:hover:bg-gray-700/70"}`}>
            {!inputFocused && activeTab?.url ? <IconLock /> : <IconSearch />}
            <input
              ref={inputRef}
              type="text"
              value={inputFocused ? input : (activeTab?.display || input)}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => { setInputFocused(true); requestAnimationFrame(() => inputRef.current?.select()); }}
              onBlur={() => setInputFocused(false)}
              placeholder="Search or type a URL…"
              spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" enterKeyHint="go"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
            {input && inputFocused && (
              <button type="button" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setInput(""); inputRef.current?.focus(); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 text-xs">✕</button>
            )}
          </div>
        </form>

        {/* Focus window button — when a window is open for this tab */}
        {activeTab?.url && hasOpenWindow && (
          <NavButton onClick={focusWindow} title="Bring browser window to front">
            <IconPopOut />
          </NavButton>
        )}
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-white dark:bg-gray-950">
        {!activeTab?.url ? (
          <NativeHomePage navigate={navigate} input={input} setInput={setInput} inputRef={inputRef} />
        ) : errorMsg ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <div className="text-4xl">🌐</div>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Unable to open browser</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">{errorMsg}</p>
            <button onClick={() => { setErrorMsg(null); navigate(activeTab.url); }}
              className="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium transition-colors">
              Try again
            </button>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm text-gray-500 dark:text-gray-400">Opening {urlLabel(activeTab.url)}…</span>
          </div>
        ) : hasOpenWindow ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-white">
                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM6.262 6.072a8.25 8.25 0 1 0 10.562-.766 4.5 4.5 0 0 1-1.318 1.357L14.25 7.5l.165.33a.809.809 0 0 1-1.086 1.085l-.604-.302a1.125 1.125 0 0 0-1.298.21l-.132.131c-.439.44-.439 1.152 0 1.591l.296.296c.256.257.622.374.98.314l1.17-.195c.323-.054.654.036.905.245l1.33 1.108c.32.267.46.694.358 1.1a8.7 8.7 0 0 1-2.288 4.04l-.723.724a1.125 1.125 0 0 1-1.298.21l-.153-.076a1.125 1.125 0 0 1-.622-1.006v-1.089c0-.298-.119-.585-.33-.796l-1.347-1.347a1.125 1.125 0 0 1 1.591-1.591L8 14.25v.093c0 .498.198.975.55 1.327l.15.15c.282.283.664.443 1.063.443h.465a.375.375 0 0 0 .375-.375v-.405a.375.375 0 0 0-.215-.343l-.62-.31a.75.75 0 0 1-.41-.65V8.57a.75.75 0 0 1 .298-.599l2.048-1.536z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {urlLabel(activeTab.url)} is open
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                Loaded in a native Chromium window — no proxy, no restrictions.
              </p>
            </div>
            <button onClick={focusWindow}
              className="px-5 py-2.5 rounded-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-medium transition-colors shadow-md">
              Bring to front
            </button>
          </div>
        ) : (
          <NativeHomePage navigate={navigate} input={input} setInput={setInput} inputRef={inputRef} />
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PROXY BROWSER — web fallback
// ═════════════════════════════════════════════════════════════════════════════

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
  const iframeSrc = activeTab?.url ? `/api/browser?url=${encodeURIComponent(activeTab.url)}` : null;

  const updateTab = useCallback((id, patch) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const navigate = useCallback((raw, tabId) => {
    const url = normalizeInput(raw);
    if (!url) return;
    const id = tabId ?? activeIdRef.current;
    setInput(url);
    setTabs((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const hist = t.history.slice(0, t.histIndex + 1);
      if (hist[hist.length - 1] !== url) hist.push(url);
      return { ...t, url, display: url, title: urlLabel(url), loading: true, error: false, history: hist, histIndex: hist.length - 1 };
    }));
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
    setTabs((prev) => prev.map((x) => x.id === activeId ? { ...x, loading: true, error: false, _reloadKey: (x._reloadKey || 0) + 1 } : x));
  }, [activeId]);

  const goHome = useCallback(() => {
    setInput("");
    setTabs((prev) => prev.map((t) => t.id === activeId ? { ...t, url: "", display: "", title: "", loading: false, error: false } : t));
  }, [activeId]);

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
      if (next.length === 0) { const fresh = makeTab(); setActiveId(fresh.id); setInput(""); return [fresh]; }
      if (id === activeIdRef.current) { const n = next[Math.min(idx, next.length - 1)]; setActiveId(n.id); setInput(n.display); }
      return next;
    });
  }, []);

  const selectTab = useCallback((id) => {
    setActiveId(id);
    const t = tabs.find((x) => x.id === id);
    if (t) setInput(t.display);
  }, [tabs]);

  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let realUrl = null, title = "";
    try { realUrl = extractRealUrl(iframe.contentWindow?.location?.href); title = iframe.contentDocument?.title || ""; } catch {}
    const id = activeIdRef.current;
    setTabs((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const display = realUrl || t.display;
      const hist = t.history.slice(0, t.histIndex + 1);
      if (realUrl && hist[hist.length - 1] !== realUrl) {
        hist.push(realUrl);
        return { ...t, url: realUrl, display, title: title || urlLabel(display), loading: false, error: false, history: hist, histIndex: hist.length - 1 };
      }
      return { ...t, display, title: title || urlLabel(display), loading: false, error: false };
    }));
    if (realUrl) setInput(realUrl);
  }, []);

  const handleError = useCallback(() => {
    updateTab(activeIdRef.current, { loading: false, error: true });
  }, [updateTab]);

  useEffect(() => {
    const onMessage = (e) => {
      const data = e.data?.__browser;
      if (!data) return;
      if (data.type === "newTab" && data.url) {
        const t = makeTab({ url: data.url, display: data.url, loading: true });
        setTabs((prev) => [...prev, t]); setActiveId(t.id); setInput(data.url);
        return;
      }
      if (data.type === "nav") {
        const id = activeIdRef.current;
        setTabs((prev) => prev.map((t) => {
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
        }));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

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

  useEffect(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (t) setInput(t.display);
  }, [activeId]); // eslint-disable-line

  const canBack = activeTab && activeTab.histIndex > 0;
  const canForward = activeTab && activeTab.histIndex < activeTab.history.length - 1;
  const isLoading = activeTab?.loading ?? false;

  return (
    <div className="h-dvh flex flex-col bg-white dark:bg-gray-950 overflow-hidden">
      {/* Tab strip */}
      <div className="flex items-center gap-0.5 px-1.5 pt-1.5 border-b border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 overflow-x-auto scrollbar-hide shrink-0 select-none">
        {tabs.map((t) => {
          const isActive = t.id === activeId;
          return (
            <div key={t.id} role="tab" aria-selected={isActive} onClick={() => selectTab(t.id)}
              className={`group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-t-lg text-xs max-w-[180px] min-w-[100px] cursor-pointer border border-b-0 shrink-0 transition-colors
                ${isActive ? "bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700 shadow-sm" : "bg-transparent text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-200/60 dark:hover:bg-gray-800/60"}`}>
              {t.loading ? <SpinnerIcon /> : <span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />}
              <span className="truncate flex-1 font-medium">{t.title || (t.display ? urlLabel(t.display) : "New Tab")}</span>
              <button aria-label="Close tab" onClick={(e) => closeTab(t.id, e)}
                className={`w-4 h-4 flex items-center justify-center rounded-full text-[10px] transition-opacity shrink-0
                  ${isActive ? "opacity-50 hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700" : "opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>✕</button>
            </div>
          );
        })}
        <button onClick={addTab} title="New tab (Ctrl+T)"
          className="ml-0.5 p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Address bar */}
      <div className="relative flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
        <LoadingBar active={isLoading} />
        <div className="flex items-center gap-0 shrink-0">
          <NavButton onClick={goBack}    disabled={!canBack}    title="Back (Alt+←)"><IconBack /></NavButton>
          <NavButton onClick={goForward} disabled={!canForward} title="Forward (Alt+→)"><IconForward /></NavButton>
          <NavButton onClick={isLoading ? () => updateTab(activeId, { loading: false }) : reload} title={isLoading ? "Stop" : "Reload (Ctrl+R)"}>
            {isLoading ? <IconStop /> : <IconReload />}
          </NavButton>
          <NavButton onClick={goHome} title="Home"><IconHome /></NavButton>
        </div>
        <form className="flex-1 min-w-0" onSubmit={(e) => { e.preventDefault(); navigate(input); inputRef.current?.blur(); }}>
          <div className={`flex items-center gap-2 rounded-full px-3 h-9 transition-all
            ${inputFocused ? "bg-white dark:bg-gray-900 ring-2 ring-blue-500 shadow-sm" : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200/70 dark:hover:bg-gray-700/70"}`}>
            {!inputFocused && activeTab?.url ? <IconLock /> : <IconSearch />}
            <input ref={inputRef} type="text"
              value={inputFocused ? input : (activeTab?.display || input)}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => { setInputFocused(true); requestAnimationFrame(() => inputRef.current?.select()); }}
              onBlur={() => setInputFocused(false)}
              placeholder="Search or enter URL   (Ctrl+L)"
              spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" enterKeyHint="go"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" />
            {input && inputFocused && (
              <button type="button" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setInput(""); inputRef.current?.focus(); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 text-xs">✕</button>
            )}
          </div>
        </form>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 relative bg-white dark:bg-gray-950">
        {iframeSrc ? (
          <iframe
            ref={iframeRef}
            key={`${activeTab.id}-${activeTab._reloadKey ?? 0}`}
            src={iframeSrc}
            title={activeTab.title || "Browser"}
            onLoad={handleLoad} onError={handleError}
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

// ─── Root export ──────────────────────────────────────────────────────────────

export default function BrowserClient() {
  const [inTauri, setInTauri] = useState(false);
  useEffect(() => { setInTauri(isTauri()); }, []);
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">AnonTweet Browser</h1>
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
            <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Search Google or type a URL…" spellCheck={false} autoComplete="off"
              className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" />
            {input && <button type="button" onClick={() => setInput("")} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>}
          </div>
        </form>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {NATIVE_SHORTCUTS.map((s) => (
            <button key={s.name} onClick={() => navigate(s.url)}
              className={`rounded-2xl p-4 flex flex-col items-center gap-2 bg-gradient-to-br ${s.gradient} text-white hover:scale-[1.04] active:scale-[0.98] transition-transform shadow-md`}>
              <span className="text-2xl leading-none">{s.emoji}</span>
              <span className="text-xs font-semibold tracking-wide">{s.name}</span>
            </button>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
          {[["Ctrl+L","Focus URL"],["Ctrl+T","New tab"],["Ctrl+W","Close tab"],["Ctrl+R","Reload"],["Alt+←/→","Back/Fwd"]].map(([k,d]) => (
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">AnonTweet Browser</h1>
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
            <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Search or enter URL…" spellCheck={false} autoComplete="off"
              className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" />
            {input && <button type="button" onClick={() => setInput("")} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>}
          </div>
        </form>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {WEB_SHORTCUTS.map((s) => (
            <button key={s.name} onClick={() => navigate(s.url)}
              className={`rounded-2xl p-4 flex flex-col items-center gap-2 bg-gradient-to-br ${s.gradient} text-white hover:scale-[1.04] active:scale-[0.98] transition-transform shadow-md`}>
              <span className="text-2xl leading-none">{s.emoji}</span>
              <span className="text-xs font-semibold tracking-wide">{s.name}</span>
            </button>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          Download the <span className="font-medium text-gray-600 dark:text-gray-300">AnonTweet desktop app</span> for a native browser with no restrictions.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
          {[["Ctrl+L","Focus URL"],["Ctrl+T","New tab"],["Ctrl+W","Close tab"],["Ctrl+R","Reload"],["Alt+←/→","Back/Fwd"]].map(([k,d]) => (
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
