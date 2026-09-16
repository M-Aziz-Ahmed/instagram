"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Tauri detection ──────────────────────────────────────────────────────────

function isTauri() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

// ─── Shortcuts ────────────────────────────────────────────────────────────────

const ALL_SHORTCUTS = [
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

const WEB_SHORTCUTS = ALL_SHORTCUTS.filter((s) =>
  !["YouTube", "Reddit", "X", "Google", "ChatGPT", "Twitch"].includes(s.name)
);

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
  try { return new URL(proxyHref).searchParams.get("url") || null; }
  catch { return null; }
}

function urlLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url || ""; }
}

function getFavicon(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
  catch { return null; }
}

// ─── Bookmarks storage ────────────────────────────────────────────────────────

function loadBookmarks() {
  try { return JSON.parse(localStorage.getItem("anb_bookmarks") || "[]"); }
  catch { return []; }
}
function saveBookmarks(bm) {
  try { localStorage.setItem("anb_bookmarks", JSON.stringify(bm)); } catch {}
}

// ─── Tab model ────────────────────────────────────────────────────────────────

let _tabCounter = 0;
const newTabId = () => `tab-${++_tabCounter}`;

function makeTab(overrides = {}) {
  return {
    id: newTabId(), url: "", display: "", title: "",
    history: [], histIndex: -1, loading: false, error: false, favicon: null,
    ...overrides,
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

// ─── Shared sub-components ────────────────────────────────────────────────────

function NavButton({ children, disabled, title, onClick, active }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`p-1.5 rounded-full transition-colors disabled:opacity-30 disabled:pointer-events-none shrink-0
        ${active
          ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20"
          : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}>
      {children}
    </button>
  );
}

// SVG icon components
const Ic = {
  Back:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>,
  Forward: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>,
  Reload:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>,
  Stop:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
  Home:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"/></svg>,
  PopOut:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>,
  Bookmark:() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"/></svg>,
  BookmarkFill:()=><svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-yellow-500"><path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0 1 11.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93Z" clipRule="evenodd"/></svg>,
  History: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>,
  Extensions:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z"/></svg>,
  Settings:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>,
  Lock:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-green-500 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z"/></svg>,
  Search:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-gray-400 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>,
  Spinner: () => <svg className="w-3 h-3 shrink-0 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>,
  Plus:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>,
  Trash:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>,
  Close:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>,
  ZoomIn:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM10.5 7.5v6m3-3h-6"/></svg>,
  ZoomOut: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM13.5 10.5h-6"/></svg>,
};

// ─── Sidebar panel ────────────────────────────────────────────────────────────

function SidePanel({ panel, bookmarks, history, onNavigate, onDeleteBookmark, onClearHistory, onClose }) {
  const [bmSearch, setBmSearch] = useState("");
  const [histSearch, setHistSearch] = useState("");

  const filteredBm = bookmarks.filter((b) =>
    bmSearch ? (b.title + b.url).toLowerCase().includes(bmSearch.toLowerCase()) : true
  );
  const filteredHist = history.filter((h) =>
    histSearch ? (h.title + h.url).toLowerCase().includes(histSearch.toLowerCase()) : true
  );

  const panelTitle = panel === "bookmarks" ? "Bookmarks" : panel === "history" ? "History" : panel === "extensions" ? "Extensions" : "Settings";

  return (
    <div className="w-72 shrink-0 flex flex-col border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{panelTitle}</span>
        <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <Ic.Close />
        </button>
      </div>

      {/* Panel content */}
      {panel === "bookmarks" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-3 py-2 shrink-0">
            <input
              type="text"
              value={bmSearch}
              onChange={(e) => setBmSearch(e.target.value)}
              placeholder="Search bookmarks…"
              className="w-full bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {filteredBm.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600 gap-2">
                <Ic.Bookmark />
                <p className="text-xs">{bmSearch ? "No matching bookmarks" : "No bookmarks yet"}</p>
                <p className="text-[10px] text-center">Navigate to a page and click ☆ to bookmark it</p>
              </div>
            ) : (
              filteredBm.map((b) => (
                <div key={b.id} className="group flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => onNavigate(b.url)}>
                  {b.favicon ? (
                    <img src={b.favicon} alt="" className="w-4 h-4 rounded shrink-0" onError={(e) => { e.target.style.display = "none"; }} />
                  ) : (
                    <span className="w-4 h-4 shrink-0 text-gray-300 dark:text-gray-600"><Ic.Bookmark /></span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{b.title || urlLabel(b.url)}</p>
                    <p className="text-[10px] text-gray-400 truncate">{urlLabel(b.url)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteBookmark(b.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all rounded"
                  >
                    <Ic.Trash />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {panel === "history" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-3 py-2 flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={histSearch}
              onChange={(e) => setHistSearch(e.target.value)}
              placeholder="Search history…"
              className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
            />
            {history.length > 0 && (
              <button onClick={onClearHistory} title="Clear history" className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                <Ic.Trash />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {filteredHist.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600 gap-2">
                <Ic.History />
                <p className="text-xs">{histSearch ? "No matching results" : "No history yet"}</p>
              </div>
            ) : (
              filteredHist.map((h, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => onNavigate(h.url)}>
                  {h.favicon ? (
                    <img src={h.favicon} alt="" className="w-4 h-4 rounded shrink-0" onError={(e) => { e.target.style.display = "none"; }} />
                  ) : (
                    <span className="w-4 h-4 shrink-0 text-gray-300 dark:text-gray-600"><Ic.History /></span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{h.title || urlLabel(h.url)}</p>
                    <p className="text-[10px] text-gray-400 truncate">{urlLabel(h.url)} · {h.time}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {panel === "extensions" && (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Manage browser extensions and add-ons.</p>

          {/* Built-in extensions */}
          {[
            { name: "AdBlock", desc: "Block ads and trackers", icon: "🛡️", enabled: true },
            { name: "Dark Reader", desc: "Dark mode for every website", icon: "🌙", enabled: false },
            { name: "Password Manager", desc: "Save and autofill passwords", icon: "🔐", enabled: false },
            { name: "Translate", desc: "Translate pages automatically", icon: "🌐", enabled: true },
            { name: "Screenshot", desc: "Capture full-page screenshots", icon: "📸", enabled: false },
            { name: "Reader Mode", desc: "Clean reading view for articles", icon: "📖", enabled: false },
          ].map((ext) => (
            <ExtensionItem key={ext.name} ext={ext} />
          ))}

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
              More extensions coming soon
            </p>
          </div>
        </div>
      )}

      {panel === "settings" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Search Engine</p>
            <div className="space-y-1">
              {["Google", "DuckDuckGo", "Bing", "Brave Search"].map((s) => (
                <label key={s} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                  <input type="radio" name="search" defaultChecked={s === "Google"} className="accent-blue-500" />
                  <span className="text-sm text-gray-900 dark:text-gray-100">{s}</span>
                </label>
              ))}
            </div>
          </section>
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Privacy</p>
            {[
              { label: "Block trackers", checked: true },
              { label: "Do Not Track", checked: true },
              { label: "Block cookies", checked: false },
            ].map((item) => (
              <label key={item.label} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                <span className="text-sm text-gray-900 dark:text-gray-100">{item.label}</span>
                <input type="checkbox" defaultChecked={item.checked} className="accent-blue-500" />
              </label>
            ))}
          </section>
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Appearance</p>
            {[
              { label: "Show bookmarks bar", checked: false },
              { label: "Smooth scrolling", checked: true },
            ].map((item) => (
              <label key={item.label} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                <span className="text-sm text-gray-900 dark:text-gray-100">{item.label}</span>
                <input type="checkbox" defaultChecked={item.checked} className="accent-blue-500" />
              </label>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function ExtensionItem({ ext }) {
  const [enabled, setEnabled] = useState(ext.enabled);
  return (
    <div className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <span className="text-xl shrink-0">{ext.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{ext.name}</p>
        <p className="text-[10px] text-gray-400 truncate">{ext.desc}</p>
      </div>
      <button
        onClick={() => setEnabled(!enabled)}
        className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${enabled ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`}
        title={enabled ? "Disable" : "Enable"}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

// ─── Shared address bar + toolbar ─────────────────────────────────────────────

function BrowserToolbar({
  tabs, activeId, activeTab, input, inputFocused, isLoading,
  canBack, canForward, isBookmarked, panel, zoom,
  onBack, onForward, onReload, onHome, onNavigate, onInputChange,
  onInputFocus, onInputBlur, onInputClear, onAddTab, onCloseTab, onSelectTab,
  onToggleBookmark, onTogglePanel, onPopOut, onZoomIn, onZoomOut, onZoomReset,
  inputRef, showZoom,
}) {
  return (
    <>
      {/* Tab strip */}
      <div className="flex items-center gap-0.5 px-1.5 pt-1.5 border-b border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 overflow-x-auto scrollbar-hide shrink-0 select-none">
        {tabs.map((t) => {
          const isActive = t.id === activeId;
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectTab(t.id)}
              className={`
                group flex items-center gap-1.5 pl-2 pr-1.5 py-1.5 rounded-t-lg text-xs
                max-w-[180px] min-w-[90px] cursor-pointer border border-b-0 shrink-0 transition-colors
                ${isActive
                  ? "bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700 shadow-sm"
                  : "bg-transparent text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-200/60 dark:hover:bg-gray-800/60"
                }
              `}
            >
              {t.loading ? (
                <Ic.Spinner />
              ) : t.favicon ? (
                <img src={t.favicon} alt="" className="w-3 h-3 rounded shrink-0" onError={(e) => { e.target.style.display = "none"; }} />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
              )}
              <span className="truncate flex-1 font-medium">
                {t.title || (t.display ? urlLabel(t.display) : "New Tab")}
              </span>
              <button
                aria-label="Close tab"
                onClick={(e) => onCloseTab(t.id, e)}
                className={`w-4 h-4 flex items-center justify-center rounded-full text-[10px] transition-opacity shrink-0
                  ${isActive ? "opacity-50 hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700" : "opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
              >✕</button>
            </div>
          );
        })}
        <button onClick={onAddTab} title="New tab (Ctrl+T)"
          className="ml-0.5 p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors shrink-0">
          <Ic.Plus />
        </button>
      </div>

      {/* Address bar */}
      <div className="relative flex items-center gap-0.5 px-1.5 py-1.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
        <LoadingBar active={isLoading} />

        {/* Nav */}
        <NavButton onClick={onBack}    disabled={!canBack}    title="Back (Alt+←)"><Ic.Back /></NavButton>
        <NavButton onClick={onForward} disabled={!canForward} title="Forward (Alt+→)"><Ic.Forward /></NavButton>
        <NavButton onClick={isLoading ? () => {} : onReload} title={isLoading ? "Stop" : "Reload (Ctrl+R)"}>
          {isLoading ? <Ic.Stop /> : <Ic.Reload />}
        </NavButton>
        <NavButton onClick={onHome} title="Home"><Ic.Home /></NavButton>

        {/* URL input */}
        <form className="flex-1 min-w-0 mx-1"
          onSubmit={(e) => { e.preventDefault(); onNavigate(input); inputRef.current?.blur(); }}>
          <div className={`flex items-center gap-1.5 rounded-full px-3 h-8 transition-all
            ${inputFocused
              ? "bg-white dark:bg-gray-900 ring-2 ring-blue-500 shadow-sm"
              : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200/70 dark:hover:bg-gray-700/70"
            }`}>
            {!inputFocused && activeTab?.url ? <Ic.Lock /> : <Ic.Search />}
            <input
              ref={inputRef}
              type="text"
              value={inputFocused ? input : (activeTab?.display || input)}
              onChange={(e) => onInputChange(e.target.value)}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
              placeholder="Search Google or type a URL"
              spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" enterKeyHint="go"
              className="flex-1 min-w-0 bg-transparent outline-none text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
            {input && inputFocused && (
              <button type="button" onMouseDown={(e) => e.preventDefault()}
                onClick={onInputClear}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 text-[10px]">✕</button>
            )}
          </div>
        </form>

        {/* Right actions */}
        {activeTab?.url && (
          <NavButton onClick={onToggleBookmark} title={isBookmarked ? "Remove bookmark" : "Bookmark this page"} active={isBookmarked}>
            {isBookmarked ? <Ic.BookmarkFill /> : <Ic.Bookmark />}
          </NavButton>
        )}

        {/* Zoom controls (inline, compact) */}
        {showZoom && (
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 shrink-0">
            <button onClick={onZoomOut}   className="p-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded transition-colors"><Ic.ZoomOut /></button>
            <button onClick={onZoomReset} className="text-[10px] font-mono text-gray-700 dark:text-gray-300 px-1 min-w-[32px] text-center hover:text-blue-500 transition-colors">{zoom}%</button>
            <button onClick={onZoomIn}    className="p-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded transition-colors"><Ic.ZoomIn /></button>
          </div>
        )}

        {/* Pop out (Tauri only) */}
        {onPopOut && activeTab?.url && (
          <NavButton onClick={onPopOut} title="Open in separate window"><Ic.PopOut /></NavButton>
        )}

        {/* Panel toggles */}
        <NavButton onClick={() => onTogglePanel("bookmarks")} title="Bookmarks" active={panel === "bookmarks"}><Ic.Bookmark /></NavButton>
        <NavButton onClick={() => onTogglePanel("history")}   title="History"   active={panel === "history"}><Ic.History /></NavButton>
        <NavButton onClick={() => onTogglePanel("extensions")}title="Extensions" active={panel === "extensions"}><Ic.Extensions /></NavButton>
        <NavButton onClick={() => onTogglePanel("settings")}  title="Settings"  active={panel === "settings"}><Ic.Settings /></NavButton>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// NATIVE BROWSER — Tauri desktop (same-screen overlay)
// A borderless native overlay owned by Rust, positioned exactly over the
// content area of THIS window — same screen, no separate pop-out.
// No proxy needed (native Chromium); VPN is virtualized via browser_open.

function NativeBrowserClient() {
  const [tabs, setTabs] = useState(() => [makeTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [panel, setPanel] = useState(null); // "bookmarks" | "history" | "extensions" | "settings" | null
  const [bookmarks, setBookmarks] = useState(() => loadBookmarks());
  const [history, setHistory] = useState([]); // { url, title, favicon, time }
  const [zoom, setZoom] = useState(100);

  const contentRef = useRef(null);
  const inputRef = useRef(null);
  const activeIdRef = useRef(activeId);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const isBookmarked = bookmarks.some((b) => b.url === activeTab?.url);
  const isLoading = activeTab?.loading ?? false;
  const canBack = activeTab && activeTab.histIndex > 0;
  const canForward = activeTab && activeTab.histIndex < activeTab.history.length - 1;

  // ── Native overlay bridge ────────────────────────────────────────────────
  // The browser content is a borderless native overlay owned by the Rust
  // backend, positioned exactly over the content area of THIS window — same
  // screen, no separate pop-out window.

  const measureContent = useCallback(async () => {
    const el = contentRef.current;
    if (!el) return null;
    let inner = { x: 0, y: 0, scaleFactor: 1 };
    try {
      const core = await import("@tauri-apps/api/core");
      inner = await core.invoke("get_window_inner_pos"); // { x, y, scaleFactor }
    } catch {}
    const s = inner?.scaleFactor > 0 ? inner.scaleFactor : 1;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round((inner?.x || 0) + r.left * s),
      y: Math.round((inner?.y || 0) + r.top * s),
      width: Math.round(r.width * s),
      height: Math.round(r.height * s),
      scale: s,
    };
  }, []);

  const scaleForZoom = useCallback((box, z) => {
    if (!box || z === 100) return box;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const width = Math.round((box.width * z) / 100);
    const height = Math.round((box.height * z) / 100);
    return { ...box, width, height, x: Math.round(cx - width / 2), y: Math.round(cy - height / 2) };
  }, []);

  const openOverlay = useCallback(async (url, firstOpen) => {
    const box = await measureContent();
    if (!box || !url) return;
    const B = scaleForZoom(box, zoom);
    const args = { url, x: B.x, y: B.y, width: B.width, height: B.height };
    try {
      const core = await import("@tauri-apps/api/core");
      if (firstOpen) {
        await core.invoke("browser_open", args pw);
      } else {
        try { await core.invoke("browser_set_bounds", { x: B.x, y: B.y, width: B.width, height: B.height }); } catch {}
        try { await core.invoke("browser_navigate", { url }); } catch {}
      }
    } catch {}
  }, [measureContent, scaleForZoom, zoom]);

  const closeOverlay = useCallback(async () => {
    try {
      const core = await import("@tauri-apps/api/core");
      await core.invoke("browser_close");
    } catch {}
  }, []);

  const refitOverlay = useCallback(async () => {
    const box = await measureContent();
    if (!box) return;
    const B = scaleForZoom(box, zoom);
    try {
      const core = await import("@tauri-apps/api/core");
      await core.invoke("browser_set_bounds", { x: B.x, y: B.y, width: B.width, height: B.height });
    } catch {}
  }, [measureContent, scaleForZoom, zoom]);

  // Window resize / zoom → keep overlay glued to the content box on the SAME screen.
  useEffect(() => {
    const onResize = () => { requestAnimationFrame(() => refitOverlay()); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [refitOverlay]);

  // Close the native overlay when the component goes away.
  useEffect(() => {
    return () => { closeOverlay(); };
  }, [closeOverlay]);

  // ── Navigation ──────────────────────────────────────────────────────────

  const navigate = useCallback((raw) => {
    const url = normalizeInput(raw);
    if (!url) return;
    setInput(url);
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeId) return t;
        const hist = t.history.slice(0, t.histIndex + 1);
        if (hist[hist.length - 1] !== url) hist.push(url);
        const histIndex = hist.length - 1;
        openOverlay(url, !t.url);
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setHistory((prevHist) => [{ url, title: urlLabel(url), favicon: getFavicon(url), time: timeStr }, ...prevHist.slice(0, 199)]);
        return { ...t, url, display: url, title: urlLabel(url), loading: false, error: false, favicon: getFavicon(url), history: hist, histIndex, display, _reloadKey: (t._reloadKey || 0) + 1 };
      })
    );
  }, [activeId, openOverlay]);

  const reload = useCallback(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t?.url) return;
    openOverlay(t.url, false);
    setTabs((prev) => prev.map((x) => x.id === activeId ? { ...x, loading: true, error: false, _reloadKey: (x._reloadKey || 0) + 1 } : x));
  }, [tabs, activeId, openOverlay]);

  const goHome = useCallback(() => {
    closeOverlay();
    setInput("");
    setTabs((prev) => prev.map((t) => t.id === activeId ? { ...t, url: "", display: "", title: "", loading: false, error: false, favicon: null, history: t.history, histIndex: t.histIndex } : t));
  }, [activeId, closeOverlay]);

  const goBack = useCallback(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t || !t.url || t.histIndex <= 0) return;
    const histIndex = t.histIndex - 1;
    const url = t.history[histIndex];
    setInput(url);
    openOverlay(url, false);
    setTabs((prev) => prev.map((x) => x.id === activeId ? { ...x, histIndex, url, display: url, title: urlLabel(url), loading: false, error: false, favicon: getFavicon(url) } : x));
  }, [tabs, activeId, openOverlay]);

  const goForward = useCallback(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t || !t.url || t.histIndex >= t.history.length - 1) return;
    const histIndex = t.histIndex + 1;
    const url = t.history[histIndex];
    setInput(url);
    openOverlay(url, false);
    setTabs((prev) => prev.map((x) => x.id === activeId ? { ...x, histIndex, url, display: url, title: urlLabel(url), loading: false, error: false, favicon: getFavicon(url) } : x));
  }, [tabs, activeId, openOverlay]);

  // Keyboard shortcuts

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "l") { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "t") { e.preventDefault(); addTab(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "w") { e.preventDefault(); closeTab(activeIdRef.current); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "r") { e.preventDefault(); reload(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "d") { e.preventDefault(); toggleBookmark(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "=") { e.preventDefault(); zoomIn(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); zoomOut(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "0") { e.preventDefault(); zoomReset(); }
      else if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); goBack(); }
      else if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); goForward(); }
      else if (e.key === "Escape" && inputFocused) inputRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addTab, closeTab, reload, goBack, goForward, inputFocused, toggleBookmark, zoomIn, zoomOut, zoomReset]);

  // Tabs

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
      if (next.length === 0) { closeOverlay(); const fresh = makeTab(); setActiveId(fresh.id); setInput(""); return [fresh]; }
      if (id === activeIdRef.current) { const n = next[Math.min(idx, next.length - 1)]; setActiveId(n.id); setInput(n.display || ""); if (n.url) openOverlay(n.url, false); else closeOverlay(); }
      return next;
    });
  }, [closeOverlay, openOverlay]);

  const selectTab = useCallback((id) => {
    setActiveId(id);
    const t = tabs.find((x) => x.id === id);
    if (t) { setInput(t.display || ""); if (t.url) openOverlay(t.url, false); else closeOverlay(); }
  }, [tabs, openOverlay, closeOverlay]);

  // Bookmarks

  const toggleBookmark = useCallback(() => {
    const url = activeTab?.url;
    if (!url) return;
    setBookmarks((prev) => {
      let next;
      if (prev.some((b) => b.url === url)) {
        next = prev.filter((b) => b.url !== url);
      } else {
        next = [{ id: Date.now(), url, title: activeTab.title || urlLabel(url), favicon: activeTab.favicon }, ...prev];
      }
      saveBookmarks(next);
      return next;
    });
  }, [activeTab]);

  const deleteBookmark = useCallback((id) => {
    setBookmarks((prev) => { const next = prev.filter((b) => b.id !== id); saveBookmarks(next); return next; });
  }, []);

  // Panels

  const togglePanel = useCallback((name) => {
    setPanel((prev) => (prev === name ? null : name));
  }, []);

  // Zoom

  const zoomIn  = useCallback(() => setZoom((z) => Math.min(z + 10, 200)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 10, 50)), []);
  const zoomReset = useCallback(() => setZoom(100), []);

  useEffect(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (t) setInput(t.display || "");
  }, [activeId]); // eslint-disable-line

  return (
    <div className="h-dvh flex flex-col bg-white dark:bg-gray-950 overflow-hidden">
      <BrowserToolbar
        tabs={tabs} activeId={activeId} activeTab={activeTab}
        input={input} inputFocused={inputFocused} isLoading={isLoading}
        canBack={canBack} canForward={canForward}
        isBookmarked={isBookmarked} panel={panel} zoom={zoom}
        showZoom={zoom !== 100}
        onBack={goBack} onForward={goForward} onReload={reload} onHome={goHome}
        onNavigate={navigate}
        onInputChange={setInput}
        onInputFocus={() => { setInputFocused(true); requestAnimationFrame(() => inputRef.current?.select()); }}
        onInputBlur={() => setInputFocused(false)}
        onInputClear={() => { setInput(""); inputRef.current?.focus(); }}
        onAddTab={addTab} onCloseTab={closeTab} onSelectTab={selectTab}
        onToggleBookmark={toggleBookmark}
        onTogglePanel={togglePanel}
        onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomReset={zoomReset}
        inputRef={inputRef}
      />

      {/* Main area: same-screen native overlay target + optional side panel */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div ref={contentRef} className="flex-1 min-w-0 relative">
          {activeTab?.url ? (
            <div
              className="absolute inset-0 pointer-events-none"
              aria-label="Native browser overlay renders here (same screen)"
            />
          ) : (
            <NativeHomePage navigate={navigate} input={input} setInput={setInput} inputRef={inputRef} />
          )}
        </div>

        {/* Side panel */}
        {panel && (
          <SidePanel
            panel={panel}
            bookmarks={bookmarks}
            history={history}
            onNavigate={(url) => { navigate(url); }}
            onDeleteBookmark={deleteBookmark}
            onClearHistory={() => setHistory([])}
            onClose={() => setPanel(null)}
          />
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PROXY BROWSER — web fallback (unchanged logic, now shares BrowserToolbar)
// ═════════════════════════════════════════════════════════════════════════════

function ProxyBrowserClient() {
  const [tabs, setTabs] = useState(() => [makeTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [panel, setPanel] = useState(null);
  const [bookmarks, setBookmarks] = useState(() => loadBookmarks());
  const [history, setHistory] = useState([]);
  const [zoom, setZoom] = useState(100);

  const iframeRef = useRef(null);
  const inputRef = useRef(null);
  const activeIdRef = useRef(activeId);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const iframeSrc = activeTab?.url ? `/api/browser?url=${encodeURIComponent(activeTab.url)}` : null;
  const isBookmarked = bookmarks.some((b) => b.url === activeTab?.url);
  const isLoading = activeTab?.loading ?? false;
  const canBack = activeTab && activeTab.histIndex > 0;
  const canForward = activeTab && activeTab.histIndex < activeTab.history.length - 1;

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
      return { ...t, url, display: url, title: urlLabel(url), loading: true, error: false, favicon: getFavicon(url), history: hist, histIndex: hist.length - 1 };
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
    setTabs((prev) => prev.map((t) => t.id === activeId ? { ...t, url: "", display: "", title: "", loading: false, error: false, favicon: null } : t));
  }, [activeId]);

  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let realUrl = null, title = "";
    try { realUrl = extractRealUrl(iframe.contentWindow?.location?.href); title = iframe.contentDocument?.title || ""; } catch {}
    const id = activeIdRef.current;
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const display = realUrl || t.display;
        const favicon = realUrl ? getFavicon(realUrl) : t.favicon;
        const hist = t.history.slice(0, t.histIndex + 1);
        if (realUrl && hist[hist.length - 1] !== realUrl) {
          hist.push(realUrl);
          const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          setHistory((prev) => [{ url: realUrl, title: title || urlLabel(realUrl), favicon, time: timeStr }, ...prev.slice(0, 199)]);
          return { ...t, url: realUrl, display, title: title || urlLabel(display), loading: false, error: false, favicon, history: hist, histIndex: hist.length - 1 };
        }
        return { ...t, display, title: title || urlLabel(display), loading: false, error: false, favicon };
      })
    );
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
        const t = makeTab({ url: data.url, display: data.url, loading: true, favicon: getFavicon(data.url) });
        setTabs((prev) => [...prev, t]); setActiveId(t.id); setInput(data.url);
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
                return { ...t, url: newUrl, display: newUrl, title: newTitle, loading: false, history: hist, histIndex: hist.length - 1, favicon: getFavicon(newUrl) };
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

  const toggleBookmark = useCallback(() => {
    const url = activeTab?.url;
    if (!url) return;
    setBookmarks((prev) => {
      const next = prev.some((b) => b.url === url)
        ? prev.filter((b) => b.url !== url)
        : [{ id: Date.now(), url, title: activeTab.title || urlLabel(url), favicon: activeTab.favicon }, ...prev];
      saveBookmarks(next);
      return next;
    });
  }, [activeTab]);

  const deleteBookmark = useCallback((id) => {
    setBookmarks((prev) => { const next = prev.filter((b) => b.id !== id); saveBookmarks(next); return next; });
  }, []);

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

  const togglePanel = useCallback((name) => {
    setPanel((prev) => (prev === name ? null : name));
  }, []);

  const zoomIn  = useCallback(() => setZoom((z) => Math.min(z + 10, 200)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 10, 50)), []);
  const zoomReset = useCallback(() => setZoom(100), []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "l") { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "t") { e.preventDefault(); addTab(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "w") { e.preventDefault(); closeTab(activeIdRef.current); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "r") { e.preventDefault(); reload(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "d") { e.preventDefault(); toggleBookmark(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "=") { e.preventDefault(); zoomIn(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); zoomOut(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "0") { e.preventDefault(); zoomReset(); }
      else if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); goBack(); }
      else if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); goForward(); }
      else if (e.key === "Escape" && inputFocused) inputRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addTab, closeTab, reload, goBack, goForward, inputFocused, toggleBookmark, zoomIn, zoomOut, zoomReset]);

  useEffect(() => {
    const t = tabs.find((x) => x.id === activeId);
    if (t) setInput(t.display);
  }, [activeId]); // eslint-disable-line

  return (
    <div className="h-dvh flex flex-col bg-white dark:bg-gray-950 overflow-hidden">
      <BrowserToolbar
        tabs={tabs} activeId={activeId} activeTab={activeTab}
        input={input} inputFocused={inputFocused} isLoading={isLoading}
        canBack={canBack} canForward={canForward}
        isBookmarked={isBookmarked} panel={panel} zoom={zoom}
        showZoom={zoom !== 100}
        onBack={goBack} onForward={goForward} onReload={reload} onHome={goHome}
        onNavigate={navigate}
        onInputChange={setInput}
        onInputFocus={() => { setInputFocused(true); requestAnimationFrame(() => inputRef.current?.select()); }}
        onInputBlur={() => setInputFocused(false)}
        onInputClear={() => { setInput(""); inputRef.current?.focus(); }}
        onAddTab={addTab} onCloseTab={closeTab} onSelectTab={selectTab}
        onToggleBookmark={toggleBookmark}
        onTogglePanel={togglePanel}
        onPopOut={null}
        onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomReset={zoomReset}
        inputRef={inputRef}
      />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 min-w-0 relative">
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
              style={{ zoom: zoom !== 100 ? `${zoom}%` : undefined }}
            />
          ) : (
            <WebHomePage navigate={navigate} input={input} setInput={setInput} inputRef={inputRef} />
          )}
        </div>
        {panel && (
          <SidePanel
            panel={panel}
            bookmarks={bookmarks}
            history={history}
            onNavigate={(url) => { navigate(url); }}
            onDeleteBookmark={deleteBookmark}
            onClearHistory={() => setHistory([])}
            onClose={() => setPanel(null)}
          />
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
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-950">
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
          {ALL_SHORTCUTS.map((s) => (
            <button key={s.name} onClick={() => navigate(s.url)}
              className={`rounded-2xl p-4 flex flex-col items-center gap-2 bg-gradient-to-br ${s.gradient} text-white hover:scale-[1.04] active:scale-[0.98] transition-transform shadow-md`}>
              <span className="text-2xl leading-none">{s.emoji}</span>
              <span className="text-xs font-semibold tracking-wide">{s.name}</span>
            </button>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
          {[["Ctrl+L","Focus URL"],["Ctrl+T","New tab"],["Ctrl+W","Close tab"],["Ctrl+R","Reload"],["Ctrl+D","Bookmark"],["Ctrl+=/-","Zoom"]].map(([k,d]) => (
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
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-950">
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
      </div>
    </div>
  );
}