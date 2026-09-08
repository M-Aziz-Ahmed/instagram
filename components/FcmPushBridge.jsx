"use client";

import { useEffect } from "react";
import { useUser } from "@/context/UserContext";

// Runs only inside the native Capacitor shell (Android/iOS). Registers the app
// for Firebase Cloud Messaging and posts the FCM token to the live-server so
// closed-app notifications are delivered through FCM instead of Web Push.
export default function FcmPushBridge() {
    const { user } = useUser();

    useEffect(() => {
        if (!user?.username) return;

        let alive = true;
        let listener = null;

        (async () => {
            await Promise.resolve(); // keep effect body sync-free
            if (!alive) return;
            if (typeof window === "undefined") return;

            const cap = window.Capacitor;
            if (!cap?.isNativePlatform?.()) return;
            const api = cap.Plugins?.PushNotifications;
            if (!api) return;

            try {
                const perms = await api.requestPermissions();
                if (perms?.receive !== "granted") return;

                listener = await api.addListener("registration", (data) => {
                    const token = data?.value;
                    if (!token) return;
                    fetch("/api/push/fcm/token", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            token,
                            platform: cap.getPlatform?.() || "android",
                        }),
                    }).catch(() => {});
                });

                api.addListener("registrationError", (err) => {
                    console.warn("[fcm] registration error:", err);
                }).catch(() => {});

                await api.register();
            } catch {}
        })();

        return () => {
            alive = false;
            listener?.remove?.();
        };
    }, [user?.username]);

    return null;
}