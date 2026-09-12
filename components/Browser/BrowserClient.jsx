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
// Webview is managed via Rust browser_open/navigate/set_bounds/close commands.
// We use a frameless overlay window positioned at the exact screen coordinates
// of the content placeholder div.
// ═════════════════════════════════════════════════════════════════════════════

let _inlineActive = false;

async function rustInvoke(cmd, args = {}) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(cmd, args);
}

/** Convert a DOMRect (logical CSS px relative to viewport) to physical screen px */
async function rectToPhysical(rect) {
  const { x: winX, y: winY, scaleFactor } = await rustInvoke("get_window_inner_pos");
  const dpr = scaleFactor || window.devicePixelRatio || 1;
  return {
    x:      Math.round(winX + rect.left * dpr),
    y:      Math.round(winY + rect.top  * dpr),
    width:  Math.max(1, Math.round(rect.width  * dpr)),
    height: Math.max(1, Math.round(rect.height * dpr)),
  };
}

async function browserOpen(url, rect) {
  const phys = await rectToPhysical(rect);
  await rustInvoke("browser_open", { url, ...phys });
  _inlineActive = true;
}

async function browserNavigate(url) {
  await rustInvoke("browser_navigate", { url });
}

async function browserSetBounds(rect) {
  if (!_inlineActive) return;
  try {
    const phys = await rectToPhysical(rect);
    await rustInvoke("browser_set_bounds", phys);
  } catch {}
}

async function browserClose() {
  if (!_inlineActive) return;
  _inlineActive = false;
  await rustInvoke("browser_close").catch(() => {});
}

async function openPopOutWindow(url) {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const label = `browser-popup-${Date.now()}`;
  const win = new WebviewWindow(label, {
    url, title: urlLabel(url),
    width: 1280, height: 800, minWidth: 400, minHeight: 400,
    resizable: true, center: true, decorations: true, focus: true,
  });
  win.once("tauri://error", () => {});
  return win;
}

