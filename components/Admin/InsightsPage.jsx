"use client";

/**
 * Admin Insights — activation, retention, feature adoption, cadence, dormancy.
 *
 * `/admin/analytics` already answers "how many, and where". This page answers
 * the *next* question: do people who sign up actually do anything, do they come
 * back, and which features are used at all. Nothing here repeats a total, a
 * growth curve, a device donut or a map.
 *
 * ── The rule this page is built around ───────────────────────────────────────
 * Every endpoint on /api/admin/insights returns a `note`, a `definition` or a
 * `truncated` flag describing a real limit on how the number was produced. Those
 * are rendered verbatim next to the data they qualify, because a control that
 * looks authoritative while being wrong is worse than no control. Three
 * consequences run through the whole file:
 *
 *   1. `null` is never printed as 0. `growthPct: null` means the previous window
 *      had zero signups, so the ratio has no denominator. It renders as an em
 *      dash plus that explanation — never as 0%.
 *   2. `truncated: true` is a visible warning that the numbers are lower bounds,
 *      and it names the scan cap that caused it.
 *   3. The daily-active series counts USER-DAYS, not distinct users, so it is
 *      expected to exceed the account count. Wherever both appear it says so.
 *
 * No chart library: AreaChart / BarChart / DonutChart / StatCard all come from
 * components/Admin/charts.jsx.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { AreaChart, BarChart, DonutChart, StatCard } from "@/components/Admin/charts";

const INSIGHTS = "/api/admin/insights";

/** Mirrors SCAN_CAP in live-server/routes/adminInsights.js. */
const SCAN_CAP = 20000;

/** The server clamps `days` to 7–365 and `limit` to 1–200; stay inside that. */
const WINDOWS = [
    { days: 7, label: "7 days" },
    { days: 30, label: "30 days" },
    { days: 90, label: "90 days" },
];
const DORMANT_LIMITS = [25, 50, 100, 200];
/** The server clamps `weeks` to 2–26. */
const WEEK_OPTIONS = [4, 8, 12, 26];

/** A cohort smaller than this is noise. The server does not warn about it. */
const NOISY_COHORT = 10;

const TABS = [
    { id: "overview", label: "Overview" },
    { id: "activation", label: "Activation" },
    { id: "retention", label: "Retention" },
    { id: "features", label: "Features" },
    { id: "cadence", label: "Cadence" },
    { id: "dormant", label: "Dormant" },
];

const FUNNEL_COLORS = ["#58cc02", "#1cb0f6", "#ffc800", "#ce82ff"];

const PROFILE_ORDER = ["never-posted", "lapsed-creator", "lapsed"];
const PROFILES = {
    "never-posted": {
        label: "Never posted",
        tone: "warn",
        color: "#ffc800",
        blurb: "Signed up and left without ever posting. A first-run problem, not churn.",
    },
    "lapsed-creator": {
        label: "Lapsed creator",
        tone: "info",
        color: "#1cb0f6",
        blurb: "Last post was more than 90 days ago. This account used to produce.",
    },
    lapsed: {
        label: "Lapsed",
        tone: "gray",
        color: "#a3a3a3",
        blurb: "Has posted, and the last post is inside 90 days.",
    },
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

async function callApi(path) {
    const res = await fetch(path, { cache: "no-store" });
    let data = {};
    try {
        data = await res.json();
    } catch {
        // Non-JSON body (proxy error page, HTML 502). The status is all we have.
    }
    if (!res.ok) {
        const err = new Error(data.error || `Request failed with HTTP ${res.status}`);
        err.payload = data;
        err.status = res.status;
        throw err;
    }
    return data;
}

/**
 * The server's own words, plus the one field that carries the reason.
 *
 * Every catch block in adminInsights.js answers `{ error: "Failed", detail:
 * error.message }`, so `error` on its own is a dead end — the actual cause is in
 * `detail`. Neither string is rewritten or summarised; they are concatenated and
 * the status is appended, so what an admin reads is what the server said.
 */
function describe(e) {
    const status = e?.status ? ` (HTTP ${e.status})` : "";
    const fromPayload = typeof e?.payload?.error === "string" ? e.payload.error.trim() : "";
    const error = fromPayload || e?.message || "Request failed";
    const detail = typeof e?.payload?.detail === "string" ? e.payload.detail.trim() : "";
    if (!detail || detail === error) return `${error}${status}`;
    return `${error}${status} — server detail: ${detail}`;
}

/** A 500 from any of these routes can leave any field absent, so nothing is trusted. */
const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const rowsOf = (v) => (Array.isArray(v) ? v : []);

/** null is not 0 on these routes: it means the server chose not to compute it. */
const isAbsent = (v) => v === null || v === undefined || v === "";

const fmtInt = (v) => (isAbsent(v) ? "—" : num(v).toLocaleString());

const fmtPct = (v) => (isAbsent(v) ? "—" : `${num(v).toFixed(1)}%`);

function fmtDate(v) {
    if (isAbsent(v)) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

/** "2026-03-04" becomes "03-04". Anything unexpected is an em dash, never NaN. */
function shortDay(v) {
    return typeof v === "string" && v.length >= 10 ? v.slice(5) : "—";
}

/* ── Shared presentational primitives (house style) ─────────────────────────── */

function Spinner({ label }) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 py-10" role="status">
            <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            {label && <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>}
        </div>
    );
}

const CARD = "bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5";
const HEADING = "font-semibold text-sm text-gray-900 dark:text-gray-100";
const SUBTLE = "text-xs text-gray-500 dark:text-gray-400";
const INPUT =
    "w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-gray-100";
/** 44px tap target on a native control. */
const SELECT = `${INPUT} min-h-11`;
const BTN_GHOST =
    "px-3 py-2 min-h-10 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors";

const TONES = {
    warn: "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200",
    danger: "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200",
    ok: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200",
    info: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300",
};

function Note({ tone = "info", title, children }) {
    return (
        <div className={`rounded-xl border px-3 py-2.5 ${TONES[tone] || TONES.info}`}>
            {title && <p className="text-xs font-bold">{title}</p>}
            {children && <div className={`text-xs leading-relaxed ${title ? "mt-1" : ""}`}>{children}</div>}
        </div>
    );
}

function ErrorBox({ message, onRetry }) {
    if (!message) return null;
    return (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
            <div className="flex items-start gap-2">
                <p className="text-xs text-red-700 dark:text-red-300 flex-1 min-w-0 break-words">{message}</p>
                {onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="shrink-0 text-xs font-semibold text-red-600 dark:text-red-400 min-h-10 px-2"
                    >
                        Retry
                    </button>
                )}
            </div>
        </div>
    );
}

function Badge({ tone = "gray", children }) {
    const cls = {
        gray: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
        ok: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300",
        danger: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300",
        warn: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300",
        info: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",
    }[tone];
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>{children}</span>;
}

/** `v` may be a string, a number, or a node (a percentage that is undefined). */
function Kv({ k, v, mono }) {
    return (
        <div className="flex items-start gap-2 py-1 min-w-0">
            <span className="text-[11px] text-gray-400 dark:text-gray-500 w-40 shrink-0">{k}</span>
            <span className={`text-xs text-gray-800 dark:text-gray-200 min-w-0 flex-1 break-words ${mono ? "font-mono" : ""}`}>
                {isAbsent(v) ? "—" : v}
            </span>
        </div>
    );
}

