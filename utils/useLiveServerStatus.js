"use client";

import { useEffect, useRef, useState } from "react";

// Detect whether the live server is actually reachable, so the UI can say so
// instead of looking broken.
//
// The probe goes through the same-origin /api proxy, which on the desktop build is
// the locally bundled Next server forwarding to live-server. That means one probe
// covers the whole chain: if the sidecar died or live-server is unreachable, both
// show up here. Any HTTP status counts as reachable - live-server answers 401 to an
// unauthenticated probe, which is a healthy server telling us it is alive. Only a
// transport failure or an upstream gateway error means "down".

const PROBE_URL = "/api/app/config";
const HEALTHY_INTERVAL_MS = 20000;
const UNHEALTHY_INTERVAL_MS = 5000;
const MAX_BACKOFF_MS = 60000;

function classify(response) {
    if (!response) return false;
    // 502/503/504 mean the proxy could not reach live-server. 5xx from live-server
    // itself still proves it answered, so only the gateway codes count as down.
    return ![502, 503, 504].includes(response.status);
}

export function useLiveServerStatus() {
    const [status, setStatus] = useState("checking"); // checking | online | offline
    const [since, setSince] = useState(null);
    const timerRef = useRef(null);
    const failuresRef = useRef(0);
    const aliveRef = useRef(true);

    useEffect(() => {
        aliveRef.current = true;

        const set = (next) => {
            setStatus((prev) => (prev === next ? prev : next));
            setSince(Date.now());
        };

        const probe = async () => {
            // Nothing to gain from probing a hidden tab, and a background poll would
            // keep the network awake on battery.
            if (typeof document !== "undefined" && document.hidden) {
                schedule();
                return;
            }
            let reachable = false;
            try {
                const controller = new AbortController();
                const t = setTimeout(() => controller.abort(), 8000);
                const response = await fetch(PROBE_URL, {
                    method: "GET",
                    cache: "no-store",
                    credentials: "include",
                    signal: controller.signal,
                }).finally(() => clearTimeout(t));
                reachable = classify(response);
            } catch {
                reachable = false;
            }
            if (!aliveRef.current) return;

            if (reachable) {
                failuresRef.current = 0;
                set("online");
            } else {
                failuresRef.current += 1;
                set("offline");
            }
            schedule();
        };

        const schedule = () => {
            clearTimeout(timerRef.current);
            const base = failuresRef.current === 0 ? HEALTHY_INTERVAL_MS : UNHEALTHY_INTERVAL_MS;
            // Back off while it stays down so a long outage does not hammer the proxy.
            const delay = Math.min(base * Math.min(failuresRef.current || 1, 6), MAX_BACKOFF_MS);
            timerRef.current = setTimeout(probe, delay);
        };

        const onVisible = () => {
            if (typeof document === "undefined" || !document.hidden) probe();
        };

        probe();
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("online", onVisible);
        window.addEventListener("offline", onVisible);

        return () => {
            aliveRef.current = false;
            clearTimeout(timerRef.current);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("online", onVisible);
            window.removeEventListener("offline", onVisible);
        };
    }, []);

    return { status, offline: status === "offline", since };
}

export default useLiveServerStatus;
