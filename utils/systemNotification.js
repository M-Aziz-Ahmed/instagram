// Shows OS-level notifications from the running app (no Web Push / VAPID needed).
// Works while the page/tab is open in the background. Web Push additionally
// covers a fully closed app, but this is the VAPID-free fallback.

export function isNotificationSupported() {
    return typeof window !== "undefined" && "Notification" in window;
}

export function canNotify() {
    return isNotificationSupported() && Notification.permission === "granted";
}

export function requestNotificationsPermission() {
    if (!isNotificationSupported()) return Promise.resolve("unsupported");
    return Notification.requestPermission();
}

// Only surface system notifications when the app is in the background (the
// in-app UI already handles the visible app).
export function showBackgroundNotification(title, { body = "", url = "/", icon = "/icon-192.svg", tag = "" } = {}) {
    if (!canNotify()) return false;
    if (typeof document !== "undefined" && !document.hidden) return false;

    try {
        const n = new Notification(title, {
            body,
            icon,
            badge: "/icon-192.svg",
            vibrate: [100, 50, 100],
            tag: tag || undefined,
        });
        n.onclick = () => {
            n.close();
            if (typeof window !== "undefined") window.focus();
            if (url && typeof window !== "undefined") {
                try { window.location.href = url; } catch {}
            }
        };
        return true;
    } catch (e) {
        return false;
    }
}