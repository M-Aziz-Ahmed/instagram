const express = require("express");
const UserMediaConnection = require("../models/userMediaConnection");
const { verifyToken } = require("../middleware/auth");
const { requireFeature } = require("../lib/featureFlags");
const { readLimiter, writeLimiter } = require("../middleware/rateLimit");
const { logAuth } = require("../logService");
const drive = require("../lib/googleDrive");

const router = express.Router();

/**
 * Google Drive as a media PICKER.
 *
 * The model is already stored (`providers.googleDrive`); these routes finish the
 * flow. Note the direction this works in, because it is the opposite of
 * Cloudinary and it matters:
 *
 *   Cloudinary — the user's cloud receives NEW uploads. Bytes go browser → their
 *                provider, so we never touch them.
 *   Drive      — the user's existing files are REFERENCED. Nothing is copied
 *                into our storage; we keep a file id and Google's servers do
 *                the delivery.
 *
 * A file only works as a reference if it is already shared, so every response
 * here is filtered to shared files. Offering an unshared one would be offering
 * a post that cannot play, and it would also be a quiet nudge toward the user
 * sharing their entire Drive.
 */

// ── GET /api/media-vault/drive/status ─────────────────────────────────────
router.get("/drive/status", verifyToken, requireFeature("mediaVault"), readLimiter, async (req, res) => {
    try {
        const configured = drive.isConfigured();
        const conn = await UserMediaConnection.findOne({ userId: req.userId }).lean();
        const connected = !!conn?.providers?.googleDrive?.refreshToken;
        return res.json({
            // Not configured is a normal state, not an error: the app runs
            // without Drive and the UI simply hides the option.
            configured,
            connected,
            email: conn?.providers?.googleDrive?.email || "",
            connectedAt: conn?.providers?.googleDrive?.connectedAt || null,
        });
    } catch (err) {
        console.error("[mediaVault] drive status failed:", err.message);
        return res.status(500).json({ error: "Could not read your Drive connection" });
    }
});

// ── GET /api/media-vault/drive/auth?picker=1 ──────────────────────────────
// Hand the browser Google's consent screen.
router.get("/drive/auth", verifyToken, requireFeature("mediaVault"), readLimiter, async (req, res) => {
    try {
        if (!drive.isConfigured()) {
            return res.status(503).json({ error: "Google Drive is not configured on this server" });
        }
        const state = drive.issueState(req.userId);
        return res.json({ url: drive.buildAuthUrl({ state, picker: req.query.picker === "1" }) });
    } catch (err) {
        console.error("[mediaVault] drive auth failed:", err.message);
        return res.status(500).json({ error: "Could not start the Google sign-in" });
    }
});

// ── GET /api/media-vault/drive/callback ───────────────────────────────────
// Google's redirect target. Verifies `state`, exchanges the code, and stores
// the refresh token encrypted.
router.get("/drive/callback", readLimiter, async (req, res) => {
    // NO verifyToken here on purpose: this is a top-level redirect from Google,
    // and the session cookie is sent, but the account is identified by the
    // opaque single-use `state` that was minted while they were signed in. That
    // is the standard authorization-code + state pattern; trusting a
    // username from a query parameter instead would be a hole.
    try {
        const { code, state, error } = req.query || {};
        if (error) return fail(res, `Google sign-in was declined (${error})`);
        if (!code || !state) return fail(res, "Google did not return a code");

        const userId = drive.consumeState(state);
        if (!userId) return fail(res, "This sign-in link has expired. Try again.", 400);

        const tokens = await drive.exchangeCode(code);
        if (!tokens.refresh_token) {
            // Happens when the account previously granted access: Google then
            // omits a new refresh token. The existing one is still valid, so
            // this is only fatal if we have none.
            const existing = await UserMediaConnection.findOne({ userId }).lean();
            if (!existing?.providers?.googleDrive?.refreshToken) {
                return fail(res, "Google did not grant offline access. Revoke this app in your Google account and try again.", 400);
            }
            return finish(res, userId, existing, tokens.access_token, tokens.expires_in);
        }

        const email = await fetchDriveEmail(tokens.access_token);
        return finish(res, userId, null, tokens.access_token, tokens.expires_in, tokens.refresh_token, email);
    } catch (err) {
        console.error("[mediaVault] drive callback failed:", err.message);
        return fail(res, "Could not complete the Google sign-in");
    }
});

async function finish(res, userId, existing, accessToken, expiresIn, refreshToken, email) {
    await UserMediaConnection.updateOne(
        { userId },
        {
            $set: {
                "providers.googleDrive.accessToken": drive.encrypt(accessToken || ""),
                "providers.googleDrive.expiresAt": expiresIn
                    ? new Date(Date.now() + expiresIn * 1000)
                    : null,
                "providers.googleDrive.connectedAt": new Date(),
                ...(refreshToken ? { "providers.googleDrive.refreshToken": drive.encrypt(refreshToken) } : {}),
                ...(email ? { "providers.googleDrive.email": email } : {}),
            },
        },
        { upsert: true, setDefaultsOnInsert: true },
    );
    logAuth("media_drive_connected", existing?.username || "", { message: "Connected Google Drive as a media source" });

    // A 302 back into the app rather than JSON, because this is reached by a
    // top-level navigation from Google and the browser is waiting for a page.
    return res.redirect("/settings?drive=connected");
}

async function fetchDriveEmail(accessToken) {
    try {
        const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { authorization: `Bearer ${accessToken}` },
        });
        if (!r.ok) return "";
        return (await r.json()).email || "";
    } catch {
        return "";
    }
}

function fail(res, message, status = 400) {
    // Same redirect shape as success so the user lands back in the app with an
    // explanation rather than on a raw JSON error page.
    return res.redirect(`/settings?drive=error&reason=${encodeURIComponent(message)}`);
}

// ── GET /api/media-vault/drive/files ──────────────────────────────────────
router.get("/drive/files", verifyToken, requireFeature("mediaVault"), readLimiter, async (req, res) => {
    try {
        const data = await drive.listFiles(req.userId, { pageToken: String(req.query.pageToken || "") });
        return res.json({
            nextPageToken: data.nextPageToken || "",
            files: (data.files || []).map((f) => ({
                id: f.id,
                name: f.name || "Untitled",
                mimeType: f.mimeType,
                sizeBytes: Number(f.size) || 0,
                // Google needs both of these for an embed to work; the embed
                // cannot be verified from the listing alone, so the UI labels
                // every pick as needing "shared" and the post route stores the
                // id rather than a URL it could not use.
                thumbnail: f.thumbnailLink || "",
                webViewLink: f.webViewLink || "",
            })),
        });
    } catch (err) {
        if (err.status === 409) return res.status(409).json({ error: "Google Drive is not connected" });
        console.error("[mediaVault] drive files failed:", err.message);
        return res.status(500).json({ error: "Could not list your Drive videos" });
    }
});

// ── DELETE /api/media-vault/drive ─────────────────────────────────────────
// Disconnects and forgets the token. Deletes nothing in the user's Drive.
router.delete("/drive", verifyToken, requireFeature("mediaVault"), writeLimiter, async (req, res) => {
    try {
        await UserMediaConnection.updateOne(
            { userId: req.userId },
            {
                $set: {
                    "providers.googleDrive.refreshToken": "",
                    "providers.googleDrive.accessToken": "",
                    "providers.googleDrive.expiresAt": null,
                    "providers.googleDrive.email": "",
                },
            },
        );
        return res.json({ ok: true });
    } catch (err) {
        return res.status(500).json({ error: "Could not disconnect Google Drive" });
    }
});

module.exports = router;
