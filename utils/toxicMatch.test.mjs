/**
 * Contract tests for the content-filter word matcher.
 *
 * Two things are being protected here:
 *
 *   1. The reported bug: a filtered word `ass` must NOT blur "assistant",
 *      "classes", "pass" or "bass", and MUST still match "ass", "ass," and
 *      "#ass". The old `text.split(/(ass)/gi)` tokenizer did the opposite.
 *
 *   2. Drift between the two implementations. `utils/toxicMatch.js` is ESM and
 *      is bundled into the Next client; `live-server/lib/toxicMatch.js` is
 *      CommonJS and runs in the API process. They are duplicates by necessity,
 *      so every behavioural case is asserted against BOTH and the two result
 *      sets are compared directly. A client that blurs a word the server allows
 *      (or worse, allows one the server blocks) is a content-filter bypass, so
 *      this is asserted rather than assumed.
 *
 * Run: node utils/toxicMatch.test.mjs
 */

import { createRequire } from "node:module";
import {
    findMatches as esmFind,
    segmentByMatches as esmSegment,
    redactMatches as esmRedact,
    normalizeLeet as esmLeet,
    prepareWords as esmPrepare,
    filterAllowed as esmFilterAllowed,
} from "./toxicMatch.js";

const require = createRequire(import.meta.url);
const cjs = require("../live-server/lib/toxicMatch.js");

let passed = 0;
let failed = 0;
const failures = [];

function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        passed++;
    } else {
        failed++;
        failures.push(`${name}\n     expected: ${e}\n     actual:   ${a}`);
    }
}

function ok(name, condition) {
    check(name, !!condition, true);
}

