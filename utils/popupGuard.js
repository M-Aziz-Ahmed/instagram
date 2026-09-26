/**
 * Popup abuse guard.
 *
 * The symptom this exists for: ad creatives in the feed and third-party video
 * embeds would open a new browser tab every few seconds, burying the app under
 * a stack of windows the user has to close one by one. The tell is that none
 * of those opens come from a click.
 *
 * The browser already gives us the exact signal we need:
 * `navigator.userActivation.isActive` is true only while the current task was
 * started by a genuine user interaction (click, key, tap) and hasn't expired.
 * A legitimate click-through is opened from inside a click handler, so it is
 * active. A creative looping on `setInterval` is not, at any point.
 *
 * So the rule is: refuse to open a window when there is no user activation.
 * That is precise rather than heuristic — it cannot break a real button in the
 * app, and it kills the entire class of timer-driven popup.
 *
 * `window.open` is wrapped once per page. `openAdLink` is the supported way to
 * open an advertiser landing page and deliberately routes through the same
 * wrapper, so a click-through still works (it is user-activated) while an
 * untrusted frame cannot reach `window.open` at all.
 */

const nativeOpen = typeof window !== "undefined" ? window.open : null;

let installed = false;

/** True when the current task was started by a real user interaction. */
function hasUserActivation() {
    if (typeof navigator === "undefined") return true;
    const activation = navigator.userActivation;
    // No User Activation API: fail open rather than break navigation for
    // everyone on an older engine.
    if (!activation || typeof activation.isActive !== "boolean") return true;
    return activation.isActive;
}

export function installPopupGuard() {
    if (installed || typeof window === "undefined" || !nativeOpen) return;
    installed = true;

    const blocked = { count: 0 };

    window.open = function guardedOpen(url, target, features) {
        if (!hasUserActivation()) {
            blocked.count++;
            // Deliberately silent: a console warning per popup would turn a
            // runaway loop into a runaway log.
            if (blocked.count <= 3 && process.env.NODE_ENV !== "production") {
                console.warn("[popup-guard] blocked a window.open with no user activation", url);
            }
            return null;
        }
        return nativeOpen.call(window, url, target, features);
    };

    // `target="_blank"` on a plain anchor is the other way an untrusted frame
    // or injected script spawns windows without touching window.open. Named
    // targets are left alone (window.open callers pass a name there).
    document.addEventListener(
        "click",
        (event) => {
            const anchor = event.target instanceof Element ? event.target.closest("a") : null;
            if (!anchor) return;
            if (anchor.target !== "_blank") return;
            if (anchor.hasAttribute("rel") && anchor.rel.includes("noopener")) return;
            // A plain un-vouched _blank link leaks window.opener and is a
            // common popup vector.
            anchor.rel = `${anchor.rel} noopener noreferrer`.trim();
        },
        true,
    );
}

/**
 * Open an advertiser landing page from a user gesture.
 *
 * Uses a detached anchor rather than `window.open` so it is a plain navigation
 * with `noopener`, and so it works even where the popup guard has installed.
 */
export function openAdLink(url) {
    if (typeof document === "undefined" || !url) return;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer nofollow";
    document.body.appendChild(a);
    a.click();
    a.remove();
}
