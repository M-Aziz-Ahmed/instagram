// OS-level notifications for the desktop app.
//
// Design decision (no extra windows, ever):
//   • Web (plain browser / PWA): uses the browser Notification API and only
//     fires when the page is in the background. Clicking navigates.
//   • Tauri desktop: uses the Web Notification API inside the webview, which
//     WebView2/WKWebView map to the real OS notification center (Windows
//     Action Center / macOS Notification Center). Clicking focuses + shows the
//     app window and navigates to the notification's target URL. There is
//     intentionally NO extra "toast" window — the system notification IS the
//     notification.

function isRunningInTauriClient() {
    return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

// In-memory record of every OS-notification attempt made by
// `showBackgroundNotification`. Consumed by the desktop diagnostics panel via
// `getDesktopNotificationLog()` — never shipped to the OS, just this session.
const desktopNotificationLog = [];

function recordNotificationAttempt(status, method, error) {
    desktopNotificationLog.push({
        status, // "ok" | "fail"
        method, // which code path attempted delivery
        error: error ? String(error) : "",
        time: Date.now(),
    });
    if (desktopNotificationLog.length > 200) desktopNotificationLog.shift();
}

export function getDesktopNotificationLog() {
    return [...desktopNotificationLog];
}

export function isTauri() {
    return isRunningInTauriClient();
}

export function isNotificationSupported() {
    return typeof window !== "undefined" && "Notification" in window;
}

export function canNotify() {
    if (!isNotificationSupported()) return false;
    return Notification.permission === "granted";
}

export async function requestNotificationsPermission() {
    if (!isNotificationSupported()) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    if (Notification.permission === "granted") return "granted";
    try {
        return (await Notification.requestPermission()) || "default";
    } catch (e) {
        return "default";
    }
}

// Convert a relative app route (e.g. "/inbox") into an absolute URL and, when on
// the desktop app, bring the window to the foreground first.
function buildClickTarget(url) {
    const target = (() => {
        try {
            return new URL(url, typeof window !== "undefined" ? window.location.href : url).href;
        } catch {
            return url;
        }
    })();

    if (isRunningInTauriClient()) {
        // Show + focus the main window before navigating, so the user lands in
        // front (the window may be hidden in the system tray).
        Promise.resolve()
            .then(() => import("@tauri-apps/api/window"))
            .then(({ getCurrentWindow }) => getCurrentWindow())
            .then((w) => Promise.all([w.show(), w.setFocus()]).catch(() => {}))
            .catch(() => {});
    }
    return target;
}

/**
 * Deliver a notification. Returns true when the OS actually displayed it.
 *
 * On the desktop app this always uses a single, real OS notification (no
 * custom in-app window). Clicks navigate the app to `opts.url`.
 */
export async function showBackgroundNotification(title, opts = {}) {
    const { body = "", url = "/", icon = "/icon-192.svg", tag = "" } = opts;

    if (!isNotificationSupported()) return false;

    // Plain browsers: only bother the user when this page is in the background.
    if (!isRunningInTauriClient() && typeof document !== "undefined" && document.hidden === false) {
        return false;
    }

    if (isRunningInTauriClient() && Notification.permission !== "granted") {
        try { await Notification.requestPermission(); } catch {}
    }

    if (Notification.permission !== "granted") return false;

    try {
        const n = new Notification(title, { body, icon, tag: tag || undefined });
        const abs = (() => {
            try { return new URL(url, window.location.href).href; }
            catch { return url; }
        })();

        // Click → focus + show, then navigate to the notification's target.
        n.onclick = () => {
            n.close();
            if (isRunningInTauriClient()) {
                Promise.resolve()
                    .then(() => import("@tauri-apps/api/window"))
                    .then(({ getCurrentWindow }) => getCurrentWindow())
                    .then((w) => Promise.all([w.show(), w.setFocus()]).catch(() => {}))
                    .catch(() => {});
            }
            if (typeof window !== "undefined" && typeof window.location !== "undefined") {
                try { window.location.href = abs; } catch {}
            }
        };
        recordNotificationAttempt("ok", "webview-native");
        return true;
    } catch (e) {
        recordNotificationAttempt("fail", "webview-native", e);
        return false;
    }
}
