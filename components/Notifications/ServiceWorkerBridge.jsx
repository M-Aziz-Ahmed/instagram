"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Receiving end of service-worker navigation.
//
// public/sw.js used to hard-navigate the window with `client.navigate(url)`.
// That is a full document load: it discards the React tree and everything in it,
// so a call opened from its own notification landed on /inbox with no ringing
// UI, an open conversation lost its scroll and draft, and with several tabs open
// it navigated whichever window it happened to find first. The worker now
// postMessages the target instead, and this routes it client-side.
//
// The worker still falls back to a real navigation when it cannot focus a
// window (see focusOrOpen there), so this is an optimisation on top of a path
// that works either way, not the only way through.

export default function ServiceWorkerBridge() {
    const router = useRouter();

    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;

        const onMessage = (event) => {
            const data = event.data;
            if (!data || data.type !== "navigate" || typeof data.url !== "string") return;

            // Same-origin only. The worker only ever builds these paths from our
            // own push payload, but the value arrives as a message and is about
            // to become a client-side route, so it is checked rather than trusted.
            let path = null;
            try {
                const parsed = new URL(data.url, window.location.origin);
                if (parsed.origin !== window.location.origin) return;
                path = parsed.pathname + parsed.search + parsed.hash;
            } catch {
                return;
            }

            router.push(path);

            // Tell anything else that cares about the route. CallContext uses
            // this to notice it has just been sent to /inbox?call=<id> and
            // rebuild the ringing state for a call whose `call:incoming` socket
            // event it never received, because it was disconnected at the time.
            window.dispatchEvent(new CustomEvent("sw:navigate", { detail: { url: path } }));
        };

        navigator.serviceWorker.addEventListener("message", onMessage);
        return () => navigator.serviceWorker.removeEventListener("message", onMessage);
    }, [router]);

    return null;
}
