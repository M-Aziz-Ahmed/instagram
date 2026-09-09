// Shows OS-level notifications from the running app (no Web Push / VAPID needed).
// Works while the page/tab is open in the background. Web Push additionally
// covers a fully closed app, but this is the VAPID-free fallback.
//
// On the Tauri desktop app, notifications go through the native plugin
// (tauri-plugin-notification) — proper desktop tray notifications that need no
// browser permission. In a plain browser they use the web Notification API.

export function isTauri() {
    return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export function isNotificationSupported() {
    if (isTauri()) return true;
    return typeof window !== "undefined" && "Notification" in window;
}

export function canNotify() {
    if (isTauri()) return true; // native desktop notifications are always available
    return isNotificationSupported() && Notification.permission === "granted";
}

export function requestNotificationsPermission() {
    if (isTauri()) {
        // Tauri native notifications are always available on desktop
        return Promise.resolve("granted");
    }
    if (typeof window !== "undefined" && "Notification" in window) {
        return Notification.requestPermission();
    }
    return Promise.resolve("unsupported");
}

// Show an OS notification. In Tauri this uses the native plugin so it
// appears as a proper desktop tray notification even when the window is hidden
// to the system tray. In a browser it uses the web Notification API and only
// fires when the page is in the background.
export async function showBackgroundNotification(title, { body = "", url = "/", icon = "/icon-192.svg", tag = "" } = {}) {
    if (!canNotify()) return false;

    if (isTauri()) {
        try {
            // Use Tauri native notification plugin - this works even when
            // the app is minimized to the system tray or fully closed
            const { notify } = await import("@tauri-apps/api/notification");
            await notify({ title, body, icon, tag });
            return true;
        } catch (e) {
            // Native notification failed - fall back to showing an error
            console.error("Tauri native notification failed:", e);
            return false;
        }
    }

    // Browser fallback: only show if the page/tab is visible/in background
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