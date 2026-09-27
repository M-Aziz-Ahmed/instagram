/**
 * Extract @mentions from a piece of text.
 *
 * Lives here rather than in routes/posts.js because two route files need it and
 * it was previously a private function there — so routes/groups.js had no way to
 * reach it, and a local copy would have been free to drift.
 *
 * @param {string} text
 * @param {string} [sender] the author's own username, excluded from the result
 * @returns {string[]} lowercased, de-duplicated usernames
 */
function extractMentions(text, sender) {
    if (!text) return [];
    const matches = String(text).match(/@(\w+)/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))].filter(
        (u) => u !== sender
    );
}

module.exports = { extractMentions };
