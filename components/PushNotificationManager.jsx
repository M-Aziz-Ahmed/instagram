"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";

const DELAY_MS = 3000;

export default function PushNotificationManager() {
    const { user } = useUser();
    const [showBanner, setShowBanner] = useState(false);
    const [subscribed, setSubscribed] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        if (!user || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

        const dismissedKey = `push_dismissed_${user.username}`;
        if (localStorage.getItem(dismissedKey)) {
            setDismissed(true);
            return;
        }

        navigator.serviceWorker.ready.then((reg) => {
            return reg.pushManager.getSubscription();
        }).then((existing) => {
            if (existing) {
                setSubscribed(true);
                saveSubscription(existing);
                return;
            }
            timerRef.current = setTimeout(() => setShowBanner(true), DELAY_MS);
        });

        return () => clearTimeout(timerRef.current);
    }, [user]);

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

    async function handleAllow() {
        setShowBanner(false);
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") return;

            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(
                    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
                ),
            });

            await saveSubscription(sub);
            setSubscribed(true);
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
