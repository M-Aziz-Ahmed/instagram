"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const DOWNLOAD_STORE = "download-float-dismissed";

export default function FloatingDownloadButton() {
    const [dismissed, setDismissed] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (localStorage.getItem(DOWNLOAD_STORE) === "1") setDismissed(true);
    }, []);

    const handleDismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(DOWNLOAD_STORE, "1");
        } catch {}
    };

    // Only show download button in web browser, not in Tauri desktop app
    // Tauri app has its own update mechanism via AutoUpdater
    const inTauri = typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
    if (inTauri) return null;

    if (dismissed) return null;

    return (
        <div
            onClick={() => router.push("/download")}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 cursor-pointer hover:transform hover:scale-105 transition-transform"
        >
            <div
                className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-white">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 12m0 0L7.5 12m4.5 4.5V3" />
                </svg>
            </div>
            <span className="text-sm font-medium text-white">Download</span>
        </div>
    );
}