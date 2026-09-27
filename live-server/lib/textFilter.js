/**
 * Server-side text content filtering.
 *
 * The original implementation lived inline in `routes/posts.js`:
 *
 *     (filter.nudityKeywords || []).some((kw) => lower.includes(kw.toLowerCase()))
 *
 * `String.includes` is an unanchored substring test, so the list entry "ass"
 * rejected a post containing "assistant" — the same defect the client had, and
 * strictly worse because it was a hard 400 rather than a cosmetic blur. It was
 * also wired into only 3 of the ~14 write paths, and it failed OPEN on a Mongo
 * error (`catch { return false }`).
 *
 * This module centralises the check so every write path can share one
 * implementation, one match configuration, and one audit trail.
 */

const { findMatches, hasMatches } = require("./toxicMatch");
const ContentFilter = require("../models/contentFilter");
const { logModeration } = require("../logService");

/** In-memory cache so a busy create-post request does not hit Mongo per call. */
let cached = { at: 0, doc: null };
const CACHE_MS = 15000;

async function getFilterDoc() {
    if (cached.doc && Date.now() - cached.at < CACHE_MS) return cached.doc;
    try {
        const doc = await ContentFilter.findById("singleton").lean();
        cached = { at: Date.now(), doc: doc || null };
        return cached.doc;
    } catch {
        // Fail CLOSED on a read error. The old code returned "not blocked", which
        // meant a transient Mongo blip silently disabled moderation entirely.
        return null;
    }
}

function invalidateCache() {
    cached = { at: 0, doc: null };
}

/** Surface key -> the `textScope` flag that governs it. */
const SURFACES = {
    post: "posts",
    comment: "comments",
    postEdit: "postEdits",
    commentEdit: "commentEdits",
    repost: "reposts",
    dm: "directMessages",
    group: "groupMessages",
    story: "stories",
    bio: "bios",
    bot: "bots",
};

/**
 * @param {string} text
 * @param {string} surface one of SURFACES' keys
 * @returns {Promise<{blocked:boolean, reason:string, matches:Array}>}
 */
async function checkText(text, surface = "post") {
    const scopeKey = SURFACES[surface] || "posts";
    const value = String(text ?? "");

    try {
        const filter = await getFilterDoc();
        if (!filter) {
            // No configuration at all is not a failure; nothing is configured to
            // block, so let content through rather than wedging the whole site.
            if (!value) return { blocked: false, reason: "unconfigured", matches: [] };
            return { blocked: false, reason: "unconfigured", matches: [] };
        }

        const scope = filter.textScope || {};
        if (scope[scopeKey] === false) return { blocked: false, reason: "surface-disabled", matches: [] };
        if (!filter.blockNudity) return { blocked: false, reason: "block-nudity-off", matches: [] };
        if (!value.trim()) return { blocked: false, reason: "empty", matches: [] };

        const keywords = Array.isArray(filter.nudityKeywords) ? filter.nudityKeywords : [];
        if (keywords.length === 0) return { blocked: false, reason: "empty-list", matches: [] };

        const options = filter.matchOptions || { wholeWord: true };
        const allowlist = Array.isArray(filter.allowedWords) ? filter.allowedWords : [];

        const matches = allowlist.length
            ? require("./toxicMatch").filterAllowed(
                  value,
                  findMatches(value, keywords, options),
                  allowlist
              )
            : findMatches(value, keywords, options);

        if (matches.length === 0) return { blocked: false, reason: "clean", matches: [] };

        return {
            blocked: true,
            reason: "blocked-keyword",
            // Only the matched word is reported, never the surrounding sentence.
            matches: matches.map((m) => m.word.toLowerCase()),
        };
    } catch (err) {
        // Fail closed: an unexpected error must not become "allow everything".
        return { blocked: true, reason: "filter-error", error: err && err.message, matches: [] };
    }
}

/**
 * Route-handler helper. Returns `null` when the content is fine, or a
 * ready-to-send `{ error, code }` payload when it is not.
 */
async function rejectIfBlocked(text, surface, res) {
    const result = await checkText(text, surface);
    if (!result.blocked) return null;
    try {
        logModeration("text_blocked", {
            message: `Blocked ${surface} content`,
            meta: { surface, reason: result.reason, matches: result.matches },
        });
    } catch {
        // Never let audit logging turn into a second failure.
    }
    res.status(400).json({
        error: `Your ${surface === "comment" ? "comment" : "post"} contains content that is not allowed.`,
        filtered: true,
        // The specific word is echoed so the client can highlight it; the
        // surrounding text is never sent back.
        matchedTerms: result.matches,
    });
    return result;
}

/** Cheap boolean form for bulk/backfill jobs. */
async function isBlocked(text, surface = "post") {
    return (await checkText(text, surface)).blocked;
}

module.exports = {
    checkText,
    rejectIfBlocked,
    isBlocked,
    hasMatches,
    invalidateCache,
    SURFACES,
};
