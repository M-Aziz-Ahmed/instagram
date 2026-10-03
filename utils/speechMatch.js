// Pronunciation grading, kept out of the lesson component so it can be unit tested
// (node cannot import .jsx, and the repo keeps testable logic in plain .js).
//
// The match is deliberately forgiving: a learner pronouncing a foreign phrase will
// differ on accents, inflection and word order, so a close-enough attempt should
// pass rather than cost a heart.

export function normalizeSpeech(s) {
    return (s || "")
        .toLowerCase()
        .replace(/[.,!?;:""'',""`'--()]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

export function speechMatch(heard, expect) {
    const h = normalizeSpeech(heard);
    const e = normalizeSpeech(expect);
    if (!h) return false;
    if (!e) return true;
    if (h === e) return true;
    if (h.includes(e) || e.includes(h)) return true;
    const hw = h.split(" ");
    const ew = e.split(" ");
    const overlap = hw.filter((w) => ew.includes(w)).length;
    return overlap / ew.length >= 0.7;
}

// A recogniser guessing is not the same as a learner being wrong, so confidence
// decides whether a mismatch is graded or handed back for another attempt. Windows
// System.Speech loads a grammar constrained to the expected phrase, so on noise or an
// imperfect attempt it returns its nearest guess with a low score instead of nothing.
// Matches are still accepted at any confidence.
export const MATCH_CONFIDENCE_MIN = 0.5;

/**
 * @returns {"correct" | "wrong" | "unclear-retry" | "self-check"} plus whether a
 * heart should be spent. Only a confident mismatch costs one.
 */
export function gradePronunciation({ heard, expect, confidence = 0 }) {
    if (!heard) return { outcome: "self-check", heart: false };
    if (speechMatch(heard, expect)) return { outcome: "correct", heart: false };
    if ((confidence || 0) < MATCH_CONFIDENCE_MIN) return { outcome: "unclear-retry", heart: false };
    return { outcome: "wrong", heart: true };
}
