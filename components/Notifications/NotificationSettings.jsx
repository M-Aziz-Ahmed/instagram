"use client";

import { useEffect, useState } from "react";
import {
    getPushSubscription,
    getVapidConfigured,
    isNotificationSupported,
    isPushSupported,
    isStandalone,
    isTauri,
    requestPermissionAndSubscribe,
} from "@/utils/notifications";

export default function NotificationSettings() {
    const tauri = typeof window !== "undefined" && isTauri();
    const [status, setStatus] = useState({
        checking: true,
        supported: false,
        push: false,
        vapid: false,
        standalone: false,
        permission: "unsupported",
        subscribed: false,
        working: false,
    });

    async function refresh() {
        setStatus(s => ({ ...s, checking: true }));
        const supported = isNotificationSupported();
        const push = isPushSupported();
        let sub = null;
        if (push) {
            try {
                sub = await getPushSubscription();
            } catch {}
        }
        const permission = supported ? Notification.permission : "unsupported";
        setStatus({
            checking: false,
            supported,
            push,
            vapid: getVapidConfigured(),
            standalone: isStandalone(),
            permission,
            subscribed: Boolean(sub),
            working: false,
        });
    }

    useEffect(() => {
        let alive = true;
        (async () => {
            await Promise.resolve();
            if (!alive) return;
            await refresh();
        })();
        return () => {
            alive = false;
        };
    }, []);

    async function handleEnable() {
        setStatus(s => ({ ...s, working: true }));
        await requestPermissionAndSubscribe();
        await refresh();
    }

    const { supported, push, vapid, standalone, permission, subscribed, checking, working } = status;
    const blocked = permission === "denied";
    const notAsked = permission === "default";
    const needsInstall = supported && push === false && !standalone;

    // Tauri desktop: notifications are native tray notifications — no browser
    // permission, no Web Push subscription, no VAPID. Just a simple status.
    if (tauri) {
        return (
            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 mb-6">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="font-bold text-gray-900 dark:text-gray-100">Notifications</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Desktop app — shown natively from the system tray.</p>
                    </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">Notifications on this device</span>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400">
                        On
                    </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Notifications appear as desktop alerts while the app runs in the system tray — no browser permission needed.
                </p>
            </section>
        );
    }

    return (
        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 mb-6">
            <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                    </svg>
                </div>
                <div>
                    <h2 className="font-bold text-gray-900 dark:text-gray-100">Notifications</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Per-device — enable on each phone, tablet, or computer.</p>
                </div>
            </div>

            {checking ? (
                <p className="text-sm text-gray-400 animate-pulse">Checking this device…</p>
            ) : (
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Permission on this device</span>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            blocked ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                            : notAsked ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
                            : "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                        }`}>
                            {!supported ? "Unavailable" : blocked ? "Blocked" : notAsked ? "Not asked" : "Allowed"}
                        </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">
                            Notifications when app is closed
                            {vapid ? "" : " (pending VAPID)"}
                        </span>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            subscribed ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                        }`}>
                            {push ? (subscribed ? "On" : "Off") : "Unavailable"}
                        </span>
                    </div>

                    {needsInstall && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2">
                            This device needs the installed app for alerts while it’s closed. Use your browser’s “Add to Home Screen”, then open the app and tap Enable.
                        </p>
                    )}
                    {blocked && (
                        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2">
                            Notifications are blocked. In your browser settings allow notifications for this site, then tap “Check again”.
                        </p>
                    )}

                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={handleEnable}
                            disabled={working || (blocked && !supported) || (!supported && needsInstall) || subscribed}
                            className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                                text-white rounded-xl transition-colors min-h-[44px]"
                        >
                            {working ? "Enabling…" : subscribed ? "Enabled" : "Enable"}
                        </button>
                        <button
                            onClick={refresh}
                            disabled={working || checking}
                            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700
                                rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors min-h-[44px] disabled:opacity-50"
                        >
                            Check again
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
