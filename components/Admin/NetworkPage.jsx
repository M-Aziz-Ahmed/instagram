"use client";

/**
 * Social graph & community health.
 *
 * ── The question this page answers ──────────────────────────────────────────
 * /admin/analytics reports VOLUME: users, posts, events. Volume is not health.
 * A network can post all day and still be a dust cloud of disconnected pairs,
 * which is the state where it is one notification away from dying. This page
 * measures the graph itself: who is connected to whom, and where the data lies.
 *
 * ── The two facts that drive every design decision here ─────────────────────
 * 1. A follow is stored redundantly on BOTH endpoints: `A.following` contains
 *    B AND `B.followers` contains A. So reciprocity is measurable exactly, AND
 *    an edge present on one side but not the other is a data-integrity BUG,
 *    not a user behaviour. The write path (routes/users.js) pushes both
 *    documents in one `Promise.all`, so a mismatch means one save failed and
 *    the follower's own view disagrees with everyone else's. Integrity tab.
 *
 *    Note that a pending follow request to a private account writes NO edge at
 *    all — it goes to `pendingFollowRequests`, which this API never reads. So
 *    the graph is blind to every un-accepted request, not just slow.
 *
 * 2. THERE IS NO TIMESTAMP ON A FOLLOW. `User.following` / `User.followers`
 *    are plain string arrays, there is no edge document and no createdAt.
 *    Therefore follow-VELOCITY ("followed 200 accounts in 10 minutes") is
 *    fundamentally UNDETECTABLE. The server says so in its own `limitation`
 *    field. Any panel implying velocity detection exists would be fabricating
 *    data, so that limitation is rendered prominently next to every spam
 *    signal rather than buried.
 *
 * ── What this page never does ──────────────────────────────────────────────
 * Report a number it cannot back. `null` and `0` are rendered differently
 * everywhere (a null percentage means "no denominator", not "0%"), every
 * endpoint's list cap is stated rather than implied, and every scan is a
 * LOWER BOUND because the server walks at most 20,000 users.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { AreaChart, BarChart, DonutChart, StatCard } from "@/components/Admin/charts";

const API = "/api/admin/network";

/**
 * The server's own scan ceiling. Only /overview echoes it back (`scanCap`);
 * every other endpoint reports a boolean `truncated` and nothing else, so this
 * constant is what the remaining warnings have to quote.
 */
const SCAN_CAP = 20000;

/* ── Sub-tabs ────────────────────────────────────────────────────────────── */

const TABS = [
    { id: "health", label: "Health" },
    { id: "integrity", label: "Integrity" },
    { id: "degree", label: "Degree" },
    { id: "spam", label: "Spam signals" },
    { id: "ghosts", label: "Ghosts" },
    { id: "blocks", label: "Blocks & mutes" },
];

/** The seven fixed keys /degrees returns, in the server's own order. */
const BUCKET_ORDER = ["0", "1-2", "3-5", "6-10", "11-25", "26-100", "100+"];

/* ── fetch helper ────────────────────────────────────────────────────────── */

/**
 * fetch + JSON + throw, carrying the server's own words on the exception.
 *
 * The route answers failures as `{ error, detail }` and `error` is very often
 * the useless literal "Failed". Both are kept so a card can show
 * "Failed: <the actual reason>" instead of a bare "Failed".
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
        const err = new Error(data?.error || `Request failed with HTTP ${res.status}`);
        err.payload = data;
        err.status = res.status;
        throw err;
    }
    return data;
}

/**
 * `error` AND `detail`, verbatim, never a bare "Failed".
 * `detail` is the part that actually identifies the fault.
 */
const errText = (e) => {
    const base = e?.payload?.error || e?.message || "Request failed";
    const detail = e?.payload?.detail;
    if (!detail || detail === base) return base;
    return `${base}: ${detail}`;
};

/* ── House presentational primitives ──────────────────────────────────────── */

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
const BTN_PRIMARY =
    "px-3 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40 transition-colors";
const BTN_GHOST =
    "px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors";

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

/**
 * Card-level failure. Rendered INSIDE the card that failed, so one broken
 * endpoint never blanks the rest of the tab. `error` and `detail` both appear.
 */
