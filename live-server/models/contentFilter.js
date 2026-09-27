const mongoose = require("mongoose");

/**
 * Content-filter configuration (singleton document).
 *
 * IMPORTANT: mongoose defaults to `strict: true`, which means any path NOT
 * declared below is silently DROPPED on `Object.assign(doc, update); doc.save()`.
 * That is a live footgun for the admin PATCH route: adding a key to the route's
 * whitelist without adding it here returns HTTP 200, shows "saved" in the UI, and
 * persists nothing. Declare every field here first.
 */
const contentFilterSchema = new mongoose.Schema(
    {
        // ── Word lists ────────────────────────────────────────────────────
        // `toxicWords` is a client-side DISPLAY list (blurred spans). It is not a
        // block list and is never read on any write path.
        toxicWords: [{ type: String, default: [] }],
        // `nudityKeywords` is the server-side hard-block list, matched with the
        // shared matcher (whole-word by default). Previously matched with a bare
        // `String.includes`, so "ass" blocked "assistant" server-side too.
        nudityKeywords: [{ type: String, default: [] }],
        // Words permitted even when they would otherwise match. Lets an admin
        // whitelist a brand name that collides with a filtered term.
        allowedWords: [{ type: String, default: [] }],

        blockNudity: { type: Boolean, default: true },
        blurToxicWords: { type: Boolean, default: true },

        // ── Matching rules (must match the client's, or the two disagree) ─
        matchOptions: {
            // THE fix for "ass" blurring "assistant". Keep this true unless the
            // admin has a specific reason.
            wholeWord: { type: Boolean, default: true },
            leetspeak: { type: Boolean, default: false },
            caseSensitive: { type: Boolean, default: false },
            minLength: { type: Number, default: 0, min: 0, max: 32 },
        },

        // ── Text moderation scope ─────────────────────────────────────────
        // Which write paths are checked. Every surface is opt-out so adding a
        // new one later does not silently leave content unmoderated.
        textScope: {
            posts: { type: Boolean, default: true },
            comments: { type: Boolean, default: true },
            postEdits: { type: Boolean, default: true },
            commentEdits: { type: Boolean, default: true },
            reposts: { type: Boolean, default: true },
            directMessages: { type: Boolean, default: true },
            groupMessages: { type: Boolean, default: true },
            stories: { type: Boolean, default: true },
            bios: { type: Boolean, default: false },
            // Bot posts come from third-party news APIs and an admin's own
            // config. Off by default: a headline legitimately containing a
            // filtered word is a false positive, and bots are server-to-server so
            // they already bypass POST /api/posts and its check.
            bots: { type: Boolean, default: false },
        },

        // ── Media (image/video) moderation ───────────────────────────────
        // `blockNudity` is TEXT-only despite the old admin label saying
        // "Block Nudity Uploads", which was actively misleading.
        mediaModeration: {
            enabled: { type: Boolean, default: false },
            // "none" | "cloudinary" | "google" | "aws"
            // "none" performs structural checks only (host allowlist, rollback).
            provider: { type: String, default: "none", enum: ["none", "cloudinary", "google", "aws"] },
            // Confidence above which the provider's verdict is "explicit".
            // 0.60 = AWS/Google "Likely", 0.80 = "Very Likely".
            threshold: { type: Number, default: 0.8, min: 0, max: 1 },
            // "block"  -> reject the write and destroy the asset
            // "flag"   -> accept but hide pending review
            // "blur"   -> accept and mark the post NSFW
            action: { type: String, default: "block", enum: ["block", "flag", "blur"] },
            // What to do when the provider errors or is not configured.
            // "closed" rejects (safe, but a provider outage blocks all uploads);
            // "open" accepts (available, but a provider outage leaks content).
            failureMode: { type: String, default: "closed", enum: ["closed", "open"] },
            // Per-surface switches, same rationale as textScope.
            // KEY NAMES MUST MATCH THE `surface` IDs USED AT THE CALL SITES
            // (see the `enforceMedia({ surface: ... })` calls in routes/*), because
            // the lookup is `settings.scope[surface]`. An earlier version stored
            // plural keys ("postImages") while callers passed singular ones
            // ("postImage"), so every lookup returned undefined, every surface
            // evaluated `undefined !== false`, and all seven switches were
            // permanently inert no matter what the admin set.
            scope: {
                postImage: { type: Boolean, default: true },
                postVideo: { type: Boolean, default: true },
                commentImage: { type: Boolean, default: true },
                story: { type: Boolean, default: true },
                dm: { type: Boolean, default: true },
                group: { type: Boolean, default: true },
                avatar: { type: Boolean, default: false },
            },
            // Only allow Cloudinary-hosted media through. Off by default because
            // Giphy GIFs are referenced off-Cloudinary and are not moderated.
            requireCloudinaryHost: { type: Boolean, default: false },
            // Destroy the asset when a write is rejected. Without this every
            // rejected upload is orphaned in the Cloudinary account forever.
            destroyOnReject: { type: Boolean, default: true },
            // Skip provider calls for assets already screened and known good.
            cacheResults: { type: Boolean, default: true },
            cacheTtlHours: { type: Number, default: 168, min: 1, max: 8760 },
        },

        // ── Link / domain policy ─────────────────────────────────────────
        links: {
            // Hosts that may appear in a post. Empty = allow any http(s).
            blockedDomains: [{ type: String, default: [] }],
            allowedDomains: [{ type: String, default: [] }],
            blockAllLinks: { type: Boolean, default: false },
            // Reject obviously credential-harvesting hosts.
            blockPhishingPatterns: { type: Boolean, default: true },
        },

        // ── Auto-action on repeat offences ───────────────────────────────
        autoAction: {
            // Hide posts automatically when they trip the filter, instead of
            // waiting for a moderator.
            autoHideFlaggedPosts: { type: Boolean, default: false },
            // Suspensions an account earns within the window below. 0 = disabled.
            suspendAfterOffences: { type: Number, default: 0, min: 0, max: 1000 },
            // min is 0, not 1: these windows are persisted straight from the
            // admin form, and a `min: 1` made a legitimate 0 throw a validation
            // error that surfaced as an opaque 500 from save() rather than a
            // 400 explaining the problem.
            offenceWindowHours: { type: Number, default: 24, min: 0, max: 8760 },
            suspendHours: { type: Number, default: 24, min: 0, max: 8760 },
        },

        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: String, default: "" },
    },
    { minimize: false }
);

/**
 * Fixed `_id` so the document is a true singleton. The admin routes read it with
 * `findOne({})` and auto-create it on first GET, and two concurrent GETs could
 * otherwise both insert, leaving `findOne({})` to return an arbitrary one of
 * several documents with no error anywhere. With a fixed id the loser gets a
 * duplicate-key error, which the route handles by re-reading.
 */
const SINGLETON_ID = "singleton";

contentFilterSchema.statics.load = async function load() {
    const existing = await this.findById(SINGLETON_ID);
    if (existing) return existing;
    try {
        return await this.create({ _id: SINGLETON_ID });
    } catch {
        // Lost the race; the winner's document is the real one.
        return this.findById(SINGLETON_ID);
    }
};

module.exports = mongoose.models.ContentFilter || mongoose.model("ContentFilter", contentFilterSchema);
module.exports.SINGLETON_ID = SINGLETON_ID;
