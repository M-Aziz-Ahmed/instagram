/**
 * Extract unique lowercase hashtags from text.
 * e.g. "Hello #World #foo #world" → ["world", "foo"]
 */
export function extractHashtags(text) {
    const matches = text.match(/#([a-zA-Z0-9_]+)/g) ?? [];
    return [...new Set(matches.map((t) => t.slice(1).toLowerCase()))];
}

/**
 * Extract unique @mentions from text (excluding self).
 * e.g. "@alice check this @bob" → ["alice", "bob"]
 */
export function extractMentions(text, selfUsername = "") {
    const matches = text.match(/@([a-zA-Z0-9_]+)/g) ?? [];
    return [...new Set(
        matches
            .map((m) => m.slice(1).toLowerCase())
            .filter((u) => u !== selfUsername.toLowerCase())
    )];
}