// ─────────────────────────────────────────────────────────────────────────────
// The reported bug, verbatim.
// ─────────────────────────────────────────────────────────────────────────────
{
    const words = ["ass"];
    const segs = esmSegment("I am an assistant today", words);
    check("assistant is not blurred at all", segs, [{ text: "I am an assistant today", toxic: false }]);
    ok("assistant produces no toxic segment", segs.every((s) => !s.toxic));

    check("'classes' untouched", esmFind("classes", words), []);
    check("'pass' untouched", esmFind("pass", words), []);
    check("'bass guitar' untouched", esmFind("bass guitar", words), []);
    check("'assessment' untouched", esmFind("assessment", words), []);
    check("'embassy' untouched", esmFind("embassy", words), []);
    check("'assistance' untouched", esmFind("assistance", words), []);
    check("'Esssex' untouched (case-insensitive)", esmFind("Essex", words), []);

    // Still matches where a real word boundary exists.
    check("bare 'ass' matches", esmFind("ass", words), [{ start: 0, end: 3, word: "ass" }]);
    check("'ass,' matches", esmFind("ass,", words), [{ start: 0, end: 3, word: "ass" }]);
    check("'#ass' matches", esmFind("#ass", words), [{ start: 1, end: 4, word: "ass" }]);
    check("'you ass!' matches", esmFind("you ass!", words), [{ start: 4, end: 7, word: "ass" }]);
    check("'(ass)' matches", esmFind("(ass)", words), [{ start: 1, end: 4, word: "ass" }]);
    check("'smart-ass' matches on hyphen boundary", esmFind("smart-ass", words).length, 1);
    check("mid-sentence match", esmFind("what an ass", words), [{ start: 8, end: 11, word: "ass" }]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Digits and underscores are word characters, so they bound a match too.
// ─────────────────────────────────────────────────────────────────────────────
check("'ass1' does not match", esmFind("ass1", ["ass"]), []);
check("'1ass' does not match", esmFind("1ass", ["ass"]), []);
check("'ass_foo' does not match", esmFind("ass_foo", ["ass"]), []);
check("'my_ass' does not match", esmFind("my_ass", ["ass"]), []);
check("accents are word chars", esmFind("assé", ["ass"]), []);

// ─────────────────────────────────────────────────────────────────────────────
// Multiple words, overlaps, and the original casing being preserved.
// ─────────────────────────────────────────────────────────────────────────────
{
    const words = ["ass", "damn", "hell"];
    const segs = esmSegment("Damn, that ass hell is bad", words);
    check(
        "three words segmented correctly",
        segs,
        [
            { text: "Damn", toxic: true },
            { text: ", that ", toxic: false },
            { text: "ass", toxic: true },
            { text: " ", toxic: false },
            { text: "hell", toxic: true },
            { text: " is bad", toxic: false },
        ]
    );
    ok("matched text keeps the source casing", segs[0].text === "Damn");

    // Overlapping list entries must not produce overlapping segments.
    const overlap = esmSegment("ass hole", ["ass", "ass hole"]);
    check("overlapping entries merge to one segment", overlap, [
        { text: "ass hole", toxic: true },
    ]);
    // Round-trip: concatenating segments must always reproduce the input.
    const src = "one ass two damn three";
    ok(
        "segments always round-trip to the source",
        esmSegment(src, words).map((s) => s.text).join("") === src
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phrases.
// ─────────────────────────────────────────────────────────────────────────────
check("multi-word phrase matches", esmFind("go to hell now", ["go to hell"]).length, 1);
check("phrase needs full text", esmFind("go to heaven", ["go to hell"]), []);
check("phrase respects word boundary at start", esmFind("cargo to hell", ["go to hell"]), []);

// ─────────────────────────────────────────────────────────────────────────────
// Case sensitivity.
// ─────────────────────────────────────────────────────────────────────────────
check("case-insensitive by default", esmFind("ASS", ["ass"]).length, 1);
check("case-sensitive opt-in still finds exact case", esmFind("ASS", ["ass"], { caseSensitive: true }), []);
check("case-sensitive honours casing", esmFind("Ass", ["Ass"], { caseSensitive: true }).length, 1);

// ─────────────────────────────────────────────────────────────────────────────
// Leetspeak, and the length-preservation that keeps offsets valid.
// ─────────────────────────────────────────────────────────────────────────────
check("leet folded", esmFind("a55hole", ["asshole"], { leetspeak: true }).length, 1);
check("leet off by default", esmFind("a55hole", ["asshole"]), []);
check("leet is length preserving", esmLeet("a55h0l3").length, "a55h0l3".length);
check(
    "leet offsets index the ORIGINAL string",
    esmFind("say a55hole now", ["asshole"], { leetspeak: true }),
    [{ start: 4, end: 11, word: "a55hole" }]
);

// ─────────────────────────────────────────────────────────────────────────────
// minLength guard.
// ─────────────────────────────────────────────────────────────────────────────
check("minLength skips short entries", esmFind("a cat sat", ["a"], { minLength: 2 }), []);
check("minLength keeps long entries", esmFind("a cat sat", ["cat"], { minLength: 2 }).length, 1);

// ─────────────────────────────────────────────────────────────────────────────
// Substring mode (wholeWord off) restores the legacy behaviour on purpose.
// ─────────────────────────────────────────────────────────────────────────────
check("wholeWord:false matches inside words", esmFind("assistant", ["ass"], { wholeWord: false }).length, 1);

// ─────────────────────────────────────────────────────────────────────────────
// Redaction, for surfaces that cannot render an interactive span.
// ─────────────────────────────────────────────────────────────────────────────
check("redact replaces only whole words", esmRedact("an assistant said ass", ["ass"]), "an assistant said ***");
check("redact with a custom token", esmRedact("ass and assistant", ["ass"], "[redacted]"), "[redacted] and assistant");
check("redact no match returns input", esmRedact("all clear", ["ass"]), "all clear");

// ─────────────────────────────────────────────────────────────────────────────
// Allowlist suppression.
// ─────────────────────────────────────────────────────────────────────────────
check(
    "allowlist suppresses an overlapping match",
    esmFilterAllowed("badword here", esmFind("badword here", ["bad"]), ["badword"]),
    []
);
check(
    "allowlist leaves unrelated matches alone",
    esmFilterAllowed("badword and ass", esmFind("badword and ass", ["bad", "ass"]), ["badword"]).length,
    1
);

// ─────────────────────────────────────────────────────────────────────────────
// Input hygiene — the filter must never throw on whatever a user types.
// ─────────────────────────────────────────────────────────────────────────────
check("null text", esmFind(null, ["ass"]), []);
check("undefined text", esmFind(undefined, ["ass"]), []);
check("number text", esmFind(42, ["4"], { leetspeak: false }).length, 0);
check("non-array words", esmFind("hello", "ass"), []);
check("empty list", esmFind("hello", []), []);
check("null entries in list", esmFind("hello", [null, undefined, "hello"]), [
    { start: 0, end: 5, word: "hello" },
]);
check("blank entries ignored", esmPrepare(["", "  ", "a"]), ["a"]);
check("dedupes case-insensitively", esmPrepare(["Ass", "ass", "ASS"]), ["ass"]);

// ─────────────────────────────────────────────────────────────────────────────
// Non-crashing on adversarial input (no catastrophic backtracking).
// ─────────────────────────────────────────────────────────────────────────────
{
    const long = "a".repeat(20000);
    const t0 = Date.now();
    esmFind(long, ["aaa", "a".repeat(50)]);
    ok(`no pathological blow-up on 20k chars (${Date.now() - t0}ms)`, Date.now() - t0 < 2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Allowlist, applied through segmentByMatches (the path the UI actually uses).
// ─────────────────────────────────────────────────────────────────────────────
check(
    "whole-word matching already excludes 'badword'",
    esmSegment("badword here", ["bad"]),
    [{ text: "badword here", toxic: false }]
);
check(
    "a genuine whole-word match is still split",
    esmSegment("bad word here", ["bad"]),
    [
        { text: "bad", toxic: true },
        { text: " word here", toxic: false },
    ]
);
// The allowlist earns its keep when the admin turns whole-word matching off:
// it can then permit one specific word that would otherwise be swept up.
check(
    "allowlist suppresses an overlapping match",
    esmSegment("assistant and ass", ["ass"], { wholeWord: false, allowlist: ["assistant"] }),
    [
        { text: "assistant and ", toxic: false },
        { text: "ass", toxic: true },
    ]
);
check(
    "without the allowlist both occurrences are toxic",
    esmSegment("assistant and ass", ["ass"], { wholeWord: false }),
    [
        { text: "ass", toxic: true },
        { text: "istant and ", toxic: false },
        { text: "ass", toxic: true },
    ]
);
check("empty allowlist is a no-op", esmSegment("ass", ["ass"], { allowlist: [] }), [
    { text: "ass", toxic: true },
]);

// ─────────────────────────────────────────────────────────────────────────────
// DRIFT GUARD: the ESM and CommonJS implementations must agree exactly.
// ─────────────────────────────────────────────────────────────────────────────
{
    const cases = [
        ["I am an assistant today", ["ass"]],
        ["classes pass bass embassy", ["ass"]],
        ["ass, #ass (ass) ass!", ["ass"]],
        ["Damn, that ass hell is bad", ["ass", "damn", "hell"]],
        ["ass hole", ["ass", "ass hole"]],
        ["go to hell now", ["go to hell"]],
        ["ASS", ["ass"]],
        ["a55hole", ["asshole"], { leetspeak: true }],
        ["say a55hole now", ["asshole"], { leetspeak: true }],
        ["a cat sat", ["a"], { minLength: 2 }],
        ["assistant", ["ass"], { wholeWord: false }],
        ["badword and ass", ["bad", "ass"]],
        ["an assistant said ass", ["ass"]],
        ["héllo wörld", ["hell"]],
        ["1ass ass1 _ass", ["ass"]],
        ["", ["ass"]],
        [null, ["ass"]],
        ["hello", null],
        ["multi   space    ass   here", ["ass"]],
        ["badword here", ["bad"], { allowlist: ["badword"] }],
        ["badword and ass", ["bad", "ass"], { allowlist: ["badword"] }],
        ["assistant and ass", ["ass"], { wholeWord: false, allowlist: ["assistant"] }],
        ["assistant and ass", ["ass"], { wholeWord: false }],
    ];

    for (const [text, words, opts] of cases) {
        const esm = esmFind(text, words, opts);
        const cjsResult = cjs.findMatches(text, words, opts);
        check(
            `impl parity findMatches(${JSON.stringify(text)})`,
            cjsResult,
            esm
        );
        check(
            `impl parity segment(${JSON.stringify(text)})`,
            cjs.segmentByMatches(text, words, opts),
            esmSegment(text, words, opts)
        );
        check(
            `impl parity redact(${JSON.stringify(text)})`,
            cjs.redactMatches(text, words, "***", opts),
            esmRedact(text, words, "***", opts)
        );
    }
    check("impl parity normalizeLeet", cjs.normalizeLeet("a55h0l3!"), esmLeet("a55h0l3!"));
    check("impl parity prepareWords", cjs.prepareWords(["", "A", "a"]), esmPrepare(["", "A", "a"]));
    check("impl parity filterAllowed", cjs.filterAllowed("badword", esmFind("badword", ["bad"]), ["badword"]), esmFilterAllowed("badword", esmFind("badword", ["bad"]), ["badword"]));
    check("impl parity DEFAULT_MATCH_OPTIONS", cjs.DEFAULT_MATCH_OPTIONS, {
        wholeWord: true,
        leetspeak: false,
        caseSensitive: false,
        minLength: 0,
    });
}

// ─────────────────────────────────────────────────────────────────────────────

for (const f of failures) console.log("FAIL  " + f);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.log("\nCONTENT FILTER MATCHER TESTS FAILED");
    process.exit(1);
}
console.log("ALL CONTENT FILTER MATCHER TESTS PASS");