function NativeBrowserClient() {
  // Tab model — each tab = a URL + history stack. Only active tab has a live webview.
  const [tabs, setTabs] = useState(() => [makeTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [isPoppedOut, setIsPoppedOut] = useState(false);
  const [webviewReady, setWebviewReady] = useState(false);
  const [webviewError, setWebviewError] = useState(null);

  const inputRef = useRef(null);
  const contentRef = useRef(null);   // the placeholder div the webview covers
  const activeIdRef = useRef(activeId);
  const rafRef = useRef(null);
  const lastRectRef = useRef(null);
  const poppedOutWinRef = useRef(null);
  // track whether we've created a webview for the current URL
  const webviewCreatedRef = useRef(false);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const hasUrl = Boolean(activeTab?.url);

  // ── Sync bounds via rAF ────────────────────────────────────────────────────

  const syncBounds = useCallback(() => {
    const el = contentRef.current;
    if (!el || !webviewCreatedRef.current) return;
    const rect = el.getBoundingClientRect();
    const last = lastRectRef.current;
    if (
      last &&
      Math.abs(last.left - rect.left) < 1 &&
      Math.abs(last.top - rect.top) < 1 &&
      Math.abs(last.width - rect.width) < 1 &&
      Math.abs(last.height - rect.height) < 1
    ) return;
    lastRectRef.current = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    browserSetBounds(rect);
  }, []);

  useEffect(() => {
    if (!hasUrl || isPoppedOut || !webviewReady) return;
    let running = true;
    const loop = () => {
      if (!running) return;
      syncBounds();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [hasUrl, isPoppedOut, webviewReady, syncBounds]);

  // ── Create inline webview when active tab URL changes ────────────────────

  useEffect(() => {
    if (!hasUrl || isPoppedOut) return;
    const el = contentRef.current;
    if (!el) return;

    let cancelled = false;
    setWebviewReady(false);
    setWebviewError(null);
    webviewCreatedRef.current = false;

    (async () => {
      // Always close any existing webview before opening a new one
      await browserClose();
      if (cancelled) return;

      const rect = el.getBoundingClientRect();
      lastRectRef.current = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };

      try {
        await browserOpen(activeTab.url, rect);
        if (cancelled) { await browserClose(); return; }
        webviewCreatedRef.current = true;
        setWebviewReady(true);
        setTabs((prev) => prev.map((t) => t.id === activeIdRef.current ? { ...t, loading: false } : t));
      } catch (err) {
        if (!cancelled) {
          setWebviewError(String(err?.message || err || "Failed to create webview"));
          setTabs((prev) => prev.map((t) => t.id === activeIdRef.current ? { ...t, loading: false, error: true } : t));
        }
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.url, isPoppedOut]);

  // ── Destroy on unmount ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      browserClose();
    };
  }, []);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const navigate = useCallback((raw, tabId) => {
    const url = normalizeInput(raw);
    if (!url) return;
    const id = tabId ?? activeIdRef.current;
    setInput(url);
    setWebviewReady(false);
    setWebviewError(null);
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const hist = t.history.slice(0, t.histIndex + 1);
        if (hist[hist.length - 1] !== url) hist.push(url);
        return { ...t, url, display: url, title: urlLabel(url), loading: true, error: false, history: hist, histIndex: hist.length - 1 };
      })
    );

    // If popped out, navigate the popup window
    if (isPoppedOut && poppedOutWinRef.current) {
      try { poppedOutWinRef.current.navigate(url); } catch {}
      return;
    }

    // If webview already exists, navigate it in-place (no recreate needed)
    if (webviewCreatedRef.current) {
      browserNavigate(url)
        .then(() => setTabs((prev) => prev.map((t) => t.id === id ? { ...t, loading: false } : t)))
        .catch(() => {});
    }
    // Otherwise the useEffect above will create it when url state updates
  }, [isPoppedOut]);

  const goBack = useCallback(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t || t.histIndex <= 0) return;
    const histIndex = t.histIndex - 1;
    const url = t.history[histIndex];
    setInput(url);
    setTabs((prev) => prev.map((x) => x.id === activeId ? { ...x, histIndex, url, display: url, loading: true, error: false } : x));
    if (webviewCreatedRef.current) browserNavigate(url).catch(() => {});
  }, [tabs, activeId]);

  const goForward = useCallback(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t || t.histIndex >= t.history.length - 1) return;
    const histIndex = t.histIndex + 1;
    const url = t.history[histIndex];
    setInput(url);
    setTabs((prev) => prev.map((x) => x.id === activeId ? { ...x, histIndex, url, display: url, loading: true, error: false } : x));
    if (webviewCreatedRef.current) browserNavigate(url).catch(() => {});
  }, [tabs, activeId]);

  const reload = useCallback(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t?.url) return;
    if (webviewCreatedRef.current) browserNavigate(t.url).catch(() => {});
    else navigate(t.url);
  }, [activeId, tabs, navigate]);

  const goHome = useCallback(async () => {
    setInput("");
    setWebviewReady(false);
    setWebviewError(null);
    webviewCreatedRef.current = false;
    await browserClose();
    setTabs((prev) => prev.map((t) => t.id === activeId ? { ...t, url: "", display: "", title: "", loading: false, error: false } : t));
  }, [activeId]);

  // ── Pop out / pop in ───────────────────────────────────────────────────────

  const handlePopOut = useCallback(async () => {
    const url = activeTab?.url;
    if (!url) return;
    webviewCreatedRef.current = false;
    await browserClose();
    setIsPoppedOut(true);
    const win = await openPopOutWindow(url);
    poppedOutWinRef.current = win;
    win.once("tauri://destroyed", () => {
      poppedOutWinRef.current = null;
      setIsPoppedOut(false);
    });
  }, [activeTab]);

  const handlePopIn = useCallback(async () => {
    if (poppedOutWinRef.current) {
      try { await poppedOutWinRef.current.close(); } catch {}
      poppedOutWinRef.current = null;
    }
    setIsPoppedOut(false);
  }, []);

  // ── Tabs ───────────────────────────────────────────────────────────────────

  const addTab = useCallback(async () => {
    webviewCreatedRef.current = false;
    await browserClose();
    setWebviewReady(false);
    setIsPoppedOut(false);
    const t = makeTab();
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const closeTab = useCallback(async (id, e) => {
    e?.stopPropagation();
    if (id === activeIdRef.current) {
      webviewCreatedRef.current = false;
      await browserClose();
      setWebviewReady(false);
      setIsPoppedOut(false);
    }
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
        setInput(neighbor.display || "");
      }
      return next;
    });
  }, []);

  const selectTab = useCallback(async (id) => {
    if (id === activeIdRef.current) return;
    webviewCreatedRef.current = false;
    await browserClose();
    setWebviewReady(false);
    setIsPoppedOut(false);
    setActiveId(id);
    const t = tabs.find((x) => x.id === id);
    setInput(t?.display || "");
  }, [tabs]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

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
  const isLoading = activeTab?.loading && !webviewReady;

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

        {/* Pop-out / pop-in button — only when a page is loaded */}
        {hasUrl && (
          <NavButton
            onClick={isPoppedOut ? handlePopIn : handlePopOut}
            title={isPoppedOut ? "Pop back in" : "Open in separate window"}
          >
            {isPoppedOut ? <IconPopIn /> : <IconPopOut />}
          </NavButton>
        )}
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-white dark:bg-gray-950">
        {!hasUrl ? (
          /* New tab / home page */
          <NativeHomePage navigate={navigate} input={input} setInput={setInput} inputRef={inputRef} />
        ) : isPoppedOut ? (
          /* Popped-out state */
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
              <IconPopOut />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Opened in a separate window
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                <span className="font-medium text-blue-500">{urlLabel(activeTab.url)}</span> is open in its own window.
              </p>
            </div>
            <button onClick={handlePopIn}
              className="px-4 py-2 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors shadow flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
              </svg>
              Pop back in
            </button>
          </div>
        ) : webviewError ? (
          /* Error state */
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <div className="text-4xl">🌐</div>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Unable to load page</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">{webviewError}</p>
            <button onClick={() => navigate(activeTab.url)}
              className="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium transition-colors">
              Try again
            </button>
          </div>
        ) : (
          /* Inline webview placeholder — the Tauri Webview renders on top of this */
          <div
            ref={contentRef}
            className="absolute inset-0 bg-gray-50 dark:bg-gray-900"
          >
            {/* Shown only while webview is initialising */}
            {!webviewReady && (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
                  <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span className="text-sm">Loading {urlLabel(activeTab.url)}…</span>
                </div>
              </div>
            )}
          </div>
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
