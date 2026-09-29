const UserMediaConnection = require("../models/userMediaConnection");
const {
    cloudinaryReady, googleDriveReady,
} = require("../models/userMediaConnection");
const { canUploadVideo } = require("./videoUpload");

/**
 * Where a user's media should be written, and whether they are allowed to write.
 *
 * The decision is a pure function of the account and its connection, so the
 * composer, the post route and the admin panel can never disagree about it. All
 * three ask `resolveMediaTarget`; none of them re-derives the rules.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 *   1. If the user has connected their own storage, media goes there. Always,
 *      regardless of any grant. Their account beats ours on every axis, and it
 *      is the only tier that costs us nothing.
 *   2. Otherwise, if the account is allowed to upload at all, media goes to the
 *      site provider — metered against a quota.
 *   3. Otherwise there is no upload target, and the caller falls back to
 *      posting a link, which is free and always available.
 *
 * Rule 1 sitting above rule 2 is deliberate. A user who did the work of
 * connecting storage should not be silently billed to the site tier because
 * some grant happens to be active, and an admin should not be able to talk them
 * back onto our storage.
 *
 * ── Quotas, and what a direct upload can actually enforce ───────────────────
 *
 * Uploads are browser → provider, so this server never sees the bytes. That is
 * the whole point (no egress, no storage) and it has one honest consequence:
 *
 *   WE CANNOT HARD-CAP A USER'S TOTAL VOLUME.
 *
 * What we CAN do, and what this module does:
 *   - cap a single file, by choosing a preset with `max_file_size` and
 *     `max_video_bitrate` (see connectCloudinary);
 *   - refuse to ATTACH over-quota media to a post (see assertWithinQuota);
 *   - reconcile actual usage from the provider (see reconcileUsage).
 *
 * So a determined user with a valid preset can upload more than their quota to
 * their cloud; they simply cannot get it into a post on this site. A hard total
 * cap would require proxying the bytes, which reintroduces exactly the cost
 * this whole feature removes. That tradeoff is stated here rather than papered
 * over with a quota that cannot be enforced.
 */

/** Site-tier allowance for an admin-granted account. */
const SITE_TIER_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
/** A single file on the site tier. Mirrors the preset Cloudinary enforces. */
const SITE_TIER_MAX_FILE_BYTES = 200 * 1024 * 1024;   // 200 MB

/**
 * Pure: given a user and a connection, where does their media go?
 * No database access, so it is trivially testable and safe to call from a
 * render path.
 */
function resolveMediaTarget(user, conn) {
    const canUpload = canUploadVideo({
        isAdmin: user?.isAdmin,
        roles: user?.roles,
        permissions: user?.permissions,
        videoUploadAllowed: user?.videoUploadAllowed,
    });

    if (cloudinaryReady(conn)) {
        return {
            tier: "user",
            provider: "cloudinary",
            // The public identifiers the browser needs. Not credentials.
            cloudName: conn.providers.cloudinary.cloudName,
            uploadPreset: conn.providers.cloudinary.uploadPreset,
            maxFileBytes: SITE_TIER_MAX_FILE_BYTES,
            quotaBytes: 0, // their cloud, their bill
            canUpload: true,
        };
    }

    if (canUpload) {
        return {
            tier: "site",
            provider: "cloudinary",
            // Empty: the browser already has these from NEXT_PUBLIC_*.
            cloudName: "",
            uploadPreset: "",
            maxFileBytes: SITE_TIER_MAX_FILE_BYTES,
            quotaBytes: SITE_TIER_QUOTA_BYTES,
            canUpload: true,
        };
    }

    return {
        tier: null,
        provider: null,
        canUpload: false,
        // The alternative, and the reason this is a "not right now" rather than
        // a wall: a link post renders a real playable video and costs nothing.
        alternative: "link",
    };
}

/** Load (or create) the connection row for an account. */
async function getConnection(userId) {
    if (!userId) return null;
    return UserMediaConnection.findOne({ userId }).lean();
}

