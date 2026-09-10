"use client";

import { useEffect } from "react";

export default function TauriNotificationHandler() {
    const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    useEffect(() => {
        if (!inTauri) return;

        const handleFocus = async () => {
            try {
                // Showing the window to the foreground lets the user act on a
                // clicked notification when the app was hidden in the system tray.
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                await getCurrentWindow().show();
                await getCurrentWindow().setFocus();
            } catch (e) {
                console.warn("[Tauri] focus window failed:", e);
            }
        };

        window.addEventListener("focus", handleFocus);

        return () => {
            window.removeEventListener("focus", handleFocus);
        };
    }, [inTauri]);

    return null;
}