"use client";

/**
 * Safety & ops admin panel — user risk, data health, compliance.
 *
 * ── What this panel is ───────────────────────────────────────────────────────
 * The third of the three content-safety panels. Content Filter owns the text
 * matcher, Media Safety owns image/video screening; this one owns the questions
 * neither of them answers: who is generating reports, is the database keeping
 * up, and can we answer "what did you do with my data".
 *
 * ── What this panel must never do ────────────────────────────────────────────
 * Look like it is enforcing something. The risk score is arithmetic over
 * reports, the "shadowban" toggle writes a field the user schema does not
 * declare, and the URL analyser is a set of regexes. None of them is a verdict,
 * so every number is shown with the components behind it and the server's own
 * `note` is rendered wherever the server supplies one.
 *
 * ── Server-side problems found while building this, and since fixed ──────────
 * Every item below was a real bug. They are fixed in the server now; the notes
 * are kept because each one changed the SHAPE of this panel's data, and a
 * future change that reintroduces any of them will show up as a silently
 * useless control here:
 * 1. `POST /users/:username/shadowban` wrote `user.isShadowbanned`, which
 *    `models/user.js` did not declare. Mongoose strict mode dropped it on save
 *    and the response echoed the value just assigned, so the call reported
 *    success while nothing was stored — and nothing read the field either. The
 *    field is now declared and `lib/visibility.js` enforces it on the read path.
 * 2. `POST /cache/clear` ran the same two invalidators for `content-filter` and
 *    for `all`, and returned a hard-coded `cleared` array that read like a
 *    report of what had been emptied. It now returns what it actually cleared.
 * 3. `GET /ttl-health` reported `systemlogs` as having no TTL index while
 *    `models/systemLog.js` declares a 30-day one, and hard-coded healthy: true.
 * 4. `analyse-urls` returned an unparseable URL with no `risk` and no
 *    `suspicious` flag, excluding the worst inputs from the suspicious count.
 *    It now reports `invalid` separately.
 * 5. Every 500 in this router answered a bare `{ error: "Failed" }`. They now
 *    carry `detail`. `describe()` still handles the bare form defensively.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/context/ToastContext";

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Endpoints                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

const OPS = "/api/admin/safety-ops";

/**
 * `POST /bulk-reports` takes report ids, but nothing on the safety-ops router
 * used to hand out a selectable list of them: `/report-age` returns only the
 * single oldest document and `/safety-scores` returns counts, so the checklist
 * had to be sourced from the unrelated `/api/admin/reports` inbox. There is now
 * a `/safety-ops/open-reports` endpoint that returns ids, and this is it — the
 * bulk resolver is self-contained on its own router.
 */
const REPORTS_INBOX = "/api/admin/safety-ops/open-reports";

const TABS = [
    { id: "overview", label: "Overview" },
    { id: "risk", label: "User Risk" },
    { id: "health", label: "Data Health" },
    { id: "compliance", label: "Compliance" },
];

/** Must match the SystemLog `category` enum or the server finds nothing. */
const AUDIT_CATEGORIES = [
    "moderation",
    "system",
    "users",
    "auth",
    "chats",
    "database",
    "server",
    "frontend",
    "games",
];

const AGE_BUCKETS = ["0-1d", "1-3d", "3-7d", "7-30d", "30d+"];
const MAX_URLS = 200;
const INBOX_PREVIEW = 50;
const PREVIEW_ROWS = 3;
const SPAM_THRESHOLD = 10;

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Helpers                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * fetch + JSON + throw with the server's own message attached.
 * Identical to the copy in MediaSafetyPanel.jsx: the `error` string is the only
 * useful thing these routes return on failure, so it is carried on the exception
 * rather than replaced with a generic string.
 */
