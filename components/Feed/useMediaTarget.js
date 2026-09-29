"use client";

/**
 * Where should this upload go, and may it?
 *
 * The answer used to be two compile-time constants
 * (`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` / `_UPLOAD_PRESET`), which means the site
 * had exactly one destination and the only way to change that was a rebuild.
 * It is now a per-account answer from `/api/media-vault/status`: a user who has
 * connected their own storage uploads there, everyone else uploads to the site.
 *
 * The client asks, but does not decide. `resolveMediaTarget` on the server is
 * authoritative, and the post route re-checks the quota before anything is
 * attached — this hook exists so the composer can show the right target and the
 * right meter, not so the client can enforce anything.
 *
 * Until the status call resolves, `target` is null and callers must fall back to
 * the site constants. That is a real consideration rather than a nicety: the
 * fallback is what keeps an upload working during a slow or failed status call,
 * instead of blocking the composer entirely.
 */

import { useCallback, useEffect, useState } from "react";
import { publishMediaTarget } from "./mediaTargetStore";

/** The site's own provider, used while status is unknown or unavailable. */
const SITE_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";
const SITE_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

export default function useMediaTarget({ enabled = true } = {}) {
    const [status, setStatus] = useState(null);
    // Derived, not stored. Storing it meant a setState in the effect body on
    // the disabled path, and the state can say nothing more than "have we
    // finished looking" — which is exactly what `status === null` already means.
    const loading = enabled && status === null;

    const reload = useCallback(async () => {
        try {
            const res = await fetch("/api/media-vault/status", { credentials: "include" });
            // A 404 means the route is not deployed yet. That is not an error to
            // surface — the fallback below keeps uploads working until it is.
            if (!res.ok) return;
            setStatus(await res.json());
        } catch {
            // Offline or the feature flag is off. Fall back silently.
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        (async () => { await reload(); })();
    }, [enabled, reload]);

    // The account's own cloud, when connected — it always wins, even over a
    // grant that would otherwise put the upload on the site tier.
    const usingOwnStorage = status?.tier === "user" && !!status?.cloud?.cloudName;

    // Publish for the upload sites that are module-level functions or constants
    // and therefore cannot call this hook themselves.
    useEffect(() => {
        publishMediaTarget({
            tier: status?.tier ?? null,
            usingOwnStorage,
            canUpload: status ? status.canUpload : true,
            maxFileBytes: status?.maxFileBytes || null,
            quota: status?.quota || null,
        });
    }, [status, usingOwnStorage]);

    return {
        status,
        loading,
        usingOwnStorage,
        canUpload: status ? status.canUpload : true, // default permissive while unknown
        cloudName: usingOwnStorage ? status.cloud.cloudName : SITE_CLOUD,
        uploadPreset: usingOwnStorage ? status.cloud.uploadPreset : SITE_PRESET,
        maxFileBytes: status?.maxFileBytes || null,
        quota: status?.quota || null,
        hasTarget: usingOwnStorage || !!SITE_CLOUD,
        reload,
        /**
         * Report a completed direct upload so the site-tier running total keeps
         * up. Fire-and-forget: the bytes already went to the provider, so
         * failing to note it must not fail the post. The server still refuses
         * over-quota media at attach time, which is where it actually matters.
         */
        noteUsage: (bytes) => {
            if (!Number.isFinite(bytes) || bytes <= 0) return;
            fetch("/api/media-vault/usage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ bytes }),
            }).catch(() => {});
        },
    };
}
