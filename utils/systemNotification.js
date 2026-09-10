// Shows OS-level notifications from the running app (no Web Push / VAPID needed).
//
// On the Tauri desktop app:
//   1. Primary: the native notification plugin (tauri-plugin-notification) → real
//      OS tray/action-center toasts (works even while the window is in the tray).
//   2. Fallback: a guaranteed-visible always-on-top toast window (Rust `show_toast`)
//      — shown whenever the native path throws or permission is denied. This always
//      appears because the app process is running even when hidden in the system tray.
//
// In a plain browser it uses the web Notification API and only fires when the page
// is in the background.

export function isTauri() {
    return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export function isNotificationSupported() {
    if (isTauri()) return true;
    return typeof window !== "undefined" && "Notification" in window;
}

export function canNotify() {
    if (isTauri()) return true;
    return isNotificationSupported() && Notification.permission === "granted";
}

export function requestNotificationsPermission() {
    if (isTauri()) {
        return Promise.resolve("granted");
    }
    if (typeof window !== "undefined" && "Notification" in window) {
        return Notification.requestPermission();
    }
    return Promise.resolve("unsupported");
}

// --- Desktop notification diagnostics (visible in the desktop-only debug pill) ---

const desktopNotificationLog = [];

export function getDesktopNotificationLog() {
    return [...desktopNotificationLog];
}

function logDesktopNotification(status, method, error) {
    desktopNotificationLog.push({
        status,
        method,
        error: error ? String(error?.message || error) : undefined,
        time: new Date().toISOString(),
    });
    if (desktopNotificationLog.length > 50) desktopNotificationLog.shift();
}

async function showCustomToast(title, body, url) {
    const { invoke } = await import("@tauri-apps/api/core");
    const absoluteUrl = url && !/^https?:\/\//i.test(url)
        ? new URL(url, window.location.href).href
        : url || "";
    await invoke("show_toast", { title, body, url: absoluteUrl });
}

// Show an OS notification.
export async function showBackgroundNotification(title, { body = "", url = "/", icon = "/icon-192.svg", tag = "" } = {}) {
    if (!canNotify()) return false;

    if (isTauri()) {
        // 1) When a target URL is attached, lead with the always-on-top toast
        //    window: it is the only desktop notification that supports
        //    click-to-navigate (native OS toasts only foreground the app).
        if (url) {
            try {
                await showCustomToast(title, body, url);
                logDesktopNotification("ok", "toast-window");
                return true;
            } catch (e1) {
                logDesktopNotification("failed", "toast-window", e1);
            }
        }

        // 2) Native OS notification (Action Center). Windows toasts use the
        //    installed app's own icon; passing a URL icon can make notify-rust
        //    fail silently. Clicking one only brings the app forward.
        try {
            const plugin = await import("@tauri-apps/plugin-notification");
            let granted = await plugin.isPermissionGranted();
            if (!granted) {
                granted = (await plugin.requestPermission()) === "granted";
            }
            if (granted) {
                plugin.sendNotification({ title, body, tag });
                logDesktopNotification("ok", "native");
                return true;
            }
            logDesktopNotification("denied", "native");
        } catch (e) {
            console.error("[notify] native notification failed:", e);
        }

        // 3) Fallback: guaranteed-visible always-on-top toast window.
        try {
            await showCustomToast(title, body, url);
            logDesktopNotification("ok", "toast-window");
            return true;
        } catch (e2) {
            console.error("[notify] in-app toast also failed:", e2);
            logDesktopNotification("failed", "toast-window", e2);
            return false;
        }
    }

    // Browser fallback: only show if the page/tab is in the background.
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