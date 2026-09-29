const mongoose = require("mongoose");

/**
 * A user's OWN media storage connection.
 *
 * The premise: media lives in the account that belongs to the person who
 * uploaded it, and this site keeps only the coordinates needed to reference it.
 * Nothing is proxied through our servers, so a view costs us nothing — which is
 * the property that makes the media vault work, and which is also simply the
 * right default for content the platform does not own.
 *
 * ── Why no API secret is stored ─────────────────────────────────────────────
 * Uploads go straight from the browser to the provider using an UNSIGNED upload
 * preset, which is the same mechanism `components/Feed/Compose.jsx` already uses
 * for the site's own Cloudinary. A preset name and a cloud name are public by
 * design — they are not credentials, and they only ever grant "append a file to
 * this cloud", never "read or delete anything already there".
 *
 * That means this document has no secret in it, and therefore needs no secret
 * encryption. Adding an `api_secret` field would be strictly worse: it would
 * create a high-value target and buy nothing, because a signed upload is only
 * needed to restrict file size on a tier we control the storage for.
 *
 * ── Tiering ─────────────────────────────────────────────────────────────────
 *
 *   user   — connected their own provider. All their media goes to their
 *            account. Our cost is zero, permanently.
 *   site   — uses the site's provider, for accounts an admin has granted it
 *            (the existing `upload_video` permission and friends). Metered.
 *
 * `tier` is a cached copy of what the gates resolve to, so the client can render
 * the right upload target without a round trip. The gates remain authoritative;
 * this is a hint, not a control.
 */
const mediaVaultConnectionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },

    // Which tier the media should be written to right now.
    // "site" | "user"
    tier: { type: String, enum: ["site", "user"], default: "site" },

    providers: {
        cloudinary: {
            // The user's own cloud. Public identifiers, not credentials.
            cloudName:   { type: String, default: "" },
            uploadPreset: { type: String, default: "" },
            // When this was last proven to work, and how.
            verifiedAt:  { type: Date, default: null },
            verifyError: { type: String, default: "" },
        },
        googleDrive: {
            // Populated by the OAuth flow in routes/mediaVault.js.
            refreshToken:  { type: String, default: "" }, // ENCRYPTED before write
            accessToken:   { type: String, default: "" }, // ENCRYPTED before write
            expiresAt:     { type: Date, default: null },
            email:         { type: String, default: "" },
            connectedAt:   { type: Date, default: null },
        },
    },

    // Bytes this account has attached to live posts, reconciled from the
    // provider rather than trusted from the client. Denormalised so a quota
    // check is one field read instead of a provider round trip.
    usage: {
        storedBytes:  { type: Number, default: 0 },
        fileCount:    { type: Number, default: 0 },
        quotaBytes:   { type: Number, default: 0 },  // 0 = unlimited for this tier
        reconciledAt: { type: Date, default: null },
    },

    // Set when the user has been told their media is on the site tier, so the
    // prompt to bring their own storage is shown once and not nagged.
    ownStorageOfferedAt: { type: Date, default: null },
}, { timestamps: true });

// Quota checks read quota + usage for one account, and the admin panel lists
// everyone over their allowance.
mediaVaultConnectionSchema.index({ "usage.storedBytes": -1 });
mediaVaultConnectionSchema.index({ "providers.cloudinary.cloudName": 1 });

/** Is this connection usable for uploads right now? */
function cloudinaryReady(conn) {
    return !!(conn?.providers?.cloudinary?.cloudName && conn?.providers?.cloudinary?.uploadPreset);
}

function googleDriveReady(conn) {
    return !!conn?.providers?.googleDrive?.refreshToken;
}

module.exports = mongoose.models.UserMediaConnection
    || mongoose.model("UserMediaConnection", mediaVaultConnectionSchema);

module.exports.cloudinaryReady = cloudinaryReady;
module.exports.googleDriveReady = googleDriveReady;
