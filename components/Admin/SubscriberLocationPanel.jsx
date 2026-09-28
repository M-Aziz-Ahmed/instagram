"use client";

/**
 * Subscriber location record — the admin's answer to "where is this account".
 *
 * Answers the three questions a compliance request actually asks, in the order
 * they are asked:
 *
 *   1. Where was the account made from?  → origin, permanent.
 *   2. Where was it last seen?           → latest, with its age.
 *   3. Where does it usually connect?    → frequent places, with visit counts.
 *
 * Two things this panel deliberately does:
 *
 *   IT DOES NOT HIDE THE ADDRESS. The city is a convenience; the address is what
 *   an ISP can turn into a person, so a disclosure that hid it would be useless
 *   for its only purpose. What it does instead is make the address visible,
 *   selectable, and hard to read past by accident.
 *
 *   IT SAYS WHEN THE DATA IS OLD. "Last seen 3 minutes ago" and "last seen 29
 *   days ago" are different evidence, and a panel that rendered both identically
 *   would be actively misleading. Every timestamp is rendered with its age.
 */

import { useCallback, useEffect, useState } from "react";

/** Compact age. Precision that matters: minutes inside the hour, days after. */
function age(ms) {
    if (ms == null) return "unknown";
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return `${Math.floor(d / 30)}mo ago`;
}

function stamp(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return "—";
    }
}

/** An address, shown deliberately: monospaced, selectable, with a copy button. */
function AddressLine({ ip, network }) {
    const [copied, setCopied] = useState(false);
    if (!ip) return <p className="text-xs text-gray-400">Not recorded</p>;
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded select-all break-all">
                {ip}
            </code>
            {network && network !== ip && (
                <span className="text-[11px] text-gray-400 font-mono">net {network}</span>
            )}
            <button
                type="button"
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(ip);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                    } catch { /* denied */ }
                }}
                className="text-[11px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
                {copied ? "copied" : "copy"}
            </button>
        </div>
    );
}

function PlaceLine({ place, city, region, country, lat, lon }) {
    return (
        <p className="text-sm text-gray-800 dark:text-gray-200">
            {place || <span className="text-gray-400">Unknown place</span>}
            {Number.isFinite(lat) && Number.isFinite(lon) && (
                <span className="ml-2 text-[11px] text-gray-400 font-mono">
                    {Number(lat).toFixed(4)}, {Number(lon).toFixed(4)}
                </span>
            )}
        </p>
    );
}

function Row({ label, children }) {
    return (
        <div className="grid grid-cols-[minmax(0,7rem)_1fr] gap-2 py-1.5 items-start">
            <span className="text-[11px] uppercase tracking-wide text-gray-400 pt-0.5">{label}</span>
            <div className="min-w-0">{children}</div>
        </div>
    );
}

function Card({ tone = "gray", title, badge, children }) {
    const ring = tone === "blue" ? "border-blue-200 dark:border-blue-900/60"
        : tone === "amber" ? "border-amber-200 dark:border-amber-900/60"
            : "border-gray-200 dark:border-gray-800";
    return (
        <div className={`rounded-xl border ${ring} p-3 bg-white dark:bg-gray-900/40`}>
            <div className="flex items-center justify-between gap-2 mb-1">
                <h4 className="text-xs font-bold text-gray-700 dark:text-gray-200">{title}</h4>
                {badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        {badge}
                    </span>
                )}
            </div>
            {children}
        </div>
    );
}

