"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";

// Recipient picker for forwarding a message. Reuses the global search endpoint
// for candidate lookup, which already hides blocked and muted accounts, so a
// blocked user cannot even be selected — the server re-checks regardless.
export default function ForwardModal({ message, onClose, onForwarded }) {
    const { user } = useUser();
    const { showToast } = useToast();
    const [query, setQuery] = useState("");
    // Results are stored together with the query that produced them, so stale
    // candidates can be ignored by comparison instead of being cleared from an
    // effect (which would force an extra render pass on every keystroke).
    const [candState, setCandState] = useState({ query: "", users: [] });
    const [selected, setSelected] = useState(null);
    const [note, setNote] = useState("");
    const [sending, setSending] = useState(false);
    const inputRef = useRef(null);

    const q = query.trim();
    const candidates = candState.query === q ? candState.users : [];
    const searching = q.length >= 1 && candState.query !== q;

    useEffect(() => {
        inputRef.current?.focus();
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    // Debounced so typing does not fire a request per keystroke.
    useEffect(() => {
        if (q.length < 1 || !user?.username) return;

        const controller = new AbortController();
        const id = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/search?q=${encodeURIComponent(q)}&username=${encodeURIComponent(user.username)}`,
                    { credentials: "include", signal: controller.signal }
                );
                if (res.ok) {
                    const data = await res.json();
                    // Never offer yourself as a forward target.
                    setCandState({
                        query: q,
                        users: (data.users || []).filter(
                            (u) => u.username.toLowerCase() !== user.username.toLowerCase()
                        ),
                    });
                }
            } catch { /* aborted or offline */ }
        }, 250);

        return () => { clearTimeout(id); controller.abort(); };
    }, [q, user?.username]);

    const submit = async () => {
        if (!selected) { showToast("Pick someone to forward to", "error"); return; }
        setSending(true);
        try {
            const res = await fetch("/api/messages/forward", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    messageId: message._id,
                    recipient: selected.username,
                    note: note.trim() || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                showToast(data.error || "Failed to forward", "error");
                return;
            }
            showToast(`Forwarded to ${selected.username}`, "success");
            onForwarded?.();
            onClose();
        } catch {
            showToast("Failed to forward", "error");
        } finally {
            setSending(false);
        }
    };

    const preview = message?.text?.trim()
        ? message.text.trim()
        : message?.audioUrl ? "🎤 Voice message" : "📷 Image";

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Forward message</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        aria-label="Close"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Message</p>
                    <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-3">{preview}</p>
                </div>

                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <input
                        ref={inputRef}
                        type="text"
                        value={selected ? selected.username : query}
                        onChange={(e) => { setSelected(null); setQuery(e.target.value); }}
                        placeholder="Search for a person..."
                        className="w-full bg-gray-100 dark:bg-gray-800 rounded-full px-4 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                    />

                    {searching && (
                        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">Searching...</p>
                    )}

                    {!searching && candidates.length > 0 && (
                        <ul className="mt-2 max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                            {candidates.map((c) => (
                                <li key={c.username}>
                                    <button
                                        onClick={() => { setSelected(c); setQuery(""); }}
                                        className="w-full flex items-center gap-3 px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                                    >
                                        {c.avatarUrl ? (
                                            <img src={c.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                                        ) : (
                                            <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                                                style={{ backgroundColor: c.avatarColor || "#3b82f6" }}>
                                                {c.username[0]?.toUpperCase()}
                                            </span>
                                        )}
                                        <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{c.username}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {!searching && query.trim() && candidates.length === 0 && (
                        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">No matching accounts</p>
                    )}
                </div>

                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1" htmlFor="forward-note">
                        Add a note (optional)
                    </label>
                    <textarea
                        id="forward-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 500))}
                        rows={2}
                        placeholder="Say something about this..."
                        className="w-full bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none resize-none"
                    />
                </div>

                <div className="flex items-center justify-end gap-2 px-4 py-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        disabled={!selected || sending}
                        className="px-4 py-2 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-full transition-colors"
                    >
                        {sending ? "Forwarding..." : "Forward"}
                    </button>
                </div>
            </div>
        </div>
    );
}
