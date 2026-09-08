"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import {
    ensurePushSubscription,
    isNotificationSupported,
    isStandalone,
    requestPermissionAndSubscribe,
} from "@/utils/notifications";

const DELAY_MS = 3000;

export default function PushNotificationManager() {
    const { user } = useUser();
    const [banner, setBanner] = useState({ show: false, mode: "ask" }); // mode: ask | blocked | install
    const [subscribed, setSubscribed] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        if (!user) return;

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

            // Notification API unavailable (e.g. iOS Safari that isn't installed
            // as a PWA) — no point asking, guide the user instead.
            if (!isNotificationSupported()) {
                if (isStandalone()) return;
                timerRef.current = setTimeout(() => setBanner({ show: true, mode: "install" }), DELAY_MS);
                return;
            }

            if (Notification.permission === "granted") {
                setSubscribed(true);
            } else if (Notification.permission === "denied") {
                // Cannot re-prompt from JS — take the user to the fix.
                timerRef.current = setTimeout(() => setBanner({ show: true, mode: "blocked" }), DELAY_MS);
            } else {
                timerRef.current = setTimeout(() => setBanner({ show: true, mode: "ask" }), DELAY_MS);
            }

            // Always try to (re)create the Web Push subscription — permission
            // may predate VAPID, so the closed-app path may never have existed.
            const subscribedNow = await ensurePushSubscription();
            if (subscribedNow) setSubscribed(true);
        })();

        return () => {
            alive = false;
            clearTimeout(timerRef.current);
        };
    }, [user]);

    async function handleAllow() {
        setBanner({ show: false, mode: "ask" });
        try {
            const ok = await requestPermissionAndSubscribe();
            localStorage.setItem(`notifications_enabled_${user?.username}`, "1");
            if (ok) {
                setSubscribed(true);
            } else if (typeof Notification === "undefined") {
                setBanner({ show: false, mode: "install" });
            } else if (Notification.permission === "denied") {
                setBanner({ show: true, mode: "blocked" });
            }
        } catch {}
    }

    function handleDismiss() {
        setBanner({ show: false, mode: "ask" });
        setDismissed(true);
        localStorage.setItem(`push_dismissed_${user?.username}`, "1");
    }

    if (!user || dismissed || subscribed || !banner.show) return null;

    const isBlocked = banner.mode === "blocked";
    const isInstall = banner.mode === "install";

    return (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] max-w-sm w-[calc(100%-2rem)]
            bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl shadow-2xl
            p-4 flex items-center gap-3 animate-slide-up">
            <div className="text-2xl">🔔</div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                    {isBlocked ? "Notifications are blocked" : isInstall ? "Install the app to get notifications" : "Stay in the loop"}
                </p>
                <p className="text-xs text-white/80 truncate">
                    {isBlocked
                        ? "Enable notifications for this site in your browser settings, then reload."
                        : isInstall
                            ? "Tap the share button → “Add to Home Screen”, then open the app again."
                            : "Get notified about messages and calls even when the app is closed"}
                </p>
            </div>
            <div className="flex gap-2 shrink-0">
                {!isInstall && (
                    <button
                        onClick={handleAllow}
                        className="px-3 py-1.5 text-xs font-semibold bg-white text-blue-600 rounded-lg
                            hover:bg-white/90 transition-colors cursor-pointer"
                    >
                        {isBlocked ? "How to fix" : "Allow"}
                    </button>
                )}
                <button
                    onClick={handleDismiss}
                    className="px-3 py-1.5 text-xs font-medium bg-white/20 text-white rounded-lg
                        hover:bg-white/30 transition-colors cursor-pointer"
                >
                    {isBlocked ? "Close" : "Later"}
                </button>
            </div>
        </div>
    );
}