export default function SubscriberLocationPanel({ username, className = "" }) {
    // One state object, tagged with the username it belongs to.
    //
    // This is what makes the panel safe when the admin types a new username: the
    // tag is compared rather than cleared, so the previous subject's record can
    // never be shown under the new subject's name for a moment, and "loading" is
    // derived instead of being set in the effect body. An earlier version reset
    // `loading` in a useEffect, which is a synchronous setState in the effect and
    // also left a race where a slow response for user A could land after a fast
    // one for user B.
    const [state, setState] = useState({ for: null, data: null, error: "", at: 0 });    const loading = !!username && state.for !== username;

    useEffect(() => {
        // No reset branch for an empty username: `state.for !== username` already
        // makes a new subject load, and an empty one renders nothing at all
        // (see the `if (!username) return null` below). Writing state here would
        // be a synchronous setState in the effect for no observable change.
        if (!username) return;
        const wanted = username;
        (async () => {
            // `at` is the clock for every age on screen. Captured here, when the
            // response lands, rather than during render — `Date.now()` in render
            // is an impure call, and doing it per row would let two rows disagree
            // by microseconds. Exact timestamps are shown beside every age.
            const at = Date.now();
            try {
                const res = await fetch(`/api/admin/subscribers/${encodeURIComponent(wanted)}/location`);
                const body = await res.json();
                if (!res.ok) throw new Error(body.error || "Could not load the record");
                setState({ for: wanted, data: body, error: "", at });
            } catch (err) {
                setState({ for: wanted, data: null, error: err.message || "Could not load the record", at });
            }
        })();
    }, [username]);

    const data = state.for === username ? state.data : null;
    const error = state.for === username ? state.error : "";
    const now = state.at || 0;

    if (!username) return null;

    if (loading) {
        return (
            <div className={`text-xs text-gray-400 py-3 ${className}`}>Loading location record…</div>
        );
    }

    if (error) {
        return (
            <div className={`text-xs text-red-500 dark:text-red-400 py-3 ${className}`} role="alert">
                {error}
            </div>
        );
    }

    if (!data) return null;

    const { origin, latest, lastSeenAgeMs, history = [], frequentPlaces = [], retention, disclosedAt, disclosedBy } = data;

    // A record that is close to expiry is the one an investigator is most likely
    // to be told about too late, so it is called out rather than left implicit.
    const expiryNote = lastSeenAgeMs != null && retention?.observationDays
        ? lastSeenAgeMs > retention.observationDays * 0.85 * 86400000
        : false;

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Shown once, so an admin always knows the read happened. The server
                writes its own audit row; this is the in-session reminder. */}
            <p className="text-[11px] text-gray-400 border-b border-gray-200 dark:border-gray-800 pb-1">
                Disclosure logged · {disclosedBy} · {stamp(disclosedAt)}
            </p>

            {/* 1. Where was the account made from? */}
            <Card tone="blue" title="1 · Account origin — where it was made from" badge="permanent">
                {origin?.available === false ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                        No origin recorded. Accounts created before this was deployed have none, and it
                        cannot be reconstructed after the fact.
                    </p>
                ) : (
                    <>
                        <Row label="IP address"><AddressLine ip={origin.ip} network={origin.network} /></Row>
                        <Row label="Place"><PlaceLine {...origin} /></Row>
                        <Row label="Recorded"><span className="text-xs text-gray-500 dark:text-gray-400">{stamp(origin.at)}</span></Row>
                    </>
                )}
            </Card>

            {/* 2. Where was it last seen? */}
            <Card tone="amber" title="2 · Last known location" badge={`expires after ${retention?.observationDays ?? "?"}d`}>
                {!latest ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        No observation recorded in the retention window.
                    </p>
                ) : (
                    <>
                        <Row label="IP address"><AddressLine ip={latest.ip} network={latest.network} /></Row>
                        <Row label="Place"><PlaceLine {...latest} /></Row>
                        <Row label="Seen">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {age(lastSeenAgeMs)} · {stamp(latest.at)}
                            </span>
                        </Row>
                        {expiryNote && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                                Close to expiry — this record will disappear if the account does not connect.
                            </p>
                        )}
                    </>
                )}
            </Card>

            {/* 3. Where does it usually connect from? */}
            <Card title="3 · Frequent places" badge={`${frequentPlaces.length} distinct`}>
                {frequentPlaces.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Nothing recorded yet.</p>
                ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                        {frequentPlaces.map((p) => (
                            <li key={p.key} className="py-1.5 flex items-center gap-2">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs text-gray-800 dark:text-gray-200 truncate">{p.place}</p>
                                    <p className="text-[10px] text-gray-400">
                                        last {age(p.lastSeenAgeMs)} · first {stamp(p.firstSeen).split(",")[0]}
                                    </p>
                                </div>
                                <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 shrink-0">
                                    ×{p.count}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            {/* The journey, collapsed by default: it is supporting detail, and the
                three answers above are what gets asked for. */}
            {history.length > 1 && (
                <details className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <summary className="text-xs font-bold text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                        Place changes ({history.length})
                    </summary>
                    <ol className="mt-2 space-y-1.5">
                        {history.map((h, i) => (
                            <li key={`${h.at}-${i}`} className="text-[11px] flex gap-2 items-start">
                                <span className="text-gray-400 font-mono shrink-0 w-24">{age(now - new Date(h.at).getTime())}</span>
                                <span className="text-gray-700 dark:text-gray-300 min-w-0">
                                    <span className="font-mono">{h.ip}</span>
                                    <span className="text-gray-400"> · {h.place}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                </details>
            )}
        </div>
    );
}
