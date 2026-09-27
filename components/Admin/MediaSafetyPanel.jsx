"use client";

/**
 * Media safety admin panel.
 *
 * ── The one thing this panel must never do ───────────────────────────────────
 * Look capable. The user asked for "automatically block posts that contain
 * nudity". Every uploader in this app posts DIRECTLY to Cloudinary from the
 * browser with an UNSIGNED preset, so the bytes are already online and publicly
 * fetchable before the app is ever consulted. The server receives the final
 * `secure_url` and holds Cloudinary API credentials, so the only real design
 * available is: screen the already-uploaded asset, then either accept the write
 * or reject it AND destroy the asset.
 *
 * Real nudity detection needs a trained model. There is no model in this repo
 * and none in package.json. With `provider: "none"` the server performs only
 * STRUCTURAL checks (URL validity, the Cloudinary host allowlist, rollback) and
 * does not look at a single pixel. So every surface here that could be mistaken
 * for "we are scanning" says so explicitly, driven by the server's own
 * `detectingNudity` flag rather than by what looks true from the outside.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/context/ToastContext";

const SAFETY = "/api/admin/content-safety";
const FILTER = "/api/admin/content-filter";

/* ── Reference data ───────────────────────────────────────────────────────── */

const PROVIDERS = [
    {
        id: "none",
        label: "None — structural checks only",
        blurb:
            "No classifier runs. The server still validates the URL, can enforce the Cloudinary host allowlist, and still destroys an asset when a write is rejected. Nothing here looks at pixels, so nothing here detects nudity.",
    },
    {
        id: "cloudinary",
        label: "Cloudinary moderation add-on",
        blurb:
            "Calls Cloudinary's own moderation engine over the Admin API using credentials the server already holds, so it is the cheapest option and adds no new vendor. It only works if the moderation add-on is enabled on the Cloudinary account — the API key alone is not enough.",
    },
    {
        id: "google",
        label: "Google Cloud Vision SafeSearch",
        blurb:
            "SafeSearch's adult bucket over REST, one call per still image. Stills only: a video needs per-frame extraction, which is not implemented, so videos are not actually screened by this provider.",
    },
    {
        id: "aws",
        label: "Amazon Rekognition",
        blurb:
            "Would use DetectModerationLabels. The server reports it as deliberately unavailable — see the note under the selector.",
    },
];

const ACTIONS = [
    {
        id: "block",
        label: "Block — reject the write and delete the asset",
        blurb:
            "The post is refused and the Cloudinary asset is destroyed, so the raw file stops being fetchable. Nothing is queued. Safest for the content, harshest for false positives: one wrong verdict deletes a real upload with no undo.",
    },
    {
        id: "flag",
        label: "Flag — accept it, but queue it for review",
        blurb:
            "The post goes live and is queued in the review queue below for a human. Nothing is destroyed automatically, so a bad verdict is recoverable. This is the safest thing to start with.",
    },
    {
        id: "blur",
        label: "Blur — accept it and mark it NSFW",
        blurb:
            "The post goes live, marked as explicit. No queue entry is created, so an admin does not get told about it. Fine for a platform where NSFW is a legitimate category; not a moderation control.",
    },
];

const FAILURE_MODES = [
    {
        id: "closed",
        label: "Closed — reject when the provider errors",
        blurb:
            "A provider timeout, a missing credential or a 500 from the vendor is treated as a failed screen and the upload is rejected. Nothing slips past while the detector is broken — but a provider outage blocks every upload on the affected surfaces, and unconfigured is treated the same way as an outage.",
    },
    {
        id: "open",
        label: "Open — allow when the provider errors",
        blurb:
            "Uploads keep working during a provider outage. The cost is that a broken detector silently allows everything, which is indistinguishable from a detector that says everything is clean.",
    },
];

/** Surfaces accepted by POST /test and POST /scan. Mirrors the server's own list. */
const MEDIA_SURFACES = [
    { id: "postImage", label: "Post image" },
    { id: "postVideo", label: "Post video" },
    { id: "commentImage", label: "Comment image" },
    { id: "story", label: "Story" },
    { id: "dm", label: "Direct message" },
    { id: "group", label: "Group message" },
    { id: "avatar", label: "Avatar" },
];

/**
 * The seven `scope` keys, and the surface id each one gates.
 *
 * The key is the SAME string as the surface id, because that is exactly what the
 * server looks up: `settings.scope[surface]`. These were previously plural
 * ("postImages") while callers passed singular ones ("postImage"), so the lookup
 * always missed, every surface evaluated `undefined !== false`, and all seven
 * switches were inert no matter what was saved here. The stored keys in
 * models/contentFilter.js have been renamed to match.
 */
const SCOPE_KEYS = [
    { key: "postImage", label: "Post images", surface: "postImage", defaultOn: true },
    { key: "postVideo", label: "Post videos", surface: "postVideo", defaultOn: true },
    { key: "commentImage", label: "Comment images", surface: "commentImage", defaultOn: true },
    { key: "story", label: "Story images", surface: "story", defaultOn: true },
    { key: "dm", label: "Direct messages", surface: "dm", defaultOn: true },
    { key: "group", label: "Group messages", surface: "group", defaultOn: true },
    { key: "avatar", label: "Avatars", surface: "avatar", defaultOn: false },
];

/** Surfaces accepted by POST /test-text. These are the TEXT filter's surfaces. */
const TEXT_SURFACES = [
    { id: "post", label: "Post caption" },
    { id: "comment", label: "Comment" },
    { id: "postEdit", label: "Post edit" },
    { id: "commentEdit", label: "Comment edit" },
    { id: "repost", label: "Repost / quote" },
    { id: "dm", label: "Direct message" },
    { id: "group", label: "Group message" },
    { id: "story", label: "Story caption" },
    { id: "bio", label: "Profile bio" },
    { id: "bot", label: "Bot reply" },
];

const CONFIG_FALLBACK = {
    enabled: false,
    provider: "none",
    threshold: 0.8,
    action: "block",
    failureMode: "closed",
    requireCloudinaryHost: false,
    destroyOnReject: true,
    cacheResults: true,
    cacheTtlHours: 168,
    scope: {},
};

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/**
 * fetch + JSON + throw with the server's own message attached.
 * The server's `error` is the only useful text it returns on failure, so it is
 * carried on the exception rather than replaced with a generic string.
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

const isCloudinaryHost = (url) => /^https:\/\/(res|upload)\.cloudinary\.com\//i.test(String(url || ""));

/**
 * What a threshold actually means, grounded in the scores the two implemented
 * providers really return rather than in a generic "confidence" caption.
 */
function thresholdMeaning(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return { label: "unknown", note: "Not a readable number." };
    if (n >= 0.9)
        return {
            label: "Almost certain",
            note: "Only a provider's very top bucket counts. The fewest false positives, and borderline explicit content slips past.",
        };
    if (n >= 0.75)
        return {
            label: "Very likely",
            note: "Matches Google LIKELY (0.8) and Cloudinary's very-likely score (0.95). The usual starting point.",
        };
    if (n >= 0.5)
        return {
            label: "Likely",
            note: "Also matches a category hit with no level attached (0.7), which Cloudinary returns for an unlabelled adult finding.",
        };
    if (n >= 0.3)
        return {
            label: "Possible",
            note: "Also matches Google's POSSIBLE (0.45). Catches more, but ordinary photos start getting caught.",
        };
    return {
        label: "Any signal at all",
        note: "Below Google's UNLIKELY floor (0.1). Nearly everything a provider looks at will trip this. Expect heavy false positives.",
    };
}

