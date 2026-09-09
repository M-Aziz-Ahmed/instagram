// Shows OS-level notifications from the running app (no Web Push / VAPID needed).
// Works while the page/tab is open in the background. Web Push additionally
// covers a fully closed app, but this is the VAPID-free fallback.
//
// On the Tauri desktop app, notifications go through the native plugin
// (tauri-plugin-notification) — Discord-style tray notifications that need no
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
    if (isTauri()) return Promise.resolve("granted"); // no browser permission needed
    if (!isNotificationSupported()) return Promise.resolve("unsupported");
    return Notification.requestPermission();
}

// Show an OS notification. In Tauri this invokes the native plugin so it
// appears as a proper desktop tray notification even when the window is hidden
// to the system tray. In a browser it uses the web Notification API and only
// fires when the page is in the background.
export async function showBackgroundNotification(title, { body = "", url = "/", icon = "/icon-192.svg", tag = "" } = {}) {
    if (!canNotify()) return false;

    if (isTauri()) {
        try {
            // Route through the Rust `notify` command (lib.rs) which uses
            // tauri-plugin-notification to raise a native tray notification.
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("notify", { title, body, url, tag });
            return true;
        } catch {
            return false;
        }
    }

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
