"use client";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function getVapidConfigured() {
    return Boolean(VAPID_PUBLIC_KEY);
}

export function isTauri() {
    if (typeof window === "undefined") return false;
    return Boolean(window.__TAURI_INTERNALS__);
}

export function isNotificationSupported() {
    if (typeof window === "undefined") return false;
    if (isTauri()) return true;
    return "Notification" in window;
}

export function isPushSupported() {
    if (typeof window === "undefined") return false;
    if (isTauri()) return false;
    return "serviceWorker" in navigator && "PushManager" in window;
}

export function isIOS() {
    if (typeof navigator === "undefined") return false;
    return /iP(hone|ad|od)/.test(navigator.userAgent);
}

// True when installed as a standalone PWA (Android / iOS "Add to Home Screen") or Tauri desktop.
export function isStandalone() {
    if (typeof window === "undefined") return false;
    if (isTauri()) return true;
    if (window.navigator?.standalone === true) return true;
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    return false;
}

export async function getPushSubscription() {
    if (!isPushSupported()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
}

async function savePushSubscription(subscription) {
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

// Create or refresh the Web Push subscription that delivers notifications
// when the app is fully closed. VAPID-agnostic: also safe to call when no
// public key is configured (returns false, no error).
export async function ensurePushSubscription() {
    if (!getVapidConfigured()) return false;
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") return false;
    if (!isPushSupported()) return false;
    try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
            await savePushSubscription(existing);
            return true;
        }
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        await savePushSubscription(sub);
        return true;
    } catch (err) {
        console.warn(
            "[push] subscribe failed — verify the built NEXT_PUBLIC_VAPID_PUBLIC_KEY matches the live-server VAPID_PUBLIC_KEY:",
            err?.name || err
        );
        return false;
    }
}

// Ask for permission, then create/refresh the push subscription.
export async function requestPermissionAndSubscribe() {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return false;
    }
    return ensurePushSubscription();
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

// Tauri native notification permission request (uses the Notification API in Tauri webview,
// which forwards to the OS notification center via tauri-plugin-notification).
export async function requestTauriNotificationPermission() {
    if (!isTauri() || typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission();
    return result === "granted";
}