function ErrorBox({ error, onRetry }) {
    if (!error) return null;
    return (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
            <div className="flex items-start gap-2">
                <p className="text-xs text-red-700 dark:text-red-300 flex-1 min-w-0 break-words">{error}</p>
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

function Field({ label, children, hint }) {
    return (
        <label className="block min-w-0">
            <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">{label}</span>
            {children}
            {hint && <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">{hint}</span>}
        </label>
    );
}

/** `null` is "no denominator", never "0%". */
const pctText = (v) => (v === null || v === undefined ? "—" : `${v}%`);

const numText = (v) => (typeof v === "number" && Number.isFinite(v) ? v.toLocaleString() : "—");

/**
 * The scan ceiling. Every endpoint walks at most SCAN_CAP users, so whenever
 * `truncated` is true every number on the page is a LOWER BOUND — the real
 * value is at least this large, and the un-scanned remainder is not counted.
 */
function ScanCapWarning({ truncated, scanCap }) {
    if (!truncated) return null;
    const cap = typeof scanCap === "number" ? scanCap : SCAN_CAP;
    return (
        <Note tone="warn" title={`Scan hit the ${cap.toLocaleString()}-account ceiling — these numbers are lower bounds.`}>
            The server read at most {cap.toLocaleString()} user documents and stopped. Edges, accounts and percentages below
            counted only those, so each is a <b>minimum</b>: the true figure is equal or larger, and any follow that crosses the
            cut-off is invisible on every tab of this page.
        </Note>
    );
}

/**
 * The list cap, which is a DIFFERENT thing from the scan cap and is reported
 * differently per endpoint. Some endpoints give an uncapped `total`, some give
 * none at all — which is stated rather than papered over.
 */
function ListCap({ shown, total, noun, capNote }) {
    if (total != null) {
        const hidden = total - shown;
        return (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Listing <b className="text-gray-600 dark:text-gray-300">{shown.toLocaleString()}</b> of{" "}
                <b className="text-gray-600 dark:text-gray-300">{total.toLocaleString()}</b> {noun}
                {hidden > 0 ? (
                    <>
                        {" "}
                        — <b className="text-amber-600 dark:text-amber-400">{hidden.toLocaleString()} not listed</b>, because the
                        request capped the list.
                    </>
                ) : (
                    " — the cap was not reached."
                )}
            </p>
        );
    }
    return (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
            Listing <b className="text-gray-600 dark:text-gray-300">{shown.toLocaleString()}</b> {noun}.{" "}
            {capNote || "This endpoint returns no uncapped total, so matches beyond the cap cannot be counted from here."}
        </p>
    );
}

/** Plain table shell. No chart or grid library involved. */
function Table({ head, children, minWidth = 520, caption }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ minWidth }}>
                {caption && <caption className="sr-only">{caption}</caption>}
                <thead>
                    <tr>
                        {head.map((h) => (
                            <th
                                key={h.key}
                                scope="col"
                                className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 whitespace-nowrap ${
                                    h.align === "right" ? "text-right" : "text-left"
                                }`}
                            >
                                {h.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{children}</tbody>
            </table>
        </div>
    );
}

const TD = "px-2 py-2 text-xs text-gray-700 dark:text-gray-300 align-middle";
const TD_NUM = `${TD} text-right tabular-nums font-semibold`;
const TD_USER = `${TD} font-mono font-medium text-gray-900 dark:text-gray-100 break-all`;

/* ── Derived read-outs ───────────────────────────────────────────────────── */

/**
 * One plain-language sentence about the shape of the graph, from the numbers
 * only. Deliberately says what an admin should DO about it, not what it is.
 */
function graphVerdict(o) {
    if (!o) return null;
    const users = o.users ?? 0;
    if (users === 0) {
        return {
            tone: "info",
            head: "No accounts exist yet.",
            clauses: [
                "There is nothing to measure and nothing wrong. Every figure on this page is a lower bound of zero, which is only meaningful because the denominator is also zero.",
            ],
        };
    }
    const edges = o.edges ?? 0;
    if (edges === 0) {
        return {
            tone: "danger",
            head: "No follow has ever been made.",
            clauses: [
                `${users.toLocaleString()} account${users === 1 ? "" : "s"} exist and not one connection joins any of them. The social graph is empty: every account is isolated, and no feed can be personalised for anyone.`,
                "Check that the follow control is reachable from the UI before treating this as a community problem rather than a wiring problem.",
            ],
        };
    }

    const isoPct = o.accounts?.isolatedPct;
    const oneWayPct = edges > 0 ? (o.oneWayEdges / edges) * 100 : null;
    const dangPct = o.danglingPct;

    let head;
    if (isoPct === null || isoPct === undefined) {
        head = "Isolation cannot be expressed as a percentage — the account count is the denominator and it is unavailable.";
    } else if (isoPct >= 70) {
        head = `This is a dust cloud: ${isoPct}% of accounts have no connections at all.`;
    } else if (isoPct >= 40) {
        head = `A large share of accounts are disconnected — ${isoPct}% neither follow anyone nor are followed.`;
    } else if (isoPct >= 20) {
        head = `${isoPct}% of accounts are isolated; the rest of the graph is connected.`;
    } else {
        head = `The graph is genuinely connected: only ${isoPct}% of accounts have no connection in either direction.`;
    }

    const clauses = [];
    if (oneWayPct !== null && oneWayPct !== undefined && oneWayPct >= 10) {
        clauses.push(
            `${oneWayPct.toFixed(1)}% of follows exist on one side only. That is not a user preference, it is a follow write that did not finish — see Integrity.`,
        );
    }
    if (dangPct !== null && dangPct !== undefined && dangPct >= 1) {
        clauses.push(
            `${dangPct}% of follows point at usernames that no longer exist, so those edges inflate the edge count without connecting anybody.`,
        );
    }
    if (isoPct !== null && isoPct !== undefined && isoPct >= 40) {
        clauses.push(
            "The useful next number is not posts — it is how many of the isolated accounts posted anything at all. See Ghosts, where the registered-and-left share is a first-run-experience problem rather than a moderation one.",
        );
    }

    const danger =
        (isoPct !== null && isoPct !== undefined && isoPct >= 70) || (dangPct !== null && dangPct !== undefined && dangPct >= 10);
    const warn =
        (isoPct !== null && isoPct !== undefined && isoPct >= 40) ||
        (oneWayPct !== null && oneWayPct !== undefined && oneWayPct >= 10) ||
        (dangPct !== null && dangPct !== undefined && dangPct >= 1);

    return { tone: danger ? "danger" : warn ? "warn" : "ok", head, clauses };
}

/** YYYY-MM -> "Jan 26" */
const monthLabel = (key) => {
    const [y, m] = key.split("-").map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return key;
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
};

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Panel                                                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

export default function NetworkPage() {
    const { showToast } = useToast();

    const [sub, setSub] = useState("health");
    const [minFollowing, setMinFollowing] = useState(50);

    // One slot per endpoint so a single failure is contained to its own card.
    const [data, setData] = useState({});
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState({});

    // Loaded-once bookkeeping lives in a ref, not in `data`, so the effect
    // below does not re-run every time a response lands.
    const loadedRef = useRef({});

    /** A good response: mark the slot read, store it, clear any old failure. */
    const accept = useCallback((key, d) => {
        loadedRef.current[key] = true;
        setData((d0) => ({ ...d0, [key]: d }));
        setErrors((e) => ({ ...e, [key]: null }));
    }, []);

    /**
     * A bad response. A stale successful value is worse than none here: every
     * figure on this page is a lower bound, and a lower bound from an older scan
     * would quietly understate the current one. `announce` is for the automatic
     * loads, where a failure on a tab nobody is looking at would otherwise be
     * invisible; a Retry the admin just pressed speaks for itself.
     */
    const reject = useCallback(
        (key, e, announce) => {
            delete loadedRef.current[key];
            setData((d0) => {
                const next = { ...d0 };
                delete next[key];
                return next;
            });
            const text = errText(e);
            setErrors((e0) => ({ ...e0, [key]: text }));
            if (announce) showToast(`Network: ${text}`, "error");
        },
        [showToast],
    );

    /** User-initiated refetch: marks the slot pending, then forces a re-read. */
    const refresh = useCallback(
        (key, path) => {
            setBusy((b) => ({ ...b, [key]: true }));
            callApi(path, { cache: "no-store" })
                .then((d) => accept(key, d))
                .catch((e) => reject(key, e, false))
                .finally(() => setBusy((b) => ({ ...b, [key]: false })));
        },
        [accept, reject],
    );

    // Only what the visible tab needs. /overview and /degrees are shared
    // between two tabs each, and the loaded-once guard makes that free.
    const jobs = useMemo(() => {
        const list = [];
        if (sub === "health" || sub === "integrity") list.push(["overview", `${API}/overview`]);
        if (sub === "health" || sub === "degree") list.push(["degrees", `${API}/degrees?limit=25`]);
        if (sub === "integrity") list.push(["asym", `${API}/asymmetric?limit=100`]);
        if (sub === "degree") list.push(["reach", `${API}/reach?limit=25`]);
        if (sub === "spam") list.push(["outliers", `${API}/ratio-outliers?limit=25&minFollowing=${minFollowing}`]);
        if (sub === "ghosts") list.push(["ghosts", `${API}/ghosts?limit=50`]);
        if (sub === "blocks") list.push(["mod", `${API}/moderation-edges`]);
        return list;
    }, [sub, minFollowing]);

    /**
     * Read the graph. The effect body only touches the network; every state
     * write happens in a promise callback, which is the shape that avoids a
     * cascading render. A response belonging to a tab the admin has already
     * left is dropped, and because it never marked the slot as read, the next
     * effect run re-requests it.
     */
    useEffect(() => {
        let alive = true;
        for (const [key, path] of jobs) {
            if (loadedRef.current[key]) continue;
            callApi(path, { cache: "no-store" })
                .then((d) => {
                    if (alive) accept(key, d);
                })
                .catch((e) => {
                    if (alive) reject(key, e, true);
                });
        }
        return () => {
            alive = false;
        };
    }, [jobs, accept, reject]);

    const o = data.overview || null;
    const scanCap = typeof o?.scanCap === "number" ? o.scanCap : SCAN_CAP;

    const verdict = useMemo(() => graphVerdict(o), [o]);

    const current = TABS.find((t) => t.id === sub) || TABS[0];

    return (
        <div className="space-y-4">
            {/* ── Section switch ──────────────────────────────────────────── */}
            <div
                role="tablist"
                aria-label="Network sections"
                className="flex gap-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-1 w-fit max-w-full overflow-x-auto"
            >
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        id={`net-tab-${t.id}`}
                        type="button"
                        role="tab"
                        aria-selected={sub === t.id}
                        aria-controls={`net-panel-${t.id}`}
                        onClick={() => setSub(t.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                            sub === t.id
                                ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div
                id={`net-panel-${sub}`}
                role="tabpanel"
                aria-labelledby={`net-tab-${sub}`}
                tabIndex={0}
                className="min-w-0 focus-visible:outline-none"
            >
                {sub === "health" && (
                    <HealthTab
                        overview={o}
                        overviewError={errors.overview}
                        degrees={data.degrees || null}
                        degreesError={errors.degrees}
                        busy={busy}
                        verdict={verdict}
                        scanCap={scanCap}
                        reload={() => {
                            refresh("overview", `${API}/overview`);
                            refresh("degrees", `${API}/degrees?limit=25`);
                        }}
                    />
                )}
                {sub === "integrity" && (
                    <IntegrityTab
                        overview={o}
                        overviewError={errors.overview}
                        asym={data.asym || null}
                        asymError={errors.asym}
                        busy={busy}
                        scanCap={scanCap}
                        reload={() => refresh("asym", `${API}/asymmetric?limit=100`)}
                        reloadOverview={() => refresh("overview", `${API}/overview`)}
                    />
                )}
                {sub === "degree" && (
                    <DegreeTab
                        degrees={data.degrees || null}
                        degreesError={errors.degrees}
                        reach={data.reach || null}
                        reachError={errors.reach}
                        busy={busy}
                        scanCap={scanCap}
                        reload={() => {
                            refresh("degrees", `${API}/degrees?limit=25`);
                            refresh("reach", `${API}/reach?limit=25`);
                        }}
                    />
                )}
                {sub === "spam" && (
                    <SpamTab
                        outliers={data.outliers || null}
                        outliersError={errors.outliers}
                        busy={busy}
                        scanCap={scanCap}
                        minFollowing={minFollowing}
                        setMinFollowing={setMinFollowing}
                        apply={() => refresh("outliers", `${API}/ratio-outliers?limit=25&minFollowing=${minFollowing}`)}
                    />
                )}
                {sub === "ghosts" && (
                    <GhostsTab
                        ghosts={data.ghosts || null}
                        ghostsError={errors.ghosts}
                        busy={busy}
                        scanCap={scanCap}
                        reload={() => refresh("ghosts", `${API}/ghosts?limit=50`)}
                    />
                )}
                {sub === "blocks" && (
                    <BlocksTab
                        mod={data.mod || null}
                        modError={errors.mod}
                        busy={busy}
                        scanCap={scanCap}
                        reload={() => refresh("mod", `${API}/moderation-edges`)}
                    />
                )}
            </div>

            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed pb-2">
                Every figure on this page is a <b>lower bound</b>. Each endpoint walks the user collection in one pass with a hard
                ceiling of {scanCap.toLocaleString()} accounts, and the tab you are on is the only one that has been read:{" "}
                {current.label} reports on its own endpoints alone.
            </p>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  1. Health                                                                */
/* ══════════════════════════════════════════════════════════════════════════ */

function HealthTab({ overview: o, overviewError, degrees, degreesError, busy, verdict, scanCap, reload }) {
    if (overviewError && !o) {
        return <ErrorBox message={`Could not load the graph overview: ${overviewError}`} onRetry={reload} />;
    }
    if (!o) return <Spinner label="Loading graph overview…" />;

    const a = o.accounts || {};

    /* `degrees.accounts` is the node count of the graph map. The three
     * `withOutgoing` / `withIncoming` / `isolated` figures overlap (an account
     * that both follows and is followed lands in two of them), so they cannot
     * be summed into a donut. Isolated-vs-the-rest is the only clean split the
     * API supports, and the rest needs the node count to compute. */
    const nodeCount = typeof degrees?.accounts === "number" ? degrees.accounts : null;
    const donut =
        nodeCount !== null
            ? [
                  { label: "Connected (follows, or is followed)", count: Math.max(0, nodeCount - (a.isolated ?? 0)) },
                  { label: "Isolated (no follow either way)", count: a.isolated ?? 0 },
              ]
            : null;

    const oneWayPct = o.edges > 0 ? Number(((o.oneWayEdges / o.edges) * 100).toFixed(1)) : null;

    return (
        <div className="space-y-4">
            <ScanCapWarning truncated={o.truncated} scanCap={o.scanCap} />

            {/* ── The headline verdict ───────────────────────────────────── */}
            {verdict && (
                <div
                    className={`rounded-2xl border p-4 sm:p-5 ${
                        verdict.tone === "danger"
                            ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
                            : verdict.tone === "warn"
                              ? "border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/25"
                              : verdict.tone === "ok"
                                ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20"
                                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                    }`}
                >
                    <div className="flex items-start gap-2.5">
                        <span
                            className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                                verdict.tone === "danger"
                                    ? "bg-red-500"
                                    : verdict.tone === "warn"
                                      ? "bg-amber-500"
                                      : verdict.tone === "ok"
                                        ? "bg-emerald-500"
                                        : "bg-gray-400"
                            }`}
                        />
                        <div className="min-w-0 flex-1">
                            <p
                                className={`text-sm font-bold ${
                                    verdict.tone === "danger"
                                        ? "text-red-900 dark:text-red-200"
                                        : verdict.tone === "warn"
                                          ? "text-amber-900 dark:text-amber-200"
                                          : verdict.tone === "ok"
                                            ? "text-emerald-900 dark:text-emerald-200"
                                            : "text-gray-900 dark:text-gray-100"
                                }`}
                            >
                                {verdict.head}
                            </p>
                            {verdict.clauses.length > 0 && (
                                <ul className="mt-2 space-y-1.5">
                                    {verdict.clauses.map((c) => (
                                        <li
                                            key={c}
                                            className={`text-xs leading-relaxed ${
                                                verdict.tone === "danger"
                                                    ? "text-red-800 dark:text-red-300"
                                                    : verdict.tone === "warn"
                                                      ? "text-amber-800 dark:text-amber-300"
                                                      : "text-gray-600 dark:text-gray-300"
                                            }`}
                                        >
                                            {c}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── The numbers ────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard
                    label="Accounts"
                    value={numText(o.users)}
                    icon="👤"
                    hint={o.truncated ? `at least this many · cap ${numText(scanCap)}` : "in the scanned range"}
                />
                <StatCard
                    label="Follows"
                    value={numText(o.edges)}
                    icon="🔗"
                    hint={o.danglingFollows > 0 ? `${numText(o.danglingFollows)} point at deleted accounts` : "every target exists"}
                />
                <StatCard
                    label="Reciprocity"
                    value={pctText(o.reciprocityPct)}
                    icon="🔁"
                    hint={o.reciprocityPct === null ? "no follows exist yet" : `${numText(o.reciprocalEdges)} mutual of ${numText(o.edges)}`}
                />
                <StatCard
                    label="Isolated accounts"
                    value={numText(a.isolated)}
                    icon="🕳️"
                    hint={a.isolatedPct === null ? "no accounts to divide by" : `${a.isolatedPct}% of the account count`}
                />
                <StatCard
                    label="Dangling follows"
                    value={numText(o.danglingFollows)}
                    icon="🧟"
                    hint={o.danglingPct === null ? "no follows exist yet" : `${o.danglingPct}% of all follows`}
                />
                <StatCard
                    label="Density"
                    value={o.density === null || o.density === undefined ? "—" : String(o.density)}
                    icon="🕸️"
                    hint="follows ÷ (n × (n−1))"
                />
            </div>

            {/* ── Density, explained before anyone panics about it ────────── */}
            <Note tone="info" title="A very small density is normal, not a fault.">
                Density here is the directed-graph definition: every follow divided by every ordered pair of accounts that{" "}
                <i>could</i> follow each other, so the denominator grows as n². On a network of{" "}
                {(o.users ?? 0).toLocaleString()} accounts that denominator is{" "}
                {numText((o.users ?? 0) * ((o.users ?? 0) - 1))} possible directed edges, and a perfectly healthy young
                network fills a tiny fraction of them.{" "}
                {o.density === null || o.density === undefined
                    ? "Density is null here because that denominator is zero — fewer than two accounts exist, so there is no pair to divide by."
                    : `A figure like ${o.density} is what a real, sparsely-populated social graph looks like. Read it as a shape, never as a score: the number to act on is isolated accounts, not density.`}
            </Note>

            {/* ── Shape of the graph ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={CARD}>
                    <h3 className={`${HEADING} mb-1`}>Connected vs isolated</h3>
                    <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                        The single most useful split: an account with no follow in either direction gets no feed, no follower count
                        and no notification, whatever it posts.
                    </p>

                    {donut === null ? (
                        <div className="space-y-2">
                            <ErrorBox
                                message={
                                    degreesError
                                        ? `Degree data needed to split the graph is unavailable: ${degreesError}`
                                        : "Degree data needed to split the graph has not loaded yet."
                                }
                                onRetry={degreesError ? reload : undefined}
                            />
                            {busy.degrees && <Spinner label="Loading node count…" />}
                        </div>
                    ) : (
                        <>
                            <DonutChart data={donut} />
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
                                Centre figure is the {numText(nodeCount)} accounts in the graph map (its caption reads &ldquo;events&rdquo;
                                regardless of what is plotted).
                            </p>
                        </>
                    )}

                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                        <Kv k="with outgoing" v={`${numText(a.withOutgoing)} follow someone`} />
                        <Kv k="with incoming" v={`${numText(a.withIncoming)} are followed`} />
                        <Kv k="isolated" v={`${numText(a.isolated)} do neither`} />
                        <Kv k="isolated share" v={pctText(a.isolatedPct)} />
                    </div>

                    <div className="mt-3 space-y-2">
                        <Note tone="warn" title="Those three counts overlap — do not add them.">
                            An account that follows somebody <i>and</i> is followed by somebody appears in both
                            &ldquo;with outgoing&rdquo; and &ldquo;with incoming&rdquo;, so their sum is larger than the
                            account count. The ring above uses the only clean split the API offers: isolated versus everything else.
                            <br />
                            <br />
                            A second caveat: the three counts are measured over the graph&rsquo;s node map, which also holds
                            usernames that appear only as a follow target — including accounts that have been deleted. The
                            percentage, however, is divided by the account count from a different total. The two are close when
                            there are no deleted accounts and drift apart as deletions accumulate.
                        </Note>
                    </div>
                </div>

                <div className={`${CARD} space-y-3`}>
                    <div>
                        <h3 className={`${HEADING} mb-1`}>Edge integrity</h3>
                        <p className={`${SUBTLE} leading-relaxed`}>
                            A follow is stored twice — once on each endpoint — so the two copies can be compared exactly.
                        </p>
                    </div>

                    {overviewError && <ErrorBox message={overviewError} onRetry={reload} />}

                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <Kv k="total follows" v={numText(o.edges)} />
                        <Kv k="mutual" v={`${numText(o.reciprocalEdges)} — both sides recorded it`} />
                        <Kv k="one-way" v={`${numText(o.oneWayEdges)}${oneWayPct === null ? "" : ` (${oneWayPct}%)`}`} />
                        <Kv k="one-way share" v={pctText(oneWayPct)} />
                        <Kv k="dangling" v={`${numText(o.danglingFollows)}${o.danglingPct === null ? "" : ` (${o.danglingPct}%)`}`} />
                    </div>

                    {oneWayPct !== null && oneWayPct > 0 && (
                        <Note tone="warn" title={`${numText(o.oneWayEdges)} follows exist on one side only.`}>
                            These are not one-way friendships — the product has no such concept. Each is a follow write that updated
                            one document and not the other, so the follower&rsquo;s own view disagrees with everybody else&rsquo;s.
                            The Integrity tab lists them.
                        </Note>
                    )}
                    {oneWayPct === 0 && (o.edges ?? 0) > 0 && (
                        <Note tone="ok" title="Every follow is recorded on both sides.">
                            No half-finished writes were found. Reciprocity of{" "}
                            {pctText(o.reciprocityPct)} means the redundant storage is being kept consistent.
                        </Note>
                    )}

                    {o.note && (
                        <Note tone="info" title="What the server says about this number.">
                            {o.note}
                        </Note>
                    )}

                    <Note tone="warn" title="What the graph cannot see at all.">
                        A follow request to a <b>private</b> account writes no edge — it goes to that account&rsquo;s{" "}
                        <code className="text-[10px]">pendingFollowRequests</code>, which this API never reads. So every un-accepted
                        request is invisible here, and the graph can look sparser than the real relationship count. Pending
                        requests are not counted as follows, as isolated accounts, or as ghosts.
                    </Note>
                </div>
            </div>

            {/* ── Degree distribution preview ────────────────────────────── */}
            <div className={CARD}>
                <div className="min-w-0 mb-1">
                    <h3 className={HEADING}>Degree distribution</h3>
                    <p className={`${SUBTLE} mt-0.5`}>Accounts per total-connection band, the full shape rather than the top of it.</p>
                </div>
                <BucketBars buckets={degrees?.buckets} error={degreesError} busy={busy.degrees} onRetry={reload} />
            </div>
        </div>
    );
}

function BucketBars({ buckets, error, busy, onRetry }) {
    if (error && !buckets) {
        return <ErrorBox message={`Could not load the degree distribution: ${error}`} onRetry={onRetry} />;
    }
    if (!buckets) {
        return busy ? <Spinner label="Loading degree distribution…" /> : <p className="text-xs text-gray-400 py-4 text-center">No distribution data.</p>;
    }

    const rows = BUCKET_ORDER.map((k) => ({ k, n: Number(buckets[k]) || 0 }));
    const max = Math.max(1, ...rows.map((r) => r.n));
    const total = rows.reduce((s, r) => s + r.n, 0);

    return (
        <>
            {/* Plain CSS bars — no chart library, no graph visualisation library. */}
            <ul className="space-y-1.5">
                {rows.map((r) => (
                    <li key={r.k} className="flex items-center gap-2.5 min-w-0">
                        <span className="w-16 shrink-0 text-[11px] font-semibold text-gray-500 dark:text-gray-400 text-right tabular-nums">
                            {r.k}
                        </span>
                        <span className="flex-1 min-w-0 h-6 rounded-md bg-gray-100 dark:bg-gray-800 overflow-hidden">
                            <span
                                className={`block h-full rounded-md ${r.k === "0" ? "bg-red-400 dark:bg-red-500" : "bg-[#1cb0f6]"}`}
                                style={{ width: `${(r.n / max) * 100}%`, minWidth: r.n > 0 ? "2px" : "0" }}
                            />
                        </span>
                        <span className="w-12 shrink-0 text-[11px] font-bold text-gray-700 dark:text-gray-300 tabular-nums">
                            {r.n.toLocaleString()}
                        </span>
                        <span className="w-12 shrink-0 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                            {total > 0 ? `${Math.round((r.n / total) * 100)}%` : "—"}
                        </span>
                    </li>
                ))}
            </ul>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
                Bands are total connections (following + followers) per account, over {numText(total)} accounts in the graph map.
                The leftmost band is the one that matters: it is the population with no social life at all.
            </p>
        </>
    );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  2. Integrity                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

function IntegrityTab({ overview: o, overviewError, asym, asymError, busy, scanCap, reload, reloadOverview }) {
    if (asymError && !asym) {
        return <ErrorBox message={`Could not load asymmetric follows: ${asymError}`} onRetry={reload} />;
    }
    if (!asym) return <Spinner label="Scanning both sides of every follow…" />;

    const rows = asym.rows || [];
    const total = asym.total ?? 0;
    const shown = asym.shown ?? rows.length;
    const hidden = Math.max(0, total - shown);

    return (
        <div className="space-y-4">
            <ScanCapWarning truncated={asym.truncated} scanCap={scanErrorlessCap(o, asym)} />

            {/* ── The headline card: unfinished writes ───────────────────── */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5 bg-white dark:bg-gray-900">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                        <h3 className="text-base font-extrabold text-gray-900 dark:text-gray-100">Unfinished follow writes</h3>
                        <p className={`${SUBTLE} mt-0.5 leading-relaxed max-w-2xl`}>
                            A data-integrity bug list, not a report of how people use the product. There is no one-way follow in this
                            app: if A follows B, both documents are supposed to say so.
                        </p>
                    </div>
                    {busy.asym && <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">Rescanning…</span>}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <StatCard label="Asymmetric follows" value={numText(total)} icon="⚠️" hint={total === 0 ? "no half-written follows" : "one side only"} />
                    <StatCard label="Listed here" value={numText(shown)} icon="📋" hint={hidden > 0 ? `${numText(hidden)} beyond the request cap` : "the request cap was not hit"} />
                    <StatCard label="of all follows" value={o ? pctText(o.edges > 0 ? Number(((total / o.edges) * 100).toFixed(1)) : null) : "—"} icon="📊" hint={o && o.edges > 0 ? `${numText(o.edges)} follows scanned` : "follow total unavailable"} />
                    <StatCard label="Reciprocity" value={o ? pctText(o.reciprocityPct) : "—"} icon="🔁" hint={o && o.reciprocityPct === null ? "no follows exist yet" : "mutual follows"} />
                </div>

                <div className="mt-4 space-y-2">
                    {total === 0 ? (
                        <Note tone="ok" title="No half-finished follow writes.">
                            Every follow in the scanned range is present on both endpoints. The redundant storage is consistent, so
                            nobody&rsquo;s follower count disagrees with another account&rsquo;s view of it.
                        </Note>
                    ) : (
                        <Note tone="danger" title="Each of these means the follower's view disagrees with everyone else's.">
                            The follow endpoint pushes the two documents in a single concurrent save, so a row here is a save where
                            one side landed and the other did not — a partial failure, a duplicate key, or a write that was
                            interrupted. The visible consequence is not cosmetic: the person who followed sees themselves in the
                            wrong list, the account they followed cannot see or respond to them, and any unfollow will not clean up
                            the side that was never written.{" "}
                            {hidden > 0 && (
                                <>
                                    The list above is capped at the requested limit, so {numText(hidden)} more exist and are not
                                    shown.
                                </>
                            )}
                        </Note>
                    )}

                    {asymError && <ErrorBox message={asymError} onRetry={reload} />}

                    {asym.note && (
                        <Note tone="info" title="The server&rsquo;s own description.">
                            {asym.note}
                        </Note>
                    )}

                    <ListCap shown={shown} total={total} noun="asymmetric follows found" />

                    <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                        Two different caps are in play here and they are reported by two different fields.{" "}
                        <b>Request cap</b> — the {numText(shown)} above, the most this response will list, discovered by comparing{" "}
                        <code className="text-[10px]">total</code> with <code className="text-[10px]">shown</code>.{" "}
                        <b>Scan cap</b> — the {numText(scanCap)}-account ceiling, reported by{" "}
                        <code className="text-[10px]">truncated</code> above, which means the <i>underlying graph itself</i> is
                        partial and every count here is a minimum. Dangling follows are excluded from this list by design and are
                        reported on their own below.
                    </p>
                </div>

                {rows.length > 0 && (
                    <div className="mt-4">
                        <Table
                            caption="Follows recorded on one account but not returned by the other"
                            head={[
                                { key: "follower", label: "follower" },
                                { key: "arrow", label: "" },
                                { key: "followee", label: "does not list them back" },
                            ]}
                            minWidth={420}
                        >
                            {rows.map((r, i) => (
                                <tr key={`${r.follower}->${r.followee}-${i}`}>
                                    <td className={TD_USER}>@{r.follower}</td>
                                    <td className={`${TD} text-center text-gray-300 dark:text-gray-600`}>→</td>
                                    <td className={TD_USER}>@{r.followee}</td>
                                </tr>
                            ))}
                        </Table>
                    </div>
                )}
            </div>

            {/* ── Dangling follows ───────────────────────────────────────── */}
            <div className={CARD}>
                <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                    <div className="min-w-0">
                        <h3 className={HEADING}>Dangling follows</h3>
                        <p className={`${SUBTLE} mt-0.5`}>Follows pointing at usernames that no longer exist.</p>
                    </div>
                    {overviewError && (
                        <button type="button" onClick={reloadOverview} className={`${BTN_GHOST} shrink-0`}>
                            Retry overview
                        </button>
                    )}
                </div>

                {overviewError ? (
                    <ErrorBox message={`Could not load the follow totals: ${overviewError}`} onRetry={reloadOverview} />
                ) : !o ? (
                    <Spinner label="Loading follow totals…" />
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <StatCard
                                label="Dangling follows"
                                value={numText(o.danglingFollows)}
                                icon="🧟"
                                hint={o.danglingPct === null ? "no follows exist yet" : `${o.danglingPct}% of all follows`}
                            />
                            <StatCard label="All follows" value={numText(o.edges)} icon="🔗" hint="in the scanned range" />
                            <StatCard label="Reciprocity" value={pctText(o.reciprocityPct)} icon="🔁" hint={o.reciprocityPct === null ? "no follows exist yet" : "measured exactly, both sides compared"} />
                        </div>

                        {(o.danglingFollows ?? 0) > 0 ? (
                            <div className="mt-3 space-y-2">
                                <Note tone="warn" title="These edges connect nobody.">
                                    The username has been deleted but the accounts that followed it still carry the name. Every
                                    dangling follow inflates the edge count, the density figure and the average degree without
                                    putting a single person within reach of another — so the graph looks healthier than it is.
                                    The names themselves are not listed by any endpoint here, so the cleanup has to happen where the
                                    accounts are deleted rather than from this page.
                                </Note>
                            </div>
                        ) : (
                            o.edges > 0 && (
                                <div className="mt-3">
                                    <Note tone="ok" title="Every follow points at an account that exists.">
                                        No account was deleted without the follows pointing at it being cleaned up.
                                    </Note>
                                </div>
                            )
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

/** /asymmetric reports no scanCap of its own, so the overview's is used. */
function scanErrorlessCap(o, fallback) {
    if (typeof o?.scanCap === "number") return o.scanCap;
    if (fallback?.truncated) return SCAN_CAP;
    return null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  3. Degree                                                                */
/* ══════════════════════════════════════════════════════════════════════════ */

function DegreeTab({ degrees, degreesError, reach, reachError, busy, scanCap, reload }) {
    /* One derivation, above the early returns, so hook order never depends on
     * whether the data has arrived. The table keeps the server's sort (total
     * degree); the two charts re-sort a copy, because an account that follows a
     * lot and an account that is followed a lot are different animals. */
    const { top, accounts, zeroBucket, zeroShare, byFollowing, byFollowers } = useMemo(() => {
        const t = degrees?.top || [];
        const acc = typeof degrees?.accounts === "number" ? degrees.accounts : null;
        const zb = Number(degrees?.buckets?.["0"]) || 0;
        return {
            top: t,
            accounts: acc,
            zeroBucket: zb,
            zeroShare: acc && acc > 0 ? Math.round((zb / acc) * 100) : null,
            byFollowing: [...t].sort((a, b) => b.following - a.following),
            byFollowers: [...t].sort((a, b) => b.followers - a.followers),
        };
    }, [degrees]);

    if (degreesError && !degrees) {
        return <ErrorBox message={`Could not load degrees: ${degreesError}`} onRetry={reload} />;
    }
    if (!degrees) return <Spinner label="Loading degree distribution…" />;

    return (
        <div className="space-y-4">
            <ScanCapWarning truncated={degrees.truncated} scanCap={scanCap} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Accounts in the map" value={numText(accounts)} icon="🗺" hint="distinct usernames with a connection" />
                <StatCard label="No connections" value={numText(zeroBucket)} icon="🕳️" hint={zeroShare === null ? "share unavailable" : `${zeroShare}% of the map`} />
                <StatCard label="Shown in the table" value={numText(top.length)} icon="📋" hint="the most-connected accounts" />
                <StatCard
                    label="Highest total"
                    value={top.length > 0 ? numText(top[0].total) : "—"}
                    icon="🏔️"
                    hint={top.length > 0 ? `@${top[0].username}` : "no connections exist"}
                />
            </div>

            <Note tone="info" title="A long tail of zeros is the expected shape for a young network, not a fault.">
                A social network looks like a few hubs with very high degree and a long flat tail of accounts with almost none.
                That is normal, and it stays normal for years. The number worth reacting to is the size of the zero band:{" "}
                {zeroShare === null ? (
                    "the share cannot be computed because the account count is unavailable."
                ) : (
                    <>
                        <b>{zeroShare}%</b> of the map sits in it
                        {zeroShare >= 50 ? ", which is the dust-cloud case Health warns about." : "."}
                    </>
                )}{" "}
                A rising top of the table is a warning of its own — it usually means accounts are accumulating connections without
                anyone new joining, rather than new accounts entering the graph.
            </Note>

            <div className={CARD}>
                <h3 className={`${HEADING} mb-1`}>Most connected accounts</h3>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    Sorted by total connections (following + followers). The endpoint returns the top{" "}
                    {numText(top.length === 0 ? 0 : 25)} only, and gives no uncapped total, so accounts ranked{" "}
                    {top.length + 1} and below are not visible from here.
                </p>

                {degreesError && <ErrorBox message={degreesError} onRetry={reload} />}

                {top.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
                        No account has any connection yet, so there is no top of the list.
                    </p>
                ) : (
                    <Table
                        caption="Accounts with the highest total degree"
                        head={[
                            { key: "u", label: "account" },
                            { key: "f", label: "following", align: "right" },
                            { key: "i", label: "followers", align: "right" },
                            { key: "t", label: "total", align: "right" },
                        ]}
                        minWidth={480}
                    >
                        {top.map((r) => (
                            <tr key={r.username} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className={TD_USER}>@{r.username}</td>
                                <td className={TD_NUM}>{numText(r.following)}</td>
                                <td className={TD_NUM}>{numText(r.followers)}</td>
                                <td className={`${TD_NUM} text-gray-900 dark:text-gray-100`}>{numText(r.total)}</td>
                            </tr>
                        ))}
                    </Table>
                )}
            </div>

            <div className={CARD}>
                <h3 className={`${HEADING} mb-1`}>Distribution across the whole map</h3>
                <p className={`${SUBTLE} mb-3`}>Plain bars, so the shape is visible and not only the top of the list.</p>
                <BucketBars buckets={degrees.buckets} busy={busy.degrees} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={CARD}>
                    <h3 className={`${HEADING} mb-1`}>Who follows the most</h3>
                    <p className={`${SUBTLE} mb-3`}>The same rows re-sorted by outgoing edges.</p>
                    {byFollowing.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center">No outgoing edges.</p>
                    ) : (
                        <BarChart data={byFollowing.map((r) => ({ label: r.username, value: r.following }))} color="#1cb0f6" height={180} />
                    )}
                </div>
                <div className={CARD}>
                    <h3 className={`${HEADING} mb-1`}>Who is followed the most</h3>
                    <p className={`${SUBTLE} mb-3`}>The same rows re-sorted by incoming edges — the accounts a post can reach.</p>
                    {byFollowers.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center">No incoming edges.</p>
                    ) : (
                        <BarChart data={byFollowers.map((r) => ({ label: r.username, value: r.followers }))} color="#ce82ff" height={180} />
                    )}
                </div>
            </div>

            {/* ── Reach per post ─────────────────────────────────────────── */}
            <div className={CARD}>
                <h3 className={`${HEADING} mb-1`}>Reach per post</h3>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    Followers divided by posts. This is the number that sets moderation priority: it estimates how many people
                    see a single post, so an account with a huge reach and a handful of posts is the one worth reviewing first.
                </p>

                <ErrorBox message={reachError} onRetry={reload} />
                {busy.reach && !reach && <Spinner label="Counting posts…" />}

                {reach && (
                    <>
                        {reach.note && (
                            <div className="mb-3">
                                <Note tone="info" title="What this number means.">
                                    {reach.note}
                                </Note>
                            </div>
                        )}

                        {reach.rows?.length > 0 ? (
                            <Table
                                caption="Per-account reach per post"
                                head={[
                                    { key: "u", label: "account" },
                                    { key: "f", label: "followers", align: "right" },
                                    { key: "g", label: "following", align: "right" },
                                    { key: "p", label: "posts", align: "right" },
                                    { key: "r", label: "reach / post", align: "right" },
                                ]}
                                minWidth={520}
                            >
                                {reach.rows.map((r) => (
                                    <tr key={r.username} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className={TD_USER}>@{r.username}</td>
                                        <td className={TD_NUM}>{numText(r.followers)}</td>
                                        <td className={TD_NUM}>{numText(r.following)}</td>
                                        <td className={TD_NUM}>{numText(r.posts)}</td>
                                        <td className={TD_NUM}>
                                            {r.reachPerPost === null || r.reachPerPost === undefined ? (
                                                <span className="text-gray-400 dark:text-gray-500 font-normal" title="This account has posted nothing, so there is no post to divide by. Not the same as a reach of zero.">
                                                    —<span className="block text-[10px] font-normal">no posts</span>
                                                </span>
                                            ) : (
                                                numText(r.reachPerPost)
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </Table>
                        ) : (
                            !busy.reach && <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No account has any followers yet.</p>
                        )}

                        <div className="mt-3 space-y-2">
                            <ScanCapWarning truncated={reach.truncated} scanCap={scanCap} />
                            <ListCap
                                shown={reach.rows?.length || 0}
                                total={null}
                                noun="accounts"
                                capNote="This endpoint returns at most 25 rows and no uncapped total, so accounts outside that page — and how many there are — cannot be counted from here."
                            />
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                                Post counts come from a second query that is itself capped at {numText(scanCap)} documents, so a
                                heavily-posting account can report a lower post count than it really has — which would make its
                                reach per post read high.
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  4. Spam signals                                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

function SpamTab({ outliers, outliersError, busy, scanCap, minFollowing, setMinFollowing, apply }) {
    const draft = minFollowing;
    const clampedOut = outliers && typeof outliers.minFollowing === "number" ? outliers.minFollowing : null;
    const applied = clampedOut !== null ? clampedOut !== draft : true;

    return (
        <div className="space-y-4">
            {/* ── THE LIMITATION. Deliberately the loudest thing on the tab. ── */}
            <div className="rounded-2xl border-2 border-amber-500 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/25 p-4 sm:p-5">
                <div className="flex items-start gap-2.5">
                    <span className="mt-1 w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold text-amber-900 dark:text-amber-100">
                            Follow-velocity detection does not exist here, and cannot be built from the data that is stored.
                        </p>
                        <p className="text-xs text-amber-800 dark:text-amber-200 mt-1.5 leading-relaxed">
                            There is <b>no timestamp on a follow</b>. A follow is a username pushed into a plain array on two
                            documents — there is no edge record and no <code className="text-[10px]">createdAt</code>. So the
                            question &ldquo;did this account follow 200 accounts in 10 minutes?&rdquo; has no answer available,
                            at any price, from this database. Any panel that appeared to answer it would be inventing the numbers
                            it displayed.
                        </p>
                        <p className="text-xs font-semibold text-amber-900 dark:text-amber-100 mt-2 leading-relaxed">
                            What <i>is</i> observable, and what this tab uses: the follow-to-follower ratio, and how old the account
                            is. An account following hundreds of people while sitting at zero followers, registered days ago, is
                            the same behaviour seen end-on rather than side-on.
                        </p>
                        {outliers?.limitation && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2 leading-relaxed border-t border-amber-300 dark:border-amber-700 pt-2">
                                Server&rsquo;s own statement, verbatim: <span className="italic">{outliers.limitation}</span>
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Controls ───────────────────────────────────────────────── */}
            <div className={CARD}>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
                    <Field
                        label="Minimum accounts followed before an account is listed"
                        hint={`The server only considers accounts following at least this many, and independently requires a ratio above 5×. It clamps the value to 10–10,000, so anything outside that range is silently replaced — the value actually in force is reported below.`}
                    >
                        <input
                            type="range"
                            min="10"
                            max="500"
                            step="5"
                            value={draft}
                            onChange={(e) => setMinFollowing(Number(e.target.value))}
                            aria-label="Minimum accounts followed before an account is listed"
                            className="w-full h-11 accent-black dark:accent-white"
                        />
                    </Field>
                    <div className="flex items-center gap-2 shrink-0">
                        <input
                            type="number"
                            min="10"
                            max="10000"
                            value={draft}
                            onChange={(e) => setMinFollowing(Number(e.target.value))}
                            aria-label="Minimum accounts followed, exact value"
                            className={`${INPUT} w-24 text-center tabular-nums`}
                        />
                        <button type="button" onClick={apply} disabled={busy.outliers || applied} className={`${BTN_PRIMARY} h-11`}>
                            {busy.outliers ? "Loading…" : "Apply"}
                        </button>
                    </div>
                </div>

                {clampedOut !== null && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                        In force on the server:{" "}
                        <b className="text-gray-600 dark:text-gray-300">{numText(clampedOut)}</b>
                        {clampedOut !== draft ? (
                            <>
                                {" "}
                                — the requested {numText(draft)} was clamped to {numText(clampedOut)}.
                            </>
                        ) : (
                            "."
                        )}
                    </p>
                )}
            </div>

            <ScanCapWarning truncated={outliers?.truncated} scanCap={scanCap} />

            {/* ── The table ──────────────────────────────────────────────── */}
            <div className={CARD}>
                <h3 className={`${HEADING} mb-1`}>Ratio outliers</h3>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    Accounts that follow many more people than follow them back. Sorted by how many they follow, not by how
                    suspicious the ratio looks.
                </p>

                <ErrorBox message={outliersError} onRetry={apply} />
                {busy.outliers && !outliers && <Spinner label="Computing follow ratios…" />}

                {outliers && outliers.rows?.length > 0 && (
                    <Table
                        caption="Accounts following far more than they are followed"
                        head={[
                            { key: "u", label: "account" },
                            { key: "f", label: "following", align: "right" },
                            { key: "i", label: "followers", align: "right" },
                            { key: "r", label: "ratio", align: "right" },
                            { key: "a", label: "age", align: "right" },
                            { key: "n", label: "signal" },
                        ]}
                        minWidth={620}
                    >
                        {outliers.rows.map((r) => (
                            <tr key={r.username} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className={TD_USER}>@{r.username}</td>
                                <td className={TD_NUM}>{numText(r.following)}</td>
                                <td className={TD_NUM}>{numText(r.followers)}</td>
                                <td className={TD_NUM}>
                                    {r.ratio === null || r.ratio === undefined ? (
                                        <span className="text-red-600 dark:text-red-400" title="Zero followers, so following/followers has no finite value. This is the worst case, not a ratio of zero.">
                                            ∞<span className="block text-[10px] font-normal text-gray-400 dark:text-gray-500">no followers</span>
                                        </span>
                                    ) : (
                                        <span className="text-gray-900 dark:text-gray-100">{r.ratio}×</span>
                                    )}
                                </td>
                                <td className={TD_NUM}>
                                    {r.ageDays === null || r.ageDays === undefined ? (
                                        <span className="text-gray-400 dark:text-gray-500 font-normal">unknown</span>
                                    ) : (
                                        `${numText(r.ageDays)}d`
                                    )}
                                </td>
                                <td className={TD}>
                                    {r.newAccount ? (
                                        <Badge tone="danger">NEW · ≤30 DAYS</Badge>
                                    ) : r.ratio === null ? (
                                        <Badge tone="warn">NO FOLLOWERS</Badge>
                                    ) : (
                                        <Badge tone="gray">ratio only</Badge>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </Table>
                )}

                {outliers && outliers.rows?.length === 0 && !busy.outliers && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
                        No account follows {numText(outliers.minFollowing)} or more people with a ratio above 5×. Lower the threshold
                        to look at a smaller following count.
                    </p>
                )}

                {outliers && (
                    <div className="mt-3 space-y-2">
                        <ListCap
                            shown={outliers.rows?.length || 0}
                            total={null}
                            noun="accounts"
                            capNote="This endpoint returns at most 25 rows and no uncapped total, so a longer list of matches may exist without this page being able to say how much longer."
                        />
                        <Note tone="info" title="How to read a row.">
                            <b>New · ≤30 days</b> is the strongest signal available, and it is the only one that does not depend on
                            the graph having grown. <b>No followers</b> means the ratio has no finite value at all, so it is shown
                            as &infin; rather than 0 — an account with zero followers and 200 follows is the worst case, not a
                            healthy one. <b>Ratio only</b> is weaker on its own: an old account that built a following list over
                            years looks identical to a spammer&rsquo;s output when only the ratio is considered.
                        </Note>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                            Absence of a row is not evidence of innocence. The scan is capped at{" "}
                            {numText(scanCap)} accounts and the filter is a threshold, so an account just under the{" "}
                            {numText(outliers.minFollowing)}-follow mark, or outside the scanned range, does not appear here at
                            all.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  5. Ghosts                                                                */
/* ══════════════════════════════════════════════════════════════════════════ */

function GhostsTab({ ghosts, ghostsError, busy, scanCap, reload }) {
    /* Both derivations live above the early returns, so hook order never
     * depends on whether the data has arrived. */
    const { rows, totalIsolated, shown, series, breakdown } = useMemo(() => {
        const r = ghosts?.rows || [];
        const total = ghosts?.totalIsolated ?? r.length;

        // Cumulative isolated accounts by signup month, built from the rows the
        // server returned — so it describes this page and not the whole map,
        // which is stated underneath the chart.
        const byMonth = new Map();
        for (const row of r) {
            const d = row.createdAt ? new Date(row.createdAt) : null;
            const key = d && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "unknown";
            byMonth.set(key, (byMonth.get(key) || 0) + 1);
        }
        const s = Array.from(byMonth.entries())
            .sort((a, b) => {
                if (a[0] === "unknown") return 1;
                if (b[0] === "unknown") return -1;
                return a[0] < b[0] ? -1 : 1;
            })
            .reduce(
                (acc, [key, n]) => [
                    ...acc,
                    { label: key === "unknown" ? "no date" : monthLabel(key), signedUp: n, cumulative: acc.length ? acc[acc.length - 1].cumulative + n : n },
                ],
                [],
            );

        // Post counts are only fetched for the page the server returned, so
        // this breakdown is of the listed rows and cannot be projected onto
        // every isolated account.
        let left = 0;
        let posted = 0;
        let suspended = 0;
        for (const row of r) {
            if (row.kind === "registered-and-left") left += 1;
            else posted += 1;
            if (row.suspended) suspended += 1;
        }

        return {
            rows: r,
            totalIsolated: total,
            shown: r.length,
            series: s,
            breakdown: { left, posted, suspended },
        };
    }, [ghosts]);

    if (ghostsError && !ghosts) {
        return <ErrorBox message={`Could not load isolated accounts: ${ghostsError}`} onRetry={reload} />;
    }
    if (!ghosts) return <Spinner label="Finding accounts connected to nobody…" />;

    return (
        <div className="space-y-4">
            <ScanCapWarning truncated={ghosts.truncated} scanCap={scanCap} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Isolated accounts" value={numText(totalIsolated)} icon="🕳️" hint="zero following, zero followers" />
                <StatCard
                    label="Registered and left"
                    value={numText(breakdown.left)}
                    icon="🚪"
                    hint={shown > 0 ? `${Math.round((breakdown.left / shown) * 100)}% of the ${shown} listed` : "no rows listed"}
                />
                <StatCard
                    label="Posted, unfollowed"
                    value={numText(breakdown.posted)}
                    icon="📝"
                    hint={shown > 0 ? `${Math.round((breakdown.posted / shown) * 100)}% of the ${shown} listed` : "no rows listed"}
                />
                <StatCard label="Suspended" value={numText(breakdown.suspended)} icon="⛔" hint="within the listed rows" />
            </div>

            <Note tone="info" title={ghosts.note || "Accounts connected to nobody."} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 sm:p-5">
                    <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">Mostly a first-run problem, not a moderation one</h3>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-1.5 leading-relaxed">
                        An account that signed up, posted nothing and follows nobody has not broken a rule. It never got far
                        enough to break one. Treating it as abuse — warning it, suspending it, deleting it — removes a
                        registration, not a problem, and hides the real signal.
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-1.5 leading-relaxed">
                        The useful question is what the product showed that account next. Nobody arrives on a follow graph already
                        knowing whom to follow, so a high &ldquo;registered and left&rdquo; share points at onboarding that ends
                        before the first follow: an empty suggested rail, a feed with nothing in it, or a follow button that is
                        easy to miss. A <b>posted but unfollowed</b> account is a different and more concerning shape — it did
                        engage, and still left with no connection, so whatever it saw did not make anyone worth following.
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2 leading-relaxed">
                        Because follows carry no timestamp, none of this can be tracked over time: the two counts are snapshots,
                        and the signup dates below are the only time reference that exists.
                    </p>
                </div>

                <div className={CARD}>
                    <h3 className={`${HEADING} mb-1`}>When they signed up</h3>
                    <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                        Accounts listed here, grouped by signup month. A rising line means the problem is growing; a flat one
                        means it is not being fixed and is merely not worsening.
                    </p>
                    {series.length > 0 ? (
                        <AreaChart
                            data={series}
                            keys={[
                                { field: "signedUp", label: "Signed up that month", color: "#ffc800" },
                                { field: "cumulative", label: "Cumulative isolated", color: "#1cb0f6" },
                            ]}
                            height={200}
                        />
                    ) : (
                        !busy.ghosts && <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No rows to chart.</p>
                    )}
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
                        Built from the {numText(shown)} account{shown === 1 ? "" : "s"} listed below, oldest first — not from the
                        whole isolated population, which is {numText(totalIsolated)}. If the list is capped, this chart is too.
                    </p>
                </div>
            </div>

            <div className={CARD}>
                <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                    <div className="min-w-0">
                        <h3 className={HEADING}>Isolated accounts</h3>
                        <p className={`${SUBTLE} mt-0.5`}>Zero following and zero followers, oldest registration first.</p>
                    </div>
                    {busy.ghosts && <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">Loading…</span>}
                </div>

                <div className="space-y-2 mb-3">
                    <ErrorBox message={ghostsError} onRetry={reload} />
                    <ListCap shown={shown} total={totalIsolated} noun="isolated accounts found" />
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                        Post counts and last-post times are fetched for the listed rows only, so the two-kind breakdown and the
                        post counts describe those rows and cannot be scaled to the{" "}
                        {numText(totalIsolated)} isolated accounts. The post query is itself capped at {numText(scanCap)}{" "}
                        documents, so a prolific poster can read as having fewer posts than it does.
                    </p>
                </div>

                {rows.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
                        {totalIsolated === 0
                            ? "No isolated accounts — every account has at least one connection."
                            : "No rows on this page."}
                    </p>
                ) : (
                    <Table
                        caption="Accounts with no follows in either direction"
                        head={[
                            { key: "u", label: "account" },
                            { key: "k", label: "kind" },
                            { key: "a", label: "age", align: "right" },
                            { key: "p", label: "posts", align: "right" },
                            { key: "l", label: "last post" },
                        ]}
                        minWidth={560}
                    >
                        {rows.map((r) => (
                            <tr key={r.username} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className={TD_USER}>
                                    @{r.username}
                                    {r.suspended && (
                                        <span className="ml-1.5 align-middle">
                                            <Badge tone="danger">SUSPENDED</Badge>
                                        </span>
                                    )}
                                </td>
                                <td className={TD}>
                                    {r.kind === "registered-and-left" ? (
                                        <Badge tone="warn">registered and left</Badge>
                                    ) : (
                                        <Badge tone="info">posted but unfollowed</Badge>
                                    )}
                                </td>
                                <td className={TD_NUM}>
                                    {r.ageDays === null || r.ageDays === undefined ? (
                                        <span className="text-gray-400 dark:text-gray-500 font-normal">unknown</span>
                                    ) : (
                                        `${numText(r.ageDays)}d`
                                    )}
                                </td>
                                <td className={TD_NUM}>{numText(r.posts)}</td>
                                <td className={TD}>
                                    {r.lastPostAt ? (
                                        <span className="text-gray-500 dark:text-gray-400">
                                            {new Date(r.lastPostAt).toLocaleDateString()}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400 dark:text-gray-500">never</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </Table>
                )}
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  6. Blocks & mutes                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

function BlocksTab({ mod, modError, busy, scanCap, reload }) {
    if (modError && !mod) {
        return <ErrorBox message={`Could not load block and mute usage: ${modError}`} onRetry={reload} />;
    }
    if (!mod) return <Spinner label="Reading block and mute lists…" />;

    const sym = mod.symmetry || {};
    const blockedEdges = mod.blockedEdges ?? 0;
    const classified = (sym.symmetric ?? 0) + (sym.oneSided ?? 0);
    const unclassified = Math.max(0, blockedEdges - classified);

    return (
        <div className="space-y-4">
            <ScanCapWarning truncated={mod.truncated} scanCap={scanCap} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Blocked edges" value={numText(blockedEdges)} icon="🚫" hint="entries in blockedUsers arrays" />
                <StatCard label="Muted edges" value={numText(mod.mutedEdges)} icon="🔇" hint="entries in mutedUsers arrays" />
                <StatCard
                    label="Distinct blocked"
                    value={numText(mod.distinctBlockedAccounts)}
                    icon="🎯"
                    hint="unique usernames on somebody's list"
                />
                <StatCard
                    label="One-sided blocks"
                    value={pctText(sym.oneSidedPct)}
                    icon="↔️"
                    hint={
                        sym.oneSidedPct === null || sym.oneSidedPct === undefined
                            ? "nobody has blocked anybody yet"
                            : `${numText(sym.oneSided)} of ${numText(blockedEdges)} block entries`
                    }
                />
            </div>

            {/* ── Symmetry, framed correctly ─────────────────────────────── */}
            <div className="rounded-2xl border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 sm:p-5">
                <div className="flex items-start gap-2.5">
                    <span className="mt-1 w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-blue-900 dark:text-blue-100">
                            A one-sided block is the expected result, not a data-integrity bug.
                        </p>
                        <p className="text-xs text-blue-800 dark:text-blue-200 mt-1.5 leading-relaxed">
                            This looks like the follow check above and it is not the same thing. The block endpoint writes the
                            blocker&rsquo;s own list only — it never adds the blocker to the person they blocked, and it only
                            <i> removes</i> the follow edges between the two. So a block is recorded once, on one side, by
                            design, and a mutual block is the exception rather than the rule.
                        </p>
                        <p className="text-xs text-blue-800 dark:text-blue-200 mt-1.5 leading-relaxed">
                            Read the number as &ldquo;how often two people blocked each other&rdquo;. A high one-sided share is not
                            evidence of a broken write; the consequence is a product one — the blocked account is never told, so
                            it keeps posting into a space where it has been silently excluded, and the blocker&rsquo;s own
                            visibility rules are the only place the block exists.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className={CARD}>
                    <h3 className={`${HEADING} mb-3`}>Block symmetry</h3>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <Kv k="mutual blocks" v={`${numText(sym.symmetric)} — both listed each other`} />
                        <Kv k="one-sided" v={`${numText(sym.oneSided)} — only the blocker recorded it`} />
                        <Kv k="one-sided share" v={pctText(sym.oneSidedPct)} />
                        <Kv k="total block edges" v={numText(blockedEdges)} />
                    </div>

                    {unclassified > 0 && (
                        <div className="mt-2">
                            <Note tone="warn" title={`${numText(unclassified)} block edges are in neither symmetry count.`}>
                                Mutual plus one-sided accounts for {numText(classified)} of {numText(blockedEdges)} entries. The
                                remainder are blocks whose target no longer exists: they are counted as edges, but they cannot be
                                classified as mutual or one-sided because there is no second document to compare them against.
                                That also means the one-sided percentage is divided by a slightly larger base than the counts
                                above it was drawn from, so it reads low.
                            </Note>
                        </div>
                    )}

                    {(sym.oneSidedPct === null || sym.oneSidedPct === undefined) && (
                        <div className="mt-2">
                            <Note tone="info" title="No percentage, because there is no denominator.">
                                One-sided share is only defined when at least one block exists. Showing 0% here would be
                                inventing a measurement.
                            </Note>
                        </div>
                    )}
                </div>

                <div className={CARD}>
                    <h3 className={`${HEADING} mb-1`}>Heaviest blockers</h3>
                    <p className={`${SUBTLE} mb-3`}>Accounts with the most names on their block list.</p>
                    <TopList rows={mod.topBlockers} valueKey="blocked" error={modError} busy={busy.mod} onRetry={reload} />
                </div>

                <div className={CARD}>
                    <h3 className={`${HEADING} mb-1`}>Heaviest muters</h3>
                    <p className={`${SUBTLE} mb-3`}>Accounts with the most names on their mute list — softer, and often just taste.</p>
                    <TopList rows={mod.topMuters} valueKey="muted" error={modError} busy={busy.mod} onRetry={reload} />
                </div>
            </div>

            <Note tone="info" title="Blocks and mutes are mutually exclusive on one account.">
                Blocking someone removes them from that account&rsquo;s mute list and vice versa — the stricter action wins — so
                a single pair never appears on both of the same person&rsquo;s lists. Across the whole instance, though, one
                account can appear as a blocked user on many lists at once, which is what{" "}
                <b>distinct blocked</b> counts: {numText(mod.distinctBlockedAccounts)} unique username
                {mod.distinctBlockedAccounts === 1 ? "" : "s"} currently on somebody&rsquo;s block list. A high figure relative
                to the account count is worth a look, because blocks are also the mechanism by which the graph is pruned.
            </Note>
        </div>
    );
}

function TopList({ rows, valueKey, error, busy, onRetry }) {
    if (error && !rows) return <ErrorBox message={error} onRetry={onRetry} />;
    if (!rows) return busy ? <Spinner /> : null;
    if (rows.length === 0) {
        return <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">Nobody has any.</p>;
    }
    const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
    return (
        <>
            <ul className="space-y-1.5">
                {rows.map((r) => (
                    <li key={r.username} className="flex items-center gap-2.5 min-w-0">
                        <span className="flex-1 min-w-0 truncate font-mono text-[11px] text-gray-800 dark:text-gray-200">@{r.username}</span>
                        <span className="w-20 shrink-0 h-4 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
                            <span
                                className="block h-full rounded bg-[#ff4b6e]"
                                style={{ width: `${((Number(r[valueKey]) || 0) / max) * 100}%`, minWidth: "2px" }}
                            />
                        </span>
                        <span className="w-8 shrink-0 text-right text-[11px] font-bold text-gray-700 dark:text-gray-300 tabular-nums">
                            {numText(r[valueKey])}
                        </span>
                    </li>
                ))}
            </ul>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                {rows.length} of at most 15. The server hard-caps both lists and returns no total, so accounts past 15th place
                are not counted here.
            </p>
        </>
    );
}
