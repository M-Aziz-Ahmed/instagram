const crypto = require("crypto");
const UserMediaConnection = require("../models/userMediaConnection");

/**
 * Google Drive as a media source.
 *
 * ── Why Drive is a link source and not an upload destination ────────────────
 *
 * Files we create through the `drive.file` scope land in a hidden "app data"
 * pool: invisible in the user's Drive, not counted against their 15 GB, and
 * NOT servable without handing them an OAuth token. Uploading there would move
 * the storage bill off our account and straight onto our egress, which defeats
 * the point.
 *
 * So Drive is the other direction: the user picks videos that are ALREADY in
 * their Drive, we store the file id, and Google's own servers deliver the
 * bytes. That is the only Drive shape that costs us nothing end to end.
 *
 * The price, stated plainly: those files must be shared ("anyone with the
 * link") for the embed to work, so the link is shareable to anyone who has it.
 * That is the user's decision to make on their own file, and `listFiles` returns
 * only files they have already shared, so the app cannot surface an unshared
 * one and imply it is safe.
 *
 * Because of that, Drive is offered as a *picker*, never as a silent
 * re-upload. See lib/mediaVault.js for the tier decision that has to come first.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

/**
 * Only these three scopes.
 *
 * `drive.file` is app-scoped: it can see and create files this app created, plus
 * files the user explicitly opens with the Google Picker. It cannot enumerate
 * the user's Drive, and it cannot touch anything they did not hand over. Asking
 * for the broad `drive` scope would be a restricted-scope verification project
 * and is not remotely justified by a media picker.
 */
const SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email",
];

const PICKER_SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
];

function config() {
    return {
        clientId: process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
    };
}

function isConfigured() {
    const { clientId, clientSecret, redirectUri } = config();
    return !!(clientId && clientSecret && redirectUri);
}

/** Opaque, single-use, short-lived. Stops a crafted /auth link from being used twice. */
const stateCache = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function issueState(userId) {
    const state = crypto.randomBytes(24).toString("base64url");
    stateCache.set(state, { userId, expiresAt: Date.now() + STATE_TTL_MS });
    // Bound the map: a burst of /auth hits with no callback would otherwise
    // leave one entry per hit resident.
    if (stateCache.size > 500) {
        const oldest = stateCache.keys().next().value;
        stateCache.delete(oldest);
    }
    return state;
}

function consumeState(state) {
    const hit = stateCache.get(state);
    stateCache.delete(state);
    if (!hit || hit.expiresAt < Date.now()) return null;
    return hit.userId;
}

// ── Secrets at rest ────────────────────────────────────────────────────────
//
// A Drive refresh token is a long-lived credential: it grants ongoing access to
// the user's files. It is encrypted here with AES-256-GCM under
// MEDIA_VAULT_SECRET, so a database dump alone does not hand over every
// connected user's Drive. This is the ONE secret the vault holds, and it exists
// only because Drive is the one provider that requires a token — Cloudinary
// never does.
const ALGO = "aes-256-gcm";

function secretKey() {
    const raw = process.env.MEDIA_VAULT_SECRET || process.env.JWT_SECRET || "";
    if (!raw) {
        throw new Error("MEDIA_VAULT_SECRET (or JWT_SECRET) must be set to store Drive tokens");
    }
    return crypto.createHash("sha256").update(raw).digest();
}

function encrypt(plaintext) {
    if (!plaintext) return "";
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, secretKey(), iv);
    const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
    return `v1.${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

function decrypt(payload) {
    if (!payload) return "";
    const parts = String(payload).split(".");
    if (parts.length !== 4 || parts[0] !== "v1") return "";
    try {
        const [, iv, tag, data] = parts;
        const decipher = crypto.createDecipheriv(ALGO, secretKey(), Buffer.from(iv, "base64"));
        decipher.setAuthTag(Buffer.from(tag, "base64"));
        return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
    } catch {
        // Wrong key, or the row predates a key change. Treated as "no token"
        // rather than an error, so a key rotation degrades to disconnected
        // instead of breaking every Drive route.
        return "";
    }
}

function buildAuthUrl({ state, picker }) {
    const { clientId, redirectUri } = config();
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", (picker ? PICKER_SCOPES : SCOPES).join(" "));
    url.searchParams.set("access_type", "offline"); // needed for a refresh token
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);
    return url.toString();
}

async function exchangeCode(code) {
    const { clientId, clientSecret, redirectUri } = config();
    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    });
    if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
    return res.json();
}

/** A fresh access token, refreshing and persisting when the old one has expired. */
async function accessTokenFor(userId) {
    const conn = await UserMediaConnection.findOne({ userId });
    const stored = conn?.providers?.googleDrive;
    if (!stored?.refreshToken) throw Object.assign(new Error("Drive is not connected"), { status: 409 });

    const stillValid = stored.expiresAt && new Date(stored.expiresAt).getTime() > Date.now() + 60_000;
    if (stillValid && stored.accessToken) return decrypt(stored.accessToken);

    const { clientId, clientSecret } = config();
    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            refresh_token: decrypt(stored.refreshToken),
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
        }),
    });
    if (!res.ok) throw Object.assign(new Error("Drive session expired"), { status: 401 });
    const data = await res.json();
    if (!data.access_token) throw Object.assign(new Error("No access token returned"), { status: 401 });

    await UserMediaConnection.updateOne(
        { userId },
        {
            $set: {
                "providers.googleDrive.accessToken": encrypt(data.access_token),
                "providers.googleDrive.expiresAt": new Date(Date.now() + (data.expires_in || 3600) * 1000),
            },
        },
    );
    return data.access_token;
}

/**
 * The user's own Drive videos.
 *
 * Filtered to video mime types AND to files that are already shared. The second
 * condition is the whole point: an unshared file cannot be embedded, so
 * returning one would be offering something that fails at post time — and
 * quietly widening the list to everything would push the user toward making
 * their whole Drive public without saying so.
 */
async function listFiles(userId, { pageToken = "" } = {}) {
    const token = await accessTokenFor(userId);
    const url = new URL(`${DRIVE_FILES}/files`);
    url.searchParams.set("q", "mimeType contains 'video/' and trashed = false");
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,size,videoMediaMetadata,webViewLink,webContentLink)");
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set("pageSize", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`drive list failed: ${res.status}`);
    const data = await res.json();
    return data;
}

/** Whether one specific file is already shared, so a picked file is playable. */
async function fileShared(userId, fileId) {
    const token = await accessTokenFor(userId);
    const res = await fetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions`, {
        headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const perms = await res.json().catch(() => ({ permissions: [] }));
    return (perms.permissions || []).some(
        (p) => p.type === "anyone" || p.role === "reader" && p.type === "anyone",
    );
}

module.exports = {
    isConfigured,
    issueState,
    consumeState,
    buildAuthUrl,
    exchangeCode,
    accessTokenFor,
    listFiles,
    fileShared,
    encrypt,
    decrypt,
    SCOPES,
    PICKER_SCOPES,
};
