/**
 * Shared word matcher for the content filter.
 *
 * The original implementation built one alternation regex per word list and used
 * `String.split()` with a capture group as the tokenizer:
 *
 *     text.split(new RegExp(`(${words.join("|")})`, "gi"))
 *
 * That has two compounding defects, both reported from the admin panel:
 *
 *   1. No word boundaries. Regex alternation is a *substring* search, so a
 *      filtered word `ass` matched inside "assistant", "classes", "passage".
 *   2. `split` with a capture group returns the matched text as its own array
 *      element, so "assistant" was cut into ["cl", "ass", "istant"] and only the
 *      middle fragment rendered as the blurred span. The user saw a partly
 *      legible word that looked like a rendering bug.
 *
 * Both are fixed by not using regex for the tokenisation at all. We scan for
 * literal substrings with `indexOf` and then verify the surrounding characters
 * ourselves, which is exact, has no catastrophic-backtracking surface, and does
 * not depend on lookbehind (unsupported in Safari < 16.4, i.e. still shipping on
 * older iPhones).
 *
 * `leetspeak` normalisation is strictly length-preserving (every replacement maps
 * one character to exactly one character), so match offsets stay valid indices
 * into the ORIGINAL string and we can slice the original text, not a rewritten
 * copy of it.
 */

/** Characters that make a substring part of a longer word. */
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

function isWordChar(ch) {
    return ch !== undefined && WORD_CHAR_RE.test(ch);
}

export const DEFAULT_MATCH_OPTIONS = {
    /**
     * When true a word only matches as a whole word. This is the fix for
     * "ass" blurring "assistant". Turning it off restores the old substring
     * behaviour, which is why it is an option rather than hard-coded.
     */
    wholeWord: true,
    /** Fold digits/symbols that stand in for letters (a55 -> ass). */
    leetspeak: false,
    caseSensitive: false,
    /** Skip list entries shorter than this. Guards against a 1-2 char entry
     *  wiping out most of the corpus. */
    minLength: 0,
};

/**
 * Length-preserving leetspeak fold. Every mapping is 1 char -> 1 char so that
 * indices computed against the folded string address the same characters in the
 * original.
 */
export function normalizeLeet(text) {
    return String(text ?? "")
        .replace(/4/g, "a")
        .replace(/3/g, "e")
        .replace(/[1!|]/g, "i")
        .replace(/0/g, "o")
        .replace(/[5$]/g, "s")
        .replace(/7/g, "t")
        .replace(/@/g, "a")
        .replace(/\+/g, "t");
}

/** Clean, lowercase, de-duplicated, length-filtered list ready for matching. */
export function prepareWords(words, options = {}) {
    const opts = { ...DEFAULT_MATCH_OPTIONS, ...options };
    if (!Array.isArray(words)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of words) {
        const trimmed = String(raw ?? "").trim();
        if (!trimmed) continue;
        if (opts.minLength && trimmed.length < opts.minLength) continue;
        const word = opts.caseSensitive ? trimmed : trimmed.toLowerCase();
        if (seen.has(word)) continue;
        seen.add(word);
        out.push(word);
    }
    return out;
}

/**
 * Find every occurrence of any word in `words` within `text`.
 *
 * @returns {Array<{start:number,end:number,word:string}>} non-overlapping
 *   matches, sorted by start index. `word` is the text as it appears in the
 *   ORIGINAL string (so casing/punctuation of the source is preserved).
 */
export function findMatches(text, words, options = {}) {
    const opts = { ...DEFAULT_MATCH_OPTIONS, ...options };
    const source = String(text ?? "");
    const list = prepareWords(words, opts);
    if (!source || list.length === 0) return [];

    const haystack = opts.caseSensitive ? source : source.toLowerCase();
    const normalized = opts.leetspeak ? normalizeLeet(haystack) : haystack;

    const found = [];
    for (const word of list) {
        const needle = opts.leetspeak ? normalizeLeet(word) : word;
        if (!needle) continue;
        let from = 0;
        for (;;) {
            const idx = normalized.indexOf(needle, from);
            if (idx === -1) break;
            const end = idx + needle.length;
            // Whole-word test: neither neighbouring character may be a letter,
            // digit or underscore. Punctuation, whitespace and string edges all
            // count as boundaries, so "ass," and "#ass" still match while
            // "assistant" and "pass" do not.
            const boundaryOk =
                !opts.wholeWord ||
                (!isWordChar(haystack[idx - 1]) && !isWordChar(haystack[end]));
            if (boundaryOk) {
                found.push({ start: idx, end, word: source.slice(idx, end) });
            }
            from = idx + 1;
        }
    }

    if (found.length === 0) return [];

    found.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged = [];
    for (const m of found) {
        const last = merged[merged.length - 1];
        // Overlapping entries (e.g. list contains both "ass" and "ass hole")
        // must not be emitted twice, or the renderer would slice the same
        // characters as two separate segments.
        if (last && m.start < last.end) {
            if (m.end > last.end) last.end = m.end;
            continue;
        }
        merged.push({ start: m.start, end: m.end, word: m.word });
    }
    return merged;
}

/** True when at least one word matches. Cheap pre-check before doing real work. */
export function hasMatches(text, words, options = {}) {
    return findMatches(text, words, options).length > 0;
}

/**
 * Split `text` into alternating clean / matched runs, ready to render.
 * @returns {Array<{text:string, toxic:boolean}>}
 */
export function segmentByMatches(text, words, options = {}) {
    const { allowlist, ...matchOptions } = options;
    const source = String(text ?? "");
    let matches = findMatches(source, words, matchOptions);
    if (allowlist && allowlist.length) matches = filterAllowed(source, matches, allowlist);
    if (matches.length === 0) return source ? [{ text: source, toxic: false }] : [];

    const segments = [];
    let cursor = 0;
    for (const m of matches) {
        if (m.start > cursor) segments.push({ text: source.slice(cursor, m.start), toxic: false });
        segments.push({ text: source.slice(m.start, m.end), toxic: true });
        cursor = m.end;
    }
    if (cursor < source.length) segments.push({ text: source.slice(cursor), toxic: false });
    return segments;
}

/**
 * Replace every match with `replacement`. Used for masking on surfaces that
 * cannot render an interactive blurred span (log lines, notification bodies,
 * search results).
 */
export function redactMatches(text, words, replacement = "***", options = {}) {
    const source = String(text ?? "");
    const matches = findMatches(source, words, options);
    if (matches.length === 0) return source;
    // Built back-to-front so earlier offsets stay valid.
    return matches.reduceRight(
        (acc, m) => acc.slice(0, m.start) + replacement + acc.slice(m.end),
        source
    );
}

/**
 * Words from `allowlist` that are present in the text suppress a match on the
 * same span. Rarely needed now that whole-word matching is on, but it lets an
 * admin permit a specific legitimate word (e.g. a brand name) that is also a
 * filtered term.
 */
export function filterAllowed(text, matches, allowlist = []) {
    const allowed = prepareWords(allowlist);
    if (!allowed.length || !matches.length) return matches;
    const allowMatches = findMatches(text, allowed, { wholeWord: true });
    if (!allowMatches.length) return matches;
    return matches.filter((m) => !allowMatches.some((a) => a.start < m.end && a.end > m.start));
}
