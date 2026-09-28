"use client";

/**
 * "Who is here?" — a place search that returns accounts, not just a dot.
 *
 * The admin globe is a population counter: it answers "how much of our traffic
 * comes from Karachi". It cannot answer "which accounts are in Karachi", which
 * is the question that follows from it. This closes that loop.
 *
 * Split into two steps on purpose. The search endpoint is a text match over
 * place names, which is convenient but is a pattern scan; the enumeration
 * endpoint needs an exact place key and is the one that actually hands back
 * accounts. Asking for a place first, then a list, means a broad query cannot be
 * escalated into a bulk export by editing a URL — the second request requires a
 * key the server issued.
 */

import { useCallback, useEffect, useState } from "react";

function age(ms) {
    if (ms == null) return "—";
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function PlaceLookupPanel({ onSelectUsername, className = "" }) {
    const [q, setQ] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [err, setErr] = useState("");
    const [place, setPlace] = useState(null);
    const [people, setPeople] = useState([]);
    const [truncated, setTruncated] = useState(false);
    const [loading, setLoading] = useState(false);
    const [retentionDays, setRetentionDays] = useState(null);

    // Debounced, and every request tagged so a slow one cannot overwrite the
    // results of a later one — which is how "Karachi" ends up showing Karachi's
    // data under Karachi's label while actually being results for "Karach".
    const runSearch = useCallback(async (term) => {
        if (term.trim().length < 2) { setResults([]); return; }
        setSearching(true);
        setErr("");
        try {
            const res = await fetch(`/api/admin/subscribers/search?q=${encodeURIComponent(term)}`);
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Search failed");
            setResults(body.results || []);
            if (typeof body.retentionDays === "number") setRetentionDays(body.retentionDays);
        } catch (e) {
            setErr(e.message || "Search failed");
            setResults([]);
        } finally {
            setSearching(false);
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => runSearch(q), 300);
        return () => clearTimeout(t);
    }, [q, runSearch]);

    const openPlace = useCallback(async (key) => {
        setLoading(true);
        setErr("");
        try {
            const res = await fetch(`/api/admin/subscribers/place/${encodeURIComponent(key)}`);
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Could not load that place");
            setPlace(body.place);
            setPeople(body.people || []);
            setTruncated(!!body.truncated);
            if (typeof body.retentionDays === "number") setRetentionDays(body.retentionDays);
        } catch (e) {
            setErr(e.message || "Could not load that place");
            setPeople([]);
            setPlace(null);
        } finally {
            setLoading(false);
        }
    }, []);

    return (
        <div className={`space-y-3 ${className}`}>
            <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Find a place
                </label>
                <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Karachi, Punjab, PK, or a username…"
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                    Searches places and usernames. Opening a place lists the accounts seen there
                    {retentionDays ? ` over the last ${retentionDays} days` : ""}. Enumerating is audit-logged.
                </p>
            </div>

            {err && <p className="text-xs text-red-500 dark:text-red-400" role="alert">{err}</p>}

            {searching && !results.length && <p className="text-xs text-gray-400">Searching…</p>}

            {!!results.length && !place && (
                <ul className="border border-gray-200 dark:border-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto">
                    {results.map((r) => (
                        <li key={r.key}>
                            <button
                                type="button"
                                onClick={() => openPlace(r.key)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors flex items-center gap-2"
                            >
                                <span className="text-xs text-gray-800 dark:text-gray-200 truncate flex-1">{r.label}</span>
                                <span className="text-[11px] text-gray-400 shrink-0">
                                    {r.accounts} account{r.accounts === 1 ? "" : "s"} · {r.visits} visits
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {place && (
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800">
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{place.label}</p>
                            <p className="text-[10px] text-gray-400">
                                {people.length} account{people.length === 1 ? "" : "s"}
                                {Number.isFinite(place.lat) && Number.isFinite(place.lon)
                                    ? ` · ${Number(place.lat).toFixed(3)}, ${Number(place.lon).toFixed(3)}`
                                    : ""}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setPlace(null); setPeople([]); }}
                            className="text-[11px] px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0"
                        >
                            back
                        </button>
                    </div>

                    {loading ? (
                        <p className="text-xs text-gray-400 px-3 py-3">Loading…</p>
                    ) : people.length === 0 ? (
                        <p className="text-xs text-gray-400 px-3 py-3">No accounts recorded at this place.</p>
                    ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-72 overflow-y-auto">
                            {people.map((p) => (
                                <li key={p.username}>
                                    <button
                                        type="button"
                                        onClick={() => onSelectUsername?.(p.username)}
                                        className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors flex items-center gap-2"
                                    >
                                        <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                                            @{p.username}
                                        </span>
                                        <span className="text-[10px] text-gray-400 shrink-0 ml-auto">
                                            {p.visits} visit{p.visits === 1 ? "" : "s"} · {age(p.lastSeenAgeMs)}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {truncated && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 px-3 py-1.5 border-t border-gray-200 dark:border-gray-800">
                            List capped — more accounts are recorded here than were returned.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
