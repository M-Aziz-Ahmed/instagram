// Bounded comment storage for Post.comments.
//
// Post.comments used to accumulate every comment forever on a single document.
// Two problems followed from that:
//
//   1. A post with tens of thousands of comments approaches the 16MB BSON
//      document limit, after which writes fail outright.
//   2. `comments` is selected in the feed projection, so the entire history was
//      read and shipped to the client for every post in the feed — even though
//      the UI only ever shows a page of them.
//
// So the embedded array is now a sliding window of the newest comments, and
// Post.commentCount carries the real total. Old comments beyond the window are
// dropped from the document; the total is what users see.

const MAX_EMBEDDED_COMMENTS = 200;

/**
 * Append a comment, trimming the oldest entries past the cap.
 * Mutates `post.comments` in place; the caller still saves.
 *
 * @param {import("mongoose").Document} post
 * @param {object} comment
 * @returns {{ trimmed: number }} how many entries were dropped
 */
function appendComment(post, comment) {
    post.comments.push(comment);
    return { trimmed: trimComments(post) };
}

/**
 * Drop the oldest comments once the array exceeds the cap.
 * @returns {number} entries removed
 */
function trimComments(post) {
    const list = post.comments || [];
    if (list.length <= MAX_EMBEDDED_COMMENTS) return 0;

    const overflow = list.length - MAX_EMBEDDED_COMMENTS;
    // comments are appended in chronological order, so the head is the oldest
    post.comments = list.slice(overflow);

    // A reply whose parent just fell out of the window would leave a dangling
    // count. Recompute the window's totals so the UI stays self-consistent.
    post.comments.forEach((c) => {
        const live = post.comments.filter((x) => x.parentId === c.commentId).length;
        c.replies = live;
    });

    return overflow;
}

/**
 * Remove a comment and its full descendant reply tree, keeping commentCount and
 * every affected parent's `replies` tally honest.
 * @returns {number} how many entries were removed
 */
function removeComment(post, commentId) {
    const before = post.comments || [];

    // Walk the tree rather than just the direct children, so deleting a
    // top-level comment that has nested replies clears the whole branch
    // instead of orphaning grandchildren in the document.
    const doomed = new Set([commentId]);
    const affectedParents = new Set();

    // The target's own parent loses it too — seeding this from the root is what
    // makes "delete a reply" correct, since the walk below only ever discovers
    // parents of *descendants*, never of the comment that was named.
    const target = before.find((c) => c.commentId === commentId);
    if (target?.parentId) affectedParents.add(target.parentId);

    let grew = true;
    while (grew) {
        grew = false;
        for (const c of before) {
            if (c.parentId && doomed.has(c.parentId) && !doomed.has(c.commentId)) {
                doomed.add(c.commentId);
                if (c.parentId) affectedParents.add(c.parentId);
                grew = true;
            }
        }
    }

    const remaining = before.filter((c) => !doomed.has(c.commentId));
    const removed = before.length - remaining.length;
    post.comments = remaining;

    if (removed > 0) {
        post.commentCount = Math.max(0, (post.commentCount || 0) - removed);
    }

    // The immediate parent loses however many of its replies went with the
    // branch; recomputing from the surviving array is cheaper than bookkeeping
    // and can't drift.
    for (const pid of affectedParents) {
        const parent = remaining.find((c) => c.commentId === pid);
        if (parent) parent.replies = remaining.filter((c) => c.parentId === pid).length;
    }

    return removed;
}

/**
 * The number to show in the UI. Prefers the authoritative counter, and falls
 * back to the array length for documents written before this change (which have
 * no commentCount set).
 */
function displayCount(post) {
    const total = post.commentCount;
    if (typeof total === "number" && total > 0) return total;
    return (post.comments || []).length;
}

module.exports = {
    MAX_EMBEDDED_COMMENTS,
    appendComment,
    trimComments,
    removeComment,
    displayCount,
};
