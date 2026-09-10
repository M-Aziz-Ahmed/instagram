"use client";

import { useCallback, useEffect, useState } from "react";
import { showBackgroundNotification, getDesktopNotificationLog } from "@/utils/systemNotification";

const DEBUG_FLAG = "tauri-debug-panel";

function debugEnabled() {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "1") {
        try { window.localStorage.setItem(DEBUG_FLAG, "1"); } catch {}
        return true;
    }
    try { return window.localStorage.getItem(DEBUG_FLAG) === "1"; } catch { return false; }
}

export default function TauriDesktopDiagnostics() {
    const inTauri = typeof window !== "undefined" &&
        (typeof window.__TAURI_INTERNALS__ !== "undefined" || "__TAURI_INTERNALS__" in window);

    const [version, setVersion] = useState("");
    const [status, setStatus] = useState(null);
    const [log, setLog] = useState([]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!inTauri) return;
        (async () => {
            try {
                const { getVersion } = await import("@tauri-apps/api/app");
                setVersion(await getVersion());
            } catch {}
        })();
    }, [inTauri]);

    const refresh = useCallback(() => {
        setLog(getDesktopNotificationLog());
    }, []);

    const toggleLog = useCallback(() => {
        setOpen((v) => {
            const next = !v;
            if (next) refresh();
            return next;
        });
    }, [refresh]);

    if (!inTauri) return null;
    if (!debugEnabled()) return null;

    const testNative = async () => {
        setStatus({ kind: "pending", text: "Sending native notification…" });
        const ok = await showBackgroundNotification("Test notification", {
            body: "If you can see this, desktop notifications are working!",
            url: "/",
        });
        setStatus(
            ok
                ? { kind: "ok", text: "Notification sent (native or fallback). Check your screen & action center." }
                : { kind: "err", text: "Notification failed. Open the log to see why." }
        );
        refresh();
    };

    const testToast = async () => {
        setStatus({ kind: "pending", text: "Showing in-app toast window…" });
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("show_toast", {
                title: "Test notification",
                body: "In-app toast window works!",
                url: window.location.href,
            });
            setStatus({ kind: "ok", text: "In-app toast shown." });
        } catch (e) {
            setStatus({ kind: "err", text: `In-app toast failed: ${e}` });
        }
    };

    const statusColor =
        status?.kind === "ok" ? "text-green-400" :
        status?.kind === "err" ? "text-red-400" :
        status?.kind === "pending" ? "text-yellow-400" : "text-gray-400";

    return (
        <div className="fixed bottom-4 left-4 z-[70]">
            <div className="rounded-xl bg-gray-900 text-white shadow-2xl border border-gray-700/60 px-3 py-2 text-xs space-y-2 min-w-[280px]">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        Desktop {version ? `v${version}` : ""}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={testNative}
                            className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 font-bold transition-colors"
                        >
                            Test notification
                        </button>
                        <button
                            onClick={testToast}
                            className="px-2 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold transition-colors"
                        >
                            Test toast
                        </button>
                        <button
                            onClick={toggleLog}
                            className="px-2 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold transition-colors"
                        >
                            {open ? "Hide log" : "Log"}
                        </button>
                    </div>
                </div>

                {status && <p className={`${statusColor} leading-snug`}>{status.text}</p>}

                {open && (
                    <div className="max-h-40 overflow-y-auto rounded-lg bg-black/40 p-2 text-[10px] leading-snug font-mono space-y-1">
                        {log.length === 0 && <p className="text-gray-500">No notification attempts logged yet.</p>}
                        {log.map((entry, i) => (
                            <div key={i} className="flex gap-1">
                                <span className={entry.status === "ok" ? "text-green-400" : "text-red-400"}>
                                    {entry.status === "ok" ? "OK" : "FAIL"}
                                </span>
                                <span className="text-gray-300">{entry.method}</span>
                                {entry.error && <span className="text-red-400 truncate">— {entry.error}</span>}
                                <span className="text-gray-600 ml-auto shrink-0">{new Date(entry.time).toLocaleTimeString()}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}