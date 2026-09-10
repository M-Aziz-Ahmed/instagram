"use client";

import { useEffect, useState } from "react";
import { detectPlatform, fetchAvailableFiles, bestDownloadUrl } from "@/utils/desktopDownloads";

const PLATFORMS = [
    {
        id: "windows",
        label: "Windows 10/11",
        sub: "NSIS installer · auto-updates",
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
            </svg>
        ),
    },
    {
        id: "macos",
        label: "macOS",
        sub: "Apple Silicon + Intel · .dmg",
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M18.7 12.7c-.05-3.05 2.5-4.5 2.6-4.57-1.4-2.06-3.6-2.34-4.4-2.37-1.86-.19-3.63 1.1-4.58 1.1-.94 0-2.4-1.08-3.95-1.05-2.03.03-3.9 1.18-4.94 3-2.1 3.66-.54 9.08 1.51 12.05 1 1.45 2.2 3.08 3.78 3.02 1.51-.06 2.09-.98 3.92-.98 1.83 0 2.35.98 3.96.95 1.63-.03 2.67-1.48 3.66-2.94 1.16-1.68 1.63-3.31 1.66-3.4-.04-.02-3.18-1.22-3.22-4.81zM15.6 3.8c.83-1 1.39-2.4 1.24-3.8-1.2.05-2.66.8-3.52 1.82-.78.9-1.45 2.35-1.27 3.73 1.34.1 2.72-.68 3.55-1.75z" />
            </svg>
        ),
    },
    {
        id: "linux",
        label: "Linux",
        sub: "AppImage + .deb + .rpm",
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M12 2C9.79 2 8 3.79 8 6c0 .79.23 1.52.63 2.14-.98 2.11-2.5 3.6-2.94 4.36-.05.08-.08.17-.08.27 0 .35.28.63.63.63h.33c-.04.21-.08.42-.08.65 0 1.8 1.87 2.66 3.18 3.38-1.05.35-1.78 1.24-1.78 2.28 0 1.1.91 2 2.02 2 .83 0 1.55-.5 1.85-1.2.3.03.6.05.9.05 1.54 0 2.45-1.36 2.45-2.5 0-.25-.08-.51-.19-.73.27-.17.52-.36.75-.55l.08.06c.19.15.33.35.42.55.19.55.71.93 1.32.93h.83c1.04 0 1.89-.85 1.89-1.89 0-.13-.01-.26-.04-.38.77-.51 1.28-1.37 1.28-2.35 0-1.54-1.25-2.79-2.79-2.79-.4 0-.78.09-1.12.24l-.32-.3c.18-.3.28-.64.28-1 .05-1.77-.4-2.9-1.33-3.77C15.72 5.56 13.4 6.28 13 7.17l-.08.04c-.03-.03-.06-.06-.09-.08l.01-.02C13.25 6.1 14 4.17 14 3.08 14 2.48 13.52 2 12.92 2h-.62C12.06 2 12 2.03 12 2zm-4 12.5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm8.5 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zM12 18.7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
            </svg>
        ),
    },
];

export default function DownloadPage() {
    const [platform, setPlatform] = useState("unknown");
    const [available, setAvailable] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => {
            setPlatform(detectPlatform());
            try {
                if (localStorage.getItem("download-page-dismissed") === "1") setDismissed(true);
            } catch {}
        }, 0);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        fetchAvailableFiles().then((data) => {
            setAvailable(data);
            setLoaded(true);
        });
    }, []);

    const dismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem("download-page-dismissed", "1");
        } catch {}
    };

    // Don't render at all inside the Tauri desktop app - it has its own update
    // mechanism. Must come after the hooks so they always run in the same order.
    const inTauri = typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
    if (inTauri || dismissed) return null;

    // Fallback before CI has published available.json: keep the Windows button
    // working through the existing route handler.
    const urlFor = (id) => {
        if (available) return bestDownloadUrl(available, id);
        return id === "windows" ? "/api/downloads/desktop" : "";
    };

    return (
        <section className="min-h-screen bg-gradient-to-b from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950 dark:via-purple-950 dark:to-pink-950">
            <div className="max-w-4xl mx-auto px-3 sm:px-4 py-12 sm:py-20">
                <div className="text-center mb-10">
                    <div className="w-16 h-16 rounded-2xl bg-white/20 dark:bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-4 border border-indigo-200 dark:border-indigo-800">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-8 h-8 text-indigo-700 dark:text-indigo-300">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-indigo-800 dark:text-indigo-200 mb-4">
                        Download AnonTweet
                    </h1>
                    <p className="text-lg text-indigo-600 dark:text-indigo-400 max-w-xl mx-auto">
                        The desktop app for push notifications, sticky headers, and
                        Discord-style auto-updates. Pick your platform below.
                    </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    {PLATFORMS.map((p) => {
                        const url = urlFor(p.id);
                        const ready = Boolean(url);
                        // macOS/Linux builds are unsigned until signing secrets are added.
                        const unsignedNote = ready && (p.id === "macos" || p.id === "linux");
                        return (
                            <div
                                key={p.id}
                                className={`rounded-2xl bg-white dark:bg-gray-900 shadow-lg border p-5 flex flex-col items-center text-center gap-2 transition-colors ${
                                    ready
                                        ? "border-indigo-200 dark:border-indigo-800"
                                        : "border-dashed border-gray-300 dark:border-gray-700"
                                }`}
                            >
                                <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center">
                                    {p.icon}
                                </div>
                                <p className="font-bold text-gray-900 dark:text-white">{p.label}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{p.sub}</p>

                                {ready ? (
                                    <>
                                        <a
                                            href={url}
                                            download
                                            className="mt-3 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
                                        >
                                            Download for {p.label}
                                        </a>
                                        {unsignedNote && (
                                            <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-snug">
                                                Unsigned build — on macOS right-click → Open to bypass
                                                Gatekeeper.
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <div className="mt-3 w-full px-4 py-2.5 rounded-xl text-sm font-bold text-gray-400 dark:text-gray-500 border border-dashed border-gray-300 dark:border-gray-700">
                                        {loaded ? "Coming soon" : "Checking…"}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="text-center mt-10">
                    <a
                        href="https://anontweet.vercel.app"
                        className="inline-flex items-center justify-center gap-2 bg-white/15 dark:bg-white/5 hover:bg-white/25 dark:hover:bg-white/10 backdrop-blur border border-indigo-300 dark:border-indigo-800 text-sm font-bold px-5 py-3 rounded-xl transition-colors text-indigo-700 dark:text-indigo-300 shadow-lg"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                        </svg>
                        Get it on your phone
                    </a>
                    <p className="mt-4 text-sm text-indigo-500/80 dark:text-indigo-400/80">
                        The Windows installer is ready today — Linux & macOS builds ship
                        automatically as soon as CI publishes them.
                    </p>
                </div>
            </div>
        </section>
    );
}