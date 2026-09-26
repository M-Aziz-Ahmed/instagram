// Block/mute visibility rules, shared by the feed, profiles, search,
// suggestions and messaging.
//
// The app had muted *words* but no way to hide an *account*. On an anonymous
// network that is the difference between "I can scroll past this" and "I
// cannot be reached by this person", so blocking is enforced server-side on
// every read path rather than hidden in the UI.
//
// Both lists hold usernames, stored with their original casing. All
// comparisons here are done on the lowercase form so `BlockedUser` and
// `blockeduser` are treated as the same person.

/**
 * Build the set of usernames a viewer has blocked or muted.
 * @param {string} viewerUsername
 * @param {import("mongoose").Document} [userDoc] Already-loaded user, to
 *        avoid a second query when the caller fetched it anyway.
 * @returns {Promise<string[]>} lowercase usernames to exclude
 */
async function getHiddenUsers(viewerUsername, userDoc) {
    if (!viewerUsername) return [];

    let blocked = [];
    let muted = [];

    if (userDoc) {
        blocked = userDoc.blockedUsers || [];
        muted = userDoc.mutedUsers || [];
    } else {
        const user = await require("../models/user")
            .findOne({ username: viewerUsername })
            .select("blockedUsers mutedUsers")
            .lean();
        if (!user) return [];
        blocked = user.blockedUsers || [];
        muted = user.mutedUsers || [];
    }

    return [...new Set(
        [...blocked, ...muted]
            .filter((u) => typeof u === "string" && u)
            .map((u) => u.toLowerCase())
    )];
}

/**
 * Blocked accounts only — deliberately NOT including muted ones.
 *
 * Mute and block are different promises. Mute says "hide their content";
 * blocking also says "you can no longer reach each other". Messaging therefore
 * has to gate on this function alone, or a user who merely muted somebody
 * would silently stop being able to talk to them, contradicting the wording in
 * the UI ("you can still message them").
 *
 * @param {string} viewerUsername
 * @param {import("mongoose").Document} [userDoc]
 * @returns {Promise<string[]>} lowercase usernames that were hard-blocked
 */
async function getBlockedUsers(viewerUsername, userDoc) {
    if (!viewerUsername) return [];

    let blocked = [];
    if (userDoc) {
        blocked = userDoc.blockedUsers || [];
    } else {
        const user = await require("../models/user")
            .findOne({ username: viewerUsername })
            .select("blockedUsers")
            .lean();
        if (!user) return [];
        blocked = user.blockedUsers || [];
    }

    return [...new Set(
        (blocked || [])
            .filter((u) => typeof u === "string" && u)
            .map((u) => u.toLowerCase())
    )];
}

/**
 * Merge a `$nin` exclusion of hidden accounts into an existing `sender`
 * clause, without clobbering a `$in` that the caller already set.
 * @param {object} query Mongo query being built
 * @param {string[]} hidden lowercased usernames to exclude
 * @param {string} [selfUsername] the viewer's own username, always kept
 */
function applySenderExclusion(query, hidden, selfUsername) {
    if (!hidden || hidden.length === 0) return;

    // Mongo string comparison is case-sensitive but `sender` holds the original
    // casing, so exclude every casing we know about plus, defensively, the
    // lowercase form of each.
    const variants = new Set();
    for (const name of hidden) {
        variants.add(name);
        variants.add(name.toLowerCase());
        if (selfUsername) {
            const s = selfUsername.toLowerCase();
            // Never let the exclusion list swallow the viewer's own posts.
            if (name === s) variants.delete(name);
        }
    }

    const excluded = [...variants].filter(Boolean);
    if (excluded.length === 0) return;

    const existing = query.sender;

    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
        if (existing.$nin) {
            existing.$nin = [...new Set([...existing.$nin, ...excluded])];
        } else {
            existing.$nin = excluded;
        }
    } else if (existing !== undefined) {
        // A scalar $in was set by the caller; keep it and add the exclusion.
        query.sender = { $in: existing, $nin: excluded };
    } else {
        query.sender = { $nin: excluded };
    }
}

/**
 * Strip comments authored by hidden accounts out of already-fetched posts.
 * Blocking hides their replies too, not just their top-level posts.
 * @param {Array<object>} posts
 * @param {string[]} hidden
 */
function filterComments(posts, hidden) {
    if (!hidden || hidden.length === 0 || !Array.isArray(posts)) return posts;
    const hiddenSet = new Set(hidden);
    for (const post of posts) {
        if (Array.isArray(post.comments)) {
            post.comments = post.comments.filter(
                (c) => !hiddenSet.has(String(c?.sender || "").toLowerCase())
            );
        }
    }
    return posts;
}

module.exports = { getHiddenUsers, getBlockedUsers, applySenderExclusion, filterComments };
