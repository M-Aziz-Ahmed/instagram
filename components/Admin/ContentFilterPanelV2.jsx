"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/context/ToastContext";

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Endpoints                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

const FILTER_URL = "/api/admin/content-filter";
const TEST_URL = `${FILTER_URL}/test`;
const STATS_URL = `${FILTER_URL}/stats`;
const PRESETS_URL = "/api/admin/safety-ops/presets";
const BULK_URL = "/api/admin/safety-ops/bulk-words";
// NOTE: links/check is NOT on the safety-ops router. It lives on the
// content-safety router, mounted at /api/admin/content-safety (server.js).
const LINK_CHECK_URL = "/api/admin/content-safety/links/check";

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Shared style                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

const CARD = "bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5";
const HEADING = "font-semibold text-sm text-gray-900 dark:text-gray-100";
// text-base sm:text-sm: anything under 16px on iOS Safari zooms the viewport on
// focus and the zoom is not recoverable by dismissing the keyboard.
const FIELD = "min-w-0 px-3 py-2.5 min-h-[44px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-gray-100 disabled:opacity-50";
const INPUT = `${FIELD} w-full`;
const SELECT = `${FIELD} w-full appearance-none`;
const SELECT_INLINE = `${FIELD} w-auto appearance-none min-h-[40px] py-1.5 text-xs`;
const BTN_PRIMARY = "min-h-[40px] px-3 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40 transition-colors";
const BTN_GHOST = "min-h-[40px] px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors";
const LABEL = "block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5";
const HINT = "text-xs text-gray-400 dark:text-gray-500 mt-1";

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Word list metadata — the three lists are identical apart from colour      */
/* ═══════════════════════════════════════════════════════════════════════════ */

const WORD_LISTS = {
    toxicWords: {
        label: "Toxic Words",
        blurb: "Client-side blur list. Matching spans are hidden behind a blur until tapped.",
        placeholder: "Add a toxic word...",
        empty: "No toxic words configured.",
        chip: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40",
    },
    nudityKeywords: {
        label: "Nudity Keywords",
        blurb: "Server-side hard block. A write containing one of these is rejected outright.",
        placeholder: "Add a nudity keyword...",
        empty: "No nudity keywords configured.",
        chip: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40",
    },
    allowedWords: {
        label: "Allowlist",
        blurb: "Permitted even when they would otherwise match. Use for brand names that collide with a filtered term.",
        placeholder: "Allow a word...",
        empty: "Allowlist is empty — every match counts.",
        chip: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40",
    },
};

const BULK_TARGETS = [
    { value: "toxicWords", label: "Toxic Words (blur)" },
    { value: "nudityKeywords", label: "Nudity Keywords (hard block)" },
    { value: "allowedWords", label: "Allowlist (exempt)" },
];

const SCOPE_GROUPS = [
    {
        title: "Content",
        keys: [
            ["posts", "Posts"],
            ["comments", "Comments"],
            ["postEdits", "Post edits"],
            ["commentEdits", "Comment edits"],
            ["reposts", "Reposts"],
        ],
    },
    {
        title: "Messaging",
        keys: [
            ["directMessages", "Direct messages"],
            ["groupMessages", "Group messages"],
        ],
    },
    {
        title: "Other",
        keys: [
            ["stories", "Stories"],
            ["bios", "Bios"],
            ["bots", "Bot posts"],
        ],
    },
];

const SCOPE_LABELS = Object.fromEntries(SCOPE_GROUPS.flatMap((g) => g.keys));

const VERDICT_TONE = {
    invalid: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700",
    blocked: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
    allowed: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
    "suspicious-subdomain": "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    permitted: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
};

const VERDICT_LABEL = {
    invalid: "Invalid URL",
    blocked: "Blocked",
    allowed: "Explicitly allowed",
    "suspicious-subdomain": "Suspicious subdomain",
    permitted: "Permitted",
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Helpers                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Read a failure response and never lose the server's own wording.
 *
 * The previous panel toasted a bare "Failed to save" on every non-2xx, which is
 * how a rejected write could report success to the admin. `rejected` is the
 * server naming the exact fields it refused, so it is part of the message.
 */
async function readError(res, fallback) {
    let data = null;
    try {
        data = await res.json();
    } catch {
        data = null;
    }
    const base =
        data && typeof data.error === "string" && data.error.trim()
            ? data.error.trim()
            : `${fallback} (HTTP ${res.status})`;
    const rejected = data && Array.isArray(data.rejected) ? data.rejected.filter(Boolean) : null;
    return { message: rejected && rejected.length ? `${base} — rejected: ${rejected.join("; ")}` : base };
}

function normaliseWord(raw) {
    return String(raw ?? "").trim().toLowerCase();
}

function normaliseDomain(raw) {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];
}

