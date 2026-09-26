"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CHECK_INTERVAL = 30 * 60 * 1000;
const DISMISS_KEY = "at_updater_dismissed_v";
const CHECK_EVENT = "anon:check-update";

const CARD =
    "rounded-2xl bg-gray-900 text-white shadow-2xl border px-4 py-3 flex items-center gap-3";

function Dismiss({ onClick }) {
    return (
        <button
            onClick={onClick}
            aria-label="Dismiss"
            className="p-1 text-gray-400 hover:text-white transition-colors shrink-0"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
        </button>
    );
}

/**
 * Desktop auto-updater.
 *
 * Two things were wrong with the previous version, and together they made the
 * updater impossible to diagnose:
 *
 *  1. `setStatus("downloading")` was set *before* `found.download(...)`, and
 *     the component renders `null` while downloading. If the download threw,
 *     the catch only wrote to the console and left the status stuck on
 *     "downloading" — so the toast never appeared, the error state never
 *     appeared, and the user got permanent silence. Every retry hit the same
 *     dead end.
 *
 *  2. A failed `check()` (manifest 404, offline, or — most importantly — a
 *     signature that doesn't verify against `plugins.updater.pubkey`) was
 *     swallowed into `console.error`. That renders identically to "you're on
 *     the latest version", which is why a key mismatch looks exactly like
 *     having no updates.
 *
 * So failures are now first-class: they surface with the underlying message
 * and a retry, a manual check reports "up to date" explicitly, and progress is
 * shown instead of a silent wait.
 */