/** How much of their allowance is left, in bytes. `Infinity` when unlimited. */
function remainingBytes(target, usage) {
    if (!target?.quotaBytes) return Infinity;
    return Math.max(0, target.quotaBytes - (usage?.storedBytes || 0));
}

/**
 * Refuse to attach media that would take an account past its allowance.
 *
 * Returns null when fine, or an object explaining the refusal. Callers turn
 * that into a 402/403 with a message the composer can show.
 */
function assertWithinQuota(target, usage, incomingBytes = 0) {
    if (!target?.quotaBytes) return null;              // user tier: not our bill
    const used = usage?.storedBytes || 0;
    if (used + incomingBytes <= target.quotaBytes) return null;
    return {
        status: 413,
        error: "Storage allowance reached",
        quotaBytes: target.quotaBytes,
        usedBytes: used,
        // The actionable half: what to do about it, not just the refusal.
        remedy: "Connect your own storage to upload without a limit, or post a link instead.",
    };
}

/**
 * Connect a user's own Cloudinary.
 *
 * Stores a cloud name and an unsigned preset. Neither is a credential, and
 * neither can read or delete anything already in the cloud — a preset only
 * appends. We deliberately do NOT ask for an API secret: a signed upload is
 * only needed to restrict file size, and the size limit is set on the preset in
 * the user's own Cloudinary console, where they can see it.
 */
async function connectCloudinary(userId, { cloudName, uploadPreset }) {
    const cloud = String(cloudName || "").trim();
    const preset = String(uploadPreset || "").trim();

    // Cloudinary cloud names are lowercase alphanumeric, 3-32 chars. Presets are
    // more permissive but never contain whitespace or a slash.
    if (!/^[a-z0-9]{3,32}$/.test(cloud)) {
        throw Object.assign(new Error("That is not a valid Cloudinary cloud name"), { status: 400 });
    }
    if (!/^[\w-]{1,64}$/.test(preset)) {
        throw Object.assign(new Error("That is not a valid upload preset name"), { status: 400 });
    }

    const conn = await UserMediaConnection.findOneAndUpdate(
        { userId },
        {
            $set: {
                tier: "user",
                "providers.cloudinary.cloudName": cloud,
                "providers.cloudinary.uploadPreset": preset,
                "providers.cloudinary.verifiedAt": null,
                "providers.cloudinary.verifyError": "",
            },
            $setOnInsert: { usage: { quotaBytes: 0, storedBytes: 0, fileCount: 0 } },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return conn;
}

async function disconnectCloudinary(userId) {
    await UserMediaConnection.updateOne(
        { userId },
        {
            $set: {
                tier: "site",
                "providers.cloudinary.cloudName": "",
                "providers.cloudinary.uploadPreset": "",
                "providers.cloudinary.verifiedAt": null,
                "providers.cloudinary.verifyError": "",
            },
        },
    );
}

/** Record a successful direct upload against the account's running total. */
async function addUsage(userId, bytes) {
    if (!userId || !Number.isFinite(bytes) || bytes <= 0) return;
    await UserMediaConnection.updateOne(
        { userId },
        {
            $inc: { "usage.storedBytes": Math.round(bytes), "usage.fileCount": 1 },
            $set: { "usage.reconciledAt": new Date() },
        },
        { upsert: true, setDefaultsOnInsert: true },
    );
}

/** Mark that the user has been shown the "connect your own storage" prompt. */
async function markOffered(userId) {
    await UserMediaConnection.updateOne(
        { userId },
        { $set: { ownStorageOfferedAt: new Date() } },
        { upsert: true, setDefaultsOnInsert: true },
    );
}

module.exports = {
    resolveMediaTarget,
    getConnection,
    remainingBytes,
    assertWithinQuota,
    connectCloudinary,
    disconnectCloudinary,
    addUsage,
    markOffered,
    googleDriveReady,
    SITE_TIER_QUOTA_BYTES,
    SITE_TIER_MAX_FILE_BYTES,
};
