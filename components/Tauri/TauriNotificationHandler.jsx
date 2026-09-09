"use client";

import { useEffect } from "react";

export default function TauriNotificationHandler() {
    const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    useEffect(() => {
        if (!inTauri) return;

        const handleFocus = async () => {
            try {
                const { invoke } = await import("@tauri-apps/api/core");
                await invoke("handle_notification_click");
            } catch (e) {
                console.warn("[Tauri] handle_notification_click failed:", e);
            }
        };

        const handleVisibilityChange = () => {
            if (!document.hidden) {
                handleFocus();
            }
        };

        window.addEventListener("focus", handleFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            window.removeEventListener("focus", handleFocus);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [inTauri]);

    return null;
}