async function callApi(path, options) {
    const res = await fetch(path, options);
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

const errText = (e) => e?.payload?.error || e?.message || "Request failed";

/**
 * The server's wording, kept verbatim, plus the two things an admin needs and
 * the response does not carry: the status code, and — for the bare "Failed"
 * every catch block in adminSafetyOps.js returns — where the real reason is.
 * The message itself is never rewritten.
 */
function describe(e) {
    const text = errText(e);
    const status = e?.status ? ` (HTTP ${e.status})` : "";
    if (text.trim().toLowerCase() === "failed") {
        return `${text}${status} — the server caught an exception and returned no detail, so the reason exists only in the live-server console.`;
    }
    return `${text}${status}`;
}

/** Counts and bar widths go through here: a 500 can leave any of them absent. */
const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** The server clamps its own limits; clamping here keeps a blank field sane. */
const clampLimit = (v, dflt) => Math.max(1, Math.min(200, Number(v) || dflt));
const clampDays = (v) => Math.max(1, Math.min(90, Number(v) || 14));

function fmtStamp(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

function isoDay(v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function downloadJson(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

const rowsOf = (v) => (Array.isArray(v) ? v : []);

/** The first non-empty text-ish field, so one preview works across collections. */
const textOf = (item) =>
    item?.text ?? item?.caption ?? item?.message ?? item?.body ?? item?.bio ?? item?.details ?? null;

const whenOf = (item) => item?.createdAt || item?.timeStamp || item?.at || item?.sentAt || null;

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Shared presentational primitives (house style)                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

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
    "w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-gray-100 disabled:opacity-50";
const BTN_PRIMARY =
    "min-h-[40px] px-3 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40 transition-colors";
const BTN_GHOST =
    "min-h-[40px] px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors";
const BTN_DANGER =
    "min-h-[40px] px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg disabled:opacity-40 transition-colors";

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

/**
 * House-style toggle. The visible track stays `w-11 h-6`, but the button itself
 * is `w-11 h-11` so the tap target is 44px rather than 24px.
 */
function Toggle({ label, on, onChange, disabled, tone = "green" }) {
    const onTone = tone === "amber" ? "bg-amber-500" : tone === "red" ? "bg-red-500" : "bg-emerald-500";
    return (
        <button
            type="button"
            role="switch"
            aria-checked={!!on}
            aria-label={`${label}: ${on ? "on" : "off"}`}
            disabled={disabled}
            onClick={onChange}
            className="shrink-0 w-11 h-11 -mr-2 flex items-center justify-end disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white rounded-full"
        >
            <span className={`relative w-11 h-6 rounded-full transition-colors ${on ? onTone : "bg-gray-300 dark:bg-gray-700"}`}>
                <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? "translate-x-5" : ""}`}
                />
            </span>
        </button>
    );
}

function SwitchRow({ label, hint, on, onChange, disabled, tone, children }) {
    return (
        <div className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
                {hint && <p className={`${SUBTLE} mt-0.5 leading-relaxed`}>{hint}</p>}
                {children}
            </div>
            <Toggle label={label} on={on} onChange={onChange} disabled={disabled} tone={tone} />
        </div>
    );
}

function Field({ label, children, hint }) {
    return (
        <label className="block min-w-0">
            <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">{label}</span>
            {children}
            {hint && <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">{hint}</span>}
        </label>
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
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>
            {children}
        </span>
    );
}

function Kv({ k, v, mono }) {
    return (
        <div className="flex items-start gap-2 py-1 min-w-0">
            <span className="text-[11px] text-gray-400 dark:text-gray-500 w-28 shrink-0">{k}</span>
            <span className={`text-xs text-gray-800 dark:text-gray-200 min-w-0 flex-1 break-words ${mono ? "font-mono" : ""}`}>
                {v === null || v === undefined || v === "" ? "—" : String(v)}
            </span>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Small building blocks                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * One fetch, one error, one spinner.
 *
 * A failure never clears `data`, so a 500 on a refresh shows the error above the
 * last thing that loaded rather than blanking the card — a card that empties on
 * a transient error reads as "nothing to see here".
 */
function useResource(loader) {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    const load = useCallback(
        async (arg) => {
            setLoading(true);
            setError("");
            try {
                setData(await loader(arg));
                return true;
            } catch (e) {
                setError(describe(e));
                return false;
            } finally {
                setLoading(false);
            }
        },
        [loader]
    );

    return { data, error, loading, load };
}

function Loadable({ res, label, children }) {
    const body = res.data
        ? children(res.data)
        : res.loading
        ? <Spinner label={label} />
        : <p className="text-xs text-gray-400 dark:text-gray-500 py-2">Not loaded yet — press Refresh.</p>;

    if (!res.error) return body;
    return (
        <div className="space-y-3">
            <ErrorBox message={res.error} onRetry={() => res.load()} />
            {res.data && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                    Showing the last data that loaded successfully. It may be out of date.
                </p>
            )}
            {body}
        </div>
    );
}

function CardShell({ title, subtitle, onRefresh, refreshing, action, children }) {
    return (
        <div className={CARD}>
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                    <h3 className={HEADING}>{title}</h3>
                    {subtitle && <p className={`${SUBTLE} mt-0.5 leading-relaxed`}>{subtitle}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {action}
                    {onRefresh && (
                        <button type="button" onClick={onRefresh} disabled={refreshing} className={BTN_GHOST}>
                            {refreshing ? "Refreshing…" : "Refresh"}
                        </button>
                    )}
                </div>
            </div>
            {children}
        </div>
    );
}

function Stat({ label, value, hint, tone = "default" }) {
    const cls = {
        default: "text-gray-900 dark:text-gray-100",
        warn: "text-amber-600 dark:text-amber-400",
        danger: "text-red-600 dark:text-red-400",
        ok: "text-emerald-600 dark:text-emerald-400",
    }[tone];
    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-0.5 ${cls}`}>{value}</p>
            {hint && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">{hint}</p>}
        </div>
    );
}

function Bar({ label, value, max, tone = "bg-gray-400 dark:bg-gray-500" }) {
    const n = num(value);
    const w = num(max) > 0 ? Math.max(2, (n / num(max)) * 100) : 0;
    return (
        <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate min-w-0">{label}</span>
                <span className="text-[11px] font-bold tabular-nums text-gray-900 dark:text-gray-100 shrink-0">{n}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 mt-0.5 overflow-hidden">
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${w}%` }} />
            </div>
        </div>
    );
}

function Empty({ children }) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 py-3 text-center">{children}</p>;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Shadowban — see the caveat on the User Risk tab for why this is advisory   */
/* ═══════════════════════════════════════════════════════════════════════════ */

function useShadowbans() {
    const { showToast } = useToast();
    const [state, setState] = useState({});
    const [busy, setBusy] = useState("");

    const toggle = useCallback(
        async (username, want) => {
            if (busy) return;
            setBusy(username);
            try {
                const d = await callApi(`${OPS}/users/${encodeURIComponent(username)}/shadowban`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ shadowbanned: want }),
                });
                // The response is the only value available: there is still no
                // dedicated read endpoint for this field, so the panel cannot
                // show the stored state on page load and starts at `unknown`.
                const value = d?.isShadowbanned === true;
                setState((prev) => ({ ...prev, [username]: { value } }));
                showToast(
                    `Shadowban ${value ? "enabled" : "lifted"} for @${username}. Takes effect within 30s (read-path cache).`,
                    "success"
                );
            } catch (e) {
                showToast(describe(e), "error");
            } finally {
                setBusy("");
            }
        },
        [busy, showToast]
    );

    return { state, busy, toggle };
}

function ShadowControl({ username, state, busy, onToggle }) {
    const known = !!state;
    const on = known && state.value;
    return (
        <div className="flex items-center gap-1.5 shrink-0">
            <span
                className={`text-[10px] font-semibold ${
                    !known
                        ? "text-amber-600 dark:text-amber-400"
                        : on
                        ? "text-red-600 dark:text-red-400"
                        : "text-gray-400 dark:text-gray-500"
                }`}
            >
                {!known ? "unknown" : on ? "on*" : "off*"}
            </span>
            <Toggle
                label={`Shadowban @${username}`}
                on={on}
                disabled={!!busy}
                tone={on ? "red" : "green"}
                onChange={() => onToggle(username, !on)}
            />
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 1 — Overview                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ReportAgeCard({ res }) {
    return (
        <CardShell
            title="Open report age"
            subtitle="How long the queue has been sitting there. A bucket that only grows means nobody is working it."
            onRefresh={() => res.load()}
            refreshing={res.loading}
        >
            <Loadable res={res} label="Ageing the queue…">
                {(d) => {
                    const buckets = d?.buckets || {};
                    const max = Math.max(...AGE_BUCKETS.map((b) => num(buckets[b])), 1);
                    return (
                        <div className="space-y-3">
                            <div className="space-y-2">
                                {AGE_BUCKETS.map((b) => (
                                    <Bar
                                        key={b}
                                        label={b}
                                        value={buckets[b]}
                                        max={max}
                                        tone={
                                            b === "30d+"
                                                ? "bg-red-500"
                                                : b === "7-30d"
                                                ? "bg-amber-500"
                                                : "bg-gray-400 dark:bg-gray-500"
                                        }
                                    />
                                ))}
                            </div>
                            <Kv k="open reports" v={d?.totalOpen} />
                            <Kv k="oldest" v={d?.oldest ? fmtStamp(d.oldest.createdAt) : null} />
                            {d?.oldest && (
                                <Kv
                                    k="oldest is a"
                                    v={`${d.oldest.targetType || "?"} report · ${d.oldest.reason || "no reason recorded"}`}
                                />
                            )}
                            <Note tone="info" title="Counted from the first 5,000 open reports.">
                                The server reads the open queue with a hard cap of 5,000 documents, so every number above
                                saturates rather than grows on a large backlog. A total of exactly 5,000 means the real
                                number is higher.
                            </Note>
                        </div>
                    );
                }}
            </Loadable>
        </CardShell>
    );
}

function OverviewTab({ overview, reportAge }) {
    return (
        <div className="space-y-4">
            <CardShell
                title="Where safety stands"
                subtitle="Read-only. Every control on this page lives in the Content Filter or Media Safety tab."
                onRefresh={() => overview.load()}
                refreshing={overview.loading}
            >
                <Loadable res={overview} label="Loading the overview…">
                    {(d) => {
                        const q = d?.queue || {};
                        const t = d?.text || {};
                        const m = d?.media || {};
                        const mo = t.matchOptions || {};
                        return (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                    <Stat
                                        label="Open reports"
                                        value={q.openReports ?? "—"}
                                        tone={num(q.openReports) > 0 ? "warn" : "default"}
                                        hint="status: open — not yet worked"
                                    />
                                    <Stat label="Removed posts" value={q.removedPosts ?? "—"} hint="isRemoved: true" />
                                    <Stat label="Suspended users" value={q.suspended ?? "—"} hint="suspended: true" />
                                    <Stat
                                        label="Moderation log"
                                        value={q.moderationLogEntries ?? "—"}
                                        hint="SystemLog rows in the moderation category"
                                    />
                                </div>

                                <div>
                                    <p className={`${HEADING} mb-1.5`}>Text filter</p>
                                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                                        <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap">
                                            <Badge tone={t.blockNudity ? "ok" : "gray"}>
                                                {t.blockNudity ? "nudity keywords: blocked" : "nudity keywords: off"}
                                            </Badge>
                                            <Badge tone={t.blurToxicWords ? "ok" : "gray"}>
                                                {t.blurToxicWords ? "toxic words: blurred" : "toxic words: off"}
                                            </Badge>
                                        </div>
                                        <div className="px-3 py-1.5">
                                            <Kv k="toxic words" v={t.toxicWords ?? "—"} />
                                            <Kv k="nudity keywords" v={t.nudityKeywords ?? "—"} />
                                            <Kv k="allowlist" v={t.allowedWords ?? "—"} />
                                        </div>
                                        <div className="px-3 py-2">
                                            {Object.keys(mo).length === 0 ? (
                                                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                                    The server returned no match options, so the matcher is running on its
                                                    defaults.
                                                </p>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {Object.entries(mo).map(([k, v]) => (
                                                        <span
                                                            key={k}
                                                            className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] font-mono"
                                                        >
                                                            {k}={String(v)}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <p className={`${HEADING} mb-1.5`}>Media screening</p>
                                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                                        <Kv k="enabled" v={m.enabled ? "yes" : "no"} />
                                        <Kv k="provider" v={m.provider} mono />
                                        <Kv k="action" v={m.action} />
                                        <Kv
                                            k="detecting"
                                            v={m.detectingNudity ? "yes — a classifier runs" : "no — nothing inspects pixels"}
                                        />
                                    </div>
                                    {!m.detectingNudity && (
                                        <div className="mt-2">
                                            <Note tone="warn" title="No image or video is being looked at.">
                                                Either media moderation is off or the provider is <b>none</b>, so the only
                                                checks that happen are structural: URL validity, the host allowlist, and
                                                destroying an asset whose write was refused. The Media Safety tab is where
                                                that is configured and where the honest status banner lives.
                                            </Note>
                                        </div>
                                    )}
                                </div>

                                <Note tone="info" title="Who last edited the filter config">
                                    <p>
                                        {d?.updatedBy ? <b>@{d.updatedBy}</b> : "unknown — no updatedBy recorded"}
                                        {d?.updatedAt ? ` · ${fmtStamp(d.updatedAt)}` : " · never (no updatedAt on the document)"}.
                                    </p>
                                </Note>
                            </div>
                        );
                    }}
                </Loadable>
            </CardShell>

            <ReportAgeCard res={reportAge} />

            <div className={CARD}>
                <p className={`${HEADING} mb-1`}>Where the rest of safety lives</p>
                <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    <li>
                        <b>Content Filter</b> — the text matcher itself: word lists, matching rules, allowlist, live test,
                        bulk and preset word management.
                    </li>
                    <li>
                        <b>Media Safety</b> — image and video screening: provider selection, thresholds, the failure mode,
                        the review queue and the backfill scanner.
                    </li>
                    <li>
                        <b>User Safety (this tab)</b> — who is risky and why, whether the database is keeping up, and the
                        audit / export / erasure side of compliance.
                    </li>
                </ul>
                <p className={`${SUBTLE} mt-2 leading-relaxed`}>
                    They share one config document, but each panel keeps its own copy of it in state, so a change made in one
                    is not visible in the others until they are refreshed.
                </p>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 2 — User Risk                                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SafetyScoresCard({ res, shadow }) {
    const { showToast } = useToast();
    const [open, setOpen] = useState({});
    const rows = rowsOf(res.data?.rows);
    const max = Math.max(...rows.map((r) => num(r?.score)), 1);

    return (
        <CardShell
            title="Risk scores"
            subtitle="Arithmetic over the last 30 days, with every component shown. A score is a triage order, not a verdict."
            onRefresh={() => res.load()}
            refreshing={res.loading}
        >
            <Loadable res={res} label="Scoring users…">
                {(d) => (
                    <div className="space-y-3">
                        {d?.note && <Note tone="info" title="How the score is built">{d.note}</Note>}

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <Stat label="Reports" value={d?.totals?.reports ?? "—"} hint="all, last 30d" />
                            <Stat label="Open" value={d?.totals?.openReports ?? "—"} tone="warn" hint="still in the queue" />
                            <Stat label="Removed" value={d?.totals?.removedPosts ?? "—"} hint="posts, last 30d" />
                            <Stat label="Suspended" value={d?.totals?.suspendedUsers ?? "—"} hint="accounts, current" />
                        </div>

                        {rowsOf(d?.rows).length === 0 ? (
                            <Empty>No user scored above zero in this window. That is not proof there is nothing wrong.</Empty>
                        ) : (
                            <div className="space-y-2">
                                {rowsOf(d?.rows).map((r) => {
                                    const isOpen = !!open[r?.username];
                                    const reasons = rowsOf(r?.reasons);
                                    return (
                                        <div key={r?.username} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate min-w-0">
                                                    @{r?.username}
                                                </span>
                                                <Badge tone={num(r?.score) >= 40 ? "danger" : num(r?.score) >= 25 ? "warn" : "gray"}>
                                                    {num(r?.score)} pts
                                                </Badge>
                                                <span className="ml-auto">
                                                    <ShadowControl
                                                        username={r?.username}
                                                        state={shadow.state[r?.username]}
                                                        busy={shadow.busy}
                                                        onToggle={shadow.toggle}
                                                    />
                                                </span>
                                            </div>

                                            <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-amber-500"
                                                    style={{ width: `${Math.max((num(r?.score) / max) * 100, 2)}%` }}
                                                />
                                            </div>

                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setOpen((prev) => ({ ...prev, [r?.username]: !prev[r?.username] }));
                                                        showToast(
                                                            isOpen
                                                                ? "Components hidden"
                                                                : "Showing every component that added to this score",
                                                            "info"
                                                        );
                                                    }}
                                                    aria-expanded={isOpen}
                                                    aria-label={`${isOpen ? "Hide" : "Show"} the reasons behind @${r?.username}'s score`}
                                                    className="min-h-10 px-2 text-[11px] font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                                                >
                                                    {isOpen ? "Hide" : "Why"} ({reasons.length})
                                                </button>
                                                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                                    the bar is relative to the highest score in this list — it is not a percentage
                                                </span>
                                            </div>

                                            {isOpen && (
                                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                    {reasons.length === 0 ? (
                                                        <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                                            The server returned an empty reasons array for this row, so the
                                                            score is not explainable.
                                                        </p>
                                                    ) : (
                                                        reasons.map((reason) => (
                                                            <span
                                                                key={reason}
                                                                className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-[10px] font-medium"
                                                            >
                                                                {reason}
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </Loadable>
        </CardShell>
    );
}

function OffendersCard({ res, shadow }) {
    return (
        <CardShell
            title="Repeat offenders"
            subtitle="Ranked by confirmed removals from the moderation log — actions a human took, not computed scores."
            onRefresh={() => res.load()}
            refreshing={res.loading}
        >
            <Loadable res={res} label="Reading the moderation log…">
                {(d) => (
                    <div className="space-y-3">
                        <Kv k="window" v={d?.windowDays ? `${d.windowDays} days` : null} />
                        <Kv k="removals in window" v={d?.totalRemovals} />
                        <Note tone="info" title="How this differs from the score above.">
                            Only <code className="text-[10px]">action: &quot;remove&quot;</code> rows in the moderation log
                            count here, and that query is capped at 5,000 rows. A user can be high on the score above and
                            absent from this list if their reports have not been actioned.
                        </Note>

                        {rowsOf(d?.rows).length === 0 ? (
                            <Empty>No removals recorded in this window.</Empty>
                        ) : (
                            <div className="space-y-2">
                                {rowsOf(d?.rows).map((r) => {
                                    const reasons = rowsOf(r?.reasons);
                                    return (
                                        <div key={r?.username} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate min-w-0">
                                                    @{r?.username}
                                                </span>
                                                <Badge tone={num(r?.removals) >= 5 ? "danger" : "warn"}>
                                                    {num(r?.removals)} removals
                                                </Badge>
                                                <span className="ml-auto">
                                                    <ShadowControl
                                                        username={r?.username}
                                                        state={shadow.state[r?.username]}
                                                        busy={shadow.busy}
                                                        onToggle={shadow.toggle}
                                                    />
                                                </span>
                                            </div>
                                            {reasons.length > 0 && (
                                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                    {reasons.map((x, i) => (
                                                        <span
                                                            key={`${x?.reason ?? "none"}-${i}`}
                                                            className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[10px]"
                                                        >
                                                            {x?.reason || "no reason recorded"}{" "}
                                                            <b className="text-gray-900 dark:text-gray-100">{num(x?.count)}</b>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </Loadable>
        </CardShell>
    );
}

function BulkReportsCard({ inbox, reportAge }) {
    const { showToast } = useToast();
    const [selected, setSelected] = useState([]);
    const [reason, setReason] = useState("");
    const [pending, setPending] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");

    // Pulled out as bindings: depending on the resource objects themselves would
    // rebuild this callback on every render, since useResource returns a new
    // object each time.
    const { load: loadInbox } = inbox;
    const { load: loadReportAge } = reportAge;

    const items = rowsOf(inbox.data);
    const shown = items.slice(0, INBOX_PREVIEW);
    const allShown = shown.length > 0 && shown.every((r) => selected.includes(r.id));

    const toggle = (id) =>
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    const run = useCallback(
        async (action) => {
            setBusy(true);
            setError("");
            try {
                const d = await callApi(`${OPS}/bulk-reports`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: selected, action, reason: reason.trim() || undefined }),
                });
                setResult(d);
                setSelected([]);
                setPending("");
                setReason("");
                showToast(
                    `${num(d?.matched)} matched, ${num(d?.modified)} modified of ${num(d?.requested)} requested`,
                    "success"
                );
                await Promise.all([loadInbox(), loadReportAge()]);
            } catch (e) {
                setError(describe(e));
                showToast(describe(e), "error");
            } finally {
                setBusy(false);
            }
        },
        [selected, reason, loadInbox, loadReportAge, showToast]
    );

    return (
        <CardShell
            title="Bulk resolve / dismiss"
            subtitle="Ticks reports off in one call. The ids come from the Reports tab inbox, because no safety-ops endpoint returns a list of them."
            onRefresh={() => inbox.load()}
            refreshing={inbox.loading}
        >
            <Loadable res={inbox} label="Loading the open report inbox…">
                {() =>
                    items.length === 0 ? (
                        <Empty>No open reports in the inbox.</Empty>
                    ) : (
                        <div className="space-y-3">
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                                <SwitchRow
                                    label={`Select all ${shown.length} shown`}
                                    hint={`Only the first ${INBOX_PREVIEW} of ${items.length} are listed. The server caps the inbox at 200 and the write at 200 ids.`}
                                    on={allShown}
                                    onChange={() => setSelected(allShown ? [] : shown.map((r) => r.id))}
                                    disabled={busy}
                                />
                                <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                                    {shown.map((r, i) => (
                                        <label
                                            key={r?.id ?? `report-${i}`}
                                            className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors min-w-0"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selected.includes(r?.id)}
                                                onChange={() => toggle(r?.id)}
                                                disabled={busy}
                                                aria-label={`Select the ${r?.reason || "spam"} report on ${r?.targetType} ${r?.targetId || ""}`}
                                                className="mt-0.5 w-4 h-4 accent-black dark:accent-white shrink-0"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5 flex-wrap">
                                                    <Badge tone="gray">{r?.reason || "no reason"}</Badge>
                                                    <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                                                        {r?.targetType}
                                                    </span>
                                                    <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 break-all min-w-0">
                                                        {r?.targetId}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto shrink-0">
                                                        {fmtStamp(r?.createdAt)}
                                                    </span>
                                                </span>
                                                <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 break-words">
                                                    reported by @{r?.reporter || "unknown"}
                                                    {r?.details ? ` — ${r.details}` : ""}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {items.length > shown.length && (
                                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                    {items.length - shown.length} older reports are not listed. Work the first page, or raise
                                    the inbox limit in the Reports tab.
                                </p>
                            )}

                            <Field
                                label="Action taken (optional)"
                                hint="Stored as actionTaken on every matched report. Left blank, the server writes “bulk resolved” or “bulk dismissed”."
                            >
                                <input
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    maxLength={500}
                                    disabled={busy}
                                    placeholder="e.g. reviewed against policy 4.2, removed"
                                    className={INPUT}
                                />
                            </Field>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPending("resolved")}
                                    disabled={busy || selected.length === 0}
                                    className={BTN_PRIMARY}
                                >
                                    Resolve{selected.length > 0 ? ` (${selected.length})` : ""}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPending("dismissed")}
                                    disabled={busy || selected.length === 0}
                                    className={BTN_GHOST}
                                >
                                    Dismiss{selected.length > 0 ? ` (${selected.length})` : ""}
                                </button>
                                {selected.length > 0 && (
                                    <button type="button" onClick={() => setSelected([])} disabled={busy} className={BTN_GHOST}>
                                        Clear selection
                                    </button>
                                )}
                            </div>

                            {pending && (
                                <Note
                                    tone="warn"
                                    title={`Confirm: ${pending === "resolved" ? "resolve" : "dismiss"} ${selected.length} report${
                                        selected.length === 1 ? "" : "s"
                                    }`}
                                >
                                    <p>
                                        This sets <b>status</b> to <code className="text-[10px]">{pending}</code> and stamps a
                                        resolution time on every ticked report. It does not remove any post, comment or
                                        account — anything already moderated stays as it is.
                                    </p>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        <button type="button" onClick={() => run(pending)} disabled={busy} className={BTN_PRIMARY}>
                                            {busy ? "Working…" : `Yes, ${pending} ${selected.length}`}
                                        </button>
                                        <button type="button" onClick={() => setPending("")} disabled={busy} className={BTN_GHOST}>
                                            Cancel
                                        </button>
                                    </div>
                                </Note>
                            )}

                            <ErrorBox message={error} />

                            {result && (
                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                                    <Kv k="requested" v={result.requested} />
                                    <Kv k="matched" v={result.matched} />
                                    <Kv k="modified" v={result.modified} />
                                    {num(result.matched) < num(result.requested) && (
                                        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
                                            {num(result.requested) - num(result.matched)} id
                                            {num(result.requested) - num(result.matched) === 1 ? " was" : "s were"} not
                                            found. The server silently drops anything that is not a 24-character hex
                                            ObjectId, so a malformed id disappears rather than erroring.
                                        </p>
                                    )}
                                    {num(result.modified) < num(result.matched) && (
                                        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
                                            {num(result.matched) - num(result.modified)} matched report
                                            {num(result.matched) - num(result.modified) === 1 ? " was" : "s were"} already in
                                            that status, so nothing changed on them.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                }
            </Loadable>
        </CardShell>
    );
}

function MentionSpamCard({ res }) {
    return (
        <CardShell
            title="Mention spam"
            subtitle="Posts carrying the most @mentions. A post naming dozens of accounts is either a campaign or a bot."
            onRefresh={() => res.load()}
            refreshing={res.loading}
        >
            <Loadable res={res} label="Counting mentions…">
                {(d) => (
                    <div className="space-y-3">
                        {d?.threshold && <Note tone="info" title="The server's own threshold">{d.threshold}</Note>}
                        <Kv k="window" v={d?.windowDays ? `${d.windowDays} days` : null} />
                        {rowsOf(d?.rows).length === 0 ? (
                            <Empty>No post in the last week mentions anybody.</Empty>
                        ) : (
                            <div className="space-y-2">
                                {rowsOf(d?.rows).map((r) => (
                                    <div key={r?.postId} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate min-w-0">
                                                @{r?.sender}
                                            </span>
                                            <Badge tone={num(r?.mentions) > SPAM_THRESHOLD ? "danger" : num(r?.mentions) > 3 ? "warn" : "gray"}>
                                                {num(r?.mentions)} mentions
                                            </Badge>
                                            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 break-all min-w-0">
                                                {r?.postId}
                                            </span>
                                        </div>
                                        {r?.preview && (
                                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5 break-words">
                                                {r.preview}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        <Note tone="info" title="This is a description of shape, not an accusation.">
                            The server sorts the most recent week of posts by mention count and returns the top of that
                            list. A well-run broadcast post looks identical to a spam run, so treat this as a list to look
                            at, not a list of offenders.
                        </Note>
                    </div>
                )}
            </Loadable>
        </CardShell>
    );
}

function UrlAnalysisCard() {
    const { showToast } = useToast();
    const [text, setText] = useState("");
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const parsed = text
        .split(/[\s,]+/)
        .map((u) => u.trim())
        .filter(Boolean);

    const run = useCallback(async () => {
        const urls = parsed.slice(0, MAX_URLS);
        if (urls.length === 0) {
            setError("Paste at least one URL first.");
            return;
        }
        setBusy(true);
        setError("");
        setResult(null);
        try {
            const d = await callApi(`${OPS}/analyse-urls`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ urls }),
            });
            setResult(d);
            showToast(`Analysed ${rowsOf(d?.results).length} URL(s)`, "success");
        } catch (e) {
            setError(describe(e));
            showToast(describe(e), "error");
        } finally {
            setBusy(false);
        }
    }, [parsed, showToast]);

    const results = rowsOf(result?.results);
    const dropped = Math.max(0, parsed.length - results.length);

    return (
        <CardShell
            title="Link risk"
            subtitle="Heuristic phishing and typosquat check for URLs you are suspicious of. No host is contacted."
        >
            <div className="space-y-3">
                <Field
                    label={`URLs (one per line, up to ${MAX_URLS})`}
                    hint="Nothing is requested from these hosts. The server string-parses each URL and matches the hostname against a pattern list."
                >
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={4}
                        placeholder={"https://instagram-secure-login.example\nhttps://bit.ly/xyz"}
                        aria-label="URLs to analyse"
                        disabled={busy}
                        className={`${INPUT} resize-y font-mono`}
                    />
                </Field>

                <button type="button" onClick={run} disabled={busy || parsed.length === 0} className={BTN_PRIMARY}>
                    {busy ? "Analysing…" : `Analyse ${parsed.length > 0 ? parsed.length : ""} URL${parsed.length === 1 ? "" : "s"}`}
                </button>

                <ErrorBox message={error} onRetry={error ? run : null} />

                {result && (
                    <div className="space-y-3">
                        <Note tone="warn" title="A clean result is not a safety guarantee.">
                            {result.note}
                        </Note>

                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge tone={num(result.suspicious) > 0 ? "danger" : "ok"}>
                                {num(result.suspicious)} flagged suspicious
                            </Badge>
                            <span className="text-[11px] text-gray-400 dark:text-gray-500">of {results.length} analysed</span>
                        </div>

                        {results.some((r) => r?.valid === false) && (
                            <Note tone="warn" title="The server's suspicious count undercounts, on purpose or otherwise.">
                                An unparseable URL comes back with no <code className="text-[10px]">risk</code> and no{" "}
                                <code className="text-[10px]">suspicious</code> flag, so it is excluded from the suspicious
                                count above even though it is the most suspicious input of the lot. They are listed below
                                as “unparseable” — treat them as high risk.
                            </Note>
                        )}

                        {results.length === 0 ? (
                            <Empty>Nothing came back from the analyser.</Empty>
                        ) : (
                            <div className="space-y-2">
                                {results.map((r, i) => (
                                    <div
                                        key={`${r?.url || "url"}-${i}`}
                                        className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 min-w-0"
                                    >
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {r?.valid === false ? (
                                                <Badge tone="danger">unparseable</Badge>
                                            ) : (
                                                <Badge tone={r?.risk === "high" ? "danger" : r?.risk === "medium" ? "warn" : "ok"}>
                                                    {r?.risk ? `${r.risk} risk` : "no risk returned"}
                                                </Badge>
                                            )}
                                            <span className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate min-w-0">
                                                {r?.host || "no host"}
                                            </span>
                                        </div>
                                        <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mt-1 break-all min-w-0">
                                            {r?.url}
                                        </p>
                                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                                            {rowsOf(r?.signals).length === 0 ? (
                                                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                                    No signals matched — which is not the same as being safe.
                                                </span>
                                            ) : (
                                                rowsOf(r?.signals).map((s) => (
                                                    <span
                                                        key={s}
                                                        className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-[10px] font-mono"
                                                    >
                                                        {s}
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {dropped > 0 && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-400">
                                {dropped} URL{dropped === 1 ? " was" : "s were"} dropped: the server analyses the first{" "}
                                {MAX_URLS} only.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </CardShell>
    );
}

function RiskTab({ scores, offenders, spam, inbox, reportAge, shadow }) {
    return (
        <div className="space-y-4">
            <Note tone="info" title="How shadowban behaves">
                <p>
                    A shadowbanned account works normally for itself, but its posts, comments and messages are hidden from
                    everyone else. <code className="text-[10px]">lib/visibility.js</code> applies it on the read paths, with a
                    30-second cache so it does not add a query per feed request.
                </p>
                <p className="mt-1.5">
                    A toggle takes effect within that window. The read path always exempts the viewer from their own exclusion,
                    so a shadowbanned user still sees their own content and cannot work out that they have been hidden.
                </p>
            </Note>

            <SafetyScoresCard res={scores} shadow={shadow} />
            <OffendersCard res={offenders} shadow={shadow} />
            <BulkReportsCard inbox={inbox} reportAge={reportAge} />
            <MentionSpamCard res={spam} />
            <UrlAnalysisCard />
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 3 — Data Health                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

function IndexAuditCard({ res }) {
    return (
        <CardShell
            title="Index audit"
            subtitle="What each model declares versus how much data it holds. A warning here is a slow query waiting to happen."
            onRefresh={() => res.load()}
            refreshing={res.loading}
        >
            <Loadable res={res} label="Reading the schemas…">
                {(d) => (
                    <div className="space-y-3">
                        {d?.note && <Note tone="info" title="About the counts">{d.note}</Note>}
                        {rowsOf(d?.rows).length === 0 ? (
                            <Empty>The server returned no models.</Empty>
                        ) : (
                            <div className="space-y-2">
                                {rowsOf(d?.rows).map((r) => {
                                    const indexes = rowsOf(r?.indexes);
                                    return (
                                        <div key={r?.model} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                    {r?.model}
                                                </span>
                                                <Badge tone={r?.documents === null || r?.documents === undefined ? "warn" : "gray"}>
                                                    {r?.documents === null || r?.documents === undefined
                                                        ? "count unavailable"
                                                        : `${num(r.documents)} docs`}
                                                </Badge>
                                                <Badge tone={indexes.length === 0 ? "danger" : "ok"}>
                                                    {indexes.length} index{indexes.length === 1 ? "" : "es"}
                                                </Badge>
                                            </div>

                                            {r?.error ? (
                                                <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5 break-words">
                                                    This model could not be read: {r.error}. The other models above and below
                                                    are unaffected.
                                                </p>
                                            ) : indexes.length === 0 ? (
                                                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
                                                    No index declared. Every query against this collection is a collection
                                                    scan.
                                                </p>
                                            ) : (
                                                <div className="mt-1.5 space-y-1">
                                                    {indexes.map((ix, i) => (
                                                        <div key={`${r.model}-${i}`} className="flex items-center gap-1.5 flex-wrap min-w-0">
                                                            <span className="text-[11px] font-mono text-gray-700 dark:text-gray-300 break-all min-w-0">
                                                                {ix?.fields || "(unnamed)"}
                                                            </span>
                                                            {ix?.unique && <Badge tone="info">unique</Badge>}
                                                            {ix?.ttl !== null && ix?.ttl !== undefined && (
                                                                <Badge tone="warn">ttl {num(ix.ttl)}s</Badge>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {r?.unindexedWarning && (
                                                <div className="mt-2">
                                                    <Note tone="warn" title="Large collection with no index.">
                                                        The server flags this as a scaling problem: a collection this size with
                                                        no index means a full scan on every query against it.
                                                    </Note>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </Loadable>
        </CardShell>
    );
}

function CollectionStatsCard({ res }) {
    return (
        <CardShell
            title="Collection sizes"
            subtitle="Byte sizes come from collStats, which managed databases often refuse. A row without sizes says so instead of showing zero."
            onRefresh={() => res.load()}
            refreshing={res.loading}
        >
            <Loadable res={res} label="Asking Mongo for stats…">
                {(d) => (
                    <div className="space-y-3">
                        <Kv k="collections" v={d?.total} />
                        {rowsOf(d?.rows).length === 0 ? (
                            <Empty>
                                No collections returned. On a deployment without listCollections privileges this is empty
                                rather than an error.
                            </Empty>
                        ) : (
                            <div className="space-y-2">
                                {rowsOf(d?.rows).map((r) => (
                                    <div key={r?.name} className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-all min-w-0">
                                            {r?.name}
                                        </p>
                                        <Kv k="documents" v={r?.count} />
                                        {r?.note ? (
                                            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                                                {r.note} Only the document count is available, so size and index figures
                                                are unknown rather than zero.
                                            </p>
                                        ) : (
                                            <>
                                                <Kv k="size" v={r?.sizeMB === null || r?.sizeMB === undefined ? null : `${r.sizeMB} MB`} />
                                                <Kv
                                                    k="storage"
                                                    v={
                                                        r?.storageSizeMB === null || r?.storageSizeMB === undefined
                                                            ? null
                                                            : `${r.storageSizeMB} MB`
                                                    }
                                                />
                                                <Kv
                                                    k="indexes"
                                                    v={
                                                        r?.indexSizeMB === null || r?.indexSizeMB === undefined
                                                            ? null
                                                            : `${r.indexSizeMB} MB across ${r?.nindexes ?? "?"}`
                                                    }
                                                />
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </Loadable>
        </CardShell>
    );
}

function DuplicatesCard({ res }) {
    const [limit, setLimit] = useState("20");
    return (
        <CardShell
            title="Duplicate posts"
            subtitle="Text fingerprints that appear more than once — the shape of a repost farm or a stuck retry loop."
            onRefresh={() => res.load({ limit: Number(limit) || 20 })}
            refreshing={res.loading}
        >
            <Loadable res={res} label="Fingerprinting recent posts…">
                {(d) => (
                    <div className="space-y-3">
                        <div className="grid gap-2 sm:grid-cols-[120px_1fr] items-end">
                            <Field label="Groups" hint="1–100. Change it, then press Refresh.">
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={limit}
                                    onChange={(e) => setLimit(e.target.value)}
                                    disabled={res.loading}
                                    aria-label="Maximum number of duplicate groups"
                                    className={INPUT}
                                />
                            </Field>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                                The scan always reads the same fixed window of the collection; only the number of groups
                                returned changes.
                            </p>
                        </div>

                        <Kv k="posts scanned" v={d?.postsScanned} />
                        <Kv k="duplicate groups" v={d?.duplicateGroups} />
                        {d?.note && <Note tone="info" title="What the fingerprint actually compares">{d.note}</Note>}

                        {rowsOf(d?.groups).length === 0 ? (
                            <Empty>No duplicate text found in the scanned window.</Empty>
                        ) : (
                            <div className="space-y-2">
                                {rowsOf(d?.groups).map((g, i) => (
                                    <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 min-w-0">
                                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-1">
                                            {rowsOf(g).length} copies
                                        </p>
                                        {rowsOf(g).map((p, j) => (
                                            <div key={p?.id ?? j} className="py-0.5">
                                                <Kv k={p?.sender} v={p?.text} />
                                                <Kv k="posted" v={fmtStamp(p?.at)} />
                                                <Kv k="id" v={p?.id} mono />
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}

                        <Note tone="info" title="The scan is bounded, and posts with no text are invisible to it.">
                            The server reads the most recent 2,000 posts and skips anything with fewer than 12 characters
                            after trimming, so image-only posts, very short captions and anything older than that window
                            are never considered.
                        </Note>
                    </div>
                )}
            </Loadable>
        </CardShell>
    );
}

function TtlHealthCard({ res }) {
    return (
        <CardShell
            title="TTL health"
            subtitle="Whether the expiry indexes are expiring anything, and which collections just grow forever."
            onRefresh={() => res.load()}
            refreshing={res.loading}
        >
            <Loadable res={res} label="Checking expiry…">
                {(d) => (
                    <div className="space-y-3">
                        {rowsOf(d?.rows).length === 0 ? (
                            <Empty>The server returned no collections to check.</Empty>
                        ) : (
                            <div className="space-y-2">
                                {rowsOf(d?.rows).map((r) => (
                                    <div key={r?.collection} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-all min-w-0">
                                                {r?.collection}
                                            </span>
                                            <Badge tone={r?.healthy === false ? "warn" : "ok"}>
                                                {r?.healthy === false ? "needs a look" : "reported healthy"}
                                            </Badge>
                                        </div>
                                        <Kv k="documents" v={r?.documents} />
                                        {r?.expiredStillPresent !== null && r?.expiredStillPresent !== undefined && (
                                            <Kv k="expired, still there" v={r.expiredStillPresent} />
                                        )}
                                        {r?.newestAt && <Kv k="newest" v={fmtStamp(r.newestAt)} />}
                                        {r?.note && (
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                                                {r.note}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <Note tone="info" title="What the healthy flags actually check">
                            <code className="text-[10px]">healthy</code> is a real check for the two collections that can
                            silently accumulate — <code className="text-[10px]">stories</code> compares against the 24h TTL
                            window, and <code className="text-[10px]">posts(scheduled)</code> counts scheduled posts whose
                            time has passed without publishing. The{" "}
                            <code className="text-[10px]">systemlogs</code> row is informational: those entries carry a
                            30-day TTL index, so mongod prunes them without the app being involved.
                        </Note>
                    </div>
                )}
            </Loadable>
        </CardShell>
    );
}

function CacheCard() {
    const { showToast } = useToast();
    const [busy, setBusy] = useState("");
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");

    const clear = useCallback(
        async (scope) => {
            setBusy(scope);
            setError("");
            try {
                const d = await callApi(`${OPS}/cache/clear`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scope }),
                });
                setResult(d);
                showToast(`Cache cleared for scope "${d?.scope || scope}"`, "success");
            } catch (e) {
                setError(describe(e));
                showToast(describe(e), "error");
            } finally {
                setBusy("");
            }
        },
        [showToast]
    );

    return (
        <CardShell
            title="Cache"
            subtitle="Verdict caches live in server memory, so a restart drops them anyway. Clearing makes the next request pay the full price again."
        >
            <div className="space-y-3">
                <Note tone="warn" title="These two buttons currently do exactly the same thing.">
                    <p>
                        <code className="text-[10px]">POST /cache/clear</code> runs the same two invalidators for{" "}
                        <code className="text-[10px]">content-filter</code> and for <code className="text-[10px]">all</code>{" "}
                        — the <code className="text-[10px]">all</code> branch adds nothing today. Use{" "}
                        <code className="text-[10px]">all</code> because it is the safer intent if that branch ever grows,
                        not because it does more work.
                    </p>
                </Note>

                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => clear("content-filter")} disabled={!!busy} className={BTN_PRIMARY}>
                        {busy === "content-filter" ? "Clearing…" : "Clear filter caches"}
                    </button>
                    <button type="button" onClick={() => clear("all")} disabled={!!busy} className={BTN_GHOST}>
                        {busy === "all" ? "Clearing…" : "Clear all caches"}
                    </button>
                </div>

                <ErrorBox message={error} />

                {result && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <Kv k="scope" v={result.scope} />
                        <Kv k="cleared" v={rowsOf(result.cleared).join(", ")} mono />
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                            That list is fixed text in the route, not a measurement of what was in the cache.
                        </p>
                    </div>
                )}
            </div>
        </CardShell>
    );
}

function HealthTab({ indexAudit, collectionStats, duplicates, ttlHealth }) {
    return (
        <div className="space-y-4">
            <IndexAuditCard res={indexAudit} />
            <CollectionStatsCard res={collectionStats} />
            <DuplicatesCard res={duplicates} />
            <TtlHealthCard res={ttlHealth} />
            <CacheCard />
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 4 — Compliance                                                       */
/* ═══════════════════════════════════════════════════════════════════════════ */

function LogRow({ row }) {
    const [openMeta, setOpenMeta] = useState(false);
    const meta = row?.meta;
    const hasMeta = meta && typeof meta === "object" && Object.keys(meta).length > 0;
    return (
        <div className="px-3 py-2.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
                <Badge tone={row?.level === "error" ? "danger" : row?.level === "warn" ? "warn" : "gray"}>
                    {row?.level || "info"}
                </Badge>
                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 break-all min-w-0">
                    {row?.action || "(no action)"}
                </span>
                {row?.username && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate min-w-0">@{row.username}</span>
                )}
                {row?.targetUser && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate min-w-0">→ @{row.targetUser}</span>
                )}
                <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto shrink-0">
                    {fmtStamp(row?.createdAt)}
                </span>
            </div>
            {row?.message && (
                <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1 break-words">{row.message}</p>
            )}
            {hasMeta && (
                <div className="mt-1">
                    <button
                        type="button"
                        onClick={() => setOpenMeta((v) => !v)}
                        aria-expanded={openMeta}
                        aria-label={`${openMeta ? "Hide" : "Show"} the metadata for the ${row?.action || "log"} entry`}
                        className="min-h-10 px-1 text-[10px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    >
                        {openMeta ? "Hide meta" : "Show meta"}
                    </button>
                    {openMeta && (
                        <pre className="text-[10px] font-mono text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all min-w-0">
                            {JSON.stringify(meta, null, 2)}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}

function AuditCard({ res }) {
    const [category, setCategory] = useState("moderation");
    const [limit, setLimit] = useState("100");
    return (
        <CardShell
            title="Audit trail"
            subtitle="The system log, newest first. It is only as complete as the code that writes to it."
            onRefresh={() => res.load({ category, limit: Number(limit) || 100 })}
            refreshing={res.loading}
        >
            <Loadable res={res} label="Reading the system log…">
                {(d) => (
                    <div className="space-y-3">
                        <div className="grid gap-2 sm:grid-cols-2 items-end">
                            <Field label="Category" hint="The server falls back to moderation if this is blank.">
                                <select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    disabled={res.loading}
                                    aria-label="System log category"
                                    className={INPUT}
                                >
                                    {AUDIT_CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Limit" hint="1–200. Change it, then press Refresh.">
                                <input
                                    type="number"
                                    min="1"
                                    max="200"
                                    value={limit}
                                    onChange={(e) => setLimit(e.target.value)}
                                    disabled={res.loading}
                                    aria-label="Maximum number of audit rows"
                                    className={INPUT}
                                />
                            </Field>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge tone="gray">showing: {d?.category || category}</Badge>
                            <Badge tone="gray">{num(d?.count)} rows</Badge>
                        </div>

                        {rowsOf(d?.rows).length === 0 ? (
                            <Empty>
                                No <b>{d?.category || category}</b> entries. An empty log is not a healthy log: an action that
                                never wrote a row looks exactly like this.
                            </Empty>
                        ) : (
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                                {rowsOf(d?.rows).map((r, i) => (
                                    <LogRow key={r?._id ?? i} row={r} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </Loadable>
        </CardShell>
    );
}

function FilterHistoryCard({ res }) {
    return (
        <CardShell
            title="Filter change history"
            subtitle="System log rows whose action mentions the filter or content — presets, bulk imports and config saves that logged."
            onRefresh={() => res.load()}
            refreshing={res.loading}
        >
            <Loadable res={res} label="Reading the filter history…">
                {(d) => (
                    <div className="space-y-3">
                        <Badge tone="gray">{num(d?.count)} entries</Badge>
                        {rowsOf(d?.rows).length === 0 ? (
                            <Empty>
                                Nothing logged. The content filter logs on some paths and not others, so an empty list does
                                not mean the config was never changed.
                            </Empty>
                        ) : (
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                                {rowsOf(d?.rows).map((r, i) => (
                                    <LogRow key={r?._id ?? i} row={r} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </Loadable>
        </CardShell>
    );
}

/**
 * Curated on purpose. Rendering the user document wholesale would put whatever
 * is on it on screen the day someone adds a field to the schema.
 */
function AccountSummary({ user }) {
    const u = user || {};
    const roles = Array.isArray(u.roles) ? u.roles.map(String).filter(Boolean) : [];
    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                Account — these fields and nothing else
            </p>
            <Kv k="username" v={u.username} mono />
            <Kv k="email" v={u.email} mono />
            <Kv k="created" v={u.createdAt ? fmtStamp(u.createdAt) : null} />
            <Kv k="admin" v={u.isAdmin === true ? "yes — the server refuses to anonymise this account" : "no"} />
            <Kv
                k="suspended"
                v={
                    u.suspended === true
                        ? `yes${u.suspendedUntil ? ` until ${fmtStamp(u.suspendedUntil)}` : " with no end date"}`
                        : "no"
                }
            />
            <Kv k="roles" v={roles.length ? roles.join(", ") : null} mono />
            <div className="py-1 min-w-0">
                <span className="text-[11px] text-gray-400 dark:text-gray-500">bio</span>
                <p className="text-xs text-gray-800 dark:text-gray-200 break-words">{u.bio ? u.bio : "—"}</p>
            </div>
        </div>
    );
}

function PreviewList({ title, items, to }) {
    const list = rowsOf(items);
    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                {title} — {list.length} total
            </p>
            {list.length === 0 ? (
                <p className="text-[11px] text-gray-400 dark:text-gray-500">None.</p>
            ) : (
                <div className="space-y-1.5">
                    {list.slice(0, to).map((item, i) => (
                        <div key={i} className="min-w-0">
                            <p className="text-xs text-gray-800 dark:text-gray-200 break-words">
                                {textOf(item) || "(no text field on this record)"}
                            </p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 break-words">
                                {item?.sender ? `@${item.sender} ` : ""}
                                {item?.recipient ? `→ @${item.recipient} ` : ""}
                                {fmtStamp(whenOf(item))}
                            </p>
                        </div>
                    ))}
                    {list.length > to && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                            {list.length - to} more in the file. Nothing is rendered past this preview.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function UserExportCard() {
    const { showToast } = useToast();
    const [username, setUsername] = useState("");
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const run = useCallback(async () => {
        const name = username.trim();
        if (!name) {
            setError("Enter a username first.");
            return;
        }
        setBusy(true);
        setError("");
        setData(null);
        try {
            const d = await callApi(`${OPS}/user-export/${encodeURIComponent(name)}`, { cache: "no-store" });
            setData(d);
            showToast(`Exported @${name}`, "success");
        } catch (e) {
            setError(describe(e));
            showToast(describe(e), "error");
        } finally {
            setBusy(false);
        }
    }, [username, showToast]);

    const counts = data?.counts || {};

    return (
        <CardShell title="Single-user export" subtitle="GDPR access. Reads one account's data and hands it back as a file.">
            <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-end">
                    <Field label="Username" hint="An exact username — not an id and not an email address.">
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") run();
                            }}
                            placeholder="someuser"
                            aria-label="Username to export"
                            disabled={busy}
                            className={INPUT}
                        />
                    </Field>
                    <button type="button" onClick={run} disabled={busy || !username.trim()} className={BTN_PRIMARY}>
                        {busy ? "Exporting…" : "Export"}
                    </button>
                </div>

                <ErrorBox message={error} onRetry={error ? run : null} />

                {data && (
                    <div className="space-y-3">
                        <Note tone="ok" title="What the server stripped">
                            {data.note}
                        </Note>

                        <Note tone="danger" title="The downloaded file is more sensitive than this screen.">
                            Only <code className="text-[10px]">password</code> and{" "}
                            <code className="text-[10px]">totpSecret</code> are removed. The file still contains{" "}
                            <code className="text-[10px]">pinHash</code>, <code className="text-[10px]">inviteCode</code>,{" "}
                            <code className="text-[10px]">mutedUsers</code>, <code className="text-[10px]">blockedUsers</code>{" "}
                            and every other path on the user document — including anything secret added to the schema
                            later. Only the seven fields above are rendered, deliberately. Treat the download as personal
                            data and put it somewhere it expires.
                        </Note>

                        <AccountSummary user={data.user} />

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <Stat label="Posts" value={counts.posts ?? rowsOf(data.posts).length} />
                            <Stat label="Messages" value={counts.messages ?? rowsOf(data.messages).length} />
                            <Stat label="Group messages" value={counts.groupMessages ?? rowsOf(data.groupMessages).length} />
                            <Stat label="Reports" value={counts.reports ?? rowsOf(data.reports).length} />
                            <Stat label="Notifications" value={counts.notifications ?? rowsOf(data.notifications).length} />
                            <Stat label="Stories" value={counts.stories ?? rowsOf(data.stories).length} />
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                            <PreviewList title="Posts" items={data.posts} to={PREVIEW_ROWS} />
                            <PreviewList title="Direct messages" items={data.messages} to={2} />
                            <PreviewList title="Group messages" items={data.groupMessages} to={2} />
                            <PreviewList title="Stories" items={data.stories} to={2} />
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                const name = data?.user?.username || username.trim() || "user";
                                downloadJson(
                                    `user-export-${String(name).replace(/[^\w.-]/g, "_")}-${isoDay(new Date())}.json`,
                                    data
                                );
                                showToast("Export file created in your downloads folder", "success");
                            }}
                            className={BTN_PRIMARY}
                        >
                            Download JSON
                        </button>
                    </div>
                )}
            </div>
        </CardShell>
    );
}

function AnonymiseCard() {
    const { showToast } = useToast();
    const [username, setUsername] = useState("");
    const [typed, setTyped] = useState("");
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const target = username.trim();
    const armed = target.length > 0 && typed === target;

    const run = useCallback(async () => {
        if (!armed) {
            setError(`Type "${target}" exactly to confirm.`);
            return;
        }
        setBusy(true);
        setError("");
        setResult(null);
        try {
            const d = await callApi(`${OPS}/user-anonymize/${encodeURIComponent(target)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirm: true }),
            });
            setResult(d);
            setTyped("");
            showToast(`@${target} is now @${d?.anonymisedAs || "(unknown)"}`, "success");
        } catch (e) {
            setError(describe(e));
            showToast(describe(e), "error");
        } finally {
            setBusy(false);
        }
    }, [target, armed, showToast]);

    return (
        <CardShell title="GDPR anonymise" subtitle="Erasure. There is no undo and no trash.">
            <div className="space-y-3">
                <Note tone="danger" title="What this changes, and what it does not.">
                    <ul className="list-disc pl-4 space-y-0.5">
                        <li>
                            The username becomes <code className="text-[10px]">deleted_&lt;last 8 of the user id&gt;</code>{" "}
                            and the email becomes <code className="text-[10px]">&lt;that name&gt;@anonymised.invalid</code>.
                            Nothing maps that back to the person.
                        </li>
                        <li>The bio and avatar URL are cleared, the avatar colour is reset, and the password is removed.</li>
                        <li>
                            Every post is flagged <code className="text-[10px]">isAnonymised</code> and their comments are
                            rewritten to the new name. Post text, images and timestamps are left alone.
                        </li>
                        <li>Direct messages, group messages and stories are re-sent to the new name.</li>
                        <li>
                            Reports, notifications and audit rows naming the old username are <b>not</b> touched, so the
                            old username survives in those collections.
                        </li>
                        <li>The server refuses outright if the account is an admin.</li>
                    </ul>
                </Note>

                <Field label="Username to anonymise">
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="someuser"
                        aria-label="Username to anonymise"
                        disabled={busy}
                        className={INPUT}
                    />
                </Field>

                <Field
                    label={`Type “${target || "the username"}” to confirm`}
                    hint="Deliberately not a checkbox. A mis-typed username cannot be recovered by anyone, including you."
                >
                    <input
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") run();
                        }}
                        disabled={busy || !target}
                        placeholder={target || "username"}
                        aria-label="Confirmation: type the exact username"
                        className={INPUT}
                    />
                </Field>

                <button type="button" onClick={run} disabled={busy || !armed} className={BTN_DANGER}>
                    {busy ? "Erasing…" : `Irreversibly anonymise @${target || "…"}`}
                </button>

                <ErrorBox message={error} />

                {result && (
                    <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-3">
                        <p className="text-xs font-bold text-red-900 dark:text-red-200">
                            Done. @{target} is now @{result.anonymisedAs || "(unknown)"}.
                        </p>
                        <div className="mt-1.5">
                            <Kv k="user" v={result.user} />
                            <Kv k="posts" v={result.posts} />
                            <Kv k="comments scrubbed" v={result.commentsScrubbed} />
                            <Kv k="direct messages" v={result.messages} />
                            <Kv k="group messages" v={result.groupMessages} />
                            <Kv k="stories" v={result.stories} />
                        </div>
                        <p className="text-[11px] text-red-800 dark:text-red-300 mt-1.5 leading-relaxed">
                            Those are the server&apos;s own counts of what it changed. Anything it does not report here, it
                            did not do.
                        </p>
                    </div>
                )}
            </div>
        </CardShell>
    );
}

function RetentionCard({ res }) {
    return (
        <CardShell
            title="Retention impact"
            subtitle="What a retention sweep would delete at each age threshold. This endpoint counts and never deletes."
            onRefresh={() => res.load()}
            refreshing={res.loading}
        >
            <Loadable res={res} label="Counting by age…">
                {(d) => (
                    <div className="space-y-3">
                        {d?.note && <Note tone="ok" title="Read this before running any sweep">{d.note}</Note>}
                        {rowsOf(d?.rows).length === 0 ? (
                            <Empty>No rows returned.</Empty>
                        ) : (
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                                {rowsOf(d?.rows).map((r) => (
                                    <div key={r?.olderThanDays} className="px-3 py-2.5">
                                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                                            older than {num(r?.olderThanDays)} days
                                        </p>
                                        <Kv k="posts" v={r?.posts} />
                                        <Kv k="reports" v={r?.reports} />
                                        <Kv k="system logs" v={r?.systemLogs} />
                                        <Kv k="removed posts" v={r?.removedPosts} />
                                    </div>
                                ))}
                            </div>
                        )}
                        <Note tone="warn" title="Deleting moderation evidence breaks the audit trail.">
                            The system log carries a 30-day TTL of its own, so audit history disappears on that schedule
                            whatever a retention policy says. Deleted reports and removed posts are the only record that a
                            piece of content was ever actioned.
                        </Note>
                    </div>
                )}
            </Loadable>
        </CardShell>
    );
}

function EffectivenessCard({ res }) {
    const [days, setDays] = useState("14");
    return (
        <CardShell
            title="Filter effectiveness"
            subtitle="Moderation log entries per day, with the share that look like a block, a reject or a removal."
            onRefresh={() => res.load({ days: Number(days) || 14 })}
            refreshing={res.loading}
        >
            <Loadable res={res} label="Building the series…">
                {(d) => {
                    const series = rowsOf(d?.series);
                    const max = Math.max(...series.map((s) => num(s?.total)), 1);
                    return (
                        <div className="space-y-3">
                            <div className="grid gap-2 sm:grid-cols-[120px_1fr] items-end">
                                <Field label="Window" hint="1–90 days. Change it, then press Refresh.">
                                    <input
                                        type="number"
                                        min="1"
                                        max="90"
                                        value={days}
                                        onChange={(e) => setDays(e.target.value)}
                                        disabled={res.loading}
                                        aria-label="Effectiveness window in days"
                                        className={INPUT}
                                    />
                                </Field>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <Badge tone="gray">
                                        {num(d?.total)} entries over {num(d?.days)} days
                                    </Badge>
                                    <span className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                                        <span className="w-3 h-3 rounded bg-gray-300 dark:bg-gray-600 inline-block" />
                                        all entries
                                    </span>
                                    <span className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                                        <span className="w-3 h-3 rounded bg-red-500/80 inline-block" />
                                        block / reject / remove
                                    </span>
                                </div>
                            </div>

                            {series.length === 0 ? (
                                <Empty>No moderation log entries in this window, so there is nothing to chart.</Empty>
                            ) : (
                                <>
                                    <div className="flex gap-1 h-32 overflow-x-auto">
                                        {series.map((s) => {
                                            const total = num(s?.total);
                                            const blocked = num(s?.blocked);
                                            const h = (total / max) * 100;
                                            const bh = total > 0 ? (blocked / total) * 100 : 0;
                                            return (
                                                <div
                                                    key={s?.day}
                                                    className="flex-1 min-w-[20px] max-w-[32px] flex flex-col min-w-0"
                                                    title={`${s?.day}: ${total} entries, ${blocked} blocking`}
                                                >
                                                    <div className="flex-1 flex items-end min-w-0">
                                                        <div
                                                            className="w-full rounded-t bg-gray-300 dark:bg-gray-600 relative"
                                                            style={{ height: `${Math.max(h, 2)}%` }}
                                                        >
                                                            <div
                                                                className="absolute bottom-0 left-0 right-0 rounded-t bg-red-500/80"
                                                                style={{ height: `${bh}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <span className="text-[9px] text-gray-400 dark:text-gray-500 text-center truncate">
                                                        {String(s?.day || "").slice(5)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {series.map((s) => (
                                            <span
                                                key={`value-${s?.day}`}
                                                className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[9px] font-mono text-gray-600 dark:text-gray-400"
                                            >
                                                {String(s?.day || "").slice(5)}: {num(s?.total)}
                                                {s?.blocked ? ` (${num(s.blocked)})` : ""}
                                            </span>
                                        ))}
                                    </div>
                                </>
                            )}

                            <Note tone="warn" title="This chart does not measure filter accuracy.">
                                <p>
                                    The server counts log rows whose action matches{" "}
                                    <code className="text-[10px]">/block|reject|remove/i</code>. It cannot tell a correct
                                    block from a false positive, so a rising red bar is as likely to be a misconfigured
                                    word list as a genuine improvement. Only days with at least one entry appear — a day
                                    with no activity is absent, not zero.
                                </p>
                            </Note>
                        </div>
                    );
                }}
            </Loadable>
        </CardShell>
    );
}

function PresetCard({ res }) {
    const { showToast } = useToast();
    const [busy, setBusy] = useState("");
    const [confirming, setConfirming] = useState("");
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");

    const apply = useCallback(
        async (name, mode) => {
            setBusy(name);
            setError("");
            setConfirming("");
            try {
                const d = await callApi(`${OPS}/presets/${encodeURIComponent(name)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mode }),
                });
                setResult(d);
                showToast(`Applied ${name} (${d?.mode}) to ${d?.target} — ${num(d?.count)} words`, "success");
            } catch (e) {
                setError(describe(e));
                showToast(describe(e), "error");
            } finally {
                setBusy("");
            }
        },
        [showToast]
    );

    return (
        <CardShell
            title="Word-list presets"
            subtitle="A shortcut into the content filter's config. Full word editing lives in the Content Filter tab."
            onRefresh={() => res.load()}
            refreshing={res.loading}
        >
            <Loadable res={res} label="Loading presets…">
                {(d) => (
                    <div className="space-y-3">
                        {d?.note && <Note tone="info" title="Where each preset lands">{d.note}</Note>}

                        <Note tone="warn" title="The Content Filter tab will not notice.">
                            Presets write to the same config document every safety panel reads, but each panel keeps its own
                            copy in state. After applying one, open the Content Filter tab and refresh it before you trust
                            what it shows.
                        </Note>

                        {rowsOf(d?.rows).length === 0 ? (
                            <Empty>The server returned no presets.</Empty>
                        ) : (
                            <div className="space-y-2">
                                {rowsOf(d?.rows).map((p) => (
                                    <div key={p?.name} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {p?.name}
                                            </span>
                                            <Badge tone="gray">{num(p?.count)} words</Badge>
                                            <Badge tone="info">
                                                {p?.name === "mild" ? "→ toxicWords (blur)" : "→ nudityKeywords (block)"}
                                            </Badge>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {rowsOf(p?.words).map((w) => (
                                                <span
                                                    key={w}
                                                    className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[10px] font-mono"
                                                >
                                                    {w}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-2.5">
                                            <button
                                                type="button"
                                                onClick={() => apply(p?.name, "merge")}
                                                disabled={!!busy}
                                                className={BTN_PRIMARY}
                                            >
                                                {busy === p?.name ? "Applying…" : "Merge in"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setConfirming(confirming === p?.name ? "" : p?.name)}
                                                disabled={!!busy}
                                                className={BTN_GHOST}
                                            >
                                                Replace the list
                                            </button>
                                        </div>
                                        {confirming === p?.name && (
                                            <div className="mt-2">
                                                <Note tone="danger" title="Replace discards the current list.">
                                                    <p>
                                                        Everything currently in the target list is thrown away and replaced
                                                        by exactly the {num(p?.count)} words above. Anything an admin
                                                        tuned by hand is lost.
                                                    </p>
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => apply(p?.name, "replace")}
                                                            disabled={!!busy}
                                                            className={BTN_DANGER}
                                                        >
                                                            {busy === p?.name ? "Working…" : `Yes, replace with “${p?.name}”`}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirming("")}
                                                            disabled={!!busy}
                                                            className={BTN_GHOST}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </Note>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <ErrorBox message={error} />

                        {result && (
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                                <Kv k="preset" v={result.preset} />
                                <Kv k="target" v={result.target} mono />
                                <Kv k="mode" v={result.mode} />
                                <Kv k="words in list" v={result.count} />
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
                                    The preset endpoint returns the new list rather than the config, so the counts the
                                    Content Filter tab shows are stale until it is refreshed there.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </Loadable>
        </CardShell>
    );
}

function ComplianceTab({ audit, history, retention, effectiveness, presets }) {
    return (
        <div className="space-y-4">
            <AuditCard res={audit} />
            <FilterHistoryCard res={history} />
            <UserExportCard />
            <AnonymiseCard />
            <RetentionCard res={retention} />
            <EffectivenessCard res={effectiveness} />
            <PresetCard res={presets} />
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Panel                                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function SafetyOpsPanel() {
    const [tab, setTab] = useState("overview");

    // Every card owns one endpoint: its own data, its own error, its own
    // Refresh. A 404 or 500 renders inside the card that asked for it and never
    // blanks the tab.
    const overview = useResource(useCallback(() => callApi(`${OPS}/overview`, { cache: "no-store" }), []));
    const reportAge = useResource(useCallback(() => callApi(`${OPS}/report-age`, { cache: "no-store" }), []));

    const scores = useResource(useCallback(() => callApi(`${OPS}/safety-scores?limit=50`, { cache: "no-store" }), []));
    const offenders = useResource(useCallback(() => callApi(`${OPS}/offenders?limit=25`, { cache: "no-store" }), []));
    const spam = useResource(useCallback(() => callApi(`${OPS}/mention-spam?limit=25`, { cache: "no-store" }), []));
    const inbox = useResource(
        useCallback(() => callApi(`${REPORTS_INBOX}?status=open`, { cache: "no-store" }), [])
    );

    const indexAudit = useResource(useCallback(() => callApi(`${OPS}/index-audit`, { cache: "no-store" }), []));
    const collectionStats = useResource(
        useCallback(() => callApi(`${OPS}/collection-stats`, { cache: "no-store" }), [])
    );
    const duplicates = useResource(
        useCallback((opts) => callApi(`${OPS}/duplicates?limit=${clampLimit(opts?.limit, 20)}`, { cache: "no-store" }), [])
    );
    const ttlHealth = useResource(useCallback(() => callApi(`${OPS}/ttl-health`, { cache: "no-store" }), []));

    const audit = useResource(
        useCallback(
            (opts) =>
                callApi(
                    `${OPS}/audit?limit=${clampLimit(opts?.limit, 100)}&category=${encodeURIComponent(opts?.category || "moderation")}`,
                    { cache: "no-store" }
                ),
            []
        )
    );
    const history = useResource(useCallback(() => callApi(`${OPS}/filter-history?limit=50`, { cache: "no-store" }), []));
    const retention = useResource(useCallback(() => callApi(`${OPS}/retention`, { cache: "no-store" }), []));
    const effectiveness = useResource(
        useCallback((opts) => callApi(`${OPS}/effectiveness?days=${clampDays(opts?.days)}`, { cache: "no-store" }), [])
    );
    const presets = useResource(useCallback(() => callApi(`${OPS}/presets`, { cache: "no-store" }), []));

    const shadow = useShadowbans();

    // What each sub-tab needs on first open. The Overview is the eager one; the
    // rest load when they are first selected and keep whatever they loaded.
    const loaders = useMemo(
        () => ({
            overview: [overview.load, reportAge.load],
            risk: [scores.load, offenders.load, spam.load, inbox.load],
            health: [indexAudit.load, collectionStats.load, duplicates.load, ttlHealth.load],
            compliance: [audit.load, history.load, retention.load, effectiveness.load, presets.load],
        }),
        [
            overview.load,
            reportAge.load,
            scores.load,
            offenders.load,
            spam.load,
            inbox.load,
            indexAudit.load,
            collectionStats.load,
            duplicates.load,
            ttlHealth.load,
            audit.load,
            history.load,
            retention.load,
            effectiveness.load,
            presets.load,
        ]
    );

    const busy = useMemo(
        () => ({
            overview: overview.loading || reportAge.loading,
            risk: scores.loading || offenders.loading || spam.loading || inbox.loading,
            health: indexAudit.loading || collectionStats.loading || duplicates.loading || ttlHealth.loading,
            compliance:
                audit.loading || history.loading || retention.loading || effectiveness.loading || presets.loading,
        }),
        [
            overview.loading,
            reportAge.loading,
            scores.loading,
            offenders.loading,
            spam.loading,
            inbox.loading,
            indexAudit.loading,
            collectionStats.loading,
            duplicates.loading,
            ttlHealth.loading,
            audit.loading,
            history.loading,
            retention.loading,
            effectiveness.loading,
            presets.loading,
        ]
    );

    const opened = useRef({});

    useEffect(() => {
        if (opened.current[tab]) return undefined;
        opened.current[tab] = true;
        const list = loaders[tab] || [];
        // Deferred so the effect body itself never sets state synchronously.
        const timer = setTimeout(() => {
            list.forEach((load) => load());
        }, 0);
        return () => clearTimeout(timer);
    }, [tab, loaders]);

    const label = TABS.find((t) => t.id === tab)?.label || "";

    return (
        <div className="space-y-4">
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

            {busy[tab] && (
                <p
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
                >
                    <span className="w-3 h-3 shrink-0 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                    Loading {label}…
                </p>
            )}

            {tab === "overview" && <OverviewTab overview={overview} reportAge={reportAge} />}
            {tab === "risk" && (
                <RiskTab
                    scores={scores}
                    offenders={offenders}
                    spam={spam}
                    inbox={inbox}
                    reportAge={reportAge}
                    shadow={shadow}
                />
            )}
            {tab === "health" && (
                <HealthTab
                    indexAudit={indexAudit}
                    collectionStats={collectionStats}
                    duplicates={duplicates}
                    ttlHealth={ttlHealth}
                />
            )}
            {tab === "compliance" && (
                <ComplianceTab
                    audit={audit}
                    history={history}
                    retention={retention}
                    effectiveness={effectiveness}
                    presets={presets}
                />
            )}
        </div>
    );
}