function downloadFile(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function csvCell(value) {
    const s = String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatStamp(value) {
    if (!value) return "never";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Small building blocks                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ToggleRow({ label, hint = "", warn = "", checked, disabled, onChange }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
                {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>}
                {warn && !checked && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{warn}</p>}
            </div>
            {/* The button carries the padding so the tap target is ~40px while
                the visible track keeps the house w-11 h-6 proportions. */}
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className="shrink-0 p-2 -m-2 disabled:opacity-50"
            >
                <span
                    className={`relative block w-11 h-6 rounded-full transition-colors ${
                        checked ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
                    }`}
                >
                    <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            checked ? "translate-x-5" : ""
                        }`}
                    />
                </span>
            </button>
        </div>
    );
}

/**
 * Numeric setting.
 *
 * `draft === null` means "not being edited", so the field renders straight from
 * the server value and no effect has to copy it into local state — which is both
 * a lint problem and a source of two values disagreeing on screen.
 */
function NumberField({ id, label, hint = "", value, min, max, disabled, onCommit }) {
    const { showToast } = useToast();
    const [draft, setDraft] = useState(null);
    const shown = draft === null ? String(value ?? 0) : draft;

    const commit = () => {
        if (draft === null) return;
        const raw = draft;
        setDraft(null);
        const n = Number(raw);
        if (raw.trim() === "" || !Number.isFinite(n)) {
            showToast(`${label}: "${raw}" is not a number`, "error");
            return;
        }
        if (n < min || n > max) {
            showToast(`${label} must be between ${min} and ${max}`, "error");
            return;
        }
        if (n === Number(value)) return;
        onCommit(n);
    };

    return (
        <div className="min-w-0">
            <label htmlFor={id} className={LABEL}>
                {label}
            </label>
            <input
                id={id}
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                value={shown}
                disabled={disabled}
                onFocus={(e) => setDraft(e.target.value)}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                    }
                }}
                className={INPUT}
            />
            {hint && <p className={HINT}>{hint}</p>}
        </div>
    );
}

function WordListCard({ target, words, disabled, onAdd, onRemove }) {
    const meta = WORD_LISTS[target];
    const [draft, setDraft] = useState("");

    const submit = async () => {
        const word = normaliseWord(draft);
        if (!word) return;
        const ok = await onAdd(target, word);
        if (ok) setDraft("");
    };

    return (
        <div className={CARD}>
            <div className="flex items-baseline justify-between gap-3">
                <h3 className={HEADING}>{meta.label}</h3>
                <span className="shrink-0 text-xs tabular-nums text-gray-400 dark:text-gray-500">
                    {words.length} {(words.length === 1 ? "word" : "words")}
                </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-3">{meta.blurb}</p>

            <div className="flex gap-2 items-start">
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    placeholder={meta.placeholder}
                    aria-label={`Add a word to ${meta.label}`}
                    disabled={disabled}
                    className={`${INPUT} flex-1`}
                />
                <button type="button" onClick={submit} disabled={disabled || !draft.trim()} className={BTN_PRIMARY}>
                    Add
                </button>
            </div>

            {words.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">{meta.empty}</p>
            ) : (
                <div className="flex flex-wrap gap-1.5 mt-3">
                    {words.map((word) => (
                        <span
                            key={word}
                            className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-1 text-xs font-medium rounded-lg ${meta.chip}`}
                        >
                            {word}
                            <button
                                type="button"
                                onClick={() => onRemove(target, word)}
                                disabled={disabled}
                                aria-label={`Remove ${word} from ${meta.label}`}
                                className="p-1 -m-0.5 rounded hover:opacity-70 disabled:opacity-40 transition-opacity"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                                </svg>
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

function DomainList({ id, label, hint = "", domains, chipClass, disabled, onAdd, onRemove }) {
    const [draft, setDraft] = useState("");

    const submit = async () => {
        const domain = normaliseDomain(draft);
        if (!domain) return;
        const ok = await onAdd(domain);
        if (ok) setDraft("");
    };

    return (
        <div className="min-w-0">
            <label htmlFor={id} className={LABEL}>
                {label}
            </label>
            <div className="flex gap-2 items-start">
                <input
                    id={id}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    placeholder="example.com"
                    disabled={disabled}
                    className={`${INPUT} flex-1`}
                />
                <button type="button" onClick={submit} disabled={disabled || !draft.trim()} className={BTN_PRIMARY}>
                    Add
                </button>
            </div>
            {hint && <p className={HINT}>{hint}</p>}
            {domains.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">None.</p>
            ) : (
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {domains.map((domain) => (
                        <span
                            key={domain}
                            className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-1 text-xs font-medium rounded-lg ${chipClass}`}
                        >
                            {domain}
                            <button
                                type="button"
                                onClick={() => onRemove(domain)}
                                disabled={disabled}
                                aria-label={`Remove ${domain} from ${label}`}
                                className="p-1 -m-0.5 rounded hover:opacity-70 disabled:opacity-40 transition-opacity"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                                </svg>
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Panel                                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function ContentFilterPanel() {
    const { showToast } = useToast();

    const [filter, setFilter] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [saving, setSaving] = useState(false);
    // What the single in-flight operation is, so the status line can say
    // "Saving" for a write and "Running test" for a read. One lock covers both,
    // and claiming to save while only reading was the old panel's other lie.
    const [pendingLabel, setPendingLabel] = useState("");
    const [rejection, setRejection] = useState(null);

    const [presets, setPresets] = useState(null);
    const [presetMode, setPresetMode] = useState({});
    const [confirmPreset, setConfirmPreset] = useState(null);

    const [bulkText, setBulkText] = useState("");
    const [bulkTarget, setBulkTarget] = useState("toxicWords");
    const [bulkMode, setBulkMode] = useState("merge");
    const [importSummary, setImportSummary] = useState(null);

    const [testText, setTestText] = useState("");
    // Which list the test box exercises. Toxic Words is the default because that
    // is where the reported bug lived ("ass" in the blur list blurring
    // "assistant"); Nudity Keywords is the list the endpoint used to hard-code.
    const [testList, setTestList] = useState("toxicWords");
    const [testResult, setTestResult] = useState(null);

    const [stats, setStats] = useState(null);

    const [checkUrl, setCheckUrl] = useState("");
    const [checkVerdict, setCheckVerdict] = useState(null);

    // `saving` is duplicated in a ref because a React state update is not visible
    // until the next render: two clicks in the same tick would both read
    // `saving === false` and fire two PATCHes whose responses then race, last
    // writer winning and silently discarding the other's field.
    const savingRef = useRef(false);

    const locked = saving;

    /* ── Loading ───────────────────────────────────────────────────────── */

    // `quiet` re-reads are the rollback path after a rejected write. They must
    // NOT clear the loaded config: a transient failure there would otherwise
    // replace the whole panel with a spinner and lose the admin's context.
    const load = useCallback(async ({ quiet = false } = {}) => {
        if (!quiet) setLoading(true);
        try {
            const res = await fetch(FILTER_URL);
            if (!res.ok) {
                const { message } = await readError(res, "Could not load the content filter");
                if (!quiet) setFilter(null);
                setLoadError(message);
                return;
            }
            setFilter(await res.json());
            setLoadError(null);
        } catch (error) {
            if (!quiet) setFilter(null);
            setLoadError(`Could not reach the server: ${error?.message || "network error"}`);
        } finally {
            if (!quiet) setLoading(false);
        }
    }, []);

    const loadPresets = useCallback(async () => {
        try {
            const res = await fetch(PRESETS_URL);
            if (!res.ok) {
                const { message } = await readError(res, "Could not load presets");
                setPresets({ error: message });
                return;
            }
            setPresets(await res.json());
        } catch (error) {
            setPresets({ error: `Could not reach the server: ${error?.message || "network error"}` });
        }
    }, []);

    // Deferred so the effect body itself never calls setState synchronously.
    useEffect(() => {
        const a = setTimeout(() => { load(); }, 0);
        const b = setTimeout(() => { loadPresets(); }, 0);
        return () => { clearTimeout(a); clearTimeout(b); };
    }, [load, loadPresets]);

    /* ── Writes ────────────────────────────────────────────────────────── */

    /**
     * Run one write at a time. Everything else is disabled while this is
     * pending, and this ref is the backstop for a click that slips through.
     */
    const runLocked = useCallback(async (label, work) => {
        if (savingRef.current) return undefined;
        savingRef.current = true;
        setSaving(true);
        setPendingLabel(label);
        try {
            return await work();
        } finally {
            savingRef.current = false;
            setPendingLabel("");
            setSaving(false);
        }
    }, []);

    /**
     * Optimistic write, then adopt the server's response as the source of truth.
     * A 400 with `rejected` is surfaced verbatim, and the config is re-read
     * because nothing was persisted.
     */
    const applyPatch = useCallback(
        (update, optimistic, success) =>
            runLocked("Saving", async () => {
                if (optimistic) setFilter((prev) => (prev ? { ...prev, ...optimistic } : prev));
                try {
                    const res = await fetch(FILTER_URL, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(update),
                    });
                    if (!res.ok) {
                        const { message } = await readError(res, "Save failed");
                        setRejection(message);
                        showToast(message, "error");
                        await load({ quiet: true });
                        return false;
                    }
                    setFilter(await res.json());
                    setRejection(null);
                    // The test box is a snapshot; a verdict from the previous
                    // config is a lie after any change to it.
                    setTestResult(null);
                    if (success) showToast(success, "success");
                    return true;
                } catch (error) {
                    const message = `Save failed: ${error?.message || "network error"}`;
                    setRejection(message);
                    showToast(message, "error");
                    await load({ quiet: true });
                    return false;
                }
            }),
        [load, runLocked, showToast]
    );

    const toggleTop = (field) => {
        if (!filter) return;
        const value = !filter[field];
        applyPatch(
            { [field]: value },
            { [field]: value },
            `${field === "blockNudity" ? "Nudity text blocking" : "Toxic word blurring"} ${value ? "on" : "off"}`
        );
    };

    const toggleMatch = (field) => {
        if (!filter) return;
        const value = !filter.matchOptions[field];
        const names = { wholeWord: "Whole-word matching", leetspeak: "Leetspeak folding", caseSensitive: "Case sensitivity" };
        applyPatch({ matchOptions: { [field]: value } }, { matchOptions: { ...filter.matchOptions, [field]: value } }, `${names[field] || field} ${value ? "on" : "off"}`);
    };

    const setMinLength = (value) => {
        if (!filter) return;
        applyPatch(
            { matchOptions: { minLength: value } },
            { matchOptions: { ...filter.matchOptions, minLength: value } },
            `Minimum match length set to ${value}`
        );
    };

    const setScope = (key, value) => {
        if (!filter) return;
        const noun = SCOPE_LABELS[key] || key;
        applyPatch(
            { textScope: { [key]: value } },
            { textScope: { ...filter.textScope, [key]: value } },
            `${noun} ${value ? "enabled" : "disabled"}`
        );
    };

    const setAutoAction = (key, value, noun) => {
        if (!filter) return;
        applyPatch(
            { autoAction: { [key]: value } },
            { autoAction: { ...filter.autoAction, [key]: value } },
            `${noun} set to ${value}`
        );
    };

    const addWord = (target, word) => {
        if (!filter) return Promise.resolve(false);
        const list = filter[target] || [];
        if (list.some((w) => String(w).toLowerCase() === word)) {
            showToast(`"${word}" is already in ${WORD_LISTS[target].label}`, "info");
            return Promise.resolve(false);
        }
        const next = [...list, word];
        return applyPatch({ [target]: next }, { [target]: next }, `Added "${word}" to ${WORD_LISTS[target].label}`);
    };

    const removeWord = (target, word) => {
        if (!filter) return Promise.resolve(false);
        const next = (filter[target] || []).filter((w) => w !== word);
        return applyPatch({ [target]: next }, { [target]: next }, `Removed "${word}" from ${WORD_LISTS[target].label}`);
    };

    /* ── Bulk add ──────────────────────────────────────────────────────── */

    const applyBulk = () =>
        runLocked("Adding words", async () => {
            const text = bulkText.trim();
            if (!text) {
                showToast("Paste some words first", "info");
                return false;
            }
            const count = text
                .split(/[\n,]/)
                .map(normaliseWord)
                .filter(Boolean).length;
            if (!count) {
                showToast("No words found in that text", "error");
                return false;
            }
            try {
                const res = await fetch(BULK_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, target: bulkTarget, mode: bulkMode }),
                });
                if (!res.ok) {
                    const { message } = await readError(res, "Bulk add failed");
                    setRejection(message);
                    showToast(message, "error");
                    return false;
                }
                const data = await res.json();
                await load({ quiet: true });
                setRejection(null);
                setTestResult(null);
                setBulkText("");
                showToast(
                    `Bulk ${bulkMode}: ${data.added} words parsed, ${WORD_LISTS[bulkTarget].label} now has ${data.total}`,
                    "success"
                );
                return true;
            } catch (error) {
                const message = `Bulk add failed: ${error?.message || "network error"}`;
                setRejection(message);
                showToast(message, "error");
                return false;
            }
        });

    /* ── Presets ───────────────────────────────────────────────────────── */

    const presetTarget = (name) => (name === "mild" ? "toxicWords" : "nudityKeywords");

    const applyPreset = (name) =>
        runLocked(`Applying the ${name} preset`, async () => {
            const mode = presetMode[name] || "merge";
            try {
                const res = await fetch(`${PRESETS_URL}/${encodeURIComponent(name)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mode }),
                });
                if (!res.ok) {
                    const { message } = await readError(res, "Preset failed");
                    setRejection(message);
                    showToast(message, "error");
                    return false;
                }
                const data = await res.json();
                // bulk/preset endpoints return counts, not the config, so the
                // panel has to re-read to show the truth.
                await load({ quiet: true });
                setRejection(null);
                setTestResult(null);
                setConfirmPreset(null);
                showToast(
                    `Preset "${data.preset}" ${data.mode}d into ${WORD_LISTS[data.target]?.label || data.target} — ${data.count} words`,
                    "success"
                );
                return true;
            } catch (error) {
                const message = `Preset failed: ${error?.message || "network error"}`;
                setRejection(message);
                showToast(message, "error");
                return false;
            }
        });

    /* ── Import / export (client-side only) ────────────────────────────── */

    const exportJson = () => {
        if (!filter) return;
        const payload = {
            exportedAt: new Date().toISOString(),
            exportedBy: filter.updatedBy || "",
            toxicWords: filter.toxicWords,
            nudityKeywords: filter.nudityKeywords,
            allowedWords: filter.allowedWords,
        };
        const total = payload.toxicWords.length + payload.nudityKeywords.length + payload.allowedWords.length;
        if (!total) {
            showToast("Nothing to export — all three lists are empty", "info");
            return;
        }
        downloadFile(
            `content-filter-${new Date().toISOString().slice(0, 10)}.json`,
            JSON.stringify(payload, null, 2),
            "application/json"
        );
        showToast(`Exported ${total} words to JSON`, "success");
    };

    const importJson = (file) =>
        runLocked("Importing", async () => {
            setImportSummary(null);
            let parsed;
            try {
                parsed = JSON.parse(await file.text());
            } catch {
                const message = `"${file.name}" is not valid JSON — nothing was imported.`;
                setRejection(message);
                showToast(message, "error");
                return false;
            }
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                const message = `"${file.name}" does not contain a word-list object — nothing was imported.`;
                setRejection(message);
                showToast(message, "error");
                return false;
            }

            const found = {};
            const ignored = [];
            for (const key of Object.keys(WORD_LISTS)) {
                if (parsed[key] === undefined) continue;
                if (!Array.isArray(parsed[key])) {
                    ignored.push(key);
                    continue;
                }
                const words = parsed[key].map(normaliseWord).filter(Boolean);
                if (words.length) found[key] = words;
            }
            const targets = Object.keys(found);
            if (!targets.length) {
                const message = `No word lists found in "${file.name}". Expected at least one of ${Object.keys(WORD_LISTS).join(", ")}.`;
                setRejection(message);
                showToast(message, "error");
                return false;
            }

            const applied = [];
            try {
                for (const target of targets) {
                    const res = await fetch(BULK_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: found[target].join("\n"), target, mode: "merge" }),
                    });
                    if (!res.ok) {
                        const { message } = await readError(res, `Import failed for ${WORD_LISTS[target].label}`);
                        setRejection(message);
                        // Partially imported: say which lists landed so the
                        // admin knows the file is now half-applied.
                        setImportSummary({ file: file.name, applied, ignored });
                        showToast(message, "error");
                        return false;
                    }
                    const data = await res.json();
                    applied.push({ target, added: data.added, total: data.total });
                }
            } catch (error) {
                const message = `Import failed: ${error?.message || "network error"}`;
                setRejection(message);
                setImportSummary(applied.length ? { file: file.name, applied, ignored } : null);
                showToast(message, "error");
                return false;
            }

            await load({ quiet: true });
            setRejection(null);
            setTestResult(null);
            setImportSummary({ file: file.name, applied, ignored });
            showToast(`Imported ${applied.length} list(s) from ${file.name} in merge mode`, "success");
            return true;
        });

    /* ── Live test ─────────────────────────────────────────────────────── */

    const runTest = () =>
        runLocked("Running the test", async () => {
            const text = testText.trim();
            if (!text) {
                showToast("Type some text to test", "info");
                return false;
            }
            try {
                const res = await fetch(TEST_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    // Always the live config: a dry run against anything else
                    // would answer a question nobody asked. `list` matters: the
                    // original report was a word in the BLUR list blurring the
                    // wrong text, and testing only the block list would tell an
                    // admin that "assistant" passes — which reads as the fix
                    // having failed.
                    body: JSON.stringify({ text, useLiveConfig: true, list: testList }),
                });
                if (!res.ok) {
                    const { message } = await readError(res, "Test failed");
                    setRejection(message);
                    showToast(message, "error");
                    return false;
                }
                setTestResult(await res.json());
                setRejection(null);
                return true;
            } catch (error) {
                const message = `Test failed: ${error?.message || "network error"}`;
                setRejection(message);
                showToast(message, "error");
                return false;
            }
        });

    /* ── Link tester ───────────────────────────────────────────────────── */

    const runLinkCheck = () =>
        runLocked("Checking the URL", async () => {
            const url = checkUrl.trim();
            if (!url) {
                showToast("Enter a URL to check", "info");
                return false;
            }
            try {
                const res = await fetch(LINK_CHECK_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url }),
                });
                if (!res.ok) {
                    const { message } = await readError(res, "Link check failed");
                    setRejection(message);
                    showToast(message, "error");
                    return false;
                }
                setCheckVerdict(await res.json());
                setRejection(null);
                return true;
            } catch (error) {
                const message = `Link check failed: ${error?.message || "network error"}`;
                setRejection(message);
                showToast(message, "error");
                return false;
            }
        });

    /* ── Stats ─────────────────────────────────────────────────────────── */

    const loadStats = () =>
        runLocked("Scanning recent posts", async () => {
            try {
                const res = await fetch(STATS_URL);
                if (!res.ok) {
                    const { message } = await readError(res, "Could not load stats");
                    setRejection(message);
                    showToast(message, "error");
                    return false;
                }
                setStats(await res.json());
                setRejection(null);
                return true;
            } catch (error) {
                const message = `Could not load stats: ${error?.message || "network error"}`;
                setRejection(message);
                showToast(message, "error");
                return false;
            }
        });

    // Declared before the !filter bail-out below: a hook called after an early
    // return is a conditional hook, and the hook order changes with the data.
    const statsRows = useMemo(() => {
        const entries = stats?.entries || [];
        return [...entries].sort((a, b) => b.hits - a.hits || String(a.word).localeCompare(String(b.word)));
    }, [stats]);

    /* ── Guarded render ────────────────────────────────────────────────── */

    if (!filter) {
        if (loadError) {
            return (
                <div className={`${CARD} space-y-3`}>
                    <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
                    <button
                        type="button"
                        onClick={() => { load(); }}
                        className={BTN_GHOST}
                    >
                        Retry
                    </button>
                </div>
            );
        }
        return (
            <div className="flex justify-center py-12">
                <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    const mo = filter.matchOptions || {};
    const scope = filter.textScope || {};
    const links = filter.links || {};
    const auto = filter.autoAction || {};
    const bulkCount = (filter[bulkTarget] || []).length;

    return (
        <div className="space-y-4">
            {/* Saving indicator + last server rejection. A rejected write must
                never look like a saved one, so this stays on screen until some
                later action succeeds. */}
            {(locked || loading) && (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
                    <div className="w-3 h-3 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                    {locked ? `${pendingLabel} — controls are locked until the server responds...` : "Loading..."}
                </div>
            )}

            {rejection && (
                <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-4" role="alert">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400">Server rejected the last change — nothing was saved</p>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1 break-words">{rejection}</p>
                    <button type="button" onClick={() => setRejection(null)} aria-label="Dismiss error" className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400 underline">
                        Dismiss
                    </button>
                </div>
            )}

            {/* ── 1. Settings ────────────────────────────────────────────── */}
            <div className={`${CARD} space-y-4`}>
                <h3 className={HEADING}>Settings</h3>
                <ToggleRow
                    label="Block nudity keywords in text"
                    hint="Text only. Rejects a write whose text matches a Nudity Keyword."
                    checked={filter.blockNudity === true}
                    disabled={locked}
                    onChange={() => toggleTop("blockNudity")}
                />
                <ToggleRow
                    label="Blur toxic words in text"
                    hint="Client-side blur on Toxic Words. The write is still accepted — the match is hidden until tapped."
                    checked={filter.blurToxicWords === true}
                    disabled={locked}
                    onChange={() => toggleTop("blurToxicWords")}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800 pt-3">
                    Neither switch inspects images or video — that is the media moderation panel&apos;s job. A post with
                    nude imagery and no matching keyword is unaffected by this panel.
                </p>
            </div>

            {/* ── 2. Matching rules (the headline fix) ───────────────────── */}
            <div className={`${CARD} space-y-4`}>
                <div>
                    <h3 className={HEADING}>Matching rules</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        These four settings decide what counts as a match, on the server and in the blur renderer alike.
                    </p>
                </div>

                <ToggleRow
                    label="Whole-word matching"
                    hint={'This is the fix for "ass" also matching "assistant". A match now has to sit between two non-alphanumeric boundaries, so "ass," and "#ass" still match while "assistant" and "pass" do not.'}
                    warn="Turning this off restores raw substring matching — expect false positives on ordinary words."
                    checked={mo.wholeWord !== false}
                    disabled={locked}
                    onChange={() => toggleMatch("wholeWord")}
                />

                <ToggleRow
                    label="Leetspeak folding"
                    hint={'Normalises character substitutions, so "a55" folds to "ass" and is caught.'}
                    checked={mo.leetspeak === true}
                    disabled={locked}
                    onChange={() => toggleMatch("leetspeak")}
                />

                <ToggleRow
                    label="Case sensitive"
                    hint={'Off (recommended) means "Ass", "ASS" and "ass" all match.'}
                    checked={mo.caseSensitive === true}
                    disabled={locked}
                    onChange={() => toggleMatch("caseSensitive")}
                />

                <NumberField
                    id="cf-min-length"
                    label="Minimum match length"
                    hint="Ignore any configured term shorter than this. 0 uses every term as written."
                    value={mo.minLength ?? 0}
                    min={0}
                    max={32}
                    disabled={locked}
                    onCommit={setMinLength}
                />
            </div>

            {/* ── 3. Live test ───────────────────────────────────────────── */}
            <div className={`${CARD} space-y-3`}>
                <div>
                    <h3 className={HEADING}>Live test</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Dry-runs the text through the same matcher the server blocks with, using the config saved right
                        now. Use the toggle below to pick which list to test against — Toxic Words is the blur
                        list, Nudity Keywords is the hard-block list.
                    </p>
                </div>

                <textarea
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    placeholder="I am an assistant today"
                    aria-label="Text to test against the live filter"
                    rows={3}
                    disabled={locked}
                    className={`${INPUT} resize-y`}
                />

                <div className="flex flex-wrap gap-2 items-center">
                    <button type="button" onClick={() => runTest()} disabled={locked || !testText.trim()} className={BTN_PRIMARY}>
                        Test
                    </button>
                    <div
                        className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
                        role="group"
                        aria-label="Which word list to test against"
                    >
                        {[
                            { id: "toxicWords", label: "Toxic Words (blur)" },
                            { id: "nudityKeywords", label: "Nudity Keywords (block)" },
                        ].map((opt) => (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => { setTestList(opt.id); setTestResult(null); }}
                                disabled={locked}
                                aria-pressed={testList === opt.id}
                                className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                                    testList === opt.id
                                        ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                                        : "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => { setTestText("I am an assistant today"); setTestResult(null); }}
                        disabled={locked}
                        className={BTN_GHOST}
                    >
                        Load &quot;I am an assistant today&quot;
                    </button>
                    <button
                        type="button"
                        onClick={() => { setTestText("I am an ass"); setTestResult(null); }}
                        disabled={locked}
                        className={BTN_GHOST}
                    >
                        Load &quot;I am an ass&quot;
                    </button>
                </div>

                {testResult && (
                    <div className="space-y-3 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${
                                    testResult.wouldBlock
                                        ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
                                        : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                                }`}
                            >
                                {testResult.wouldBlock ? "WOULD BLOCK" : "PASSES"}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {testResult.totalMatches} match{(testResult.totalMatches === 1 ? "" : "es")}
                            </span>
                        </div>

                        <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 text-sm text-gray-800 dark:text-gray-200 break-words whitespace-pre-wrap">
                            {testResult.segments?.length ? (
                                testResult.segments.map((seg, i) =>
                                    seg.toxic ? (
                                        <mark key={`t${i}`} className="bg-red-500/20 dark:bg-red-500/30 text-red-700 dark:text-red-300 rounded px-0.5 font-semibold">
                                            {seg.text}
                                        </mark>
                                    ) : (
                                        <span key={`c${i}`}>{seg.text}</span>
                                    )
                                )
                            ) : (
                                <span className="text-gray-400 dark:text-gray-500">Nothing to render.</span>
                            )}
                        </div>

                        {testResult.matches?.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Matched:</span>
                                {testResult.matches.map((m, i) => (
                                    <span
                                        key={`${m.word}-${m.start}-${i}`}
                                        className="inline-flex items-center px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-medium rounded-lg"
                                    >
                                        {m.word}
                                        <span className="ml-1 text-[10px] text-red-400 dark:text-red-500 tabular-nums">
                                            {m.start}&ndash;{m.end}
                                        </span>
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400 dark:text-gray-500">
                            <span>whole-word: {testResult.config?.wholeWord ? "on" : "off"}</span>
                            <span>leetspeak: {testResult.config?.leetspeak ? "on" : "off"}</span>
                            <span>min length: {testResult.config?.minLength ?? 0}</span>
                            <span>keywords: {testResult.config?.keywordCount ?? 0}</span>
                            <span>allowlist: {testResult.config?.allowlistCount ?? 0}</span>
                            <span>posts surface: {testResult.config?.surfaceEnabled ? "on" : "off"}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 4. Word lists ──────────────────────────────────────────── */}
            {Object.keys(WORD_LISTS).map((target) => (
                <WordListCard
                    key={target}
                    target={target}
                    words={filter[target] || []}
                    disabled={locked}
                    onAdd={addWord}
                    onRemove={removeWord}
                />
            ))}

            {/* ── 5. Bulk add ────────────────────────────────────────────── */}
            <div className={`${CARD} space-y-3`}>
                <div>
                    <h3 className={HEADING}>Bulk add</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Paste a list separated by newlines or commas. Up to 5000 entries per call.
                    </p>
                </div>
                <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={"damn\nhell\ncrap\nor: damn, hell, crap"}
                    aria-label="Words to add in bulk"
                    rows={4}
                    disabled={locked}
                    className={`${INPUT} resize-y font-mono`}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="min-w-0">
                        <label htmlFor="cf-bulk-target" className={LABEL}>Target list</label>
                        <select
                            id="cf-bulk-target"
                            value={bulkTarget}
                            onChange={(e) => setBulkTarget(e.target.value)}
                            disabled={locked}
                            className={SELECT}
                        >
                            {BULK_TARGETS.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="min-w-0">
                        <label htmlFor="cf-bulk-mode" className={LABEL}>Mode</label>
                        <select
                            id="cf-bulk-mode"
                            value={bulkMode}
                            onChange={(e) => setBulkMode(e.target.value)}
                            disabled={locked}
                            className={SELECT}
                        >
                            <option value="merge">Merge (keep existing)</option>
                            <option value="replace">Replace (discard existing)</option>
                        </select>
                    </div>
                </div>
                {bulkMode === "replace" && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                        Replace discards the {bulkCount} {bulkCount === 1 ? "entry" : "entries"} currently in{" "}
                        {WORD_LISTS[bulkTarget].label} and keeps only what you pasted.
                    </p>
                )}
                <button type="button" onClick={applyBulk} disabled={locked || !bulkText.trim()} className={BTN_PRIMARY}>
                    Add words
                </button>
            </div>

            {/* ── 6. Presets ─────────────────────────────────────────────── */}
            <div className={`${CARD} space-y-3`}>
                <div>
                    <h3 className={HEADING}>Presets</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Curated word lists. The server picks the target list from the preset name, so check the confirm
                        step before applying.
                    </p>
                </div>

                {presets === null && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">Loading presets...</p>
                )}

                {presets?.error && (
                    <p className="text-xs text-red-600 dark:text-red-400">{presets.error}</p>
                )}

                {presets?.rows?.map((row) => {
                    const mode = presetMode[row.name] || "merge";
                    const target = presetTarget(row.name);
                    const current = (filter[target] || []).length;
                    return (
                        <div key={row.name} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize min-w-0">
                                    {row.name}
                                </p>
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                    {row.count} words &rarr; {WORD_LISTS[target].label} ({current} now)
                                </span>
                                <div className="ml-auto flex items-center gap-2">
                                    <select
                                        value={mode}
                                        onChange={(e) => setPresetMode((prev) => ({ ...prev, [row.name]: e.target.value }))}
                                        disabled={locked}
                                        aria-label={`Apply mode for the ${row.name} preset`}
                                        className={SELECT_INLINE}
                                    >
                                        <option value="merge">Merge</option>
                                        <option value="replace">Replace</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmPreset(confirmPreset === row.name ? null : row.name)}
                                        disabled={locked}
                                        className={BTN_GHOST}
                                    >
                                        {confirmPreset === row.name ? "Cancel" : "Apply..."}
                                    </button>
                                </div>
                            </div>

                            {confirmPreset === row.name && (
                                <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
                                    <p className="text-xs text-amber-800 dark:text-amber-200">
                                        {mode === "replace" ? (
                                            <>
                                                <b>Replace</b> {WORD_LISTS[target].label}: the {current} existing{" "}
                                                {current === 1 ? "word" : "words"} will be discarded and the {row.count} preset words
                                                will be the whole list.
                                            </>
                                        ) : (
                                            <>
                                                <b>Merge</b> {row.count} preset words into {WORD_LISTS[target].label}. The{" "}
                                                {current} existing {current === 1 ? "word is" : "words are"} kept;
                                                duplicates are dropped.
                                            </>
                                        )}
                                    </p>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                        Words that will be written
                                    </p>
                                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                        {row.words.map((w) => (
                                            <span key={w} className="px-1.5 py-0.5 bg-white dark:bg-gray-900 text-[11px] rounded border border-amber-200 dark:border-amber-800 break-all">
                                                {w}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => applyPreset(row.name)} disabled={locked} className={BTN_PRIMARY}>
                                            Confirm {row.count} words
                                        </button>
                                        <button type="button" onClick={() => setConfirmPreset(null)} disabled={locked} className={BTN_GHOST}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {presets?.note && <p className="text-xs text-gray-400 dark:text-gray-500">{presets.note}</p>}
            </div>

            {/* ── 7. Import / export ─────────────────────────────────────── */}
            <div className={`${CARD} space-y-3`}>
                <div>
                    <h3 className={HEADING}>Import / export</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Export builds the file in your browser. Import reads a JSON file and merges each list it finds
                        into the live filter.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={exportJson} disabled={locked} className={BTN_GHOST}>
                        Export JSON
                    </button>
                    <label
                        className={`${BTN_GHOST} inline-flex items-center cursor-pointer ${locked ? "opacity-40" : ""}`}
                    >
                        Import JSON
                        <input
                            type="file"
                            accept="application/json,.json"
                            aria-label="Import a content filter JSON file"
                            disabled={locked}
                            className="sr-only"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) importJson(file);
                            }}
                        />
                    </label>
                </div>

                {importSummary && (
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 space-y-1">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Imported from {importSummary.file}</p>
                        {importSummary.applied.map((a) => (
                            <p key={a.target} className="text-xs text-gray-500 dark:text-gray-400">
                                {WORD_LISTS[a.target].label}: {a.added} words parsed, list now has {a.total}
                            </p>
                        ))}
                        {importSummary.ignored?.length > 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                Skipped (not a string array): {importSummary.ignored.join(", ")}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* ── 8. Text scope ──────────────────────────────────────────── */}
            <div className={`${CARD} space-y-4`}>
                <div>
                    <h3 className={HEADING}>Text scope</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Which write paths are checked at all. Anything unticked is accepted without a filter check.
                    </p>
                </div>
                {SCOPE_GROUPS.map((group) => (
                    <div key={group.title}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                            {group.title}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                            {group.keys.map(([key, label]) => (
                                <label
                                    key={key}
                                    className="flex items-center gap-2.5 min-h-[44px] px-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer min-w-0"
                                >
                                    <input
                                        type="checkbox"
                                        checked={scope[key] === true}
                                        disabled={locked}
                                        onChange={(e) => setScope(key, e.target.checked)}
                                        className="w-4 h-4 accent-black dark:accent-gray-100 shrink-0"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300 min-w-0 truncate">{label}</span>
                                </label>
                            ))}
                        </div>
                        {group.title === "Other" && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                                Bot posts default to off: bot content arrives from third-party news APIs, so a headline
                                legitimately containing a filtered word reads as a false positive. Bots also write
                                server-to-server, bypassing the endpoint this check normally lives on.
                            </p>
                        )}
                    </div>
                ))}
            </div>

            {/* ── 9. Link policy ─────────────────────────────────────────── */}
            <div className={`${CARD} space-y-4`}>
                <div>
                    <h3 className={HEADING}>Link policy</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Host-level rules for links in post text. Matched exactly, or as a suffix of the host.
                    </p>
                </div>

                <ToggleRow
                    label="Block all links"
                    hint="Refuse any http(s) link that is not on the allowlist."
                    checked={links.blockAllLinks === true}
                    disabled={locked}
                    onChange={() =>
                        applyPatch(
                            { links: { blockAllLinks: !links.blockAllLinks } },
                            { links: { ...links, blockAllLinks: !links.blockAllLinks } },
                            `All links ${!links.blockAllLinks ? "blocked" : "allowed"}`
                        )
                    }
                />
                <ToggleRow
                    label="Block phishing patterns"
                    hint="Reject obviously credential-harvesting hosts."
                    checked={links.blockPhishingPatterns !== false}
                    disabled={locked}
                    onChange={() =>
                        applyPatch(
                            { links: { blockPhishingPatterns: !links.blockPhishingPatterns } },
                            { links: { ...links, blockPhishingPatterns: !links.blockPhishingPatterns } },
                            `Phishing pattern blocking ${!links.blockPhishingPatterns ? "on" : "off"}`
                        )
                    }
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DomainList
                        id="cf-blocked-domains"
                        label="Blocked domains"
                        hint="Hostnames that are refused outright."
                        domains={links.blockedDomains || []}
                        chipClass="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
                        disabled={locked}
                        onAdd={(domain) => {
                            const next = [...(links.blockedDomains || []), domain];
                            return applyPatch(
                                { links: { blockedDomains: next } },
                                { links: { ...links, blockedDomains: next } },
                                `Blocked ${domain}`
                            );
                        }}
                        onRemove={(domain) => {
                            const next = (links.blockedDomains || []).filter((d) => d !== domain);
                            return applyPatch(
                                { links: { blockedDomains: next } },
                                { links: { ...links, blockedDomains: next } },
                                `Unblocked ${domain}`
                            );
                        }}
                    />
                    <DomainList
                        id="cf-allowed-domains"
                        label="Allowed domains"
                        hint="Permitted even when the block-all switch is on."
                        domains={links.allowedDomains || []}
                        chipClass="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40"
                        disabled={locked}
                        onAdd={(domain) => {
                            const next = [...(links.allowedDomains || []), domain];
                            return applyPatch(
                                { links: { allowedDomains: next } },
                                { links: { ...links, allowedDomains: next } },
                                `Allowed ${domain}`
                            );
                        }}
                        onRemove={(domain) => {
                            const next = (links.allowedDomains || []).filter((d) => d !== domain);
                            return applyPatch(
                                { links: { allowedDomains: next } },
                                { links: { ...links, allowedDomains: next } },
                                `Removed ${domain} from the allowlist`
                            );
                        }}
                    />
                </div>

                <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                    <label htmlFor="cf-url-test" className={LABEL}>Test a URL against this policy</label>
                    <div className="flex gap-2 items-start">
                        <input
                            id="cf-url-test"
                            value={checkUrl}
                            onChange={(e) => { setCheckUrl(e.target.value); setCheckVerdict(null); }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    runLinkCheck();
                                }
                            }}
                            placeholder="https://example.com/photo"
                            disabled={locked}
                            className={`${INPUT} flex-1`}
                        />
                        <button type="button" onClick={runLinkCheck} disabled={locked || !checkUrl.trim()} className={BTN_PRIMARY}>
                            Check
                        </button>
                    </div>

                    {checkVerdict && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span
                                className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border ${
                                    VERDICT_TONE[checkVerdict.verdict] || VERDICT_TONE.permitted
                                }`}
                            >
                                {VERDICT_LABEL[checkVerdict.verdict] || checkVerdict.verdict}
                            </span>
                            {checkVerdict.host && <span className="text-xs text-gray-500 dark:text-gray-400 break-all">{checkVerdict.host}</span>}
                            {checkVerdict.matchedRule ? (
                                <span className="text-xs text-gray-500 dark:text-gray-400">matched rule: {String(checkVerdict.matchedRule)}</span>
                            ) : (
                                <span className="text-xs text-gray-400 dark:text-gray-500">no explicit rule matched</span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── 10. Auto-action ────────────────────────────────────────── */}
            <div className={`${CARD} space-y-4`}>
                <div>
                    <h3 className={HEADING}>Auto-action</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        What the system does on its own once content trips the filter.
                    </p>
                </div>

                <ToggleRow
                    label="Auto-hide flagged posts"
                    hint="Hide a post as soon as it trips the filter, instead of waiting for a moderator."
                    checked={auto.autoHideFlaggedPosts === true}
                    disabled={locked}
                    onChange={() =>
                        applyPatch(
                            { autoAction: { autoHideFlaggedPosts: !auto.autoHideFlaggedPosts } },
                            { autoAction: { ...auto, autoHideFlaggedPosts: !auto.autoHideFlaggedPosts } },
                            `Auto-hide ${!auto.autoHideFlaggedPosts ? "on" : "off"}`
                        )
                    }
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <NumberField
                        id="cf-suspend-after"
                        label="Suspend after offences"
                        hint="0 disables automatic suspension entirely."
                        value={auto.suspendAfterOffences ?? 0}
                        min={0}
                        max={1000}
                        disabled={locked}
                        onCommit={(n) => setAutoAction("suspendAfterOffences", n, "Suspend-after threshold")}
                    />
                    <NumberField
                        id="cf-offence-window"
                        label="Offence window (hours)"
                        value={auto.offenceWindowHours ?? 24}
                        min={1}
                        max={8760}
                        disabled={locked}
                        onCommit={(n) => setAutoAction("offenceWindowHours", n, "Offence window")}
                    />
                    <NumberField
                        id="cf-suspend-hours"
                        label="Suspend for (hours)"
                        value={auto.suspendHours ?? 24}
                        min={1}
                        max={8760}
                        disabled={locked}
                        onCommit={(n) => setAutoAction("suspendHours", n, "Suspension length")}
                    />
                </div>

                <p className="text-xs text-amber-600 dark:text-amber-400 border-t border-gray-100 dark:border-gray-800 pt-3">
                    Setting &quot;Suspend after offences&quot; above 0 turns on automatic suspensions. Accounts that reach
                    the threshold inside the offence window are suspended with no moderator in the loop, and nobody is
                    notified. Leave it at 0 unless repeat-offender enforcement is intended.
                </p>
            </div>

            {/* ── 11. Term statistics ────────────────────────────────────── */}
            <div className={`${CARD} space-y-3`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                        <h3 className={HEADING}>Term statistics</h3>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Hit counts per Toxic Word across recent posts and comments. Scanning is expensive, so it only
                            runs when you ask.
                        </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        {stats && (
                            <button
                                type="button"
                                disabled={locked}
                                onClick={() => {
                                    downloadFile(
                                        `content-filter-stats-${new Date().toISOString().slice(0, 10)}.csv`,
                                        ["word,hits", ...statsRows.map((r) => `${csvCell(r.word)},${r.hits}`)].join("\n"),
                                        "text/csv"
                                    );
                                    showToast(`Exported ${statsRows.length} terms to CSV`, "success");
                                }}
                                className={BTN_GHOST}
                            >
                                Export CSV
                            </button>
                        )}
                        <button type="button" onClick={loadStats} disabled={locked} className={BTN_PRIMARY}>
                            {stats ? "Reload stats" : "Load stats"}
                        </button>
                    </div>
                </div>

                {stats && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>{stats.totalHits} total hits</span>
                            <span>{stats.postsScanned} posts scanned</span>
                            <span>last {stats.windowDays} days</span>
                        </div>

                        {statsRows.length === 0 ? (
                            <p className="text-xs text-gray-400 dark:text-gray-500">No Toxic Words configured, so there is nothing to count.</p>
                        ) : (
                            <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                                        <tr>
                                            <th scope="col" className="text-left font-semibold text-xs text-gray-500 dark:text-gray-400 px-3 py-2">Term</th>
                                            <th scope="col" className="text-right font-semibold text-xs text-gray-500 dark:text-gray-400 px-3 py-2 w-24">Hits</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {statsRows.map((row) => (
                                            <tr key={row.word} className="border-t border-gray-100 dark:border-gray-800">
                                                <td className="px-3 py-2 text-gray-800 dark:text-gray-200 break-all">{row.word}</td>
                                                <td className={`px-3 py-2 text-right tabular-nums ${row.hits > 0 ? "font-semibold text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}`}>
                                                    {row.hits}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {stats.unusedEntries?.length > 0 && (
                            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 p-3">
                                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                                    Configured but never matched in {stats.windowDays} days ({stats.unusedEntries.length})
                                </p>
                                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                    These terms matched nothing in the scanned window. Harmless, but each one is a
                                    false-positive risk if a word is ever added that overlaps it.
                                </p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {stats.unusedEntries.map((w) => (
                                        <span key={w} className="px-1.5 py-0.5 bg-white dark:bg-gray-900 text-[11px] rounded border border-amber-200 dark:border-amber-800 break-all">
                                            {w}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── 12. Footer ─────────────────────────────────────────────── */}
            <div className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
                <div className="min-w-0">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                        Last changed {formatStamp(filter.updatedAt)}
                        {filter.updatedBy ? ` by ${filter.updatedBy}` : ""}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 tabular-nums">
                        {filter.toxicWords?.length || 0} toxic &middot; {filter.nudityKeywords?.length || 0} keywords
                        &middot; {filter.allowedWords?.length || 0} allowed
                    </p>
                    {loadError && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            Showing the last config that loaded successfully — refresh failed: {loadError}
                        </p>
                    )}
                </div>
                <button type="button" onClick={() => { load(); loadPresets(); }} disabled={locked} className={BTN_GHOST}>
                    Refresh
                </button>
            </div>
        </div>
    );
}