export default function AutoUpdater() {
    const [update, setUpdate] = useState(null);
    const [status, setStatus] = useState("idle"); // idle | checking | downloading | downloaded | installing | uptodate | error
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState("");
    const [closed, setClosed] = useState(false);
    const checking = useRef(false);
    const offered = useRef(null);

    const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    const checkForUpdate = useCallback(
        async ({ manual = false } = {}) => {
            if (!inTauri || checking.current) return;
            checking.current = true;
            setError("");
            if (manual) {
                setClosed(false);
                setStatus("checking");
            }
            try {
                const { check } = await import("@tauri-apps/plugin-updater");
                const found = await check();

                if (!found) {
                    // Distinguish "nothing newer" from "we couldn't tell".
                    // Only claim up-to-date when a check actually completed.
                    if (manual) {
                        setStatus("uptodate");
                        setTimeout(() => setStatus("idle"), 4000);
                    } else {
                        setStatus("idle");
                    }
                    return;
                }

                // Already offered this exact version in this session.
                if (offered.current === found.version) {
                    if (manual) setStatus("uptodate");
                    return;
                }
                offered.current = found.version;

                // "Later" on this exact version? Stay quiet, but a manual check
                // should still confirm what it found.
                const dismissed =
                    typeof localStorage !== "undefined" &&
                    localStorage.getItem(DISMISS_KEY) === found.version;
                if (dismissed) {
                    if (manual) {
                        setStatus("uptodate");
                        setTimeout(() => setStatus("idle"), 4000);
                    }
                    return;
                }

                setClosed(false);
                setUpdate(found);
                setProgress(0);
                setStatus("downloading");

                await found.download((event) => {
                    if (event.event === "Started") {
                        setProgress(0);
                    } else if (event.event === "Progress") {
                        const total = event.data?.contentLength || 0;
                        const done = event.data?.chunkLength || 0;
                        if (total > 0) {
                            setProgress(Math.min(100, Math.round(((done / total) * 100) || 0)));
                        }
                    } else if (event.event === "Finished") {
                        setProgress(100);
                        setStatus("downloaded");
                    }
                });
            } catch (e) {
                // Never leave this on "downloading" — that was the dead end.
                // A verification failure here is the signature/pubkey mismatch,
                // which is worth showing verbatim.
                const message =
                    e?.message || (typeof e === "string" ? e : "Update check failed");
                if (inTauri) console.error("[AutoUpdater] update check failed:", e);
                setUpdate(null);
                setError(message);
                setStatus("error");
            } finally {
                checking.current = false;
            }
        },
        [inTauri],
    );

    // Check on launch, then on a quiet cadence. No focus listener — an update
    // shouldn't nag every time you return to the window.
    useEffect(() => {
        if (!inTauri) return;
        const t = setTimeout(() => checkForUpdate(), 0);
        const id = setInterval(() => checkForUpdate(), CHECK_INTERVAL);
        // Lets a settings row (or a menu item) force a check on demand.
        const onManual = () => checkForUpdate({ manual: true });
        window.addEventListener(CHECK_EVENT, onManual);
        return () => {
            clearTimeout(t);
            clearInterval(id);
            window.removeEventListener(CHECK_EVENT, onManual);
        };
    }, [inTauri, checkForUpdate]);

    const install = async () => {
        if (!update) return;
        setStatus("installing");
        try {
            await update.install();
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await relaunch();
        } catch (e) {
            setError(e?.message || "Install failed");
            setStatus("error");
        }
    };

    const later = () => {
        if (update?.version && typeof localStorage !== "undefined") {
            try {
                localStorage.setItem(DISMISS_KEY, update.version);
            } catch {}
        }
        setClosed(true);
        setStatus("idle");
    };

    if (!inTauri || closed) return null;
    // Downloading shows progress now, so it is no longer a silent state.
    if (status === "idle" || status === "checking") return null;

    const incomingVersion = update?.version || "";

    return (
        <div className="fixed bottom-4 right-4 z-[60] w-auto max-w-[min(24rem,calc(100vw-2rem))] flex flex-col gap-2">
            {status === "downloading" && (
                <div className={`${CARD} border-gray-700/60`}>
                    <div className="h-8 w-8 shrink-0 rounded-full border-2 border-gray-700 border-t-white animate-spin" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-tight">Downloading update…</p>
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                                className="h-full rounded-full bg-[var(--brand-500)] transition-[width] duration-200"
                                style={{ width: `${progress || 8}%` }}
                            />
                        </div>
                        {progress > 0 && (
                            <p className="mt-1 text-[11px] text-gray-400 tabular-nums">{progress}%</p>
                        )}
                    </div>
                    <Dismiss onClick={later} />
                </div>
            )}

            {status === "downloaded" && (
                <div className={`${CARD} border-green-500/40`}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-green-500 text-xs font-black text-white">
                        A
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-tight">
                            Update ready{incomingVersion ? ` · v${incomingVersion}` : ""}
                        </p>
                        <p className="text-xs leading-tight text-gray-400">
                            Restart to install — it takes a second.
                        </p>
                    </div>
                    <button
                        onClick={install}
                        className="shrink-0 rounded-lg bg-[var(--brand-600)] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--brand-700)]"
                    >
                        Restart now
                    </button>
                    <Dismiss onClick={later} />
                </div>
            )}

            {status === "installing" && (
                <div className={`${CARD} border-gray-700/60`}>
                    <div className="h-5 w-5 shrink-0 rounded-full border-2 border-gray-600 border-t-white animate-spin" />
                    <p className="text-sm font-bold">Installing update…</p>
                </div>
            )}

            {status === "uptodate" && (
                <div className={`${CARD} border-gray-700/60`}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4 text-green-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                    </span>
                    <p className="text-sm font-bold">You&rsquo;re up to date</p>
                    <Dismiss onClick={() => setStatus("idle")} />
                </div>
            )}

            {status === "error" && (
                <div className={`${CARD} border-red-500/50 flex-col !items-stretch`}>
                    <div className="flex items-center gap-2">
                        <p className="flex-1 text-sm font-bold">Update failed</p>
                        <Dismiss onClick={() => setStatus("idle")} />
                    </div>
                    <p className="text-xs leading-relaxed text-gray-400 break-words">
                        {error}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => checkForUpdate({ manual: true })}
                            className="shrink-0 rounded-lg bg-[var(--brand-600)] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--brand-700)]"
                        >
                            Retry
                        </button>
                        <span className="text-[11px] text-gray-500">
                            Runs again every 30 min
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
