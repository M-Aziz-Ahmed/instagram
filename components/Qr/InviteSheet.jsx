"use client";

import { useCallback, useEffect, useState } from "react";
import QrCanvas from "./QrCanvas";
import QrScanner from "./QrScanner";
import { extractInviteCode } from "@/utils/invitePayload";

/**
 * The invite sheet: show my code, or scan someone else's.
 *
 * Mounted from the inbox ("Add people") and from the referrals page. It is a
 * component rather than a route because it is a mode over the inbox, not a
 * destination — a route would put a full page behind a modal and lose the thread
 * you were reading when the scanner refused permission.
 *
 * `onScanned` receives the raw decoded string and this component gets out of the
 * way. Parsing the payload belongs to the caller, because the two callers want
 * different things from it: the inbox sheet pushes a route, while the referrals
 * page just wants to know a code was seen.
 */
/** Fetches "my" invite code, or throws with a message worth showing. */
async function fetchMine() {
    const res = await fetch("/api/invites/mine", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load your code");
    return data;
}

export default function InviteSheet({ onClose, onScanned }) {
    const [tab, setTab] = useState("mine"); // mine | scan
    const [mine, setMine] = useState(null);
    const [loadError, setLoadError] = useState("");
    const [rotating, setRotating] = useState(false);
    const [manual, setManual] = useState("");
    const [copied, setCopied] = useState("");
    const [scanError, setScanError] = useState("");

    /**
     * A scan can produce a code, an invite link, or something that is neither —
     * a URL sticker on a poster, a barcode of a payment terminal, another app's
     * QR. Only the first two are forwarded; the rest is reported and the camera
     * keeps running, because the usual cause is "wrong thing in front of the
     * lens" and stopping would make the user reopen the sheet.
     */
    const handleScan = useCallback((decoded) => {
        const code = extractInviteCode(decoded);
        if (!code) {
            setScanError("That is not an AnonFeed invite code");
            return;
        }
        setScanError("");
        onScanned?.(code);
    }, [onScanned]);

    // Inline async IIFE, matching `CreateGroup.jsx`. `mine` being null IS the
    // loading state, so there is nothing to set before the request goes out.
    useEffect(() => {
        (async () => {
            try {
                setMine(await fetchMine());
                setLoadError("");
            } catch (err) {
                setLoadError(err.message || "Could not load your code");
            }
        })();
    }, []);

    // Escape closes, but only while the camera is not mid-decode: closing on a
    // stray keypress would leave the user on the landing page with no way back.
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const copy = async (text, label) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(label);
            setTimeout(() => setCopied(""), 2000);
        } catch {
            // Clipboard access is denied in some installed-PWA contexts; the code
            // is on screen either way, so this is a no-op rather than an error.
            setCopied("");
        }
    };

    const reload = async () => {
        setLoadError("");
        try {
            setMine(await fetchMine());
        } catch (err) {
            setLoadError(err.message || "Could not load your code");
        }
    };

    const rotate = async () => {
        setRotating(true);
        try {
            const res = await fetch("/api/invites/rotate", { method: "POST", credentials: "include" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Could not rotate your code");
            setMine((prev) => ({ ...prev, ...data }));
        } catch (err) {
            setLoadError(err.message || "Could not rotate your code");
        } finally {
            setRotating(false);
        }
    };

    const submitManual = (e) => {
        e.preventDefault();
        if (manual.trim()) handleScan(manual);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            {/* `dvh` and `max-h`, with `min-h-0` on the body, so the camera
                preview keeps its aspect box and the sheet scrolls rather than
                growing off a short landscape viewport. safe-top/safe-bottom live
                on the sheet (unlayered `.safe-*` rules would otherwise beat a
                same-side `py-*` utility and leave a zero-inset edge unpadded). */}
            <div
                className="bg-white dark:bg-gray-950 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md sm:mx-4 shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden safe-top safe-bottom"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
                    <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100">Add People</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center justify-center w-11 h-11 -mr-2 shrink-0" aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="px-5 pt-4 shrink-0">
                    <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl" role="tablist">
                        {[["mine", "My code"], ["scan", "Scan"]].map(([key, label]) => (
                            <button
                                key={key}
                                role="tab"
                                aria-selected={tab === key}
                                onClick={() => setTab(key)}
                                className={`flex-1 min-h-[40px] rounded-lg text-sm font-semibold transition-colors ${tab === key
                                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm"
                                    : "text-gray-500 dark:text-gray-400"}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                    {tab === "mine" ? (
                        !mine ? (
                            /* An error here is a dead end without a retry: `mine` stays
                             * null, so this branch is the only thing on screen and a
                             * bare spinner would spin forever. */
                            loadError ? (
                                <div className="text-center space-y-3 py-8">
                                    <p className="text-sm text-red-500 dark:text-red-400" role="alert">{loadError}</p>
                                    <button
                                        onClick={reload}
                                        className="min-h-[44px] px-5 py-2.5 bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                                    >
                                        Try again
                                    </button>
                                </div>
                            ) : (
                                <div className="flex justify-center py-10">
                                    <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                                </div>
                            )
                        ) : (
                            <>
                                {/* `loadError` with a code already on screen means a
                                    failed rotate, not a failed load, and it must not
                                    take the QR away. */}
                                {loadError && (
                                    <p className="text-xs text-red-500 dark:text-red-400 text-center" role="alert">{loadError}</p>
                                )}
                                <div className="flex flex-col items-center gap-3">
                                    <QrCanvas value={mine.url} size={208} />
                                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                        Let someone scan this to open a chat with you.
                                    </p>
                                    {/* The code as text, always. This is the accessible
                                        path to the same thing the QR encodes, and it
                                        is the only one that survives a dead camera. */}
                                    <p className="font-mono font-bold text-lg tracking-[0.2em] text-gray-900 dark:text-gray-100">
                                        {mine.code}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => copy(mine.url, "Link")}
                                        className="min-h-[44px] px-4 py-2.5 bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                                    >
                                        {copied === "Link" ? "Link copied" : "Copy link"}
                                    </button>
                                    <button
                                        onClick={() => copy(mine.code, "Code")}
                                        className="min-h-[44px] px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        {copied === "Code" ? "Code copied" : "Copy code"}
                                    </button>
                                </div>

                                {typeof navigator !== "undefined" && "share" in navigator && (
                                    <button
                                        onClick={async () => {
                                            // Native share is the one path that can hand
                                            // the link straight to a messaging app, which
                                            // is how this actually spreads.
                                            try {
                                                await navigator.share({ title: "Join me on AnonFeed", url: mine.url });
                                            } catch { /* dismissed */ }
                                        }}
                                        className="w-full min-h-[44px] px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Share invite
                                    </button>
                                )}

                                <button
                                    onClick={rotate}
                                    disabled={rotating}
                                    className="w-full min-h-[44px] px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50 transition-colors"
                                >
                                    {rotating ? "Rotating…" : "This link leaked — get a new code"}
                                </button>
                            </>
                        )
                    ) : (
                        <>
                            <QrScanner active={tab === "scan"} onResult={handleScan} />

                            {scanError && (
                                <p className="text-xs text-red-500 dark:text-red-400 text-center" role="alert">{scanError}</p>
                            )}

                            {/* Always present, and deliberately not hidden when the
                                camera works. Camera access is denied more often
                                than it succeeds — insecure origin, embedded
                                webview, no permission — and "enter the code" is
                                what makes this usable at all in those cases. */}
                            <form onSubmit={submitManual} className="space-y-2">
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                                    Or enter their code
                                </label>
                                <input
                                    type="text"
                                    value={manual}
                                    onChange={(e) => setManual(e.target.value.toUpperCase().slice(0, 10))}
                                    placeholder="e.g. 7KQR3M9X2P"
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                    spellCheck={false}
                                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-base sm:text-sm font-mono tracking-widest text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                                />
                                <button
                                    type="submit"
                                    disabled={!manual.trim()}
                                    className="w-full min-h-[44px] px-4 py-2.5 bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40 transition-colors"
                                >
                                    Continue
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
