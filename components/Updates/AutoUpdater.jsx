"use client";

import { useEffect, useRef, useState } from "react";

const CHECK_INTERVAL = 30 * 60 * 1000;
const DISMISS_KEY = "at_updater_dismissed_v";

export default function AutoUpdater() {
    const [update, setUpdate] = useState(null);
    const [status, setStatus] = useState("idle"); // idle | downloading | downloaded | installing | error
    const [closed, setClosed] = useState(false);
    const checking = useRef(false);
    const offered = useRef(null);

    const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    const checkForUpdate = async () => {
        if (!inTauri || checking.current) return;
        checking.current = true;
        try {
            const { check } = await import("@tauri-apps/plugin-updater");
            const found = await check();
            if (!found) return;
            if (offered.current === found.version) return;
            offered.current = found.version;
            // Remembered "Later" for this exact version? Stay fully silent.
            if (typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_KEY) === found.version) return;
            setUpdate(found);
            setStatus("downloading");
            await found.download((event) => {
                if (event.event === "Finished") setStatus("downloaded");
            });
        } catch (e) {
            if (inTauri) {
                console.error("[AutoUpdater] update check failed:", e);
            }
        } finally {
            checking.current = false;
        }
    };

    // Check on launch, then on a quiet cadence. No focus listener — an update
    // shouldn't nag every time you return to the window.
    useEffect(() => {
        if (!inTauri) return;
        const t = setTimeout(checkForUpdate, 0);
        const id = setInterval(checkForUpdate, CHECK_INTERVAL);
        return () => {
            clearTimeout(t);
            clearInterval(id);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const install = async () => {
        if (!update) return;
        setStatus("installing");
        try {
            await update.install();
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await relaunch();
        } catch {
            setStatus("error");
        }
    };

    const later = () => {
        if (update?.version && typeof localStorage !== "undefined") {
            try { localStorage.setItem(DISMISS_KEY, update.version); } catch {}
        }
        setClosed(true);
        setStatus("idle");
    };

    if (!inTauri || closed) return null;

    // Download silently — only surface once it's ready to install.
    if (status === "downloading") return null;

    const incomingVersion = update?.version || update?.currentVersion || "";

    return (
        <div className="fixed bottom-4 right-4 z-[60] w-auto max-w-[calc(100vw-2rem)]">
            {status === "downloaded" && (
                <div className="rounded-xl bg-gray-900 text-white shadow-2xl border border-gray-700/60 px-4 py-3 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-black shrink-0 text-xs">A</span>
                    <div className="min-w-0">
                        <p className="text-sm font-bold leading-tight">
                            Update ready{incomingVersion ? ` · v${incomingVersion}` : ""}
                        </p>
                        <p className="text-xs text-gray-400 leading-tight truncate">Restart to install — it takes a second.</p>
                    </div>
                    <button
                        onClick={install}
                        className="ml-1 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shrink-0"
                    >
                        Restart now
                    </button>
                    <button
                        onClick={later}
                        aria-label="Later"
                        className="p-1 text-gray-400 hover:text-white transition-colors shrink-0"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {status === "installing" && (
                <div className="rounded-xl bg-gray-900 text-white shadow-2xl border border-gray-700/60 px-4 py-3 flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-gray-600 border-t-white rounded-full animate-spin shrink-0" />
                    <p className="text-sm font-bold">Installing update…</p>
                </div>
            )}

            {status === "error" && (
                <div className="rounded-xl bg-gray-900 text-white shadow-2xl border border-red-500/50 px-4 py-3 flex items-center gap-3">
                    <p className="text-sm font-bold">Update failed</p>
                    <button onClick={() => setStatus("downloaded")} className="text-xs font-bold text-[#5865f2] hover:underline">
                        Retry
                    </button>
                    <button onClick={later} aria-label="Later" className="p-1 text-gray-400 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}