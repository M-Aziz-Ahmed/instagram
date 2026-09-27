/**
 * CommonJS twin of `utils/toxicMatch.js`.
 *
 * `utils/` is ESM and is bundled by Next; `live-server/` is a separate CommonJS
 * process. A single implementation cannot be shared across that boundary without
 * a build change, so the logic is duplicated here deliberately and the two are
 * kept honest by `utils/toxicMatch.test.mjs`, which imports BOTH and asserts
 * they agree on every case. If you change one, the test fails until you change
 * the other.
 *
 * Do not "DRY this up" by converting live-server to ESM.
 */

const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

function isWordChar(ch) {
    return ch !== undefined && WORD_CHAR_RE.test(ch);
}

const DEFAULT_MATCH_OPTIONS = {
    wholeWord: true,
    leetspeak: false,
    caseSensitive: false,
    minLength: 0,
};

function normalizeLeet(text) {
    return String(text == null ? "" : text)
        .replace(/4/g, "a")
        .replace(/3/g, "e")
        .replace(/[1!|]/g, "i")
        .replace(/0/g, "o")
        .replace(/[5$]/g, "s")
        .replace(/7/g, "t")
        .replace(/@/g, "a")
        .replace(/\+/g, "t");
}

function prepareWords(words, options) {
    const opts = Object.assign({}, DEFAULT_MATCH_OPTIONS, options || {});
    if (!Array.isArray(words)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of words) {
        const trimmed = String(raw == null ? "" : raw).trim();
        if (!trimmed) continue;
        if (opts.minLength && trimmed.length < opts.minLength) continue;
        const word = opts.caseSensitive ? trimmed : trimmed.toLowerCase();
        if (seen.has(word)) continue;
        seen.add(word);
        out.push(word);
    }
    return out;
}

function findMatches(text, words, options) {
    const opts = Object.assign({}, DEFAULT_MATCH_OPTIONS, options || {});
    const source = String(text == null ? "" : text);
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
        if (last && m.start < last.end) {
            if (m.end > last.end) last.end = m.end;
            continue;
        }
        merged.push({ start: m.start, end: m.end, word: m.word });
    }
    return merged;
}

function hasMatches(text, words, options) {
    return findMatches(text, words, options).length > 0;
}

function segmentByMatches(text, words, options) {
    const opts = options || {};
    const allowlist = opts.allowlist;
    const matchOptions = Object.assign({}, opts);
    delete matchOptions.allowlist;

    const source = String(text == null ? "" : text);
    let matches = findMatches(source, words, matchOptions);
    if (Array.isArray(allowlist) && allowlist.length) matches = filterAllowed(source, matches, allowlist);
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

function redactMatches(text, words, replacement, options) {
    const source = String(text == null ? "" : text);
    const rep = replacement === undefined ? "***" : replacement;
    const matches = findMatches(source, words, options);
    if (matches.length === 0) return source;
    return matches.reduceRight(
        (acc, m) => acc.slice(0, m.start) + rep + acc.slice(m.end),
        source
    );
}

function filterAllowed(text, matches, allowlist) {
    const allowed = prepareWords(allowlist);
    if (!allowed.length || !matches || !matches.length) return matches || [];
    const allowMatches = findMatches(text, allowed, { wholeWord: true });
    if (!allowMatches.length) return matches;
    return matches.filter((m) => !allowMatches.some((a) => a.start < m.end && a.end > m.start));
}

module.exports = {
    DEFAULT_MATCH_OPTIONS,
    normalizeLeet,
    prepareWords,
    findMatches,
    hasMatches,
    segmentByMatches,
    redactMatches,
    filterAllowed,
};
