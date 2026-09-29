"use client";

/**
 * One uploader for every media surface in the app.
 *
 * There were eleven places that POSTed to `api.cloudinary.com` with the site's
 * cloud name and preset hardcoded — composer, avatar, DMs, group chats, stories,
 * communities, group avatars, voice notes, setup. Each was written separately
 * and each had to be rewired to the resolved target, which is exactly the shape
 * of bug where a user moves their media to their own storage and one surface
 * quietly keeps billing the site.
 *
 * So this is the single implementation, and every surface calls it.
 *
 * Three things it centralises, all of which were per-surface drift before:
 *
 *  - WHERE the bytes go (own cloud, or the site).
 *  - REUSING the site's fallback when the status lookup has not resolved, so a
 *    slow or missing `/api/media-vault/status` never breaks an upload.
 *  - REPORTING the size to the running site-tier total, from the provider's own
 *    `bytes` field rather than the browser's view of the file.
 *
 * It uses XMLHttpRequest rather than fetch because every call site already used
 * `xhr.upload.onprogress` for a progress bar, and swap that out.
 */

import { useCallback } from "react";
import useMediaTarget from "./useMediaTarget";

/** Cloudinary resource types, and the field name each one expects. */
const RESOURCES = {
    image: { path: "image/upload", field: "image" },
    video: { path: "video/upload", field: "video" },
    raw:   { path: "raw/upload",   field: "raw" },
};

export default function useMediaUploader() {
    const media = useMediaTarget();

    /**
     * @param {File} file
     * @param {object} opts
     * @param {"image"|"video"|"raw"} [opts.resource]  defaults to image
     * @param {string} [opts.folder]                    Cloudinary folder
     * @param {(pct:number)=>void} [opts.onProgress]
     * @returns {Promise<{ url: string, bytes: number, result: object }>}
     */
    const upload = useCallback((file, { resource = "image", folder = "anon-feed", onProgress } = {}) => {
        const spec = RESOURCES[resource];
        if (!spec) return Promise.reject(new Error(`Unknown upload type: ${resource}`));
        if (!media.hasTarget) {
            // Without a cloud name there is nowhere to send this. Surfacing it
            // beats a silent failure at "Upload failed".
            return Promise.reject(new Error("No storage destination is configured yet"));
        }

        return new Promise((resolve, reject) => {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("upload_preset", media.uploadPreset);
            if (folder) fd.append("folder", folder);

            const xhr = new XMLHttpRequest();
            xhr.open("POST", `https://api.cloudinary.com/v1_1/${media.cloudName}/${spec.path}`);

            xhr.upload.onprogress = (e) => {
                if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
            };

            xhr.onload = () => {
                if (xhr.status !== 200) {
                    // Cloudinary puts a useful message in the body; surfacing it
                    // turns "upload failed" into "preset not found", which is the
                    // difference between a user fixing it and a support ticket.
                    let message = "Upload failed";
                    try { message = JSON.parse(xhr.responseText)?.error?.message || message; } catch { /* not JSON */ }
                    return reject(new Error(message));
                }
                let result;
                try {
                    result = JSON.parse(xhr.responseText);
                } catch {
                    return reject(new Error("Upload response could not be read"));
                }
                if (!result?.secure_url) return reject(new Error("Upload returned no URL"));

                // Counted from the provider's own number, falling back to the
                // file size if it is somehow absent.
                media.noteUsage(result.bytes || file.size);
                resolve({ url: result.secure_url, bytes: result.bytes || file.size, result });
            };

            xhr.onerror = () => reject(new Error("Network error during upload"));
            xhr.onabort = () => reject(new Error("Upload cancelled"));
            xhr.send(fd);
        });
    }, [media]);

    return {
        upload,
        uploadImage: (file, opts) => upload(file, { ...opts, resource: "image" }),
        uploadVideo: (file, opts) => upload(file, { ...opts, resource: "video" }),
        uploadRaw:   (file, opts) => upload(file, { ...opts, resource: "raw" }),
        target: media,
    };
}
