"use client";

import { useEffect, useState } from "react";

const RELEASE_JSON = "/downloads/desktop/latest.json";

function detectPlatform() {
    if (typeof window === "undefined") return "unknown";
    const ua = navigator.userAgent;
    const inTauri = "__TAURI_INTERNALS__" in window;
    if (inTauri) return "tauri";
    if (ua.includes("Windows")) return "windows";
    if (ua.includes("Mac OS X") || ua.includes("iPad") || ua.includes("iPhone")) return "macos";
    if (/Android/i.test(ua)) return "android";
    if (/Linux/i.test(ua)) return "linux";
    return "unknown";
}

export default function DownloadPage() {
    const [platform, setPlatform] = useState("unknown");
    const [release, setRelease] = useState(null);
    const [dismissed, setDismissed] = useState(false);

    // Don't show download page in Tauri desktop app - it has its own update mechanism
    const inTauri = typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
    if (inTauri) return null;

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
        fetch(RELEASE_JSON)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data?.version) setRelease(data);
            })
            .catch(() => {});
    }, []);

    const dismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem("download-page-dismissed", "1");
        } catch {}
    };

    if (dismissed) return null;

    const platformLabel =
        platform === "windows"
            ? "Windows 10/11"
            : platform === "macos"
              ? "macOS"
              : platform === "linux"
                ? "Linux"
                : "Windows 10/11";

    const winUrl = "/api/downloads/desktop";

    return (
        <section className="min-h-screen bg-gradient-to-b from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950 dark:via-purple-950 dark:to-pink-950">
            <div className="max-w-4xl mx-auto px-3 sm:px-4 py-12 sm:py-20">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mx-auto mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-8 h-8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-indigo-800 dark:text-indigo-200 mb-4">
                        Download AnonTweet
                    </h1>
                    <p className="text-lg text-indigo-600 dark:text-indigo-400 mb-8">
                        Get the desktop app for push notifications, sticky headers, and
                        Discord-style auto-updates.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <a
                            href={winUrl}
                            download
                            className="flex items-center justify-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 text-sm font-bold px-6 py-3 rounded-xl transition-colors shadow-lg"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
                            </svg>
                            Download for {platformLabel}
                        </a>

                        <a
                            href="https://anontweet.vercel.app"
                            className="flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur border border-white/30 text-sm font-bold px-5 py-3 rounded-xl transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                            </svg>
                            Get it on your phone
                        </a>
                    </div>

                    <p className="mt-6 text-sm text-indigo-500/80 dark:text-indigo-400/80">
                        Auto-updates like Discord — install once, stay current.
                    </p>
                </div>
            </div>
        </section>
    );
}