"use client";

/**
 * The resolved upload target, readable outside React.
 *
 * Most upload sites are hooks and could call `useMediaTarget` directly. Several
 * are not: `GroupChatBox` has a module-level `uploadToCloudinary` function, and
 * others interpolate the cloud name into a module-level constant. Converting all
 * of those to hooks is a structural rewrite of each file for no behavioural gain.
 *
 * So the hook publishes what it resolved here, and the legacy call sites read it
 * at the moment they need it. The important part is `getTarget()` reading a
 * live value rather than capturing one at module load: a constant captured
 * before `/api/media-vault/status` resolves would be the site cloud forever, and
 * a user who connected their own storage would keep billing it.
 *
 * There is exactly one network call and one resolution of the target; this is a
 * cache of that answer, not a second source of truth. `resolveMediaTarget` on
 * the server remains authoritative — nothing here is consulted for a permission
 * decision.
 */

const SITE_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";
const SITE_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

let resolved = {
    tier: null,
    cloudName: SITE_CLOUD,
    uploadPreset: SITE_PRESET,
    usingOwnStorage: false,
    canUpload: true,
    maxFileBytes: null,
    quota: null,
};

/** Called by useMediaTarget when the status call lands. */
export function publishMediaTarget(target) {
    resolved = { ...resolved, ...target };
}

/** The current target. Falls back to the site cloud, so it is never null. */
export function getTarget() {
    return resolved;
}

export function getCloudName() {
    return resolved.cloudName || SITE_CLOUD;
}

export function getUploadPreset() {
    return resolved.uploadPreset || SITE_PRESET;
}

/**
 * Report a completed upload to the running site-tier total.
 *
 * Lives here rather than on the hook because the module-level upload helpers
 * have no access to it. No-ops on the user tier, where the total is not ours to
 * keep, and deliberately silent on failure: the bytes have already gone to the
 * provider, and the post route still refuses over-quota media at attach time.
 */
export function noteUploadedBytes(bytes) {
    if (resolved.usingOwnStorage) return;
    if (!Number.isFinite(bytes) || bytes <= 0) return;
    fetch("/api/media-vault/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bytes }),
    }).catch(() => {});
}

/** Test seam: restores the site-cloud default. */
export function resetMediaTargetStore() {
    resolved = {
        tier: null,
        cloudName: SITE_CLOUD,
        uploadPreset: SITE_PRESET,
        usingOwnStorage: false,
        canUpload: true,
        maxFileBytes: null,
        quota: null,
    };
}
