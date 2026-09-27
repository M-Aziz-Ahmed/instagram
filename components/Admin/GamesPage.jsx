"use client";

/**
 * Games operations & analytics.
 *
 * ── The one thing this page must not do ──────────────────────────────────────
 * Present the eight board games as one dataset. They are not one dataset. The
 * models disagree about what a finished game is called (chess ends with
 * `checkmate`/`stalemate`/`draw`, checkers and connect4 with `win`/`draw`,
 * reactionduel with `finished`), where the players live (`white`/`black`,
 * `red`/`yellow`, `red`/`black`, `x`/`o`, singular `player`, a `players` array,
 * and battleship has no slots at all), whether move length is `moves[]` or
 * `moveCount` or `reactions[]`, and — the worst of it — four of the eight have
 * no `createdAt` at all, so no time series exists for them.
 *
 * Every number below therefore ships with the reason it is missing. A zero
 * chart reads as "nobody played"; a flat empty series for reversi means the
 * field needed to place a game in time does not exist. Those are different
 * facts and the UI keeps them different.
 *
 * All shapes below come from live-server/routes/adminGames.js, which is driven by
 * the per-game field map in live-server/lib/gameSchemas.js. Where the server
 * explains itself (`note`, `reason`, `skipped`, `unknownStatuses`, `possible`)
 * the text is rendered verbatim rather than paraphrased.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { AreaChart, BarChart, DonutChart, StatCard } from "@/components/Admin/charts";

const API = "/api/admin/games";

/**
 * Client mirror of `GAME_KEYS` in live-server/lib/gameSchemas.js, used only so
 * the picker and sub-tabs exist before the first response lands. Server rows are
 * merged over this, and any key the server knows that is not listed here is
 * appended rather than dropped.
 */
const GAMES_FALLBACK = [
    { key: "chess", label: "Chess" },
    { key: "connect4", label: "Connect 4" },
    { key: "checkers", label: "Checkers" },
    { key: "tictactoe", label: "Tic-tac-toe" },
    { key: "reversi", label: "Reversi" },
    { key: "battleship", label: "Battleship" },
    { key: "hangman", label: "Hangman" },
    { key: "reactionduel", label: "Reaction Duel" },
];

const SUBTABS = [
    { id: "overview", label: "Overview" },
    { id: "schema", label: "Schema report" },
    { id: "detail", label: "Game detail" },
    { id: "stuck", label: "Stuck games" },
    { id: "suspect", label: "Suspicious patterns" },
];

const LIFECYCLE = [
    { key: "finished", label: "Finished", color: "#58cc02" },
    { key: "active", label: "Active", color: "#1cb0f6" },
    { key: "waiting", label: "Waiting", color: "#ffc800" },
    { key: "abandoned", label: "Abandoned", color: "#ff9600" },
    { key: "other", label: "Unrecognised status", color: "#a3a3a3" },
];

const LENGTH_BUCKETS = ["0", "1-10", "11-25", "26-50", "51-100", "100+"];

const STUCK_WINDOWS = [
    { label: "6h", hours: 6 },
    { label: "24h", hours: 24 },
    { label: "72h", hours: 72 },
    { label: "7d", hours: 168 },
];

const TIMELINE_WINDOWS = [
    { label: "7 days", days: 7 },
    { label: "30 days", days: 30 },
    { label: "90 days", days: 90 },
];

/* ── API ───────────────────────────────────────────────────────────────────── */

/**
 * fetch + JSON + throw, carrying the server's own payload. The server answers
 * with `{ error, detail }` and sometimes nothing else useful, so the whole
 * payload rides on the exception rather than being replaced by a generic string.
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

/**
 * Every word the server gave us, in the order it gave it. `error` alone is
 * frequently the literal string "Failed", so `detail` and the status are always
 * carried too — a bare "Failed" is not an error message an admin can act on.
 */
function describeError(e) {
    const out = [];
    const error = e?.payload?.error;
    const detail = e?.payload?.detail;
    if (error) out.push(String(error));
    if (detail && String(detail) !== String(error)) out.push(`Detail: ${detail}`);
    if (e?.payload?.required) out.push(`Requires permission: ${e.payload.required}`);
    if (e?.payload?.validKeys) out.push(`Valid keys: ${(e.payload.validKeys || []).join(", ")}`);
    if (!out.length) out.push(e?.message || "Request failed");
    if (e?.status && !detail) out.push(`HTTP ${e.status}`);
    return out.join(" — ");
}

/* ── Formatting ────────────────────────────────────────────────────────────── */

const numText = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString() : "—");

/** `null` means "not computable", which is not the same claim as 0. */
const pctText = (v) => (v === null || v === undefined ? "—" : `${v}%`);

const when = (v) => (v ? new Date(v).toLocaleString() : "—");

const keyOf = (r) => `${r.key}:${r.gameId}`;

/**
 * Fill missing days with zero.
 * The server's `$dateToString` has no `timezone` option, so it buckets in UTC —
 * which `toISOString` matches. Zero-filling is only ever applied to a game that
 * HAS `createdAt`; a game without one returns `possible: false` and is never
 * passed through here.
 */
function zeroFill(series, days) {
    const counts = new Map((series || []).map((d) => [d._id, Number(d.count) || 0]));
    const now = Date.now();
    const out = [];
    for (let i = days - 1; i >= 0; i -= 1) {
        const day = new Date(now - i * 86400000).toISOString().slice(0, 10);
        out.push({ label: day, games: counts.get(day) || 0 });
    }
    return out;
}

/* ── House primitives ──────────────────────────────────────────────────────── */

const CARD = "bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5";
const HEADING = "font-semibold text-sm text-gray-900 dark:text-gray-100";
const SUBTLE = "text-xs text-gray-500 dark:text-gray-400";
const INPUT =
    "w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-gray-100 min-h-11";
const BTN_PRIMARY =
    "px-3 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40 transition-colors min-h-11 inline-flex items-center justify-center";
const BTN_GHOST =
    "px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors min-h-11 inline-flex items-center justify-center";
const TBL = "w-full text-left border-collapse min-w-[640px]";

const TONES = {
    warn: "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200",
    danger: "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200",
    ok: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200",
    info: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300",
};

function Spinner({ label }) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 py-10" role="status">
            <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            {label && <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>}
        </div>
    );
}

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
                    <button type="button" onClick={onRetry} className="shrink-0 text-xs font-semibold text-red-600 dark:text-red-400 min-h-10 px-2">
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

/** House toggle: 44px tap target behind a `w-11 h-6` track. */
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
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? "translate-x-5" : ""}`} />
            </span>
        </button>
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

function Th({ children, className = "" }) {
    return (
        <th scope="col" className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 text-left ${className}`}>
            {children}
        </th>
    );
}