const pct = (v) => `${Math.round(Number(v || 0) * 100)}%`;

const hostOf = (url) => {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return null;
    }
};

/* ── Shared presentational primitives (house style) ────────────────────────── */

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

function ErrorBox({ message, rejected, onRetry }) {
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
            {rejected && rejected.length > 0 && (
                <ul className="mt-2 space-y-1">
                    {rejected.map((r) => (
                        <li key={r} className="text-[11px] text-red-600 dark:text-red-400 font-mono break-words">
                            {r}
                        </li>
                    ))}
                </ul>
            )}
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

/* ── Panel ────────────────────────────────────────────────────────────────── */

export default function MediaSafetyPanel() {
    const { showToast } = useToast();

    // Server truth: the two documents this panel reads and writes.
    const [status, setStatus] = useState(null);
    const [cfg, setCfg] = useState(null);
    const [booting, setBooting] = useState(true);
    const [bootError, setBootError] = useState("");

    // Config writes. A ref (not just state) guards the entry point so a double
    // click in the same tick cannot start two PATCHes to the same document.
    const [saving, setSaving] = useState(false);
    const [saveLabel, setSaveLabel] = useState("");
    const [saveError, setSaveError] = useState(null);
    const savingRef = useRef(false);

    // Drafts, so a slider is not 100 PATCHes. They are written by applyConfig
    // rather than synced in an effect: an effect that mirrors props into state
    // is the classic cascading-render bug, and every write to `cfg` already
    // passes through applyConfig anyway.
    const [thresholdDraft, setThresholdDraft] = useState("0.8");
    const [ttlDraft, setTtlDraft] = useState("168");
    const cfgRef = useRef(CONFIG_FALLBACK);

    // Media tester.
    const [mediaUrl, setMediaUrl] = useState("");
    const [mediaSurface, setMediaSurface] = useState("postImage");
    const [mediaResult, setMediaResult] = useState(null);
    const [mediaError, setMediaError] = useState("");
    const [mediaRunning, setMediaRunning] = useState(false);

    // Text tester.
    const [textValue, setTextValue] = useState("");
    const [textSurface, setTextSurface] = useState("post");
    const [textResult, setTextResult] = useState(null);
    const [textError, setTextError] = useState("");
    const [textRunning, setTextRunning] = useState(false);

    // Review queue.
    const [queue, setQueue] = useState(null);
    const [queueError, setQueueError] = useState("");
    const [queueLoading, setQueueLoading] = useState(false);
    const [decision, setDecision] = useState(null); // { url, decision }
    const [allowlist, setAllowlist] = useState(false);
    const [resolving, setResolving] = useState(false);

    // Statistics.
    const [stats, setStats] = useState(null);
    const [statsError, setStatsError] = useState("");
    const [statsLoading, setStatsLoading] = useState(false);

    // Backfill scanner.
    const [scanLimit, setScanLimit] = useState("50");
    const [scanSurface, setScanSurface] = useState("postImage");
    const [scanDry, setScanDry] = useState(true);
    const [scanResult, setScanResult] = useState(null);
    const [scanError, setScanError] = useState("");
    const [scanRunning, setScanRunning] = useState(false);

    // Link policy.
    const [links, setLinks] = useState(null);
    const [linksError, setLinksError] = useState("");
    const [linkUrl, setLinkUrl] = useState("");
    const [linkVerdict, setLinkVerdict] = useState(null);
    const [linkTestError, setLinkTestError] = useState("");
    const [linkTesting, setLinkTesting] = useState(false);

    // Orphans.
    const [orphans, setOrphans] = useState(null);
    const [orphansError, setOrphansError] = useState("");
    const [orphansLoading, setOrphansLoading] = useState(false);

    /* ── Loading ────────────────────────────────────────────────────────── */

    /** The single writer for server config state, so drafts never drift. */
    const applyConfig = useCallback((next) => {
        cfgRef.current = next;
        setCfg(next);
        setThresholdDraft(String(next.threshold ?? 0.8));
        setTtlDraft(String(next.cacheTtlHours ?? 168));
    }, []);

    const loadStatus = useCallback(async () => {
        try {
            const d = await callApi(`${SAFETY}/provider-status`, { cache: "no-store" });
            setStatus(d);
        } catch (e) {
            setBootError(errText(e));
        }
    }, []);

    const loadFilter = useCallback(async () => {
        try {
            const d = await callApi(FILTER, { cache: "no-store" });
            applyConfig({ ...CONFIG_FALLBACK, ...(d.mediaModeration || {}) });
        } catch (e) {
            setBootError(errText(e));
        }
    }, [applyConfig]);

    const loadLinks = useCallback(async () => {
        setLinksError("");
        try {
            setLinks(await callApi(`${SAFETY}/links`, { cache: "no-store" }));
        } catch (e) {
            setLinksError(errText(e));
        }
    }, []);

    useEffect(() => {
        let alive = true;
        (async () => {
            await Promise.all([loadStatus(), loadFilter(), loadLinks()]);
            if (alive) setBooting(false);
        })();
        return () => {
            alive = false;
        };
    }, [loadStatus, loadFilter, loadLinks]);

    /* ── Config writes ──────────────────────────────────────────────────── */

    /**
     * The one write path. It never updates local state optimistically: controls
     * render from server state, so a refused write leaves the UI showing what
     * the server actually has rather than what was clicked.
     */
    const patchConfig = useCallback(
        async (body, label, section) => {
            if (savingRef.current) return;
            savingRef.current = true;
            setSaving(true);
            setSaveLabel(label);
            setSaveError(null);
            try {
                const d = await callApi(FILTER, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                if (d.mediaModeration) applyConfig({ ...CONFIG_FALLBACK, ...d.mediaModeration });
                if (d.links) setLinks(d.links);
                // detectingNudity is derived server-side from enabled+provider,
                // so the banner cannot be computed correctly from the patch
                // response alone. Re-read it.
                await loadStatus();
                showToast(`${label} saved`, "success");
            } catch (e) {
                const rejected = Array.isArray(e.payload?.rejected) ? e.payload.rejected : null;
                setSaveError({ message: errText(e), rejected, section });
                showToast(errText(e), "error");
                // Nothing was written, so re-apply the server state to snap the
                // drafts back to what is actually stored.
                applyConfig(cfgRef.current);
            } finally {
                savingRef.current = false;
                setSaving(false);
                setSaveLabel("");
            }
        },
        [applyConfig, loadStatus, showToast],
    );

    const saveMedia = useCallback(
        (patch, label, section) => patchConfig({ mediaModeration: patch }, label, section),
        [patchConfig],
    );
    const saveLinks = useCallback(
        (patch, label) => patchConfig({ links: patch }, label, "links"),
        [patchConfig],
    );

    /* ── Testers ────────────────────────────────────────────────────────── */

    const runMediaTest = useCallback(async () => {
        if (!mediaUrl.trim()) {
            setMediaError("Enter a media URL first.");
            return;
        }
        setMediaRunning(true);
        setMediaError("");
        setMediaResult(null);
        try {
            setMediaResult(await callApi(`${SAFETY}/test`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: mediaUrl.trim(), surface: mediaSurface }),
            }));
        } catch (e) {
            setMediaError(errText(e));
        } finally {
            setMediaRunning(false);
        }
    }, [mediaUrl, mediaSurface]);

    const runTextTest = useCallback(async () => {
        setTextRunning(true);
        setTextError("");
        setTextResult(null);
        try {
            setTextResult(await callApi(`${SAFETY}/test-text`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: textValue, surface: textSurface }),
            }));
        } catch (e) {
            setTextError(errText(e));
        } finally {
            setTextRunning(false);
        }
    }, [textValue, textSurface]);

    /* ── Queue ──────────────────────────────────────────────────────────── */

    const loadQueue = useCallback(async () => {
        setQueueLoading(true);
        setQueueError("");
        try {
            setQueue(await callApi(`${SAFETY}/queue?limit=50&flagged=1`, { cache: "no-store" }));
        } catch (e) {
            setQueueError(errText(e));
        } finally {
            setQueueLoading(false);
        }
    }, []);

    const loadStats = useCallback(async () => {
        setStatsLoading(true);
        setStatsError("");
        try {
            setStats(await callApi(`${SAFETY}/stats`, { cache: "no-store" }));
        } catch (e) {
            setStatsError(errText(e));
        } finally {
            setStatsLoading(false);
        }
    }, []);

    const resolveItem = useCallback(
        async (url, decisionKind, withAllowlist) => {
            setResolving(true);
            try {
                await callApi(`${SAFETY}/queue/resolve`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url, decision: decisionKind, allowlist: !!withAllowlist }),
                });
                showToast(decisionKind === "approve" ? "Approved" : "Rejected and destroy requested", "success");
                setDecision(null);
                setAllowlist(false);
                await Promise.all([loadQueue(), loadStats()]);
            } catch (e) {
                showToast(errText(e), "error");
            } finally {
                setResolving(false);
            }
        },
        [loadQueue, loadStats, showToast],
    );

    /* ── Scanner ────────────────────────────────────────────────────────── */

    const runScan = useCallback(async () => {
        setScanRunning(true);
        setScanError("");
        setScanResult(null);
        try {
            const d = await callApi(`${SAFETY}/scan`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    limit: Math.max(1, Math.min(Number(scanLimit) || 50, 1000)),
                    surface: scanSurface,
                    dryRun: scanDry,
                }),
            });
            setScanResult(d);
            if (!scanDry) await loadStats();
        } catch (e) {
            setScanError(errText(e));
        } finally {
            setScanRunning(false);
        }
    }, [scanLimit, scanSurface, scanDry, loadStats]);

    /* ── Link tester ────────────────────────────────────────────────────── */

    const runLinkCheck = useCallback(async () => {
        if (!linkUrl.trim()) {
            setLinkTestError("Enter a URL first.");
            return;
        }
        setLinkTesting(true);
        setLinkTestError("");
        setLinkVerdict(null);
        try {
            setLinkVerdict(await callApi(`${SAFETY}/links/check`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: linkUrl.trim() }),
            }));
        } catch (e) {
            setLinkTestError(errText(e));
        } finally {
            setLinkTesting(false);
        }
    }, [linkUrl]);

    /* ── Orphans ────────────────────────────────────────────────────────── */

    const loadOrphans = useCallback(async () => {
        setOrphansLoading(true);
        setOrphansError("");
        try {
            setOrphans(await callApi(`${SAFETY}/orphans?limit=200`, { cache: "no-store" }));
        } catch (e) {
            setOrphansError(errText(e));
        } finally {
            setOrphansLoading(false);
        }
    }, []);

    /* ── Derived ────────────────────────────────────────────────────────── */

    const mm = cfg || CONFIG_FALLBACK;
    const detecting = status?.detectingNudity === true;
    const selectedProvider = PROVIDERS.find((p) => p.id === mm.provider) || PROVIDERS[0];
    const providerState = status?.providers?.[mm.provider] || null;
    const threshold = Number(mm.threshold ?? 0.8);
    const meaning = thresholdMeaning(threshold);
    const actionInfo = ACTIONS.find((a) => a.id === mm.action) || ACTIONS[0];
    const failureInfo = FAILURE_MODES.find((f) => f.id === mm.failureMode) || FAILURE_MODES[0];

    const reasonBars = useMemo(() => {
        const entries = Object.entries(stats?.byReason || {});
        if (entries.length === 0) return [];
        const max = Math.max(...entries.map(([, n]) => Number(n) || 0), 1);
        return entries
            .map(([reason, n]) => ({ reason, n: Number(n) || 0, w: ((Number(n) || 0) / max) * 100 }))
            .sort((a, b) => b.n - a.n);
    }, [stats]);

    const throttleSave = saving;

    /* ── Boot states ────────────────────────────────────────────────────── */

    if (booting) {
        return (
            <div className="flex justify-center py-12">
                <div
                    className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin"
                    role="status"
                    aria-label="Loading media safety status"
                />
            </div>
        );
    }

    if (bootError && !status) {
        return (
            <div className="space-y-3">
                <ErrorBox
                    message={`Could not load media safety status: ${bootError}`}
                    onRetry={() => {
                        setBooting(true);
                        setBootError("");
                        Promise.all([loadStatus(), loadFilter(), loadLinks()]).then(() => setBooting(false));
                    }}
                />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* ── 1. Status banner ─────────────────────────────────────────── */}
            {detecting ? (
                <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 sm:p-5">
                    <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                                Automatic image and video screening is live.
                            </p>
                            <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1 leading-relaxed">
                                Provider <b>{mm.provider}</b>
                                {providerState?.configured === false
                                    ? " is selected but its credentials are missing on the server, so every check will fail — see the provider card."
                                    : ""}{" "}
                                Confidence threshold <b>{threshold}</b> ({pct(threshold)} — {meaning.label.toLowerCase()}), action{" "}
                                <b>{mm.action}</b>, failure mode <b>{mm.failureMode}</b>.
                            </p>
                            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-2 leading-relaxed">
                                Reminder: the file is already online on Cloudinary before this check runs. A block is only real because
                                the server also destroys the asset.
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl border border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/25 p-4 sm:p-5">
                    <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                                Images and videos are NOT being screened for nudity.
                            </p>
                            <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                                {status?.enabled
                                    ? "Media moderation is switched on but the provider is set to “None”, so no classifier runs. Only structural checks happen: URL validity, the Cloudinary host allowlist, and destroying an asset when a write is rejected. No pixels are examined."
                                    : "Media moderation is switched off entirely, so no media is screened at all. Anything uploaded is published as-is."}
                            </p>
                            <p className="text-xs text-amber-800 dark:text-amber-300 mt-1.5 leading-relaxed">
                                Uploads go straight to Cloudinary from the browser with an unsigned preset, so the file is already online
                                and publicly fetchable by the time the app sees it. There is no trained detection model in this project,
                                so “blocking nudity” cannot actually happen until a provider is configured.
                            </p>
                            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mt-2 leading-relaxed">
                                Next step: pick a provider in the card below, add the environment variables it lists to the server, and
                                restart live-server.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 2. Provider setup ────────────────────────────────────────── */}
            <div className={CARD}>
                <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className={HEADING}>Detection provider</h3>
                    {saving && <span className="text-[11px] text-gray-400 dark:text-gray-500">Saving…</span>}
                </div>

                <div className="space-y-2">
                    {PROVIDERS.map((p) => (
                        <label
                            key={p.id}
                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                                mm.provider === p.id
                                    ? "border-black dark:border-gray-100 bg-gray-50 dark:bg-gray-800/60"
                                    : "border-gray-200 dark:border-gray-700"
                            } ${throttleSave ? "opacity-60" : ""}`}
                        >
                            <input
                                type="radio"
                                name="ms-provider"
                                value={p.id}
                                checked={mm.provider === p.id}
                                disabled={throttleSave}
                                onChange={() => saveMedia({ provider: p.id }, "Provider", "provider")}
                                className="mt-1 w-4 h-4 accent-black dark:accent-white shrink-0"
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{p.label}</span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{p.blurb}</span>
                            </span>
                        </label>
                    ))}
                </div>

                {/* Readiness of the SELECTED provider. */}
                <div className="mt-3 space-y-2">
                    {selectedProvider.id === "none" ? (
                        <Note tone="danger" title="No classifier selected — nothing here can detect nudity.">
                            The only thing this configuration does is reject malformed or non-allowlisted URLs and destroy assets whose
                            write was refused. Switch to a provider above to screen actual content.
                        </Note>
                    ) : (
                        <Note
                            tone={providerState?.configured ? "ok" : "danger"}
                            title={
                                selectedProvider.id === "aws"
                                    ? "AWS Rekognition is reported as unavailable on purpose."
                                    : providerState?.configured
                                    ? `${selectedProvider.label} is configured on the server.`
                                    : `${selectedProvider.label} is NOT configured on the server.`
                            }
                        >
                            {providerState?.configured ? (
                                <p>
                                    Every check will make a real provider call. If the vendor returns an error the verdict falls back to
                                    the failure mode below, which is currently <b>{mm.failureMode}</b>.
                                </p>
                            ) : (
                                <>
                                    <p>
                                        Add these to the server environment (<span className="font-mono">live-server/.env</span>) and
                                        restart live-server — they are read from the process, and the Cloudinary client caches a
                                        “not configured” result for the lifetime of the process:
                                    </p>
                                    <ul className="mt-2 flex flex-wrap gap-1.5">
                                        {(providerState?.missing || []).map((v) => (
                                            <li
                                                key={v}
                                                className="px-2 py-1 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[11px] font-mono break-all"
                                            >
                                                {v}
                                            </li>
                                        ))}
                                    </ul>
                                    {providerState?.note && (
                                        <p className="mt-2 leading-relaxed">
                                            Provider note, verbatim: <span className="italic">{providerState.note}</span>
                                        </p>
                                    )}
                                </>
                            )}
                            {selectedProvider.id === "aws" && (
                                <p className="mt-2 leading-relaxed">
                                    This is a deliberate refusal, not a missing feature. SigV4 request signing that is subtly wrong
                                    returns 403s, and a 403 in front of a moderation check looks exactly like “no nudity found”. A
                                    detector that silently passes everything is worse than one that admits it does not exist, so this
                                    reports itself unavailable instead. Use the Cloudinary or Google provider instead.
                                </p>
                            )}
                        </Note>
                    )}
                </div>

                {saveError?.section === "provider" && (
                    <ErrorBox message={saveError.message} rejected={saveError.rejected} />
                )}
            </div>

            {/* ── 3. Detection settings ────────────────────────────────────── */}
            <div className={CARD}>
                <div className="flex items-center justify-between gap-3 mb-1">
                    <h3 className={HEADING}>Detection settings</h3>
                    {saving && <span className="text-[11px] text-gray-400 dark:text-gray-500">Saving {saveLabel}…</span>}
                </div>
                <p className={`${SUBTLE} mb-2 leading-relaxed`}>
                    Uploads always reach Cloudinary first. These settings only decide what the server does with them afterwards.
                </p>

                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    <SwitchRow
                        label="Media moderation enabled"
                        hint="Master switch. Off means every surface below is skipped entirely and the upload is published as-is."
                        on={mm.enabled}
                        disabled={throttleSave}
                        onChange={() => saveMedia({ enabled: !mm.enabled }, "Enabled", "settings")}
                    />

                    {/* Threshold */}
                    <div className="py-3">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Confidence threshold</p>
                            <span className="text-xs font-mono text-gray-600 dark:text-gray-300">
                                {thresholdDraft} ({pct(thresholdDraft)})
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={thresholdDraft}
                            disabled={throttleSave}
                            aria-label="Confidence threshold"
                            onChange={(e) => setThresholdDraft(e.target.value)}
                            className="w-full h-10 accent-black dark:accent-white disabled:opacity-50"
                        />
                        <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 font-semibold">
                            {thresholdMeaning(thresholdDraft).label} — {thresholdMeaning(thresholdDraft).note}
                        </p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                            A lower threshold catches more explicit content and flags more innocent images; a higher one misses more.
                            It only means anything once a provider is configured.
                        </p>
                        <button
                            type="button"
                            onClick={() => saveMedia({ threshold: Number(thresholdDraft) }, "Threshold", "settings")}
                            disabled={throttleSave || !Number.isFinite(Number(thresholdDraft)) || Number(thresholdDraft) === threshold}
                            className={`${BTN_GHOST} mt-2`}
                        >
                            Apply threshold
                        </button>
                    </div>

                    {/* Action */}
                    <div className="py-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1.5">What to do on a detection</p>
                        <div className="space-y-2">
                            {ACTIONS.map((a) => (
                                <label
                                    key={a.id}
                                    className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                                        mm.action === a.id
                                            ? "border-black dark:border-gray-100 bg-gray-50 dark:bg-gray-800/60"
                                            : "border-gray-200 dark:border-gray-700"
                                    } ${throttleSave ? "opacity-60" : ""}`}
                                >
                                    <input
                                        type="radio"
                                        name="ms-action"
                                        checked={mm.action === a.id}
                                        disabled={throttleSave}
                                        onChange={() => saveMedia({ action: a.id }, "Action", "settings")}
                                        className="mt-1 w-4 h-4 accent-black dark:accent-white shrink-0"
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100">{a.label}</span>
                                        <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                                            {a.blurb}
                                        </span>
                                    </span>
                                </label>
                            ))}
                        </div>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 leading-relaxed">
                            Start with <b>Flag</b>. It is the only one you can undo, and it is the only one that tells you the detector
                            is wrong before you start deleting people’s photos.
                        </p>
                    </div>

                    {/* Failure mode */}
                    <div className="py-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1.5">
                            When the provider errors
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {FAILURE_MODES.map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    disabled={throttleSave}
                                    onClick={() => saveMedia({ failureMode: f.id }, "Failure mode", "settings")}
                                    className={`text-left p-2.5 rounded-xl border transition-colors disabled:opacity-60 ${
                                        mm.failureMode === f.id
                                            ? "border-black dark:border-gray-100 bg-gray-50 dark:bg-gray-800/60"
                                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                    }`}
                                >
                                    <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100">{f.label}</span>
                                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                                        {f.blurb}
                                    </span>
                                </button>
                            ))}
                        </div>
                        {mm.failureMode === "closed" && !providerState?.configured && (
                            <div className="mt-2">
                                <Note tone="danger" title="This combination blocks every upload on the enabled surfaces.">
                                    Failure mode is <b>closed</b> and the selected provider is not configured, so every screen errors and
                                    every screen errors into a rejection. Turn the provider on properly, or switch the failure mode to
                                    open, before enabling media moderation.
                                </Note>
                            </div>
                        )}
                    </div>

                    {/* Host allowlist + destroy + cache */}
                    <SwitchRow
                        label="Require a Cloudinary-hosted URL"
                        hint="Rejects any media URL that is not https://res.cloudinary.com, which closes the hole where an arbitrary host was previously accepted into a post. Turning it on also breaks Giphy GIFs: they are referenced off-Cloudinary, so they cannot be screened and will be rejected rather than passed."
                        on={mm.requireCloudinaryHost}
                        tone="amber"
                        disabled={throttleSave}
                        onChange={() => saveMedia({ requireCloudinaryHost: !mm.requireCloudinaryHost }, "Host allowlist", "settings")}
                    />
                    <SwitchRow
                        label="Destroy the asset on reject"
                        hint="Without this, every rejected upload stays online forever at a guessable URL even though no post points at it — anyone who saw the link could still fetch the raw file. Turn it off only if you need the file kept for evidence."
                        on={mm.destroyOnReject}
                        disabled={throttleSave}
                        onChange={() => saveMedia({ destroyOnReject: !mm.destroyOnReject }, "Destroy on reject", "settings")}
                    />
                    <SwitchRow
                        label="Cache verdicts"
                        hint="Reuses the result for a URL instead of paying for the provider call again. The cache lives in server memory, so it is dropped on restart and cleared whenever these settings are saved."
                        on={mm.cacheResults}
                        disabled={throttleSave}
                        onChange={() => saveMedia({ cacheResults: !mm.cacheResults }, "Verdict cache", "settings")}
                    />

                    <div className="py-3">
                        <Field
                            label="Cache lifetime (hours)"
                            hint="How long a cached verdict is reused. 168 is one week. A long lifetime means edited-by-reupload content can be re-screened against a stale verdict."
                        >
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    min="1"
                                    max="8760"
                                    value={ttlDraft}
                                    disabled={throttleSave}
                                    onChange={(e) => setTtlDraft(e.target.value)}
                                    className={`${INPUT} flex-1 min-w-0`}
                                />
                                <button
                                    type="button"
                                    onClick={() => saveMedia({ cacheTtlHours: Number(ttlDraft) }, "Cache lifetime", "settings")}
                                    disabled={
                                        throttleSave ||
                                        !Number.isFinite(Number(ttlDraft)) ||
                                        Number(ttlDraft) < 1 ||
                                        Number(ttlDraft) > 8760 ||
                                        Number(ttlDraft) === Number(mm.cacheTtlHours)
                                    }
                                    className={BTN_GHOST}
                                >
                                    Apply
                                </button>
                            </div>
                        </Field>
                    </div>
                </div>

                {saveError?.section === "settings" && (
                    <ErrorBox message={saveError.message} rejected={saveError.rejected} />
                )}
            </div>

            {/* ── 4. Per-surface scope ─────────────────────────────────────── */}
            <div className={CARD}>
                <div className="flex items-center justify-between gap-3 mb-2">
                    <h3 className={HEADING}>Where screening applies</h3>
                    {saving && <span className="text-[11px] text-gray-400 dark:text-gray-500">Saving…</span>}
                </div>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    A surface that is off is meant to skip screening completely. Shown is what the server enforces: anything other
                    than an explicit <code className="text-[10px]">false</code> counts as on.
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                    {SCOPE_KEYS.map((s) => {
                        const on = mm.scope?.[s.key] !== false;
                        return (
                            <label
                                key={s.key}
                                className={`flex items-center gap-2.5 p-2 rounded-lg min-h-11 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${throttleSave ? "opacity-60" : ""}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={on}
                                    disabled={throttleSave}
                                    onChange={() => saveMedia({ scope: { [s.key]: !on } }, s.label, "scope")}
                                    className="w-4 h-4 accent-black dark:accent-white shrink-0"
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-xs font-medium text-gray-900 dark:text-gray-100">{s.label}</span>
                                    <span className="block text-[10px] text-gray-400 dark:text-gray-500 font-mono">{s.key}</span>
                                </span>
                            </label>
                        );
                    })}
                </div>

                <div className="mt-3 space-y-2">
                    <Note tone="info" title="Verify a switch with the tester below before relying on it.">
                        <p>
                            These keys are the surface ids the server passes in (<code className="text-[10px]">postImage</code>,{" "}
                            <code className="text-[10px]">dm</code>…) and the lookup is{" "}
                            <code className="text-[10px]">scope[surface]</code>, so a stored key of{" "}
                            <code className="text-[10px]">false</code> genuinely disables that surface. If a surface is disabled here,
                            the tester returns a verdict with reason{" "}
                            <code className="text-[10px]">media-moderation-disabled</code> — that is the confirmation.
                        </p>
                        <p className="mt-1.5">
                            Note that no upload path currently uses the <code className="text-[10px]">avatar</code> surface, so that
                            switch is stored but not yet enforced.
                        </p>
                    </Note>
                </div>

                {saveError?.section === "scope" && (
                    <ErrorBox message={saveError.message} rejected={saveError.rejected} />
                )}
            </div>

            {/* ── 5. Media tester ──────────────────────────────────────────── */}
            <div className={CARD}>
                <h3 className={`${HEADING} mb-1`}>Media tester</h3>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    Runs one URL through the real pipeline without storing anything. This is the only way to find out what the server
                    would actually do.
                </p>

                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] items-end">
                    <Field label="Media URL">
                        <input
                            value={mediaUrl}
                            onChange={(e) => setMediaUrl(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") runMediaTest(); }}
                            placeholder="https://res.cloudinary.com/…/image/upload/…"
                            className={INPUT}
                        />
                    </Field>
                    <Field label="Surface">
                        <select value={mediaSurface} onChange={(e) => setMediaSurface(e.target.value)} className={INPUT}>
                            {MEDIA_SURFACES.map((s) => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                        </select>
                    </Field>
                    <button type="button" onClick={runMediaTest} disabled={mediaRunning} className={`${BTN_PRIMARY} h-11`}>
                        {mediaRunning ? "Testing…" : "Test"}
                    </button>
                </div>

                <div className="mt-3 space-y-2">
                    <ErrorBox message={mediaError} onRetry={runMediaTest} />
                    {mediaRunning && <Spinner label="Screening the URL…" />}

                    {mediaResult && (
                        <>
                            {/* The single most important field: the server's own note that nothing looked at the image. */}
                            {mediaResult.note && (
                                <Note tone="warn" title="No classifier ran — the pixels were NOT examined.">
                                    {mediaResult.note}
                                </Note>
                            )}
                            {!mediaResult.note && !mediaResult.checked && mediaResult.allowed && (
                                <Note tone="warn" title="Nothing was screened at all.">
                                    Reason <code className="text-[10px]">{mediaResult.reason}</code> — media moderation is off, or
                                    this surface is switched off. The URL was not checked for anything.
                                </Note>
                            )}
                            {!mediaResult.note && !mediaResult.checked && !mediaResult.allowed && (
                                <Note tone="warn" title="The provider did not answer, so this is a setup problem.">
                                    Reason <code className="text-[10px]">{mediaResult.reason}</code> — a provider error, a missing
                                    credential or an unavailable add-on, turned into a rejection by the failure mode. It says nothing
                                    about the image itself.
                                </Note>
                            )}
                            {!mediaResult.note && mediaResult.checked && !mediaResult.allowed && (
                                <Note tone="warn" title="Rejected by a structural check, not by detection.">
                                    Reason <code className="text-[10px]">{mediaResult.reason}</code> — a URL or host rule rejected
                                    this, with no classifier involved. Fix the URL or the host allowlist; no amount of detector tuning
                                    will change this outcome.
                                </Note>
                            )}

                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                                <div className="flex items-center gap-2 flex-wrap px-3 py-2.5">
                                    <Badge tone={mediaResult.allowed ? "ok" : "danger"}>
                                        {mediaResult.allowed ? "ALLOWED" : "REJECTED"}
                                    </Badge>
                                    <Badge tone={mediaResult.checked ? "info" : "warn"}>
                                        {mediaResult.checked ? "pixels were checked" : "NOT CHECKED"}
                                    </Badge>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        surface <span className="font-mono">{mediaResult.surface}</span>
                                    </span>
                                </div>
                                <div className="px-3 py-2">
                                    <Kv k="reason" v={mediaResult.reason} mono />
                                    <Kv k="confidence" v={mediaResult.confidence === null ? null : pct(mediaResult.confidence)} />
                                    <Kv k="provider" v={mediaResult.provider} mono />
                                    <Kv
                                        k="labels"
                                        v={Array.isArray(mediaResult.labels) && mediaResult.labels.length ? mediaResult.labels.join(", ") : null}
                                        mono
                                    />
                                    {mediaResult.cloudinary ? (
                                        <Kv
                                            k="cloudinary"
                                            v={`${mediaResult.cloudinary.resourceType} · ${mediaResult.cloudinary.publicId}${
                                                mediaResult.cloudinary.format ? `.${mediaResult.cloudinary.format}` : ""
                                            }`}
                                            mono
                                        />
                                    ) : (
                                        <div className="py-1 min-w-0">
                                            <span className="text-[11px] text-gray-400 dark:text-gray-500">cloudinary</span>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                                Not a Cloudinary delivery URL, so there is no public id to address — which also means
                                                it cannot be destroyed on reject, only left in place.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {Array.isArray(mediaResult.labels) && mediaResult.labels.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {mediaResult.labels.map((l) => (
                                        <span
                                            key={l}
                                            className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[11px] font-mono"
                                        >
                                            {l}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── 6. Text tester ───────────────────────────────────────────── */}
            <div className={CARD}>
                <h3 className={`${HEADING} mb-1`}>Text tester</h3>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    The keyword matcher. This one is fully implemented and does not need a provider — it matches configured terms, not
                    images.
                </p>

                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] items-end">
                    <Field label="Text to test">
                        <textarea
                            value={textValue}
                            onChange={(e) => setTextValue(e.target.value)}
                            rows={2}
                            placeholder="Type a caption, comment or message…"
                            className={`${INPUT} resize-y min-h-11`}
                        />
                    </Field>
                    <Field label="Surface">
                        <select value={textSurface} onChange={(e) => setTextSurface(e.target.value)} className={INPUT}>
                            {TEXT_SURFACES.map((s) => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                        </select>
                    </Field>
                    <button type="button" onClick={runTextTest} disabled={textRunning} className={`${BTN_PRIMARY} h-11`}>
                        {textRunning ? "Testing…" : "Test"}
                    </button>
                </div>

                <div className="mt-3 space-y-2">
                    <ErrorBox message={textError} onRetry={runTextTest} />
                    {textRunning && <Spinner label="Matching terms…" />}

                    {textResult && (
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
                                <Badge tone={textResult.blocked ? "danger" : "ok"}>
                                    {textResult.blocked ? "BLOCKED" : "ALLOWED"}
                                </Badge>
                                <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{textResult.reason}</span>
                            </div>

                            <div className="px-3 py-2">
                                {Array.isArray(textResult.matches) && textResult.matches.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {textResult.matches.map((m, i) => (
                                            <span
                                                key={`${m}-${i}`}
                                                className="px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-[11px] font-mono"
                                            >
                                                {typeof m === "string" ? m : JSON.stringify(m)}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">No term matched.</p>
                                )}

                                <details open className="mt-1">
                                    <summary className="text-xs font-semibold text-gray-600 dark:text-gray-300 cursor-pointer min-h-10 flex items-center">
                                        Gates — which rule decided this
                                    </summary>
                                    <div className="py-1">
                                        <Kv k="blockNudity" v={textResult.gates?.blockNudity ? "on (text filter active)" : "OFF (text filter disabled)"} />
                                        <Kv
                                            k="surfaceEnabled"
                                            v={textResult.gates?.surfaceEnabled ? "on for this surface" : "OFF for this surface"}
                                        />
                                        <Kv k="keywordCount" v={textResult.gates?.keywordCount} />
                                        {textResult.gates?.matchOptions && (
                                            <div className="mt-1 min-w-0">
                                                <span className="text-[11px] text-gray-400 dark:text-gray-500">matchOptions</span>
                                                <div className="flex flex-wrap gap-1.5 mt-1">
                                                    {Object.entries(textResult.gates.matchOptions).map(([k, v]) => (
                                                        <span
                                                            key={k}
                                                            className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] font-mono"
                                                        >
                                                            {k}={String(v)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </details>

                                {!textResult.blocked && textResult.gates && (textResult.gates.blockNudity === false || textResult.gates.surfaceEnabled === false || !textResult.gates.keywordCount) && (
                                    <div className="mt-2">
                                        <Note tone="warn" title="Nothing was blocked, and a gate is the reason.">
                                            A block that never fires is almost always one of these:{" "}
                                            {textResult.gates.blockNudity === false && "blockNudity is off, "}
                                            {textResult.gates.surfaceEnabled === false && "this surface is disabled, "}
                                            {!textResult.gates.keywordCount && "the keyword list is empty, "}
                                            otherwise check the terms and the match options above.
                                        </Note>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── 7. Review queue ──────────────────────────────────────────── */}
            <div className={CARD}>
                <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="min-w-0">
                        <h3 className={HEADING}>Review queue</h3>
                        <p className={`${SUBTLE} mt-0.5`}>Flagged and rejected media waiting on a decision.</p>
                    </div>
                    <button type="button" onClick={loadQueue} disabled={queueLoading} className={`${BTN_GHOST} shrink-0`}>
                        {queueLoading ? "Loading…" : "Load queue"}
                    </button>
                </div>

                <div className="space-y-2">
                    <ErrorBox message={queueError} onRetry={loadQueue} />
                    {queueLoading && !queue && <Spinner label="Loading verdicts…" />}

                    {queue && (
                        <>
                            <Note tone="info" title="This is not an audit log.">
                                {queue.note}
                            </Note>

                            {queue.items.length === 0 ? (
                                <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
                                    Nothing flagged. The queue only fills when a verdict is recorded on this running process, so an empty
                                    list does not mean nothing was ever blocked.
                                </p>
                            ) : (
                                <>
                                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                        Showing {queue.items.length} of {queue.total} recorded verdicts.
                                    </p>
                                    <div className="space-y-2">
                                        {queue.items.map((item) => (
                                            <div
                                                key={item.id || item.url}
                                                className="rounded-xl border border-gray-200 dark:border-gray-700 p-3"
                                            >
                                                <div className="flex gap-3 min-w-0">
                                                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0">
                                                        {/* A plain <img>, deliberately: these URLs are whatever an
                                                            uploader submitted, so they include Giphy and other
                                                            hosts that are not in next.config.mjs
                                                            remotePatterns. next/image would hard-fail on
                                                            those, and a review queue that refuses to render
                                                            half its thumbnails is useless. */}
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={item.url}
                                                            alt={`Flagged media from ${item.sender || "unknown sender"}`}
                                                            loading="lazy"
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                                                        />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <Badge tone={item.allowed ? "warn" : "danger"}>
                                                                {item.allowed ? "FLAGGED" : "REJECTED"}
                                                            </Badge>
                                                            <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 break-all min-w-0">
                                                                {item.reason}
                                                            </span>
                                                            {item.confidence !== null && item.confidence !== undefined && (
                                                                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                                                    {pct(item.confidence)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 break-all min-w-0">
                                                            from <span className="font-medium">{item.sender || "unknown"}</span>
                                                            {item.postId ? ` · post ${item.postId}` : ""}
                                                            {item.at ? ` · ${new Date(item.at).toLocaleString()}` : ""}
                                                        </p>
                                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono break-all min-w-0">
                                                            {item.url}
                                                        </p>
                                                        {Array.isArray(item.labels) && item.labels.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                                {item.labels.map((l) => (
                                                                    <span
                                                                        key={l}
                                                                        className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] font-mono"
                                                                    >
                                                                        {l}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 mt-3 flex-wrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setDecision({ url: item.url, decision: "approve" }); setAllowlist(false); }}
                                                        className="px-3 py-2 min-h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setDecision({ url: item.url, decision: "reject" }); setAllowlist(false); }}
                                                        className="px-3 py-2 min-h-10 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
                                                    >
                                                        Reject
                                                    </button>
                                                    {isCloudinaryHost(item.url) ? (
                                                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                                            Cloudinary asset — a reject destroys the file
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                                            Not Cloudinary — a reject can only log it, not delete it
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── 8. Statistics ────────────────────────────────────────────── */}
            <div className={CARD}>
                <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="min-w-0">
                        <h3 className={HEADING}>Statistics</h3>
                        <p className={`${SUBTLE} mt-0.5`}>Counts from the same in-process buffer, so they reset on restart.</p>
                    </div>
                    <button type="button" onClick={loadStats} disabled={statsLoading} className={`${BTN_GHOST} shrink-0`}>
                        {statsLoading ? "Loading…" : "Load stats"}
                    </button>
                </div>

                <div className="space-y-2">
                    <ErrorBox message={statsError} onRetry={loadStats} />
                    {statsLoading && !stats && <Spinner />}

                    {stats && (
                        <>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { label: "Last 24h", w: stats.last24h },
                                    { label: "Last 7 days", w: stats.last7d },
                                ].map((row) => (
                                    <div key={row.label} className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5 min-w-0">
                                        <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 mb-1.5">{row.label}</p>
                                        <Kv k="screened" v={row.w?.screened} />
                                        <Kv k="blocked" v={row.w?.blocked} />
                                        <Kv k="flagged" v={row.w?.flagged} />
                                    </div>
                                ))}
                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5 min-w-0">
                                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 mb-1.5">Buffer</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.bufferSize ?? 0}</p>
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                                        verdicts held in memory, capped at 500
                                    </p>
                                </div>
                            </div>

                            <div className="pt-1">
                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Verdicts by reason</p>
                                {reasonBars.length === 0 ? (
                                    <p className="text-xs text-gray-400 dark:text-gray-500">Nothing recorded yet.</p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {reasonBars.map((b) => (
                                            <div key={b.reason} className="min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[11px] font-mono text-gray-600 dark:text-gray-400 truncate min-w-0">
                                                        {b.reason}
                                                    </span>
                                                    <span className="text-[11px] font-bold text-gray-900 dark:text-gray-100 shrink-0">
                                                        {b.n}
                                                    </span>
                                                </div>
                                                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 mt-0.5 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-gray-400 dark:bg-gray-500"
                                                        style={{ width: `${Math.max(b.w, 2)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {!detecting && (
                                <Note tone="warn" title="These numbers are not moderation results.">
                                    With no provider configured, every media verdict here comes from a structural check or from the
                                    provider never running. A high “screened” count means the server looked at URLs, not at images.
                                </Note>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── 9. Backfill scanner ──────────────────────────────────────── */}
            <div className={CARD}>
                <h3 className={`${HEADING} mb-1`}>Backfill scanner</h3>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    Screens content that was already published, newest first. Start with a dry run and read the list before you act on
                    it.
                </p>

                <div className="grid gap-2 sm:grid-cols-3 items-end">
                    <Field label="Limit" hint="1–1000 posts considered.">
                        <input
                            type="number"
                            min="1"
                            max="1000"
                            value={scanLimit}
                            onChange={(e) => setScanLimit(e.target.value)}
                            className={INPUT}
                        />
                    </Field>
                    <Field label="Surface" hint="Which gate to evaluate the URLs under.">
                        <select value={scanSurface} onChange={(e) => setScanSurface(e.target.value)} className={INPUT}>
                            {MEDIA_SURFACES.map((s) => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                        </select>
                    </Field>
                    <div className="flex items-end gap-2">
                        <button type="button" onClick={runScan} disabled={scanRunning} className={`${BTN_PRIMARY} h-11 flex-1`}>
                            {scanRunning ? "Scanning…" : scanDry ? "Dry run" : "Run for real"}
                        </button>
                    </div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3 py-1">
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Dry run</p>
                        <p className={`${SUBTLE} mt-0.5 leading-relaxed`}>
                            A dry run changes nothing at all: no post is touched, no asset is destroyed, nothing is written to the
                            queue. Turn it off only when you have read the list and intend to act on it.
                        </p>
                    </div>
                    <Toggle
                        label="Dry run"
                        on={scanDry}
                        onChange={() => setScanDry(!scanDry)}
                        tone={scanDry ? "green" : "red"}
                    />
                </div>

                <div className="mt-2">
                    <Note tone="info" title="This is slow on purpose, and it is rate limited.">
                        The server walks the collection one item at a time on purpose — firing a hundred provider calls at once is how
                        you get throttled. Expect a few minutes per hundred items, and expect a long scan to hit the reverse proxy
                        timeout. If the request times out in the browser the server may still be working; re-run it with a smaller
                        limit rather than assuming it failed.
                    </Note>
                </div>

                <div className="mt-3 space-y-2">
                    <ErrorBox message={scanError} onRetry={scanError ? runScan : null} />
                    {scanRunning && <Spinner label="Screening existing content. This takes a while by design…" />}

                    {scanResult && (
                        <>
                            {scanResult.note && <Note tone={scanResult.dryRun ? "info" : "warn"}>{scanResult.note}</Note>}

                            <div className="grid grid-cols-3 gap-2">
                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5">
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500">scanned</p>
                                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{scanResult.scanned}</p>
                                </div>
                                <div className="rounded-xl border border-red-200 dark:border-red-800 p-2.5">
                                    <p className="text-[10px] text-red-500 dark:text-red-400">
                                        {scanResult.dryRun ? "would block" : "blocked"}
                                    </p>
                                    <p className="text-xl font-bold text-red-600 dark:text-red-400">{scanResult.wouldBlock}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5">
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500">errors</p>
                                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{scanResult.errors}</p>
                                </div>
                            </div>

                            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                                Posts considered: {scanResult.truncatedAt} of a requested limit of {scanResult.limit}.{" "}
                                {scanResult.errors > 0
                                    ? "“errors” counts items that came back allowed but unchecked — the screen did not happen, which is not the same as clean."
                                    : ""}
                            </p>

                            {Array.isArray(scanResult.items) && scanResult.items.length > 0 && (
                                <div className="space-y-1.5">
                                    {scanResult.items.map((it, i) => (
                                        <div
                                            key={`${it.url}-${i}`}
                                            className="rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-2 min-w-0"
                                        >
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[10px] font-mono text-red-600 dark:text-red-400 break-all min-w-0">
                                                    {it.reason}
                                                </span>
                                                {it.confidence !== null && it.confidence !== undefined && (
                                                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{pct(it.confidence)}</span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 break-all min-w-0">
                                                {it.sender || "unknown sender"}
                                                {it.postId ? ` · post ${it.postId}` : ""}
                                            </p>
                                            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono break-all min-w-0">{it.url}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── 10. Link policy ──────────────────────────────────────────── */}
            <div className={CARD}>
                <h3 className={`${HEADING} mb-1`}>Link policy</h3>
                <p className={`${SUBTLE} mb-3 leading-relaxed`}>
                    Text-level domain rules. Independent of media screening, and the only part of this panel that needs no provider.
                </p>

                <div className="space-y-2">
                    <ErrorBox message={linksError} onRetry={loadLinks} />
                    {saving && <span className="text-[11px] text-gray-400 dark:text-gray-500">Saving…</span>}

                    {!links ? (
                        !linksError && <Spinner label="Loading link policy…" />
                    ) : (
                        <>
                            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                <SwitchRow
                                    label="Block all links"
                                    hint="Refuse any URL that is not on the allowlist. Off means any http(s) host is accepted unless it is explicitly blocked."
                                    on={links.blockAllLinks}
                                    tone="amber"
                                    disabled={throttleSave}
                                    onChange={() => saveLinks({ blockAllLinks: !links.blockAllLinks }, "Block all links")}
                                />
                                <SwitchRow
                                    label="Block phishing patterns"
                                    hint="Reject obviously credential-harvesting hostnames. It is a heuristic, not a classifier — it catches the crude cases and nothing subtler."
                                    on={links.blockPhishingPatterns}
                                    disabled={throttleSave}
                                    onChange={() => saveLinks({ blockPhishingPatterns: !links.blockPhishingPatterns }, "Phishing patterns")}
                                />
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 pt-2">
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                                        Blocked hosts ({(links.blockedDomains || []).length})
                                    </p>
                                    {(links.blockedDomains || []).length === 0 ? (
                                        <p className="text-xs text-gray-400 dark:text-gray-500">None — every host is allowed.</p>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {links.blockedDomains.map((d) => (
                                                <span
                                                    key={d}
                                                    className="px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[11px] font-mono break-all"
                                                >
                                                    {d}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                                        Allowed hosts ({(links.allowedDomains || []).length})
                                    </p>
                                    {(links.allowedDomains || []).length === 0 ? (
                                        <p className="text-xs text-gray-400 dark:text-gray-500">None — nothing is exempt.</p>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {links.allowedDomains.map((d) => (
                                                <span
                                                    key={d}
                                                    className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono break-all"
                                                >
                                                    {d}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="pt-2">
                                <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-end">
                                    <Field label="Test a URL against the policy">
                                        <input
                                            value={linkUrl}
                                            onChange={(e) => setLinkUrl(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") runLinkCheck(); }}
                                            placeholder="https://example.com/page"
                                            className={INPUT}
                                        />
                                    </Field>
                                    <button type="button" onClick={runLinkCheck} disabled={linkTesting} className={`${BTN_PRIMARY} h-11`}>
                                        {linkTesting ? "Checking…" : "Check"}
                                    </button>
                                </div>

                                <div className="mt-2 space-y-2">
                                    <ErrorBox message={linkTestError} onRetry={runLinkCheck} />
                                    {linkVerdict && (
                                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 space-y-1.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Badge
                                                    tone={
                                                        linkVerdict.verdict === "allowed" || linkVerdict.verdict === "permitted"
                                                            ? "ok"
                                                            : linkVerdict.verdict === "suspicious-subdomain"
                                                            ? "warn"
                                                            : "danger"
                                                    }
                                                >
                                                    {linkVerdict.verdict}
                                                </Badge>
                                                <span className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all min-w-0">
                                                    {linkVerdict.host}
                                                </span>
                                            </div>
                                            {linkVerdict.verdict === "suspicious-subdomain" && (
                                                <Note tone="warn" title="Contains a blocked domain but is not one.">
                                                    This is the common bypass shape — <code className="text-[10px]">evil-example.com</code>{" "}
                                                    against a block on <code className="text-[10px]">example.com</code>. It is reported
                                                    rather than blocked, so decide whether the blocklist needs the parent domain.
                                                </Note>
                                            )}
                                            {linkVerdict.matchedRule === false && (
                                                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                                    No blocklist entry matched. The verdict above came from the general policy.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {saveError?.section === "links" && (
                                <ErrorBox message={saveError.message} rejected={saveError.rejected} />
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── 11. Orphaned media ───────────────────────────────────────── */}
            <div className={CARD}>
                <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="min-w-0">
                        <h3 className={HEADING}>Orphaned media</h3>
                        <p className={`${SUBTLE} mt-0.5`}>What the database still points at, and what it cannot see.</p>
                    </div>
                    <button type="button" onClick={loadOrphans} disabled={orphansLoading} className={`${BTN_GHOST} shrink-0`}>
                        {orphansLoading ? "Scanning…" : "Scan database"}
                    </button>
                </div>

                <div className="space-y-2">
                    <ErrorBox message={orphansError} onRetry={loadOrphans} />
                    {orphansLoading && !orphans && <Spinner label="Reading posts and stories…" />}

                    {orphans && (
                        <>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5">
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500">referenced</p>
                                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{orphans.referencedCount}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5">
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500">posts scanned</p>
                                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{orphans.scannedPosts}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5">
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500">stories scanned</p>
                                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{orphans.scannedStories}</p>
                                </div>
                            </div>

                            <Note tone="warn" title="This cannot tell you what is actually orphaned.">
                                {orphans.note}
                            </Note>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                                The consequence worth stating plainly: if a rejected upload was never destroyed, it is invisible here
                                and it stays online. The “destroy the asset on reject” setting in the detection card is what prevents
                                that, not this scan.
                            </p>

                            {Array.isArray(orphans.referencedSample) && orphans.referencedSample.length > 0 && (
                                <details>
                                    <summary className="text-xs font-semibold text-gray-600 dark:text-gray-300 cursor-pointer min-h-10 flex items-center">
                                        Sample of referenced media ({orphans.referencedSample.length})
                                    </summary>
                                    <ul className="mt-1 space-y-1">
                                        {orphans.referencedSample.map((u) => (
                                            <li key={u} className="text-[10px] font-mono text-gray-500 dark:text-gray-400 break-all min-w-0">
                                                {u}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Decision modal ───────────────────────────────────────────── */}
            {decision && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-5 space-y-4">
                        <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">
                            {decision.decision === "approve" ? "Approve this item?" : "Reject and destroy this asset?"}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {decision.decision === "approve" ? (
                                <>
                                    The verdict is cleared and the cached result is dropped, so the same URL will not be rejected
                                    again from cache.
                                </>
                            ) : isCloudinaryHost(decision.url) ? (
                                <>
                                    The post is marked rejected and the Cloudinary asset is destroyed — the raw file stops being
                                    fetchable. This is not undoable from this panel.
                                </>
                            ) : (
                                <>
                                    This URL is not a Cloudinary delivery URL, so nothing can actually be deleted. The item is
                                    recorded as rejected by a moderator and the post it belongs to is not touched.
                                </>
                            )}
                        </p>

                        {decision.decision === "approve" ? (
                            <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer min-h-11">
                                <input
                                    type="checkbox"
                                    checked={allowlist}
                                    onChange={(e) => setAllowlist(e.target.checked)}
                                    className="mt-0.5 w-4 h-4 accent-black dark:accent-white shrink-0"
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100">
                                        Also allowlist {hostOf(decision.url) || "this domain"}
                                    </span>
                                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                                        Every URL on that host then bypasses the link policy. Only do this for a host you control.
                                    </span>
                                </span>
                            </label>
                        ) : (
                            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
                                <p className="text-[11px] text-red-700 dark:text-red-300 font-mono break-all min-w-0">{decision.url}</p>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => { setDecision(null); setAllowlist(false); }}
                                disabled={resolving}
                                className="flex-1 py-2.5 min-h-11 text-sm font-semibold rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => resolveItem(decision.url, decision.decision, allowlist)}
                                disabled={resolving}
                                className={`flex-1 py-2.5 min-h-11 text-sm font-semibold rounded-xl text-white disabled:opacity-50 ${
                                    decision.decision === "approve"
                                        ? "bg-emerald-600 hover:bg-emerald-700"
                                        : "bg-red-600 hover:bg-red-700"
                                }`}
                            >
                                {resolving ? "Working…" : decision.decision === "approve" ? "Approve" : "Reject & destroy"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
