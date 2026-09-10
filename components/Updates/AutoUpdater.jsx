"use client";

import { useEffect, useRef, useState } from "react";

const CHECK_INTERVAL = 30 * 60 * 1000;

export default function AutoUpdater() {
    const [update, setUpdate] = useState(null);
    const [progress, setProgress] = useState(null);
    const [status, setStatus] = useState("idle");
    const [closed, setClosed] = useState(false);
    const checking = useRef(false);

    const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    const checkForUpdate = async () => {
        if (!inTauri || checking.current) return;
        checking.current = true;
        try {
            const { check } = await import("@tauri-apps/plugin-updater");
            const found = await check();
            setUpdate(found);
        } catch (e) {
            if (inTauri) {
                console.error("[AutoUpdater] update check failed:", e);
            }
        } finally {
            checking.current = false;
        }
    };

    useEffect(() => {
        if (!inTauri) return;
        const t = setTimeout(checkForUpdate, 0);
        const id = setInterval(checkForUpdate, CHECK_INTERVAL);
        const onFocus = () => checkForUpdate();
        window.addEventListener("focus", onFocus);
        return () => {
            clearTimeout(t);
            clearInterval(id);
            window.removeEventListener("focus", onFocus);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const install = async () => {
        if (!update) return;
        setStatus("downloading");
        try {
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await update.downloadAndInstall((event) => {
                if (event.event === "Started") {
                    setProgress({ loaded: 0, total: event.data.contentLength || 0 });
                } else if (event.event === "Progress") {
                    setProgress((p) => ({
                        loaded: (p?.loaded || 0) + event.data.chunkLength,
                        total: p?.total || 0,
                    }));
                }
            });
            setStatus("installing");
            await relaunch();
        } catch {
            setStatus("error");
        }
    };

    if (!inTauri || closed) return null;

    // Some Tauri versions expose the incoming version on `version`; fall back
    // to `currentVersion` so the popup never shows a blank "v".
    const incomingVersion = update?.version || update?.currentVersion || "";

    return (
        <div className="fixed bottom-4 right-4 z-[60] w-80 max-w-[calc(100vw-2rem)]">
            <div className="rounded-xl bg-gray-900 text-white shadow-2xl border border-gray-700/60 overflow-hidden">
                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center text-white font-black shrink-0">
                                A
                            </div>
                            <div>
                                <p className="text-sm font-bold leading-tight">
                                    AnonTweet update available
                                </p>
                                <p className="text-xs text-gray-400 leading-tight">
                                    {incomingVersion ? `v${incomingVersion} — ` : ""}stay current, just like Discord.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setClosed(true)}
                            aria-label="Dismiss update"
                            className="p-1 text-gray-400 hover:text-white transition-colors shrink-0"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {status === "downloading" && (
                        <div className="mt-3">
                            <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                                <span>Downloading update…</span>
                                <span>{progress?.total ? `${Math.round((progress.loaded / progress.total) * 100)}%` : ""}</span>
                            </div>
                            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 rounded-full transition-all"
                                    style={{ width: progress?.total ? `${Math.round((progress.loaded / progress.total) * 100)}%` : "0%" }}
                                />
                            </div>
                        </div>
                    )}

                    {status === "installing" && (
                        <p className="mt-3 text-xs text-gray-400">Installing… this will restart instantly.</p>
                    )}

                    {status === "error" && (
                        <p className="mt-3 text-xs text-red-400">Update failed — try again later or reinstall.</p>
                    )}

                    {update && status !== "downloading" && status !== "installing" && (
                        <div className="mt-3 flex gap-2">
                            <button
                                onClick={install}
                                disabled={status === "error"}
                                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                            >
                                {status === "error" ? "Try again" : "Update & Restart"}
                            </button>
                            <button
                                onClick={() => setClosed(true)}
                                className="px-3 py-2 text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                            >
                                Later
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}