function Field({ label, children, hint, id }) {
    return (
        <div className="min-w-0">
            <label htmlFor={id} className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                {label}
            </label>
            {children}
            {hint && <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">{hint}</span>}
        </div>
    );
}

/**
 * House-style toggle. The visible track stays `w-11 h-6`, but the button itself
 * is `w-11 h-11` so the tap target is 44px rather than 24px.
 */
function Toggle({ label, on, onChange }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={!!on}
            aria-label={`${label}: ${on ? "on" : "off"}`}
            onClick={onChange}
            className="shrink-0 w-11 h-11 -mr-2 flex items-center justify-end focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white rounded-full"
        >
            <span
                className={`relative w-11 h-6 rounded-full transition-colors ${on ? "bg-[#1cb0f6]" : "bg-gray-300 dark:bg-gray-700"}`}
            >
                <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? "translate-x-5" : ""}`}
                />
            </span>
        </button>
    );
}

/**
 * A percentage the server declined to compute.
 *
 * `null` is not zero: it means a zero denominator, so the ratio does not exist.
 * Rendering 0% would invent a measurement that was never taken, so this prints an
 * em dash and exposes the reason to hover and to a screen reader.
 */
function Pct({ value, why, className = "" }) {
    if (isAbsent(value)) {
        return (
            <span className={`text-gray-400 dark:text-gray-500 ${className}`} title={why}>
                <span aria-hidden="true">—</span>
                <span className="sr-only">not available: {why}</span>
            </span>
        );
    }
    return <span className={`tabular-nums ${className}`}>{num(value).toFixed(1)}%</span>;
}

function Bar({ share, color = "#1cb0f6" }) {
    const w = Math.max(0, Math.min(100, num(share)));
    return (
        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden w-full min-w-0">
            <div className="h-full rounded-full transition-[width]" style={{ width: `${w}%`, backgroundColor: color }} />
        </div>
    );
}

/**
 * The server said its scan hit the cap, so every count behind it is a lower
 * bound. This is a warning, not a footnote, and it names the cap.
 */
function TruncatedNote({ what, cap = SCAN_CAP, serverNote }) {
    return (
        <Note tone="warn" title={`Truncated — ${what} are lower bounds, not totals.`}>
            {serverNote ? (
                <p>
                    Server note, verbatim: <span className="italic">{serverNote}</span>
                </p>
            ) : null}
            <p className={serverNote ? "mt-1" : ""}>
                The scan stopped at {cap.toLocaleString()} records, so everything past that limit was never read. Nothing on this
                card should be quoted as a complete figure.
            </p>
        </Note>
    );
}

/**
 * The server&apos;s `note` / `definition` / `limitation`, verbatim and in place.
 *
 * These strings ARE the measurement caveat, so they are printed as text and
 * never paraphrased into something the server did not claim. A null note renders
 * nothing at all rather than an empty box — `/features` deliberately sends null
 * whenever it is not truncated.
 */
function ServerNote({ note, label = "Server note", title }) {
    if (typeof note !== "string" || !note.trim()) return null;
    return (
        <Note title={title || `${label}, verbatim`}>
            <p className="italic">{note}</p>
        </Note>
    );
}

/* ── Data plumbing ─────────────────────────────────────────────────────────── */

/**
 * One fetch, one error, one spinner.
 *
 * A failure never clears `data`, so a 500 on a refresh shows the error above the
 * last thing that loaded rather than blanking the card — a card that empties on a
 * transient error reads as "nothing to see here", which is the exact failure mode
 * this page exists to avoid.
 */
function useResource(loader, label) {
    const { showToast } = useToast();
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const dataRef = useRef(null);

    const load = useCallback(
        async (arg) => {
            setLoading(true);
            setError("");
            try {
                const next = await loader(arg);
                dataRef.current = next;
                setData(next);
                return true;
            } catch (e) {
                const text = describe(e);
                setError(text);
                // A failed REFRESH over data that already loaded is easy to miss,
                // because the card deliberately keeps showing the last good
                // numbers. A first load has no such risk, so it stays in-card.
                if (dataRef.current) showToast(`${label} refresh failed: ${text}`, "error");
                return false;
            } finally {
                setLoading(false);
            }
        },
        [loader, label, showToast]
    );

    return { data, error, loading, load };
}

/** Error in the card, stale data still on screen, spinner only before the first load. */
function Loadable({ res, label, children }) {
    const body = res.data ? (
        children(res.data)
    ) : res.loading ? (
        <Spinner label={label} />
    ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-2">Not loaded yet — press Refresh.</p>
    );

    if (!res.error) return body;
    return (
        <div className="space-y-3">
            <ErrorBox message={res.error} onRetry={() => res.load()} />
            {res.data && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                    Showing the last data that loaded successfully. It may be out of date, and it was fetched for a different window
                    than the one now selected.
                </p>
            )}
            {body}
        </div>
    );
}

function CardShell({ title, subtitle, onRefresh, refreshing, children }) {
    return (
        <div className={CARD}>
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                    <h3 className={HEADING}>{title}</h3>
                    {subtitle && <p className={`${SUBTLE} mt-0.5 leading-relaxed`}>{subtitle}</p>}
                </div>
                {onRefresh && (
                    <div className="shrink-0">
                        <button type="button" onClick={onRefresh} disabled={refreshing} className={BTN_GHOST}>
                            {refreshing ? "Refreshing…" : "Refresh"}
                        </button>
                    </div>
                )}
            </div>
            {children}
        </div>
    );
}

/** A name/count list with proportional bars. Used for paths and referrers. */
function RankedList({ rows, labelOf, countOf, color, unit, empty }) {
    const list = rowsOf(rows).filter((r) => r && typeof r === "object");
    if (!list.length) {
        return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">{empty || "Nothing recorded yet."}</p>;
    }
    const max = Math.max(1, ...list.map(countOf));
    return (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {list.map((r, i) => (
                <div key={`${labelOf(r)}-${i}`} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                        <span
                            className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate min-w-0"
                            title={labelOf(r)}
                        >
                            {labelOf(r)}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums shrink-0">
                            {fmtInt(countOf(r))} {unit}
                        </span>
                    </div>
                    <div className="mt-1">
                        <Bar share={(countOf(r) / max) * 100} color={color} />
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ── 1. Overview ───────────────────────────────────────────────────────────── */

const DAILY_KEYS = [{ field: "active", label: "Active user-days", color: "#8b5cf6" }];
const BIG = "text-2xl font-extrabold text-gray-900 dark:text-gray-100";

function OverviewTab({ data, days }) {
    const u = data?.users || {};
    const a = data?.activity || {};
    const series = rowsOf(a.dailyActive);
    const chart = series.map((p) => ({ label: shortDay(p?.day), active: num(p?.active) }));

    // Recomputed here only to LABEL the server's own ratios. The percentages
    // displayed are always the server's, never these.
    const hasPriorWeek = series.length >= 14;
    const last7 = series.slice(-7).reduce((s, p) => s + num(p?.active), 0);
    const prior7 = hasPriorWeek ? series.slice(-14, -7).reduce((s, p) => s + num(p?.active), 0) : 0;
    const allUserDays = chart.reduce((s, p) => s + p.active, 0);
    const distinct = a.uniqueActiveInWindow;

    const growthUndefined = isAbsent(u.growthPct)
        ? `The ${days} days immediately before this window recorded ${fmtInt(u.newPreviousWindow)} signups, so the change has no denominator and the server returned no percentage. An em dash there is not 0% — it means the ratio was never defined.`
        : "";
    const stickUndefined = isAbsent(a.stickinessPct)
        ? `No account was active anywhere in this ${days}-day window, so average daily actives divided by active accounts has no denominator. The server returned no percentage, and the em dash is not 0%.`
        : "";
    const wowUndefined = isAbsent(a.weekOverWeekPct)
        ? !hasPriorWeek
            ? `This ${days}-day window does not contain 14 days of series, so the week-over-week pair has no prior week to divide by. Widening the window is the only thing that makes this number exist.`
            : `The seven days before the last seven recorded ${fmtInt(prior7)} user-days, so the change is undefined. It is not a flat 0%.`
        : "";

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <StatCard label="Total users" value={fmtInt(u.total)} hint="every account that exists" />
                <StatCard
                    label="New in window"
                    value={fmtInt(u.newInWindow)}
                    delta={isAbsent(u.growthPct) ? null : num(u.growthPct)}
                    hint={`vs the previous ${days} days`}
                />
                <StatCard label="Active now" value={fmtInt(u.activeNow)} hint="isOnline right now — a live flag, not history" />
                <StatCard
                    label="Avg daily actives"
                    value={isAbsent(a.avgDau) ? "—" : num(a.avgDau).toFixed(1)}
                    hint="mean of the last 7 days, in user-days"
                />
                <StatCard
                    label="Stickiness"
                    value={<Pct value={a.stickinessPct} why={stickUndefined} className={BIG} />}
                    hint="avg DAU ÷ accounts active in window"
                />
                <StatCard
                    label="Week over week"
                    value={<Pct value={a.weekOverWeekPct} why={wowUndefined} className={BIG} />}
                    hint="7 days vs the 7 before, user-days"
                />
                <StatCard label="Active in window" value={fmtInt(distinct)} hint="distinct accounts, not user-days" />
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Moderation flags
                    </p>
                    <div className="mt-2 space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2 min-w-0">
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">Suspended</span>
                            <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                                {fmtInt(u.suspended)}
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2 min-w-0">
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">Shadowbanned</span>
                            <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                                {fmtInt(u.shadowbanned)}
                            </span>
                        </div>
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
                        Counts of accounts carrying the flag, not an assessment of whether it is correct.
                    </p>
                </div>
            </div>

            {(growthUndefined || stickUndefined || wowUndefined) && (
                <Note tone="warn" title="Some percentages on this page are undefined, not zero.">
                    <ul className="space-y-1.5">
                        {growthUndefined && (
                            <li>
                                <b>New vs previous window</b> — {growthUndefined}
                            </li>
                        )}
                        {stickUndefined && (
                            <li>
                                <b>Stickiness</b> — {stickUndefined}
                            </li>
                        )}
                        {wowUndefined && (
                            <li>
                                <b>Week over week</b> — {wowUndefined}
                            </li>
                        )}
                    </ul>
                </Note>
            )}

            {data?.seriesTruncated === true && <TruncatedNote what="the daily activity series" />}

            <ServerNote note={data?.note} />

            <div className={CARD}>
                <h3 className={HEADING}>How to read these numbers</h3>
                <p className={`${SUBTLE} mt-0.5 mb-2 leading-relaxed`}>
                    Activity is counted two different ways below. They are different measurements, not two views of one.
                </p>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    <Kv k="Window" v={`${days} days (the server clamps 7 to 365)`} />
                    <Kv k="Signups in window" v={fmtInt(u.newInWindow)} />
                    <Kv k="Previous window" v={`${fmtInt(u.newPreviousWindow)} signups — the denominator for the growth figure`} />
                    <Kv k="Growth" v={<Pct value={u.growthPct} why={growthUndefined} />} />
                    <Kv k="User-days, last 7d" v={last7.toLocaleString()} />
                    <Kv
                        k="User-days, prior 7d"
                        v={hasPriorWeek ? prior7.toLocaleString() : "— window too short to contain a prior week"}
                    />
                    <Kv k="User-days, whole window" v={allUserDays.toLocaleString()} />
                    <Kv k="Distinct active accounts" v={fmtInt(distinct)} />
                </div>
                <div className="mt-2">
                    <Note title="User-days are not people.">
                        The daily chart counts an account once per day it was active, so an account active on three days contributes
                        three. Summing the whole {days}-day chart gives <b>{allUserDays.toLocaleString()}</b> user-days spread
                        across <b>{fmtInt(distinct)}</b> distinct accounts. The first number is legitimately the larger of the two
                        and neither is wrong — a user-day total exceeding the account count is expected, not a bug to chase.
                    </Note>
                </div>
            </div>

            <div className={CARD}>
                <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                    <h3 className={HEADING}>Daily active — {days}-day trend</h3>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DAILY_KEYS[0].color }} />
                        Active user-days
                    </span>
                </div>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    Bucketed by UTC day from <span className="font-mono">User.lastActive</span>. A day at zero is a real zero, not a
                    gap in the data.
                </p>
                <AreaChart data={chart} keys={DAILY_KEYS} height={240} />
            </div>

            <div className={CARD}>
                <h3 className={HEADING}>Daily active — the same series, per day</h3>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    The identical series as the area chart above, drawn as bars so a single day&apos;s magnitude is readable. Two
                    renderings of one measurement, not two measurements.
                </p>
                <BarChart data={chart.map((p) => ({ label: p.label, value: p.active }))} color="#8b5cf6" height={200} />
            </div>
        </div>
    );
}

/* ── 2. Activation ─────────────────────────────────────────────────────────── */

function ActivationTab({ data, days }) {
    const steps = rowsOf(data?.steps);

    /*
     * The empty-cohort branch of /funnel returns `steps: []` and no cohortSize,
     * so the denominator is derived from the first step instead.
     */
    const cohortSize = isAbsent(data?.cohortSize) ? num(steps[0]?.count) : num(data.cohortSize);
    const cohortDerived = isAbsent(data?.cohortSize) && steps.length > 0;

    /*
     * The server states that each step is a subset of the one above it, and the
     * bars below are drawn on that assumption. The queries do not guarantee it:
     * posts are filtered to the window but comments are not, and "came back" is a
     * lastActive comparison while "posted" is a Post row. So the nesting is
     * checked rather than trusted, and a violation is shown instead of being
     * rendered as a working funnel.
     */
    const breaks = [];
    for (let i = 1; i < steps.length; i += 1) {
        const prev = num(steps[i - 1]?.count);
        const cur = num(steps[i]?.count);
        if (cur > prev) {
            breaks.push({
                from: steps[i - 1]?.label || steps[i - 1]?.key || `step ${i}`,
                to: steps[i]?.label || steps[i]?.key || `step ${i + 1}`,
                prev,
                cur,
            });
        }
    }

    if (steps.length === 0) {
        return (
            <div className="space-y-3">
                <Note title="No signups in this window. That is a result, not a failure.">
                    <p>
                        Zero accounts were created in the last {days} days, so there is no cohort to follow and no funnel to draw.
                        An empty funnel is a valid state of the data — it is not a broken query, and nothing here should be read as
                        saying nobody engaged.
                    </p>
                    <p className="mt-1">
                        The server sends an empty step list and omits <span className="font-mono">cohortSize</span> entirely in this
                        branch, so the cohort is reported here as 0.
                    </p>
                </Note>
                <ServerNote note={data?.note} />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {breaks.length > 0 && (
                <Note tone="danger" title="These steps are not nested, and the funnel below is drawn as if they were.">
                    <p>
                        {breaks
                            .map(
                                (b) =>
                                    `"${b.to}" is ${b.cur} against "${b.from}" at ${b.prev}, which is more than the step above it — and a subset cannot be larger than the set it sits in.`
                            )
                            .join(" ")}
                    </p>
                    <p className="mt-1">
                        The cause is in the queries rather than in the data. <span className="font-mono">Posted</span> is filtered to
                        posts created inside the {days}-day window, while <span className="font-mono">Commented</span> carries no
                        date filter at all, so a cohort member who commented months ago is counted under Commented having Posted
                        nothing in this window. Read the counts, not the shape.
                    </p>
                </Note>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                    label="Cohort"
                    value={fmtInt(cohortSize)}
                    hint={cohortDerived ? "derived — the server omitted cohortSize" : "accounts created in this window"}
                />
                {steps.slice(1).map((s, i) => (
                    <StatCard
                        key={s?.key || `step-${i}`}
                        label={s?.label || s?.key || `Step ${i + 2}`}
                        value={fmtInt(s?.count)}
                        hint={<Pct value={s?.pctOfSignup} why="The cohort size was not returned, so this share has no denominator." />}
                    />
                ))}
            </div>

            <div className="space-y-3">
                {steps.map((s, i) => {
                    const count = num(s?.count);
                    const share = cohortSize > 0 ? (count / cohortSize) * 100 : 0;
                    const prevCount = i > 0 ? num(steps[i - 1]?.count) : null;
                    const prevWhy =
                        i === 0
                            ? "This is the first step, so there is no step above it to be a share of."
                            : `The step above recorded ${fmtInt(prevCount)}, so this ratio has no denominator. The em dash is not 0%.`;
                    return (
                        <div key={s?.key || `step-${i}`} className="min-w-0">
                            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 min-w-0">
                                    {i > 0 && (
                                        <span aria-hidden="true" className="text-gray-300 dark:text-gray-600 mr-1.5">
                                            ↳
                                        </span>
                                    )}
                                    {s?.label || s?.key || `Step ${i + 1}`}
                                </p>
                                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                                    {fmtInt(count)}
                                </p>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2.5">
                                <div className="flex-1 min-w-0">
                                    <Bar share={share} color={FUNNEL_COLORS[i] || "#1cb0f6"} />
                                </div>
                                <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums shrink-0 w-24 text-right">
                                    <Pct
                                        value={s?.pctOfSignup}
                                        why="The cohort size was not returned, so this share of signups has no denominator."
                                    />{" "}
                                    of signups
                                </span>
                            </div>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                                {i > 0 ? (
                                    <>
                                        <Pct value={s?.pctOfPrevious} why={prevWhy} /> of the step above it
                                    </>
                                ) : (
                                    <>Base of the funnel. Every bar below is drawn as a share of this step, not of its own neighbour.</>
                                )}
                            </p>
                        </div>
                    );
                })}
            </div>

            {data?.truncated === true && <TruncatedNote what="the cohort" />}

            <Note title="How to read this shape.">
                Each bar is drawn against the first step, so the widths are directly comparable. The arrow marks containment: a step
                is meant to be a subset of the one above it, which is why a share of signups is always the more meaningful of the two
                percentages.
            </Note>

            <ServerNote note={data?.note} />
        </div>
    );
}

/* ── 3. Retention ──────────────────────────────────────────────────────────── */

function RetentionTab({ data, weeks, onWeeks }) {
    const cohorts = rowsOf(data?.cohorts).map((c) => ({
        meta: c && typeof c === "object" ? c : {},
        rowMap: new Map(
            rowsOf(c?.rows)
                .filter((r) => r && typeof r === "object")
                .map((r) => [num(r?.week), r])
        ),
    }));
    const maxWeek = cohorts.reduce((m, c) => c.rowMap.reduce((mm, k) => Math.max(mm, k), m), 0);
    const cols = Array.from({ length: maxWeek + 1 }, (_, i) => i);

    return (
        <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
                <Field
                    id="ins-retention-weeks"
                    label="Cohort depth (weeks)"
                    hint="The server clamps this to 2 to 26. It deliberately does not follow the day window at the top of the page: a retention cohort is measured in whole weeks, and a 30-day window is not a whole number of them."
                >
                    <select
                        id="ins-retention-weeks"
                        value={weeks}
                        onChange={(e) => onWeeks(Number(e.target.value) || 8)}
                        className={SELECT}
                    >
                        {WEEK_OPTIONS.map((w) => (
                            <option key={w} value={w}>
                                {w} weeks
                            </option>
                        ))}
                    </select>
                </Field>
                <div className="flex items-end">
                    <Note title="Reading the grid">
                        Week 0 is a <b>baseline</b>, not a measurement. Later cells are missing for cohorts too young to have lived
                        that long, and a missing cell is not a zero.
                    </Note>
                </div>
            </div>

            {cohorts.length === 0 ? (
                <Note title={`No accounts were created in the last ${weeks} weeks.`}>
                    <p>
                        There is no cohort to measure, so retention is undefined rather than 0%. The server omits{" "}
                        <span className="font-mono">definition</span> and <span className="font-mono">truncated</span> in this branch
                        along with the empty cohort list, so there is no definition to quote either.
                    </p>
                </Note>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[560px]">
                        <thead>
                            <tr className="text-gray-400 dark:text-gray-500">
                                <th scope="col" className="text-left font-semibold py-2 pr-3 whitespace-nowrap">
                                    Cohort
                                </th>
                                <th scope="col" className="text-right font-semibold py-2 px-2 whitespace-nowrap">
                                    Size
                                </th>
                                {cols.map((w) => (
                                    <th
                                        key={w}
                                        scope="col"
                                        className="text-right font-semibold py-2 px-2 whitespace-nowrap"
                                        title={w === 0 ? "Baseline: every member of the cohort, by definition" : `Week ${w} after signup`}
                                    >
                                        W{w}
                                        {w === 0 ? "*" : ""}
                                    </th>
                                ))}
                                <th scope="col" className="text-right font-semibold py-2 pl-2 whitespace-nowrap">
                                    Counts
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {cohorts.map((c, ci) => (
                                <RetentionRow
                                    key={`${c.meta?.startDate || "cohort"}-${num(c.meta?.cohortWeek)}-${ci}`}
                                    cohort={c}
                                    cols={cols}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {data?.truncated === true && <TruncatedNote what="the cohort membership" />}

            <ServerNote note={data?.definition} label="Definition" title="Definition, verbatim" />

            <ServerNote note={data?.note} />
        </div>
    );
}

function RetentionRow({ cohort, cols }) {
    const [open, setOpen] = useState(false);
    const size = num(cohort?.meta?.size);
    const cellAt = (w) => cohort?.rowMap?.get(w) || null;
    const week1 = cellAt(1);

    return (
        <>
            <tr className="align-middle">
                <th scope="row" className="text-left font-normal py-2 pr-3 min-w-0">
                    <span className="block font-mono text-[11px] text-gray-500 dark:text-gray-400">
                        {cohort?.meta?.startDate || "—"}
                    </span>
                    <span className="block text-[10px] text-gray-400 dark:text-gray-500">
                        cohort week {fmtInt(cohort?.meta?.cohortWeek)}
                    </span>
                </th>
                <td className="text-right py-2 px-2 tabular-nums whitespace-nowrap">
                    <span className="font-bold text-gray-900 dark:text-gray-100">{fmtInt(size)}</span>
                    {size > 0 && size < NOISY_COHORT && (
                        <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-semibold">noise</span>
                    )}
                </td>
                {cols.map((w) => {
                    const cell = cellAt(w);
                    if (w === 0) {
                        return (
                            <td key={w} className="text-right py-2 px-2 whitespace-nowrap">
                                <span
                                    className="inline-block px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-semibold tabular-nums"
                                    title={`Baseline, not a measurement: all ${fmtInt(size)} accounts of this cohort, by definition.`}
                                >
                                    100.0%*
                                </span>
                            </td>
                        );
                    }
                    if (!cell) {
                        return (
                            <td
                                key={w}
                                className="text-right py-2 px-2 whitespace-nowrap text-gray-300 dark:text-gray-600"
                                title={`Not measured. This cohort is not old enough for week ${w} to have run its course — an absent cell is not a zero.`}
                            >
                                —
                            </td>
                        );
                    }
                    return (
                        <td
                            key={w}
                            className="text-right py-2 px-2 whitespace-nowrap tabular-nums text-gray-800 dark:text-gray-200"
                            title={`Week ${w}: ${fmtInt(cell.retained)} of ${fmtInt(size)} accounts posted at least once.`}
                        >
                            {fmtPct(cell.pct)}
                        </td>
                    );
                })}
                <td className="text-right py-2 pl-2">
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        aria-label={`${open ? "Hide" : "Show"} account counts for the cohort starting ${
                            cohort?.meta?.startDate || "unknown"
                        }`}
                        className={`${BTN_GHOST} whitespace-nowrap`}
                    >
                        {open ? "Hide" : "Show"}
                    </button>
                </td>
            </tr>
            {open && (
                <tr className="bg-gray-50 dark:bg-gray-800/40">
                    <td colSpan={cols.length + 3} className="py-2.5 pr-3">
                        <div className="flex flex-wrap gap-x-5 gap-y-1">
                            {cols.map((w) => {
                                const cell = cellAt(w);
                                return (
                                    <span key={w} className="text-[11px] text-gray-600 dark:text-gray-300">
                                        <span className="text-gray-400 dark:text-gray-500">W{w}:</span>{" "}
                                        {cell ? `${fmtInt(cell.retained)} of ${fmtInt(size)} accounts` : "not measured yet"}
                                    </span>
                                );
                            })}
                        </div>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 leading-relaxed">
                            {week1
                                ? "Week 1 is the first real measurement here. The server stops emitting a week once the cohort would run past today, which is why the newest cohorts are shorter than the oldest."
                                : "This cohort has no week 1 yet — it signed up inside the last seven days, so there is nothing after the baseline to measure."}
                        </p>
                    </td>
                </tr>
            )}
        </>
    );
}

/* ── 4. Features ───────────────────────────────────────────────────────────── */

function FeaturesTab({ data, days }) {
    // Re-sorted rather than trusting the response order, since ties in `users`
    // would otherwise leave the order at the server's discretion.
    const features = rowsOf(data?.features)
        .filter((f) => f && typeof f === "object")
        .slice()
        .sort((a, b) => num(b?.users) - num(a?.users) || num(b?.events) - num(a?.events));
    const devices = Object.entries(
        data?.devices && typeof data.devices === "object" && !Array.isArray(data.devices) ? data.devices : {}
    )
        .map(([label, count]) => ({ label, count: num(count) }))
        .sort((a, b) => b.count - a.count);
    const truncated = data?.truncated === true;

    return (
        <div className="space-y-4">
            <Note title={`${fmtInt(data?.totalEvents)} tracked events in the last ${days} days.`}>
                Adoption is measured against <b>every account that exists</b>, not against the accounts active in this window, so a
                feature used by five people reads as a small share of a large denominator. It is closer to a share of the user base
                than to a conversion rate.
            </Note>

            {truncated ? (
                <TruncatedNote what="every count on this tab" serverNote={data?.note} />
            ) : (
                <ServerNote note={data?.note} />
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Features seen" value={fmtInt(features.length)} hint="distinct event types in the window" />
                <StatCard
                    label="Total events"
                    value={fmtInt(data?.totalEvents)}
                    hint={truncated ? "lower bound — the scan was capped" : "events the server actually read"}
                />
                <StatCard
                    label="Top feature"
                    value={features[0] ? features[0].type || "unknown" : "—"}
                    hint={features[0] ? `${fmtInt(features[0]?.users)} accounts used it` : "nothing recorded in this window"}
                />
            </div>

            <div className={CARD}>
                <h3 className={HEADING}>Adoption by feature</h3>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    Sorted by how many accounts used each feature. The bar length is the printed share of all accounts, so the bar
                    and the number cannot disagree.
                </p>
                {features.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                        No analytics events in this window. Nothing has been instrumented yet, which is a different state from
                        features existing and going unused.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[440px]">
                            <thead>
                                <tr className="text-gray-400 dark:text-gray-500">
                                    <th scope="col" className="text-left font-semibold py-2 pr-3">
                                        Feature
                                    </th>
                                    <th scope="col" className="text-right font-semibold py-2 px-2">
                                        Users
                                    </th>
                                    <th scope="col" className="text-right font-semibold py-2 px-2">
                                        Events
                                    </th>
                                    <th scope="col" className="text-left font-semibold py-2 pl-3 w-[42%]">
                                        Adoption
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {features.map((f, i) => (
                                    <tr key={f?.type || `feature-${i}`}>
                                        <th
                                            scope="row"
                                            className="text-left font-medium text-gray-800 dark:text-gray-200 py-2 pr-3 break-words"
                                        >
                                            {f?.type || "unknown"}
                                        </th>
                                        <td className="text-right py-2 px-2 tabular-nums font-bold text-gray-900 dark:text-gray-100">
                                            {fmtInt(f?.users)}
                                        </td>
                                        <td className="text-right py-2 px-2 tabular-nums text-gray-500 dark:text-gray-400">
                                            {fmtInt(f?.events)}
                                        </td>
                                        <td className="py-2 pl-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="flex-1 min-w-0">
                                                    <Bar share={f?.adoptionPct} color="#1cb0f6" />
                                                </div>
                                                <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums shrink-0 w-14 text-right">
                                                    <Pct
                                                        value={f?.adoptionPct}
                                                        why="The server returned no adoption figure for this feature, so this bar has nothing to scale against."
                                                    />
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className={CARD}>
                    <h3 className={HEADING}>Top paths</h3>
                    <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                        The 25 most-visited routes the tracker recorded, capped server-side. A route outside the top 25 is not
                        absent from the app, only from this list.
                    </p>
                    <RankedList
                        rows={data?.topPaths}
                        labelOf={(r) => r?.path || "(no path recorded)"}
                        countOf={(r) => num(r?.count)}
                        color="#1cb0f6"
                        unit="hits"
                        empty="No paths recorded — the page-view tracker did not fire in this window."
                    />
                </div>
                <div className={CARD}>
                    <h3 className={HEADING}>Devices</h3>
                    <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                        Reported as a device label from the same tracked events. An event with no device value is not counted here.
                    </p>
                    <DonutChart data={devices} />
                </div>
            </div>

            <div className={CARD}>
                <h3 className={HEADING}>Referrers</h3>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    The 15 largest referring sources, capped server-side. An event with no referrer is dropped entirely rather than
                    bucketed as direct.
                </p>
                <RankedList
                    rows={data?.referrers}
                    labelOf={(r) => r?.referrer || "(unknown)"}
                    countOf={(r) => num(r?.count)}
                    color="#ce82ff"
                    unit="visits"
                    empty="No referrers recorded — no event in this window carried one."
                />
            </div>
        </div>
    );
}

/* ── 5. Cadence ────────────────────────────────────────────────────────────── */

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const FALLBACK_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GRID_COLS = "34px repeat(24, minmax(0, 1fr))";
const HEAT_RGB = "88, 204, 2";

function CadenceTab({ data, days }) {
    const perUser = data?.perUser || {};
    const series = rowsOf(data?.series).map((p) => ({ label: shortDay(p?.day), value: num(p?.posts) }));
    const posters = num(perUser.posters);

    const noPercentiles =
        isAbsent(perUser.p50) && isAbsent(perUser.p90) && isAbsent(perUser.p99) && isAbsent(perUser.max);
    const skewed =
        !noPercentiles &&
        !isAbsent(perUser.p50) &&
        !isAbsent(perUser.p99) &&
        num(perUser.p50) > 0 &&
        num(perUser.p99) >= num(perUser.p50) * 5;

    return (
        <div className="space-y-4">
            {data?.heatmap?.note && (
                <Note tone="warn" title="Read the heatmap with the caveat the server attached, not just the colours.">
                    <p className="italic">{data.heatmap.note}</p>
                </Note>
            )}

            {data?.truncated === true && (
                <>
                    <TruncatedNote what="posts, the heatmap and the per-user percentiles" />
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 -mt-2 leading-relaxed">
                        This route sends <span className="font-mono">truncated</span> but no accompanying note, so the scan cap above
                        is the entire caveat available for these numbers.
                    </p>
                </>
            )}

            <div className={CARD}>
                <h3 className={HEADING}>When people post — 7 days by 24 hours</h3>
                <p className={`${SUBTLE} mt-0.5 mb-3 leading-relaxed`}>
                    Shading is scaled to the busiest cell in the window, so an empty grid and a quiet one look identical. Hover a cell
                    for its count, or switch the values on to read them as numbers.
                </p>
                <Heatmap heatmap={data?.heatmap} />
            </div>

            <div className={CARD}>
                <h3 className={HEADING}>Posts per day — {days} days</h3>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    Every post the server read in the window, bucketed by UTC day. A bar at zero is a real day without posts.
                </p>
                <BarChart data={series} color="#58cc02" height={190} />
            </div>

            <div>
                <h3 className={`${HEADING} mb-1`}>Posts per account</h3>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    Percentiles across the {fmtInt(posters)} account{posters === 1 ? "" : "s"} that posted at least once in the
                    window. Accounts that posted nothing are not in this distribution at all, so it describes posters only.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <StatCard label="Posters" value={fmtInt(perUser.posters)} hint="accounts with at least one post" />
                    <StatCard
                        label="Median (p50)"
                        value={isAbsent(perUser.p50) ? "—" : fmtInt(perUser.p50)}
                        hint={noPercentiles ? "no account posted in the window" : "half of posters posted at most this many"}
                    />
                    <StatCard label="p90" value={isAbsent(perUser.p90) ? "—" : fmtInt(perUser.p90)} hint="nine in ten posted at most this" />
                    <StatCard label="p99" value={isAbsent(perUser.p99) ? "—" : fmtInt(perUser.p99)} hint="where the heavy tail starts" />
                    <StatCard label="Busiest" value={isAbsent(perUser.max) ? "—" : fmtInt(perUser.max)} hint="most posts by one account" />
                </div>
            </div>

            {noPercentiles ? (
                <Note title="No account posted anything in this window.">
                    Every percentile is an em dash because there is no distribution to take one from. That is not the same as each
                    account posting zero — it is that no account posted at all, and the two are different states with different
                    causes.
                </Note>
            ) : skewed ? (
                <Note tone="warn" title="The distribution is extremely top-heavy.">
                    p50 is {fmtInt(perUser.p50)} post{num(perUser.p50) === 1 ? "" : "s"} while p99 is {fmtInt(perUser.p99)} — a
                    factor of {(num(perUser.p99) / num(perUser.p50)).toFixed(1)}. The median account posts almost nothing and a very
                    small tail is carrying the volume, so a headline such as &quot;{fmtInt(perUser.total)} posts&quot; describes a
                    handful of people rather than the user base.
                </Note>
            ) : null}

            <ServerNote note={data?.note} />
        </div>
    );
}

function Heatmap({ heatmap }) {
    const [showValues, setShowValues] = useState(false);
    const dow = rowsOf(heatmap?.daysOfWeek).length === 7 ? heatmap.daysOfWeek : FALLBACK_DOW;

    // Every row is forced to 24 cells, so a short or ragged row from the server
    // reads as absent hours rather than as a grid that has silently shifted.
    const grid = Array.from({ length: 7 }, (_, r) => {
        const row = Array.isArray(heatmap?.grid?.[r]) ? heatmap.grid[r] : [];
        return HOURS.map((h) => num(row[h]));
    });
    const max = Math.max(0, ...grid.flat());

    let peak = null;
    grid.forEach((row, r) =>
        row.forEach((v, h) => {
            if (!peak || v > peak.v) peak = { v, r, h };
        })
    );
    const smallHours = !!peak && peak.v > 0 && peak.h <= 4;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500 min-w-0">
                    <span>0 posts</span>
                    <span
                        className="h-2 w-24 rounded-full shrink-0"
                        style={{ background: `linear-gradient(to right, rgba(${HEAT_RGB}, 0.06), rgba(${HEAT_RGB}, 1))` }}
                    />
                    <span>{max} posts</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">Show values</span>
                    <Toggle label="Show heatmap values as numbers" on={showValues} onChange={() => setShowValues((v) => !v)} />
                </div>
            </div>

            {max === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                    No posts in this window, so every cell is zero. The grid is still drawn so the axis scale stays readable.
                </p>
            )}

            <div className="overflow-x-auto">
                <div
                    className="min-w-[520px]"
                    role="img"
                    aria-label={
                        peak && peak.v > 0
                            ? `Posting heatmap of 7 days by 24 hours. Busiest cell ${dow[peak.r]} ${String(peak.h).padStart(
                                  2,
                                  "0"
                              )}:00 with ${peak.v} posts. Maximum ${max} posts.`
                            : "Posting heatmap of 7 days by 24 hours. No posts in this window, so every cell is zero."
                    }
                >
                    <div className="grid gap-[3px]" style={{ gridTemplateColumns: GRID_COLS }}>
                        <div aria-hidden="true" />
                        {HOURS.map((h) => (
                            <div key={h} className="text-[9px] text-center text-gray-400 dark:text-gray-500">
                                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                            </div>
                        ))}
                    </div>
                    {dow.map((dn, r) => (
                        <div key={dn} className="grid gap-[3px] mt-[3px]" style={{ gridTemplateColumns: GRID_COLS }}>
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center justify-end pr-1.5">{dn}</div>
                            {HOURS.map((h) => {
                                const n = grid[r][h];
                                const alpha = n === 0 || max === 0 ? 0.06 : 0.15 + 0.85 * (n / max);
                                return (
                                    <div
                                        key={h}
                                        title={`${dn} ${String(h).padStart(2, "0")}:00 — ${n} post${n === 1 ? "" : "s"}`}
                                        className="h-4 rounded-[3px] border border-gray-100 dark:border-gray-800"
                                        style={{ backgroundColor: `rgba(${HEAT_RGB}, ${alpha.toFixed(3)})` }}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                {peak && peak.v > 0 ? (
                    <>
                        Busiest cell: <b>{`${dow[peak.r]} ${String(peak.h).padStart(2, "0")}:00`}</b> with {fmtInt(peak.v)} post
                        {peak.v === 1 ? "" : "s"}
                        {smallHours
                            ? ", which falls between midnight and 05:00 — the shape the server's note above flags as more likely a bot than a person"
                            : ""}
                        .{" "}
                    </>
                ) : (
                    "There is no peak to report, because the window contains no posts at all. "
                )}
                The hour axis is the server process clock as the server labels it; see the note at the top of this tab.
            </p>

            {showValues && (
                <div className="overflow-x-auto">
                    <table className="w-full text-[10px] min-w-[640px] tabular-nums">
                        <thead>
                            <tr className="text-gray-400 dark:text-gray-500">
                                <th scope="col" className="text-left font-semibold py-1 pr-2">
                                    Day
                                </th>
                                {HOURS.map((h) => (
                                    <th key={h} scope="col" className="text-right font-semibold py-1 px-0.5">
                                        {String(h).padStart(2, "0")}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {dow.map((dn, r) => (
                                <tr key={dn}>
                                    <th scope="row" className="text-left font-medium text-gray-600 dark:text-gray-300 py-1 pr-2">
                                        {dn}
                                    </th>
                                    {HOURS.map((h) => (
                                        <td
                                            key={h}
                                            className={`text-right py-1 px-0.5 ${
                                                grid[r][h] > 0 ? "text-gray-800 dark:text-gray-200" : "text-gray-300 dark:text-gray-600"
                                            }`}
                                        >
                                            {grid[r][h]}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/* ── 6. Dormant ────────────────────────────────────────────────────────────── */

function DormantTab({ data, days, limit, onLimit }) {
    const rows = rowsOf(data?.rows).filter((r) => r && typeof r === "object");
    const byProfile = data?.byProfile && typeof data.byProfile === "object" && !Array.isArray(data.byProfile) ? data.byProfile : {};
    const sampled = Object.values(byProfile).reduce((s, v) => s + num(v), 0);
    const total = isAbsent(data?.total) ? null : num(data.total);
    // This route sends no `truncated` flag, so the bound is derived: the server
    // returns at most `limit` rows but counts every match in `total`.
    const bounded = total !== null && total > rows.length;
    const shown = PROFILE_ORDER.filter((k) => num(byProfile[k]) > 0);

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <Field
                    id="ins-dormant-limit"
                    label="Rows to scan"
                    hint={`The server caps this at 200 and always returns the oldest-idle accounts first, so the table below is the longest-silent tail rather than a random sample.`}
                >
                    <select id="ins-dormant-limit" value={limit} onChange={(e) => onLimit(Number(e.target.value) || 50)} className={SELECT}>
                        {DORMANT_LIMITS.map((n) => (
                            <option key={n} value={n}>
                                {n} accounts
                            </option>
                        ))}
                    </select>
                </Field>
                <div className="flex items-end">
                    <Note title="Two different idle windows appear on this tab.">
                        The <b>cutoff</b> below is the {days}-day selector at the top of the page. The <b>idle</b> column in the
                        table is each account&apos;s own age since <span className="font-mono">lastActive</span>. Both are called{" "}
                        <span className="font-mono">idleDays</span> at different levels of the response, so they are labelled
                        differently here on purpose.
                    </Note>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Cutoff" value={fmtInt(data?.idleDays)} hint="days — the server's own cutoff for this list" />
                <StatCard label="Matching accounts" value={fmtInt(total)} hint="every account past the cutoff" />
                <StatCard
                    label="Rows returned"
                    value={fmtInt(rows.length)}
                    hint={bounded ? `a bounded sample of the ${fmtInt(total)} above` : "the whole matching set"}
                />
            </div>

            {bounded && (
                <Note tone="warn" title="This is a bounded sample, so the breakdown below does not describe the whole population.">
                    <p>
                        {fmtInt(rows.length)} of {fmtInt(total)} matching accounts were scanned. This route returns no{" "}
                        <span className="font-mono">truncated</span> flag — the bound is visible only by comparing{" "}
                        <span className="font-mono">rows.length</span> with <span className="font-mono">total</span>.
                    </p>
                    <p className="mt-1">
                        The rows are the {fmtInt(rows.length)} longest-silent accounts, so the profile mix is biased towards{" "}
                        {PROFILES["never-posted"].label.toLowerCase()} accounts. Do not divide these counts by the total to get a
                        population rate.
                    </p>
                </Note>
            )}

            <div className={CARD}>
                <h3 className={HEADING}>Why these accounts are quiet</h3>
                <p className={`${SUBTLE} mt-0.5 mb-3 leading-relaxed`}>
                    Counts cover the {fmtInt(sampled)} account{sampled === 1 ? "" : "s"} in the rows below
                    {bounded ? ", not the full matching set" : ""}.
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                    {shown.map((k) => {
                        const meta = PROFILES[k];
                        const n = num(byProfile[k]);
                        return (
                            <div key={k} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 min-w-0">
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                    <Badge tone={meta.tone}>{meta.label}</Badge>
                                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                                        {fmtInt(n)}
                                    </span>
                                </div>
                                <div className="mt-2">
                                    <Bar share={sampled > 0 ? (n / sampled) * 100 : 0} color={meta.color} />
                                </div>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 leading-relaxed">{meta.blurb}</p>
                            </div>
                        );
                    })}
                    {shown.length === 0 && (
                        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4 sm:col-span-3">
                            No rows came back, so there is nothing to classify.
                        </p>
                    )}
                </div>
            </div>

            <Note tone="warn" title={`${PROFILES["never-posted"].label} is a first-run problem, not churn.`}>
                These accounts are not lapsed users. They arrived, never posted once, and left — which is a failure of whatever they
                landed on first rather than of a relationship they had, and win-back messaging aimed at them treats a stranger as a
                lapsed follower. <span className="font-mono">lapsed-creator</span> is the opposite case: a real loss of a real
                producer, and the one worth a message.
            </Note>

            <div className={CARD}>
                <h3 className={HEADING}>Dormant accounts</h3>
                <p className={`${SUBTLE} mt-0.5 mb-3 leading-relaxed`}>
                    Oldest-idle first. An account with no <span className="font-mono">lastActive</span> value is reported with an em
                    dash rather than a day count, because an unknown idle time is not a short one.
                </p>
                {rows.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                        No account has been idle for more than {fmtInt(data?.idleDays)} days. That is every account still recent, not a
                        failed query.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[720px]">
                            <thead>
                                <tr className="text-gray-400 dark:text-gray-500">
                                    <th scope="col" className="text-left font-semibold py-2 pr-3">
                                        Account
                                    </th>
                                    <th scope="col" className="text-left font-semibold py-2 px-2">
                                        Profile
                                    </th>
                                    <th scope="col" className="text-right font-semibold py-2 px-2 whitespace-nowrap">
                                        Idle (days)
                                    </th>
                                    <th scope="col" className="text-left font-semibold py-2 px-2 whitespace-nowrap">
                                        Last active
                                    </th>
                                    <th scope="col" className="text-left font-semibold py-2 px-2 whitespace-nowrap">
                                        Last post
                                    </th>
                                    <th scope="col" className="text-right font-semibold py-2 px-2">
                                        Followers
                                    </th>
                                    <th scope="col" className="text-right font-semibold py-2 pl-2">
                                        Following
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {rows.map((r, i) => {
                                    const meta = PROFILES[r?.profile] || { label: r?.profile || "unknown", tone: "gray" };
                                    return (
                                        <tr key={r?.username || `row-${i}`}>
                                            <th
                                                scope="row"
                                                className="text-left font-medium text-gray-900 dark:text-gray-100 py-2 pr-3 break-words"
                                            >
                                                @{r?.username || "unknown"}
                                            </th>
                                            <td className="py-2 px-2 whitespace-nowrap">
                                                <Badge tone={meta.tone}>{meta.label}</Badge>
                                            </td>
                                            <td
                                                className="text-right py-2 px-2 whitespace-nowrap tabular-nums text-gray-800 dark:text-gray-200"
                                                title={
                                                    isAbsent(r?.idleDays)
                                                        ? "This account has no lastActive value, so its idle time is unknown. The em dash is not zero days."
                                                        : undefined
                                                }
                                            >
                                                {isAbsent(r?.idleDays) ? "—" : fmtInt(r.idleDays)}
                                            </td>
                                            <td className="py-2 px-2 whitespace-nowrap text-gray-500 dark:text-gray-400">
                                                {fmtDate(r?.lastActive)}
                                            </td>
                                            <td className="py-2 px-2 whitespace-nowrap text-gray-500 dark:text-gray-400">
                                                {isAbsent(r?.lastPostAt) ? (
                                                    <span title="This account has never posted anything.">never</span>
                                                ) : (
                                                    fmtDate(r.lastPostAt)
                                                )}
                                            </td>
                                            <td className="text-right py-2 px-2 tabular-nums text-gray-500 dark:text-gray-400">
                                                {fmtInt(r?.followers)}
                                            </td>
                                            <td className="text-right py-2 pl-2 tabular-nums text-gray-500 dark:text-gray-400">
                                                {fmtInt(r?.following)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <ServerNote note={data?.note} />
        </div>
    );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function InsightsPage() {
    const [tab, setTab] = useState("overview");
    const [days, setDays] = useState(30);
    const [weeks, setWeeks] = useState(8);
    const [limit, setLimit] = useState(50);

    const overview = useResource(useCallback(() => callApi(`${INSIGHTS}/overview?days=${days}`), [days]), "Overview");
    const funnel = useResource(useCallback(() => callApi(`${INSIGHTS}/funnel?days=${days}`), [days]), "Activation");
    const retention = useResource(useCallback(() => callApi(`${INSIGHTS}/retention?weeks=${weeks}`), [weeks]), "Retention");
    const features = useResource(useCallback(() => callApi(`${INSIGHTS}/features?days=${days}`), [days]), "Features");
    const cadence = useResource(useCallback(() => callApi(`${INSIGHTS}/cadence?days=${days}`), [days]), "Cadence");
    const dormant = useResource(
        useCallback(() => callApi(`${INSIGHTS}/dormant?days=${days}&limit=${limit}`), [days, limit]),
        "Dormant"
    );

    // What each sub-tab needs on first open. Overview is the eager one; the rest
    // load when first selected and then keep whatever they loaded.
    const loaders = useMemo(
        () => ({
            overview: [overview.load],
            activation: [funnel.load],
            retention: [retention.load],
            features: [features.load],
            cadence: [cadence.load],
            dormant: [dormant.load],
        }),
        [overview.load, funnel.load, retention.load, features.load, cadence.load, dormant.load]
    );

    const opened = useRef({});

    useEffect(() => {
        if (opened.current[tab]) return undefined;
        opened.current[tab] = true;
        const list = loaders[tab] || [];
        // Deferred so the effect body itself never sets state synchronously.
        const timer = setTimeout(() => list.forEach((load) => load()), 0);
        return () => clearTimeout(timer);
    }, [tab, loaders]);

    /**
     * Changing the window invalidates whatever is on screen: the numbers were
     * computed for the old range, so leaving them up would silently mislabel
     * them. The open tab is marked unopened again, and because `loaders` changes
     * identity with `days`, the effect above refetches it.
     */
    const applyWindow = useCallback(
        (next) => {
            if (next === days) return;
            opened.current = {};
            setDays(next);
        },
        [days]
    );

    const label = TABS.find((t) => t.id === tab)?.label || "";
    const active = { overview, activation: funnel, retention, features, cadence, dormant }[tab];

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="min-w-0">
                    <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">Insights</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Whether signups do anything, whether they come back, and which features are used at all.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Window</span>
                    <div className="flex bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-1">
                        {WINDOWS.map((w) => (
                            <button
                                key={w.days}
                                type="button"
                                onClick={() => applyWindow(w.days)}
                                aria-pressed={days === w.days}
                                className={`px-3 py-1.5 min-h-10 rounded-lg text-xs font-bold transition-colors ${
                                    days === w.days
                                        ? "bg-[#1cb0f6] text-white"
                                        : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                }`}
                            >
                                {w.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex gap-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-1 w-fit overflow-x-auto max-w-full">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        aria-pressed={tab === t.id}
                        className={`px-4 py-2 min-h-10 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                            tab === t.id
                                ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                The {days}-day window applies to Overview, Activation, Features, Cadence and Dormant. Retention is measured in whole
                weeks instead, so it has its own selector and is deliberately not affected by this one.
            </p>

            {active?.loading && active?.data && (
                <p
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
                >
                    <span className="w-3 h-3 shrink-0 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                    Refreshing {label}…
                </p>
            )}

            {tab === "overview" && (
                <CardShell
                    title="Activation overview"
                    subtitle={`Totals for the last ${days} days, plus the daily-active series behind them.`}
                    onRefresh={overview.load}
                    refreshing={overview.loading}
                >
                    <Loadable res={overview} label="Loading overview…">
                        {(d) => <OverviewTab data={d} days={days} />}
                    </Loadable>
                </CardShell>
            )}

            {tab === "activation" && (
                <CardShell
                    title="Signup to first meaningful action"
                    subtitle={`Accounts created in the last ${days} days, and what they did next.`}
                    onRefresh={funnel.load}
                    refreshing={funnel.loading}
                >
                    <Loadable res={funnel} label="Loading funnel…">
                        {(d) => <ActivationTab data={d} days={days} />}
                    </Loadable>
                </CardShell>
            )}

            {tab === "retention" && (
                <CardShell
                    title="Weekly cohort retention"
                    subtitle="One row per signup week, one column per week after signup."
                    onRefresh={retention.load}
                    refreshing={retention.loading}
                >
                    <Loadable res={retention} label="Loading cohorts…">
                        {(d) => <RetentionTab data={d} weeks={weeks} onWeeks={setWeeks} />}
                    </Loadable>
                </CardShell>
            )}

            {tab === "features" && (
                <CardShell
                    title="Feature adoption"
                    subtitle={`Tracked events from the last ${days} days, by feature, path and device.`}
                    onRefresh={features.load}
                    refreshing={features.loading}
                >
                    <Loadable res={features} label="Loading features…">
                        {(d) => <FeaturesTab data={d} days={days} />}
                    </Loadable>
                </CardShell>
            )}

            {tab === "cadence" && (
                <CardShell
                    title="Posting rhythm"
                    subtitle={`When posts happen across the week, and how unevenly they are spread across accounts (last ${days} days).`}
                    onRefresh={cadence.load}
                    refreshing={cadence.loading}
                >
                    <Loadable res={cadence} label="Loading cadence…">
                        {(d) => <CadenceTab data={d} days={days} />}
                    </Loadable>
                </CardShell>
            )}

            {tab === "dormant" && (
                <CardShell
                    title="Dormant accounts"
                    subtitle={`Accounts with no activity for longer than the ${days}-day cutoff.`}
                    onRefresh={dormant.load}
                    refreshing={dormant.loading}
                >
                    <Loadable res={dormant} label="Loading dormant accounts…">
                        {(d) => <DormantTab data={d} days={days} limit={limit} onLimit={setLimit} />}
                    </Loadable>
                </CardShell>
            )}
        </div>
    );
}
