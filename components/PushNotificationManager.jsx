"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";

const DELAY_MS = 3000;
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Create or refresh the Web Push subscription for the *closed* app case.
// Requires a VAPID public key baked into the client build + granted
// permission. Falls back silently when VAPID is absent — background-tab
// notifications still work via the Notification API + socket.
async function ensurePushSubscription() {
    if (!VAPID_PUBLIC_KEY || !("PushManager" in window) || !("serviceWorker" in navigator)) {
        return false;
    }
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        return false;
    }
    try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
            saveSubscription(existing);
            return true;
        }
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        saveSubscription(sub);
        return true;
    } catch (err) {
        console.warn(
            "[push] subscribe failed — verify the built NEXT_PUBLIC_VAPID_PUBLIC_KEY matches the live-server VAPID_PUBLIC_KEY:",
            err?.name || err
        );
        return false;
    }
}

async function saveSubscription(subscription) {
    try {
        await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subscription: subscription.toJSON(),
                userAgent: navigator.userAgent,
            }),
        });
    } catch {}
}

export default function PushNotificationManager() {
    const { user } = useUser();
    const [showBanner, setShowBanner] = useState(false);
    const [subscribed, setSubscribed] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const timerRef = useRef(null);
    const ensuringRef = useRef(false);

    async function handleEnsureSubscription() {
        if (ensuringRef.current) return false;
        ensuringRef.current = true;
        try {
            return await ensurePushSubscription();
        } finally {
            ensuringRef.current = false;
        }
    }

    useEffect(() => {
        if (!user) return;
        if (!("Notification" in window)) return;

        let alive = true;
        (async () => {
            await Promise.resolve(); // defer so the effect body has no sync setState
            if (!alive) return;

            const dismissedKey = `push_dismissed_${user.username}`;
            if (localStorage.getItem(dismissedKey)) {
                setDismissed(true);
                return;
            }

            const enabledKey = `notifications_enabled_${user.username}`;
            if (localStorage.getItem(enabledKey)) {
                setSubscribed(true);
            }

            if (Notification.permission === "granted") {
                setSubscribed(true);
            } else if (Notification.permission !== "denied") {
                timerRef.current = setTimeout(() => setShowBanner(true), DELAY_MS);
            }

            // Attempt Web Push subscription independently of the banner —
            // permission may have been granted before VAPID existed, so no
            // subscription was ever created and closed-app pushes never fired.
            const subscribedNow = await handleEnsureSubscription();
            if (subscribedNow) setSubscribed(true);
        })();

        return () => {
            alive = false;
            clearTimeout(timerRef.current);
        };
    }, [user]);

    async function handleAllow() {
        setShowBanner(false);
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") return;

            localStorage.setItem(`notifications_enabled_${user?.username}`, "1");
            setSubscribed(true);
            await handleEnsureSubscription();
        } catch {}
    }

    function handleDismiss() {
        setShowBanner(false);
        setDismissed(true);
        localStorage.setItem(`push_dismissed_${user?.username}`, "1");
    }

    if (!user || dismissed || subscribed || !showBanner) return null;

    return (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] max-w-sm w-[calc(100%-2rem)]
            bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl shadow-2xl
            p-4 flex items-center gap-3 animate-slide-up">
            <div className="text-2xl">🔔</div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Stay in the loop</p>
                <p className="text-xs text-white/80 truncate">
                    Get notified about messages, comments, and mentions
                </p>
            </div>
            <div className="flex gap-2 shrink-0">
                <button
                    onClick={handleAllow}
                    className="px-3 py-1.5 text-xs font-semibold bg-white text-blue-600 rounded-lg
                        hover:bg-white/90 transition-colors cursor-pointer"
                >
                    Allow
                </button>
                <button
                    onClick={handleDismiss}
                    className="px-3 py-1.5 text-xs font-medium bg-white/20 text-white rounded-lg
                        hover:bg-white/30 transition-colors cursor-pointer"
                >
                    Later
                </button>
            </div>
        </div>
    );
}

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}