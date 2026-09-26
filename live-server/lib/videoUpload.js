// Decides who may upload video directly.
//
// Hosting user video is the most expensive capability this app has: every
// upload consumes Cloudinary storage and egress bandwidth, permanently, and it
// is trivial to fill. So it is not open to everyone by default.
//
// Someone who cannot upload is not blocked from posting video, though. They
// post a link to YouTube / Facebook / Instagram / TikTok / Reddit instead,
// which costs this site nothing, and that post still shows a real playable
// video in the feed and in /reels. See lib/videoLinks.js for recognition and
// components/shared/VideoLinkCard.jsx for the rendering.
//
// Three ways to be allowed, in the order they are checked:
//   1. admin - always allowed, so an operator can never lock themselves out.
//   2. the `upload_video` role permission, granted to trusted roles.
//   3. an explicit per-user grant (User.videoUploadAllowed), which is how an
//      admin gives one trusted person access without inventing a role.
// Admins never need a role grant, and a per-user false never revokes a role
// grant - a deny flag would make "off by default" ambiguous with "banned".

/**
 * Accepts either shape the callers already have:
 *   { isAdmin, roles }            - a populated roles array
 *   { isAdmin, permissions }      - a pre-flattened permission list
 * plus the optional per-user grant.
 *
 * @param {object} opts
 * @param {boolean} [opts.isAdmin]
 * @param {Array<{permissions?: string[]}>} [opts.roles]
 * @param {string[]} [opts.permissions]
 * @param {boolean} [opts.videoUploadAllowed]
 * @returns {boolean}
 */
function canUploadVideo({ isAdmin, roles, permissions, videoUploadAllowed } = {}) {
    if (isAdmin) return true;
    if (videoUploadAllowed === true) return true;
    if (Array.isArray(permissions)) return permissions.includes("upload_video");
    return Array.isArray(roles) && roles.some((r) => (r?.permissions || []).includes("upload_video"));
}

// Express middleware for write routes.
//
// Returns 403 with a machine-readable `feature` and an explicit
// `alternative`, so the client can explain what to do instead of showing a
// bare "forbidden": the whole point of the gate is that the person can still
// post the video as a link.
function requireVideoUpload() {
    return async (req, res, next) => {
        try {
            const User = require("../models/user");
            const user = await User.findById(req.userId)
                .select("isAdmin videoUploadAllowed roles")
                .populate("roles", "permissions")
                .lean();

            if (!user) return res.status(401).json({ error: "User not found" });

            if (canUploadVideo(user)) return next();

            return res.status(403).json({
                error: "Direct video upload is not enabled for your account",
                feature: "upload_video",
                // Told to the client explicitly rather than left to be guessed.
                alternative: "link",
            });
        } catch (err) {
            console.error("[videoUpload] gate error:", err);
            return res.status(500).json({ error: "Could not verify upload permission" });
        }
    };
}

module.exports = { canUploadVideo, requireVideoUpload };
