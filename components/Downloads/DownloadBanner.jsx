"use client";

import { useEffect, useState } from "react";
import { detectPlatform, fetchAvailableFiles, bestDownloadUrl } from "@/utils/desktopDownloads";

const STORE = "download-banner-dismissed";

export default function DownloadBanner() {
    const [platform, setPlatform] = useState("unknown");
    const [available, setAvailable] = useState(null);
    const [dismissed, setDismissed] = useState(false);
    const [installPrompt, setInstallPrompt] = useState(null);

    useEffect(() => {
        const t = setTimeout(() => {
            setPlatform(detectPlatform());
            try {
                if (localStorage.getItem(STORE) === "1") setDismissed(true);
            } catch {}
        }, 0);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        fetchAvailableFiles().then(setAvailable);
    }, []);

    useEffect(() => {
        const onPrompt = (e) => {
            e.preventDefault();
            setInstallPrompt(e);
        };
        window.addEventListener("beforeinstallprompt", onPrompt);
        return () => window.removeEventListener("beforeinstallprompt", onPrompt);
    }, []);

    const dismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(STORE, "1");
        } catch {}
    };

    if (platform === "tauri" || dismissed) return null;

    // Prefer the advertised binary for this platform; before CI publishes
    // available.json keep the Windows button working via the route handler.
    const desktopUrl = available
        ? bestDownloadUrl(available, platform)
        : platform === "windows" || platform === "unknown"
            ? "/api/downloads/desktop"
            : "";
    const desktopReady = Boolean(desktopUrl);

    const platformLabel =
        platform === "windows"
            ? "Windows 10/11"
            : platform === "macos"
              ? "macOS"
              : platform === "linux"
                ? "Linux"
                : "Windows 10/11";

    const installPWA = async () => {
        if (installPrompt) {
            installPrompt.prompt();
            const out = await installPrompt.userChoice;
            if (out.outcome === "accepted") setInstallPrompt(null);
        }
    };

    return (
        <section className="bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 dark:from-indigo-700 dark:via-blue-700 dark:to-purple-700 text-white">
            <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm sm:text-base font-bold leading-tight truncate">
                                Download the AnonTweet app
                            </h2>
                            <p className="text-xs text-blue-100/90 leading-snug">
                                Desktop for Windows, macOS & Linux · Mobile for Android & iOS — with push notifications, auto-updates & one-click installs.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={dismiss}
                        aria-label="Dismiss download banner"
                        className="p-2 rounded-full hover:bg-white/15 transition-colors shrink-0"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <div className="flex-1 flex flex-col gap-2">
                        {desktopReady ? (
                            <>
                                <a
                                    href={desktopUrl}
                                    download
                                    className="flex items-center justify-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                        <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
                                    </svg>
                                    Download for {platformLabel}
                                </a>
                                <p className="text-[11px] text-blue-100/80 text-center sm:text-left">
                                    Auto-updates like Discord — install once, stay current.
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center justify-center gap-2 bg-white/10 border border-dashed border-white/30 text-sm font-bold px-4 py-2.5 rounded-xl text-blue-100/90">
                                    {platformLabel} build coming soon
                                </div>
                                <p className="text-[11px] text-blue-100/80 text-center sm:text-left">
                                    Windows, macOS & Linux installers ship automatically once CI publishes them.
                                </p>
                            </>
                        )}
                    </div>

                    <div className="flex-1 flex flex-col gap-2">
                        <div className="flex gap-2">
                            {installPrompt ? (
                                <button
                                    onClick={installPWA}
                                    className="flex-1 flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur border border-white/30 text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
                                >
                                    Install on this device
                                </button>
                            ) : (
                                <a
                                    href="https://anontweet.vercel.app"
                                    className="flex-1 flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur border border-white/30 text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                                    </svg>
                                    Get it on your phone
                                </a>
                            )}
                        </div>
                        <p className="text-[11px] text-blue-100/80 text-center sm:text-left">
                            Android & Apple stores coming soon — install the phone web app today.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}