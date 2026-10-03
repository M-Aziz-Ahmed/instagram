// Pronunciation grading rules. Run: node utils/speechMatch.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { gradePronunciation, speechMatch } from "./speechMatch.js";

test("exact and punctuated attempts match", () => {
    assert.equal(speechMatch("bonjour", "bonjour"), true);
    assert.equal(speechMatch("Bonjour!", "bonjour"), true);
    assert.equal(speechMatch("  bonjour  ", "bonjour"), true);
});

test("unrelated words do not match", () => {
    assert.equal(speechMatch("xyzzy", "bonjour"), false);
    assert.equal(speechMatch("", "bonjour"), false);
});

test("a correct attempt is accepted at any confidence", () => {
    for (const confidence of [0, 0.05, 0.5, 0.99]) {
        assert.deepEqual(
            gradePronunciation({ heard: "bonjour", expect: "bonjour", confidence }),
            { outcome: "correct", heart: false }
        );
    }
});

test("a low-confidence mismatch costs no heart and asks for a retry", () => {
    for (const confidence of [0, 0.2, 0.31, 0.49]) {
        assert.deepEqual(
            gradePronunciation({ heard: "bonsoir", expect: "bonjour", confidence }),
            { outcome: "unclear-retry", heart: false }
        );
    }
});

test("a confident mismatch costs exactly one heart", () => {
    assert.deepEqual(
        gradePronunciation({ heard: "xyzzy", expect: "bonjour", confidence: 0.88 }),
        { outcome: "wrong", heart: true }
    );
});

test("nothing heard falls back to self-check rather than failing", () => {
    assert.deepEqual(
        gradePronunciation({ heard: "", expect: "bonjour", confidence: 0.9 }),
        { outcome: "self-check", heart: false }
    );
});