function Td({ children, className = "" }) {
    return <td className={`px-3 py-2.5 text-xs text-gray-700 dark:text-gray-200 align-top ${className}`}>{children}</td>;
}

/**
 * One request, isolated to one card.
 * The caller memoises `loader`, so a reload happens only when that loader's own
 * dependencies change (the selected game, the window) or on an explicit retry.
 *
 * The result is stored against the loader that produced it, and a result from a
 * different loader is never returned — switching games shows a loading state
 * rather than one frame of the previous game's numbers. A failed reload keeps
 * the last good data and adds the error above it, so one bad endpoint never
 * blanks a card that is fine.
 */
function useResource(loader) {
    const [state, setState] = useState({ loader, data: null, error: "", loading: true });
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const d = await loader();
                if (alive) setState({ loader, data: d, error: "", loading: false });
            } catch (e) {
                if (!alive) return;
                setState((p) =>
                    p.loader === loader
                        ? { ...p, error: describeError(e), loading: false }
                        : { loader, data: null, error: describeError(e), loading: false },
                );
            }
        })();
        return () => {
            alive = false;
        };
    }, [loader, nonce]);

    const reload = useCallback(() => {
        setState((p) =>
            p.loader === loader ? { ...p, error: "", loading: true } : { loader, data: null, error: "", loading: true },
        );
        setNonce((n) => n + 1);
    }, [loader]);

    if (state.loader !== loader) return { data: null, error: "", loading: true, reload };
    return { data: state.data, error: state.error, loading: state.loading, reload };
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function GamesPage() {
    const [gameKey, setGameKey] = useState("chess");
    const [tab, setTab] = useState("overview");

    const loadOverview = useCallback(() => callApi(`${API}/overview`, { cache: "no-store" }), []);
    const loadSchema = useCallback(() => callApi(`${API}/schema-report`, { cache: "no-store" }), []);

    const overview = useResource(loadOverview);
    const schema = useResource(loadSchema);

    /**
     * Labels come from the server. The static list only fills the gap before the
     * first response, and a key the server adds later is appended rather than
     * silently dropped from the picker.
     */
    const games = useMemo(() => {
        const byKey = new Map(GAMES_FALLBACK.map((g) => [g.key, { ...g, fromServer: false }]));
        for (const row of schema.data?.rows || []) {
            byKey.set(row.key, { key: row.key, label: row.label, fromServer: true, registered: row.registered });
        }
        for (const row of overview.data?.rows || []) {
            const prev = byKey.get(row.key) || { key: row.key, fromServer: false };
            byKey.set(row.key, { ...prev, key: row.key, label: row.label, fromServer: true, available: row.available });
        }
        return Array.from(byKey.values());
    }, [schema.data, overview.data]);

    const labelOf = useCallback((key) => games.find((g) => g.key === key)?.label || key, [games]);

    const openDetail = useCallback((key) => {
        setGameKey(key);
        setTab("detail");
    }, []);

    const inspectSchema = useCallback((key) => {
        setGameKey(key);
        setTab("schema");
    }, []);

    const activeSchemaRow = useMemo(
        () => (schema.data?.rows || []).find((r) => r.key === gameKey) || null,
        [schema.data, gameKey],
    );

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">Games</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Operations and analytics for the eight board games — which disagree about almost every field.
                </p>
            </div>

            {/* Game picker */}
            <div className={CARD}>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <h2 className={HEADING}>Game</h2>
                    <span className={SUBTLE}>{games.length} games</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {games.map((g) => (
                        <button
                            key={g.key}
                            type="button"
                            aria-pressed={gameKey === g.key}
                            onClick={() => setGameKey(g.key)}
                            className={`min-h-11 px-3 rounded-xl border text-xs font-semibold transition-colors ${
                                gameKey === g.key
                                    ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900 border-black dark:border-gray-100"
                                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                            }`}
                        >
                            {g.label}
                            {g.available === false && <span className="ml-1.5 text-[10px] opacity-70">unavailable</span>}
                        </button>
                    ))}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
                    Every query this page runs is driven by a per-game field map on the server, because no single status value
                    means “finished” across all eight. A query written against one model will be wrong for the other seven.
                </p>
            </div>

            {/* Sub-tabs */}
            <div
                role="tablist"
                aria-label="Games sections"
                className="flex gap-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-1 w-fit max-w-full overflow-x-auto"
            >
                {SUBTABS.map((t) => (
                    <button
                        key={t.id}
                        id={`games-tab-${t.id}`}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        aria-controls={`games-panel-${t.id}`}
                        onClick={() => setTab(t.id)}
                        className={`px-3 min-h-11 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                            tab === t.id ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div
                id={`games-panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`games-tab-${tab}`}
                tabIndex={0}
                className="min-w-0 focus-visible:outline-none"
            >
                {tab === "overview" && <OverviewTab overview={overview} schema={schema} onInspectSchema={inspectSchema} />}
                {tab === "schema" && <SchemaTab schema={schema} onOpenGame={openDetail} />}
                {tab === "detail" && <DetailTab gameKey={gameKey} schemaRow={activeSchemaRow} />}
                {tab === "stuck" && <StuckTab labelOf={labelOf} onResolved={overview.reload} />}
                {tab === "suspect" && <SuspectTab schema={schema} labelOf={labelOf} />}
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  1. Overview
 *  ═════════════════════════════════════════════════════════════════════════════ */

function OverviewTab({ overview, schema, onInspectSchema }) {
    const schemaByKey = useMemo(() => new Map((schema.data?.rows || []).map((r) => [r.key, r])), [schema.data]);

    if (overview.loading && !overview.data) return <Spinner label="Loading game overview…" />;

    const rows = overview.data?.rows || [];

    return (
        <div className="space-y-3">
            <ErrorBox message={overview.error && `Overview unavailable: ${overview.error}`} onRetry={overview.reload} />

            {overview.data?.generatedAt && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    Read at {when(overview.data.generatedAt)}. Totals come from the collection estimate, which can drift after an
                    unclean shutdown — the Game detail tab recounts a capped sample instead.
                </p>
            )}

            {overview.error && !overview.data ? null : rows.length === 0 && !overview.loading ? (
                <div className={CARD}>
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No games reported.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {rows.map((row) => (
                        <OverviewCard key={row.key} row={row} schemaRow={schemaByKey.get(row.key) || null} onInspectSchema={onInspectSchema} />
                    ))}
                </div>
            )}
        </div>
    );
}

function OverviewCard({ row, schemaRow, onInspectSchema }) {
    if (row.available === false) {
        return (
            <div className={CARD}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">{row.label}</h3>
                    <Badge tone="danger">Model not registered</Badge>
                    <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">{row.key}</span>
                </div>
                <Note tone="danger" title="This game cannot report anything at all.">
                    <p>{row.reason || "The server has no model registered under this name."}</p>
                    <p className="mt-1.5">
                        A missing model is not a game with zero games in it. There is no collection to count, so the numbers
                        below are omitted rather than shown as 0.
                    </p>
                </Note>
            </div>
        );
    }

    const breakdown = Object.entries(row.statusBreakdown || {}).sort((a, b) => b[1] - a[1]);
    const unknown = row.unknownStatuses || [];
    const terminalHasAbandoned = (schemaRow?.terminalStatuses || []).includes("abandoned");

    return (
        <div className={CARD}>
            <div className="flex items-center gap-2 flex-wrap mb-3">
                <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">{row.label}</h3>
                <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">{row.key}</span>
                <span className="flex-1 min-w-0" />
                {row.hasCreatedAt ? (
                    <Badge tone="ok">has createdAt</Badge>
                ) : (
                    <Badge tone="warn">no createdAt — no timeline</Badge>
                )}
                {row.hasTimers && <Badge tone="info">per-player clocks</Badge>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <StatCard label="Total" value={numText(row.total)} icon="🎲" />
                <StatCard label="Finished" value={numText(row.finished)} hint={schemaRow ? `${(schemaRow.terminalStatuses || []).length} terminal values` : "terminal statuses for this game"} />
                <StatCard label="Live" value={numText(row.live)} hint="active + waiting" />
                <StatCard label="Waiting" value={numText(row.waiting)} />
                <StatCard label="Abandoned" value={numText(row.abandoned)} />
                <StatCard label="AI games" value={numText(row.aiGames)} hint={row.aiShare === null ? "share unknown — nothing to divide" : `${row.aiShare}% of total`} />
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <Kv
                    k="Finished means"
                    v={schemaRow ? (schemaRow.terminalStatuses || []).join(", ") : "the terminal statuses declared for this game only"}
                />
                <Kv
                    k="Draw rate"
                    v={
                        row.drawRate === null
                            ? "— no finished games yet, so no rate exists (this is not 0%)"
                            : `${row.drawRate}% (draw + stalemate, of finished)`
                    }
                />
                <Kv
                    k="AI share"
                    v={row.aiShare === null ? "— no games, so no share exists (this is not 0%)" : `${row.aiShare}% (mode is not “multiplayer”)`}
                />
            </div>

            {terminalHasAbandoned && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
                    <b>Read the sums carefully.</b> `abandoned` is in this game&rsquo;s terminal set, so it is already inside{" "}
                    <i>Finished</i> and is also listed on its own. Finished + Live + Abandoned therefore exceeds Total by the
                    abandoned count. The Game detail tab carves abandoned back out, so the two tabs will not agree.
                </p>
            )}

            <div className="mt-3">
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Every status value in the collection
                </p>
                {breakdown.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">No documents.</p>
                ) : (
                    <div className="flex flex-wrap gap-1">
                        {breakdown.map(([status, count]) => (
                            <span
                                key={status}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-[11px] font-semibold text-gray-700 dark:text-gray-300"
                            >
                                <span className="font-mono">{status}</span>
                                <span className="tabular-nums text-gray-500 dark:text-gray-400">{numText(count)}</span>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {unknown.length > 0 && (
                <div className="mt-3">
                    <Note tone="warn" title={`${unknown.length} status value${unknown.length > 1 ? "s are" : " is"} not in this game's terminal set`}>
                        <p className="mb-1 font-mono">{unknown.join(", ")}</p>
                        <p>
                            These records exist but are not counted as finished. A game that completes under a name the map does
                            not know is a real record that every finished total on this page silently drops.
                            {schemaRow && !schemaRow.hasTypedStatusEnum && " This model has no status enum, so nothing rejects an unexpected value — that is the root cause."}
                        </p>
                    </Note>
                </div>
            )}

            {(!row.hasCreatedAt || (schemaRow && (!schemaRow.hasPlayerSlots || !schemaRow.hasTypedStatusEnum))) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">This game has known data gaps:</span>
                    {!row.hasCreatedAt && <Badge tone="warn">no createdAt</Badge>}
                    {schemaRow && !schemaRow.hasPlayerSlots && <Badge tone="warn">no player slots</Badge>}
                    {schemaRow && !schemaRow.hasTypedStatusEnum && <Badge tone="warn">free-text status</Badge>}
                    <button type="button" onClick={() => onInspectSchema(row.key)} className={`${BTN_GHOST} py-1 min-h-10`}>
                        Open schema report
                    </button>
                </div>
            )}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  2. Schema report
 *  ═════════════════════════════════════════════════════════════════════════════ */

function SchemaTab({ schema, onOpenGame }) {
    if (schema.loading && !schema.data) return <Spinner label="Reading the per-game field map…" />;

    const rows = schema.data?.rows || [];
    const summary = schema.data?.summary;

    return (
        <div className="space-y-3">
            <ErrorBox message={schema.error && `Schema report unavailable: ${schema.error}`} onRetry={schema.reload} />

            {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Game models" value={numText(summary.total)} icon="🧩" />
                    <StatCard
                        label="With createdAt"
                        value={`${summary.withCreatedAt}/${summary.total}`}
                        icon="🕒"
                        hint={`${summary.total - summary.withCreatedAt} cannot be charted`}
                    />
                    <StatCard
                        label="With player slots"
                        value={`${summary.withPlayerSlots}/${summary.total}`}
                        icon="👥"
                        hint={`${summary.total - summary.withPlayerSlots} have no per-player stats`}
                    />
                    <StatCard
                        label="With a status enum"
                        value={`${summary.withTypedStatus}/${summary.total}`}
                        icon="🔤"
                        hint={`${summary.total - summary.withTypedStatus} are free-text`}
                    />
                </div>
            )}

            <Note tone="warn" title="This is the table that saves the next engineer.">
                <p>
                    A single query written for one game will be quietly wrong for the other seven. Assume nothing: not the name
                    of the finished state, not the player field, not even that a creation timestamp exists. Anything you want to
                    group across all eight games has to be driven by this map, one game at a time.
                </p>
            </Note>

            <div className={CARD}>
                <h3 className={HEADING}>Field map, per model</h3>
                <p className={`${SUBTLE} mb-3 mt-0.5`}>
                    Read from the server&rsquo;s own map. `registered` is the only column that is measured live — the rest
                    describe what the code declares, not what is in the database.
                </p>
                <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
                    <table className={TBL}>
                        <thead className="border-b border-gray-200 dark:border-gray-800">
                            <tr>
                                <Th>Game</Th>
                                <Th>Model</Th>
                                <Th>Move field</Th>
                                <Th>Player slots</Th>
                                <Th>“Finished” means</Th>
                                <Th>createdAt</Th>
                                <Th>Problems</Th>
                                <Th />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {rows.map((r) => (
                                <tr key={r.key}>
                                    <Td>
                                        <span className="font-semibold text-gray-900 dark:text-gray-100">{r.label}</span>
                                        <span className="block font-mono text-[10px] text-gray-400 dark:text-gray-500">{r.key}</span>
                                    </Td>
                                    <Td>
                                        <span className="font-mono text-[11px]">{r.model}</span>
                                        {r.registered ? (
                                            <Badge tone="ok">registered</Badge>
                                        ) : (
                                            <Badge tone="danger">not registered</Badge>
                                        )}
                                    </Td>
                                    <Td>
                                        <span className="font-mono text-[11px]">{r.moveField}</span>
                                        <span className="block text-[10px] text-gray-400 dark:text-gray-500">a {r.moveFieldType}</span>
                                    </Td>
                                    <Td>
                                        {r.hasPlayerSlots ? (
                                            <span className="flex flex-wrap gap-1">
                                                {(r.playerSlots || []).map((s) => (
                                                    <span key={s} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-[10px] text-gray-600 dark:text-gray-400">
                                                        {s}
                                                    </span>
                                                ))}
                                            </span>
                                        ) : (
                                            <Badge tone="warn">none</Badge>
                                        )}
                                    </Td>
                                    <Td>
                                        <span className="flex flex-wrap gap-1">
                                            {(r.terminalStatuses || []).map((s) => (
                                                <span key={s} className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 text-[10px] font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                                                    {s}
                                                </span>
                                            ))}
                                        </span>
                                        {!r.hasTypedStatusEnum && (
                                            <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                                                free String, no enum — an unknown value is not terminal
                                            </span>
                                        )}
                                    </Td>
                                    <Td>
                                        {r.hasCreatedAt ? (
                                            <Badge tone="ok">yes</Badge>
                                        ) : (
                                            <Badge tone="danger">missing</Badge>
                                        )}
                                        <span className="block text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                                            {r.timeSeriesPossible ? "time series possible" : "time series impossible"}
                                        </span>
                                    </Td>
                                    <Td>
                                        {(r.problems || []).length === 0 ? (
                                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400">none known</span>
                                        ) : (
                                            <ul className="space-y-1">
                                                {(r.problems || []).map((p) => (
                                                    <li key={p} className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                                                        {p}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </Td>
                                    <Td>
                                        <button type="button" onClick={() => onOpenGame(r.key)} className={`${BTN_GHOST} py-1 min-h-10`}>
                                            Details
                                        </button>
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className={CARD}>
                <h3 className={HEADING}>What breaks, concretely</h3>
                <ul className="mt-2 space-y-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    <li>
                        <b className="text-gray-900 dark:text-gray-100">One “finished” filter cannot exist.</b> Chess finishes
                        with <span className="font-mono">checkmate</span>/<span className="font-mono">stalemate</span>/
                        <span className="font-mono">draw</span>; checkers, tictactoe and connect4 with{" "}
                        <span className="font-mono">win</span>/<span className="font-mono">draw</span>; reactionduel with{" "}
                        <span className="font-mono">finished</span>. There is no value that covers all eight.
                    </li>
                    <li>
                        <b className="text-gray-900 dark:text-gray-100">Four of eight have no clock.</b> No{" "}
                        <span className="font-mono">createdAt</span> means no time series and no age-based stuck detection. A
                        flat zero line for those is not “nobody played” — the chart simply cannot exist, and the API says so
                        instead of returning one.
                    </li>
                    <li>
                        <b className="text-gray-900 dark:text-gray-100">Player slots are named eight different ways.</b> Joining
                        on a username across games silently misses or double-counts, and battleship has no slots at all, so
                        per-player statistics are impossible there rather than merely slow.
                    </li>
                    <li>
                        <b className="text-gray-900 dark:text-gray-100">Move length is not a number everywhere.</b>{" "}
                        <span className="font-mono">moves[]</span> for chess and connect4,{" "}
                        <span className="font-mono">moveCount</span> for most others,{" "}
                        <span className="font-mono">reactions[]</span> for reactionduel. A missing length reads as{" "}
                        <span className="font-mono">null</span>, which is “unknown” and not zero.
                    </li>
                    <li>
                        <b className="text-gray-900 dark:text-gray-100">Three models cannot reject a bad status.</b> Reversi,
                        battleship and hangman store a free string, so terminal states cannot be filtered reliably and the
                        overview reports whatever unrecognised values it finds.
                    </li>
                </ul>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  3. Game detail
 *  ═════════════════════════════════════════════════════════════════════════════ */

function DetailTab({ gameKey, schemaRow }) {
    const [days, setDays] = useState(30);
    const [zeroFillDays, setZeroFillDays] = useState(true);
    const [playerFilter, setPlayerFilter] = useState("");

    const loadStats = useCallback(() => callApi(`${API}/${gameKey}/stats`, { cache: "no-store" }), [gameKey]);
    const loadTimeline = useCallback(() => callApi(`${API}/${gameKey}/timeline?days=${days}`, { cache: "no-store" }), [gameKey, days]);

    const stats = useResource(loadStats);
    const timeline = useResource(loadTimeline);

    const d = stats.data;
    const noTimestamp = d?.hasCreatedAt === false;

    const lifecycle = useMemo(
        () => LIFECYCLE.map((b) => ({ label: b.label, count: Number(d?.buckets?.[b.key]) || 0 })),
        [d],
    );
    const lengthBars = useMemo(
        () => LENGTH_BUCKETS.map((b) => ({ label: b, value: Number(d?.gameLength?.buckets?.[b]) || 0 })),
        [d],
    );
    const board = useMemo(() => {
        const rows = d?.leaderboard || [];
        const q = playerFilter.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) => String(r.username).toLowerCase().includes(q));
    }, [d, playerFilter]);

    const series = useMemo(() => {
        const t = timeline.data;
        if (!t || t.possible === false) return [];
        if (zeroFillDays) return zeroFill(t.series, t.days || days);
        return (t.series || []).map((p) => ({ label: p._id, games: Number(p.count) || 0 }));
    }, [timeline.data, zeroFillDays, days]);

    return (
        <div className="space-y-3">
            {/* Timeline lives above the detail so the "no timeline possible" answer
                is not buried under a pile of lifetime numbers. */}
            <div className={CARD}>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <h3 className={HEADING}>Daily volume</h3>
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                        {TIMELINE_WINDOWS.map((w) => (
                            <button
                                key={w.days}
                                type="button"
                                onClick={() => setDays(w.days)}
                                aria-pressed={days === w.days}
                                className={`px-2.5 min-h-10 rounded-lg text-[11px] font-semibold transition-colors ${
                                    days === w.days ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                }`}
                            >
                                {w.label}
                            </button>
                        ))}
                        <span className="w-px self-stretch bg-gray-200 dark:bg-gray-800 mx-1" />
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">Zero-fill empty days</span>
                        <Toggle label="Zero-fill empty days" on={zeroFillDays} onChange={() => setZeroFillDays((v) => !v)} tone="amber" />
                    </div>
                </div>

                <ErrorBox message={timeline.error && `${gameKey} timeline: ${timeline.error}`} onRetry={timeline.reload} />

                {timeline.loading && !timeline.data ? (
                    <Spinner label="Loading timeline…" />
                ) : timeline.data?.possible === false ? (
                    <Note tone="warn" title={`There is no timeline for ${timeline.data.label || gameKey}.`}>
                        <p>{timeline.data.reason}</p>
                        <p className="mt-1.5">
                            Nothing is drawn here on purpose. A flat zero line would be indistinguishable from “nobody played
                            this game”, and that is a completely different fact.
                        </p>
                    </Note>
                ) : timeline.data ? (
                    <>
                        <AreaChart data={series} keys={[{ field: "games", label: "Games started", color: "#1cb0f6" }]} height={200} />
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                            {zeroFillDays
                                ? "Empty days are shown as zero. The server only returns days that have at least one record, so without this the line would silently skip quiet days."
                                : "Empty days are omitted, not zeroed. Days with no record are absent from the series."}
                        </p>
                    </>
                ) : null}
            </div>

            {/* Detail */}
            <div className={CARD}>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                    <h3 className={HEADING}>{d?.label || gameKey} — lifetime</h3>
                    <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">{gameKey}</span>
                    <span className="flex-1 min-w-0" />
                    {schemaRow?.moveField && <Badge tone="info">length from {schemaRow.moveField}</Badge>}
                    {d && (d.hasCreatedAt ? <Badge tone="ok">has createdAt</Badge> : <Badge tone="warn">no createdAt</Badge>)}
                </div>

                <ErrorBox message={stats.error && `${gameKey} stats: ${stats.error}`} onRetry={stats.reload} />

                {d?.truncated && (
                    <div className="mb-3">
                        <Note tone="warn" title={`Scan truncated at ${numText(d.scanCap)} documents.`}>
                            Only the first {numText(d.scanCap)} records in the collection were read. Game collections have no TTL, so
                            they are unbounded and every number on this tab is a lower bound rather than a total.
                        </Note>
                    </div>
                )}

                {d?.note && (
                    <div className="mb-3">
                        <Note tone="warn" title="This game has no timestamp.">
                            {d.note}
                        </Note>
                    </div>
                )}

                {stats.loading && !d ? (
                    <Spinner label={`Loading ${gameKey} stats…`} />
                ) : stats.error && !d ? null : !d ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                        No statistics available for this game.
                    </p>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <StatCard label="Records scanned" value={numText(d.scanned)} icon="🔍" hint={d.truncated ? `capped at ${numText(d.scanCap)}` : "complete scan"} />
                            <StatCard
                                label="AI share"
                                value={pctText(d.aiShare)}
                                icon="🤖"
                                hint={d.aiShare === null ? "nothing scanned, so no share exists" : "mode is not “multiplayer”"}
                            />
                            <StatCard label="Unique players" value={numText(d.uniquePlayers)} icon="👤" hint={schemaRow?.hasPlayerSlots ? "from the declared slots" : "no slots declared for this game"} />
                            <StatCard
                                label="Avg game length"
                                value={d.gameLength?.average === null || d.gameLength?.average === undefined ? "—" : numText(d.gameLength.average)}
                                icon="⏱"
                                hint={
                                    d.gameLength?.known > 0
                                        ? `over ${numText(d.gameLength.known)} readable games`
                                        : "no game had a readable move length"
                                }
                            />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                    Lifecycle
                                </p>
                                <DonutChart data={lifecycle} />
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                                    Centre figure is the number of scanned game records. (The shared donut component labels its
                                    centre “events”; it is counting games here.)&nbsp;<i>Unrecognised status</i> is the catch-all
                                    for any value that is neither terminal, active nor waiting.
                                </p>
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                    Game length, in moves
                                </p>
                                <BarChart data={lengthBars} color="#ce82ff" height={180} />
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                                    Average {d.gameLength?.average === null || d.gameLength?.average === undefined ? "unknown" : numText(d.gameLength.average)} moves,
                                    measured over {numText(d.gameLength?.known)} games whose length could be read.{" "}
                                    <b className="text-amber-600 dark:text-amber-400">{numText(d.gameLength?.unknown)}</b> could not be
                                    read and are excluded from the average rather than counted as zero-move games.
                                </p>
                            </div>
                        </div>

                        {/* Leaderboard */}
                        <div>
                            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Top players — only those with at least one recorded win
                                </p>
                                {(d.leaderboard || []).length > 3 && (
                                    <div className="w-full sm:w-56">
                                        <Field label="Filter by username">
                                            <input
                                                type="search"
                                                value={playerFilter}
                                                onChange={(e) => setPlayerFilter(e.target.value)}
                                                placeholder="e.g. chess_fan"
                                                className={INPUT}
                                            />
                                        </Field>
                                    </div>
                                )}
                            </div>

                            {board.length === 0 ? (
                                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                                    {(d.leaderboard || []).length === 0
                                        ? "No player has a recorded win in this game. That is a real result, not a missing table — wins are matched on the winner field, so if a game records its winner another way, no one qualifies."
                                        : "No player matches that filter."}
                                </p>
                            ) : (
                                <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
                                    <table className={TBL}>
                                        <thead className="border-b border-gray-200 dark:border-gray-800">
                                            <tr>
                                                <Th>Player</Th>
                                                <Th className="text-right">Games</Th>
                                                <Th className="text-right">Wins</Th>
                                                <Th className="text-right">Losses</Th>
                                                <Th className="text-right">Draws</Th>
                                                <Th className="text-right">Win rate</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                            {board.map((p) => (
                                                <tr key={p.username}>
                                                    <Td>
                                                        <span className="font-semibold text-gray-900 dark:text-gray-100">@{p.username}</span>
                                                    </Td>
                                                    <Td className="text-right tabular-nums">{numText(p.games)}</Td>
                                                    <Td className="text-right tabular-nums font-semibold">{numText(p.wins)}</Td>
                                                    <Td className="text-right tabular-nums">{numText(p.losses)}</Td>
                                                    <Td className="text-right tabular-nums">{numText(p.draws)}</Td>
                                                    <Td className="text-right tabular-nums">{pctText(Number((p.games ? (p.wins / p.games) * 100 : 0)).toFixed(1))}</Td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="mt-2 space-y-2">
                                <Note tone="warn" title="What this table does not separate.">
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li>
                                            A game played against the AI counts in <i>Games</i>, <i>Wins</i> and <i>Losses</i> exactly
                                            like a game against a person, so a casual player&rsquo;s numbers are mostly about the
                                            computer.
                                        </li>
                                        <li>
                                            <i>Losses</i> is “any finished game where a winner was recorded and it was not you”. It
                                            does not check that you played.
                                        </li>
                                        <li>
                                            <i>Draws</i> is “terminal, not abandoned, and no winner recorded”. A game lost without a{" "}
                                            <span className="font-mono">winner</span> field — plausible for a single-player game like
                                            hangman — lands in Draws rather than Losses.
                                        </li>
                                        <li>Only the top 25 players with at least one win are returned; everyone else is absent, not zero.</li>
                                        {noTimestamp && <li>This game has no player slots that resolve cleanly, so treat every per-player figure as best-effort.</li>}
                                    </ul>
                                </Note>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  4. Stuck games
 *  ═════════════════════════════════════════════════════════════════════════════ */

const RESOLVE_TARGETS = [
    {
        status: "abandoned",
        label: "Mark abandoned",
        blurb: "Closes a game nobody is coming back to. This is the intended use.",
    },
    {
        status: "active",
        label: "Mark active",
        blurb: "Reopens a game that is really still in play. It does not invite the opponent or restore any board state, and it still writes a result reason onto the record.",
    },
];

function StuckTab({ labelOf, onResolved }) {
    const { showToast } = useToast();
    const [hours, setHours] = useState(24);
    const [selected, setSelected] = useState(() => new Set());
    const [target, setTarget] = useState("abandoned");
    const [confirming, setConfirming] = useState(false);
    const [resolving, setResolving] = useState(false);
    const [result, setResult] = useState(null);
    const [resolveError, setResolveError] = useState("");
    const [rowFilter, setRowFilter] = useState("");

    const loadStuck = useCallback(() => callApi(`${API}/stuck?hours=${hours}`, { cache: "no-store" }), [hours]);
    const stuck = useResource(loadStuck);

    const rows = useMemo(() => {
        const all = stuck.data?.rows || [];
        const q = rowFilter.trim().toLowerCase();
        if (!q) return all;
        return all.filter(
            (r) =>
                String(r.key).includes(q) ||
                String(r.gameId).toLowerCase().includes(q) ||
                (r.players || []).some((p) => String(p).toLowerCase().includes(q)),
        );
    }, [stuck.data, rowFilter]);

    const chosen = useMemo(() => rows.filter((r) => selected.has(keyOf(r))), [rows, selected]);
    const chosenByKey = useMemo(() => {
        const m = new Map();
        for (const r of chosen) m.set(r.key, (m.get(r.key) || 0) + 1);
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    }, [chosen]);

    const allSelected = rows.length > 0 && rows.every((r) => selected.has(keyOf(r)));

    const toggleOne = useCallback((r) => {
        setSelected((prev) => {
            const next = new Set(prev);
            const k = keyOf(r);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return next;
        });
    }, []);

    const toggleAll = useCallback(() => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (allSelected) rows.forEach((r) => next.delete(keyOf(r)));
            else rows.forEach((r) => next.add(keyOf(r)));
            return next;
        });
    }, [allSelected, rows]);

    const runResolve = useCallback(async () => {
        setResolving(true);
        setResolveError("");
        try {
            const d = await callApi(`${API}/resolve-stuck`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gameIds: chosen.map((r) => keyOf(r)), status: target }),
            });
            setResult(d);
            setConfirming(false);
            setSelected(new Set());
            showToast(`Requested ${d.status} on ${chosen.length} game(s)`, "success");
            await stuck.reload();
            onResolved?.();
        } catch (e) {
            setResolveError(describeError(e));
            showToast(describeError(e), "error");
        } finally {
            setResolving(false);
        }
    }, [chosen, target, showToast, stuck, onResolved]);

    const s = stuck.data;

    return (
        <div className="space-y-3">
            <div className={CARD}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className={HEADING}>Games stuck in “waiting”</h3>
                    <div className="flex items-center gap-1">
                        {STUCK_WINDOWS.map((w) => (
                            <button
                                key={w.hours}
                                type="button"
                                onClick={() => setHours(w.hours)}
                                aria-pressed={hours === w.hours}
                                className={`px-2.5 min-h-10 rounded-lg text-[11px] font-semibold transition-colors ${
                                    hours === w.hours ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                }`}
                            >
                                {w.label}
                            </button>
                        ))}
                    </div>
                </div>
                <p className={`${SUBTLE} mt-1`}>
                    A game is “stuck” here when it is still in its <span className="font-mono">waiting</span> start state and was
                    created more than {s?.hours ?? hours}h ago.
                </p>
            </div>

            <ErrorBox message={stuck.error && `Stuck games unavailable: ${stuck.error}`} onRetry={stuck.reload} />

            {s && (
                <div className="space-y-2">
                    {s.note && <Note tone="info" title="What this scan does and does not cover">{s.note}</Note>}

                    {(s.skipped || []).length > 0 && (
                        <Note tone="warn" title={`${s.skipped.length} of the games cannot be checked at all`}>
                            <p className="mb-1">
                                {(s.skipped || []).map((k) => labelOf(k)).join(", ")} are excluded from this list. A game that
                                cannot be checked is absent, not clean — so “nothing stuck below” never means “nothing stuck
                                anywhere”.
                            </p>
                            <p className="font-mono text-[11px] break-words">{(s.skipped || []).join(", ")}</p>
                        </Note>
                    )}

                    <Note tone="info" title={`${numText(s.total)} stuck game(s) older than ${s.hours}h`}>
                        Each game contributes at most 500 rows, so a collection with more stuck games than that is reported as a
                        floor, not an exact count. The response carries no truncation flag for this.
                    </Note>
                </div>
            )}

            <div className={CARD}>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                    <h3 className={HEADING}>Records</h3>
                    {rows.length > 6 && (
                        <div className="w-full sm:w-64">
                            <Field label="Filter" hint="Matches the game key, the document id, or any recorded player.">
                                <input
                                    type="search"
                                    value={rowFilter}
                                    onChange={(e) => setRowFilter(e.target.value)}
                                    placeholder="game, id or player"
                                    className={INPUT}
                                />
                            </Field>
                        </div>
                    )}
                </div>

                {stuck.loading && !s ? (
                    <Spinner label="Scanning for stuck games…" />
                ) : stuck.error && !s ? null : rows.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                        {rowFilter.trim() ? "No row matches that filter." : "No game is waiting longer than the chosen window."}
                        {(s?.skipped || []).length > 0 && " Games listed above as skipped were not checked."}
                    </p>
                ) : (
                    <>
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                            <label className="flex items-center gap-2 min-h-11 px-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={toggleAll}
                                    aria-label="Select all listed stuck games"
                                    className="w-4 h-4 accent-black dark:accent-white"
                                />
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                    Select all {rows.length} listed
                                </span>
                            </label>
                            <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                {chosen.length} selected &middot; server accepts up to 500 ids per request
                            </span>
                        </div>

                        <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
                            <table className={TBL}>
                                <thead className="border-b border-gray-200 dark:border-gray-800">
                                    <tr>
                                        <Th className="w-8" />
                                        <Th>Game</Th>
                                        <Th>Game id</Th>
                                        <Th>Created</Th>
                                        <Th className="text-right">Age</Th>
                                        <Th>Mode</Th>
                                        <Th>Players</Th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {rows.map((r) => {
                                        const k = keyOf(r);
                                        const on = selected.has(k);
                                        return (
                                            <tr key={k} className={on ? "bg-gray-50 dark:bg-gray-800/50" : ""}>
                                                <Td>
                                                    <input
                                                        type="checkbox"
                                                        checked={on}
                                                        onChange={() => toggleOne(r)}
                                                        aria-label={`Select ${labelOf(r.key)} game ${r.gameId}`}
                                                        className="w-4 h-4 accent-black dark:accent-white"
                                                    />
                                                </Td>
                                                <Td>
                                                    <span className="font-semibold text-gray-900 dark:text-gray-100">{r.label || labelOf(r.key)}</span>
                                                    <span className="block font-mono text-[10px] text-gray-400 dark:text-gray-500">{r.key}</span>
                                                </Td>
                                                <Td>
                                                    <span className="font-mono text-[10px] break-all">{r.gameId}</span>
                                                </Td>
                                                <Td className="whitespace-nowrap">{when(r.createdAt)}</Td>
                                                <Td className="text-right tabular-nums font-semibold whitespace-nowrap">{numText(r.ageHours)}h</Td>
                                                <Td>{r.mode || <span className="text-gray-400">unset</span>}</Td>
                                                <Td>
                                                    {(r.players || []).length === 0 ? (
                                                        <span className="text-gray-400 dark:text-gray-500 text-[11px]">no player recorded</span>
                                                    ) : (
                                                        <span className="flex flex-wrap gap-1">
                                                            {(r.players || []).map((p) => (
                                                                <span key={p} className="text-[11px] text-gray-700 dark:text-gray-300">
                                                                    @{p}
                                                                </span>
                                                            ))}
                                                        </span>
                                                    )}
                                                </Td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* Resolve */}
            <div className={CARD}>
                <h3 className={HEADING}>Resolve selected</h3>
                <p className={`${SUBTLE} mt-1 mb-3 leading-relaxed`}>
                    This writes to real game documents. Nothing happens until you confirm, and the counts below are what the
                    server will attempt.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    {RESOLVE_TARGETS.map((t) => (
                        <label
                            key={t.status}
                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                                target === t.status ? "border-black dark:border-gray-100 bg-gray-50 dark:bg-gray-800/60" : "border-gray-200 dark:border-gray-700"
                            }`}
                        >
                            <input
                                type="radio"
                                name="resolve-target"
                                checked={target === t.status}
                                onChange={() => {
                                    setTarget(t.status);
                                    setConfirming(false);
                                }}
                                className="mt-1 w-4 h-4 accent-black dark:accent-white shrink-0"
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{t.label}</span>
                                <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{t.blurb}</span>
                            </span>
                        </label>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        disabled={chosen.length === 0 || resolving}
                        onClick={() => {
                            setResult(null);
                            setConfirming(true);
                        }}
                        className={BTN_PRIMARY}
                    >
                        Review {chosen.length} selected &rarr;
                    </button>
                    {chosen.length > 0 && (
                        <button type="button" onClick={() => setSelected(new Set())} className={BTN_GHOST} disabled={resolving}>
                            Clear selection
                        </button>
                    )}
                </div>

                {chosen.length === 0 && !confirming && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">Nothing selected, so nothing will be written.</p>
                )}

                {confirming && (
                    <div className="mt-3 space-y-2">
                        <Note tone="warn" title={`Confirm: ${chosen.length} record(s) will be set to status “${target}”`}>
                            <p>
                                The server runs an update on{" "}
                                <span className="font-mono">{chosenByKey.map(([k, n]) => `${k}×${n}`).join(", ")}</span> matching{" "}
                                <span className="font-mono">_id IN (…)</span> <b>and</b>{" "}
                                <span className="font-mono">status === &quot;waiting&quot;</span>, setting{" "}
                                <span className="font-mono">status</span> to <span className="font-mono">&quot;{target}&quot;</span> and{" "}
                                <span className="font-mono">resultReason</span> to{" "}
                                <span className="font-mono">&quot;administrative cleanup&quot;</span>.
                            </p>
                            <ul className="list-disc pl-4 mt-1.5 space-y-1">
                                <li>
                                    Only records that are <i>currently</i> waiting are touched. If someone joined one of these
                                    games a moment ago, it will not be modified and will not appear in the modified count.
                                </li>
                                <li>
                                    Marking a game active does not notify anyone or restore board state; the waiting opponent is
                                    still unknown. It is a bookkeeping correction, not a resume.
                                </li>
                                <li>
                                    Only games that can be aged are offered here, so the list is a subset of what exists. Games
                                    the server skipped are never modified by this action.
                                </li>
                            </ul>
                        </Note>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={runResolve} disabled={resolving} className={BTN_PRIMARY}>
                                {resolving ? "Applying…" : `Yes, set ${chosen.length} to “${target}”`}
                            </button>
                            <button type="button" onClick={() => setConfirming(false)} disabled={resolving} className={BTN_GHOST}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                <div className="mt-3 space-y-2">
                    <ErrorBox message={resolveError && `Resolve failed: ${resolveError}`} />
                    {result && <ResolveResult result={result} requested={chosen.length} labelOf={labelOf} />}
                </div>
            </div>
        </div>
    );
}

function ResolveResult({ result, requested, labelOf }) {
    const results = result?.results || [];
    const matched = results.reduce((sum, r) => sum + (Number(r.matched) || 0), 0);
    const modified = results.reduce((sum, r) => sum + (Number(r.modified) || 0), 0);
    const noResults = results.length === 0;

    return (
        <Note tone={noResults || matched === 0 ? "warn" : "ok"} title={`Server responded: ok=${result?.ok === true}, status “${result?.status}”`}>
            {noResults ? (
                <p>
                    The server accepted the request but matched <b>no</b> game keys. Every id you sent was dropped before any
                    query ran, because an id is only accepted in the exact form <span className="font-mono">gameKey:24-hex-mongo-id</span>{" "}
                    and a key the schema map does not know is discarded without an error. Nothing was changed.
                </p>
            ) : (
                <>
                    <p>
                        Matched <b>{numText(matched)}</b> of the {numText(requested)} selected, modified{" "}
                        <b>{numText(modified)}</b>.
                        {matched !== requested && " Fewer matched than were sent, so some ids did not exist or were not in a waiting state."}
                    </p>
                    {matched > modified && (
                        <p className="mt-1">
                            <b>Modified is lower than matched on purpose.</b> The query only selects records whose status is
                            already <span className="font-mono">waiting</span>, and the write sets{" "}
                            <span className="font-mono">status</span> plus <span className="font-mono">resultReason</span>. A record
                            that already had that exact value matches but changes nothing, so it counts as matched and not
                            modified.
                        </p>
                    )}
                    <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[360px]">
                            <thead>
                                <tr>
                                    <Th>Game</Th>
                                    <Th className="text-right">Matched</Th>
                                    <Th className="text-right">Modified</Th>
                                    <Th>Error</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5">
                                {results.map((r) => (
                                    <tr key={r.key}>
                                        <Td>{labelOf(r.key)}</Td>
                                        <Td className="text-right tabular-nums">{numText(r.matched)}</Td>
                                        <Td className="text-right tabular-nums font-semibold">{numText(r.modified)}</Td>
                                        <Td className="text-[11px]">{r.error || "—"}</Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </Note>
    );
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  5. Suspicious patterns
 *  ═════════════════════════════════════════════════════════════════════════════ */

function SuspectTab({ schema, labelOf }) {
    const loadSuspect = useCallback(() => callApi(`${API}/suspect?limit=25`, { cache: "no-store" }), []);
    const suspect = useResource(loadSuspect);

    /**
     * The endpoint does not say which games it looked at, so it is reconstructed
     * from the same conditions the route applies: registered, has `createdAt`,
     * and at least one player slot.
     */
    const covered = useMemo(
        () => (schema.data?.rows || []).filter((r) => r.registered && r.hasCreatedAt && r.hasPlayerSlots),
        [schema.data],
    );
    const uncovered = useMemo(
        () => (schema.data?.rows || []).filter((r) => !(r.registered && r.hasCreatedAt && r.hasPlayerSlots)),
        [schema.data],
    );

    const s = suspect.data;

    return (
        <div className="space-y-3">
            {s?.note && (
                <div className="rounded-2xl border border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/25 p-4 sm:p-5">
                    <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Read this before reading any row below.</p>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">{s.note}</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2 leading-relaxed">
                        These are accounts to look at, not accounts to act against. Nothing here is evidence of cheating, and
                        this table is deliberately styled as triage rather than as an accusation.
                    </p>
                </div>
            )}

            <div className={CARD}>
                <h3 className={HEADING}>What this table actually measures</h3>
                <ul className="mt-2 space-y-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed list-disc pl-4">
                    <li>
                        A row appears when a single account has a{" "}
                        <b className="text-gray-900 dark:text-gray-100">win rate of 90% or more across 5+ records of one game in{" "}
                        {s?.windowDays || 7} days</b>. That is the whole rule.
                    </li>
                    <li>
                        The denominator is <b className="text-gray-900 dark:text-gray-100">every record the account appears in</b>,
                        not every record it finished. Games still in progress count against the win rate, so a player with five
                        wins and twenty open boards shows as 100%.
                    </li>
                    <li>
                        <span className="font-mono">avgMoves</span> is the mean length over the games where a move length could be
                        read, so it is comparable between accounts only if they played the same game — which is why the game is
                        named on every row.
                    </li>
                    <li>Each game contributes at most 5000 records, and there is no truncation flag in the response.</li>
                </ul>
            </div>

            {schema.data && (
                <div className="space-y-2">
                    <Note
                        tone="info"
                        title={`Scanned: ${covered.length} of ${covered.length + uncovered.length} games — ${covered.map((r) => r.label).join(", ") || "none"}`}
                    >
                        {uncovered.length === 0 ? (
                            <p>Every game in the map is covered by this scan.</p>
                        ) : (
                            <p>
                                <b>Not scanned:</b> {(uncovered || []).map((r) => r.label).join(", ")} — no{" "}
                                <span className="font-mono">createdAt</span> or no player slots, so nothing about their players can
                                be computed. An empty table below never means those games are clean.
                            </p>
                        )}
                    </Note>
                </div>
            )}

            <ErrorBox message={suspect.error && `Suspicious patterns unavailable: ${suspect.error}`} onRetry={suspect.reload} />

            <div className={CARD}>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                    <h3 className={HEADING}>Accounts to review</h3>
                    {s && <span className={SUBTLE}>{s.rows?.length || 0} shown, top {s.windowDays}-day window</span>}
                </div>

                {suspect.loading && !s ? (
                    <Spinner label="Running heuristics…" />
                ) : suspect.error && !s ? null : (s?.rows || []).length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                        No account met the threshold in the scanned games
                        {schema.data ? `. That covers ${covered.length} of ${covered.length + uncovered.length} games only.` : "."}
                    </p>
                ) : (
                    <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
                        <table className={TBL}>
                            <thead className="border-b border-gray-200 dark:border-gray-800">
                                <tr>
                                    <Th>Account</Th>
                                    <Th>Game</Th>
                                    <Th className="text-right">Records</Th>
                                    <Th className="text-right">Wins</Th>
                                    <Th className="text-right">Win rate</Th>
                                    <Th className="text-right">Avg moves</Th>
                                    <Th>Why it was listed</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {(s?.rows || []).map((r, i) => (
                                    <tr key={`${r.username}-${r.key}-${i}`}>
                                        <Td>
                                            {/* Plain weight on purpose: this list is triage, not an accusation. */}
                                            <span className="font-medium text-gray-900 dark:text-gray-100">@{r.username}</span>
                                        </Td>
                                        <Td>
                                            <span className="text-gray-700 dark:text-gray-300">{r.label || labelOf(r.key)}</span>
                                            <span className="block font-mono text-[10px] text-gray-400 dark:text-gray-500">{r.key}</span>
                                        </Td>
                                        <Td className="text-right tabular-nums">{numText(r.games)}</Td>
                                        <Td className="text-right tabular-nums">{numText(r.wins)}</Td>
                                        <Td className="text-right tabular-nums">{pctText(r.winRate)}</Td>
                                        <Td className="text-right tabular-nums">{r.avgMoves === null || r.avgMoves === undefined ? "—" : numText(r.avgMoves)}</Td>
                                        <Td className="text-[11px] leading-relaxed">{r.reason}</Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
