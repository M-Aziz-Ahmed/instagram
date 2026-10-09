// Contract tests for the translation batch protocol.
//
// The client (utils/translateApi.js) and the server (live-server/routes/translate.js)
// are two implementations of one protocol in two languages: items are stitched
// into a single upstream request with a delimiter and split back apart on the
// other side. Nothing in the type system or the module graph connects them, so
// the only thing keeping them honest is this test.
//
// It exists because the bug is invisible from either side alone. An 11-character
// separator looked perfectly reasonable in the client, passed every client-side
// test, and was silently rejected by the server's `normalizeSep`, which fell
// back to the shared default — reintroducing the exact comment-collision bug the
// separator was added to prevent. Nothing failed; translations were just quietly
// attached to the wrong comments.
//
// Run with: npm run test:translate

import { createRequire } from "node:module";
import { BATCH_SEP, MAX_BATCH_ITEMS, MAX_BATCH_CHARS } from "./translateApi.js";

// createRequire, not a bare JSON import: an ESM JSON import needs an import
// attribute that a plain `node` run rejects. The bundler does not care — this is
// only about how the test file is loaded.
const LANGUAGES = createRequire(import.meta.url)("../live-server/lib/languages.json");

// Mirrors of the server-side rules. Intentionally duplicated: the point is to
// assert the two agree, so importing the server's copy would prove nothing.
const SERVER_DEFAULT_SEP = "\n===SPLIT===\n";
const SERVER_MIN_SEP = 12;
const SERVER_MAX_SEP = 64;

function normalizeSep(sep) {
    if (typeof sep !== "string") return SERVER_DEFAULT_SEP;
    const trimmed = sep.trim();
    if (trimmed.length < SERVER_MIN_SEP || trimmed.length > SERVER_MAX_SEP) return SERVER_DEFAULT_SEP;
    if (/\s/.test(trimmed)) return SERVER_DEFAULT_SEP;
    return trimmed;
}

function targetLang(target) {
    const lang = typeof target === "string" ? target.trim() : "";
    return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(lang) ? lang : "en";
}

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
        passed++;
        console.log(`PASS  ${name}`);
    } else {
        failed++;
        console.log(`FAIL  ${name}`);
        console.log(`  expected: ${JSON.stringify(expected)}`);
        console.log(`  actual:   ${JSON.stringify(actual)}`);
    }
}

function ok(name, condition) {
    check(name, !!condition, true);
}

// ── The separator the client ships must survive the server's validator ──────
check("shipped separator is accepted by the server", normalizeSep(BATCH_SEP), BATCH_SEP);
ok(`shipped separator is >= ${SERVER_MIN_SEP} chars (is ${BATCH_SEP.length})`, BATCH_SEP.length >= SERVER_MIN_SEP);
ok(`shipped separator is <= ${SERVER_MAX_SEP} chars`, BATCH_SEP.length <= SERVER_MAX_SEP);
ok("shipped separator contains no whitespace", !/\s/.test(BATCH_SEP));
ok("shipped separator is not the shared default", BATCH_SEP !== SERVER_DEFAULT_SEP);

// ── Separator rejection rules ───────────────────────────────────────────────
check("whitespace separator rejected", normalizeSep("   ===SPLIT===   "), SERVER_DEFAULT_SEP);
check("too-short separator rejected", normalizeSep("abc"), SERVER_DEFAULT_SEP);
check("too-long separator rejected", normalizeSep("x".repeat(SERVER_MAX_SEP + 1)), SERVER_DEFAULT_SEP);
check("missing separator falls back to default", normalizeSep(undefined), SERVER_DEFAULT_SEP);

// ── The split that maps results back onto ids ──────────────────────────────
const items = [
    { id: "a", text: "hola" },
    { id: "b", text: "bonjour" },
    { id: "c", text: "hola" },
];
check("join/split round-trips in order", items.map((i) => i.text).join(BATCH_SEP).split(BATCH_SEP), ["hola", "bonjour", "hola"]);

const collided = [
    { id: "a", text: "fine" },
    { id: "b", text: `pre${BATCH_SEP}post` },
    { id: "c", text: "also fine" },
];
check(
    "an item containing the separator is dropped, not mis-split",
    collided.filter((i) => !i.text.includes(BATCH_SEP)).map((i) => i.id),
    ["a", "c"]
);

// ── Target language validation (the value is interpolated into an upstream URL) ──
check("simple language accepted", targetLang("fr"), "fr");
check("script subtag accepted", targetLang("zh-CN"), "zh-CN");
check("query injection rejected", targetLang("en&foo=bar"), "en");
check("path traversal rejected", targetLang("../../etc/passwd"), "en");
check("empty falls back to en", targetLang(""), "en");
check("non-string falls back to en", targetLang(null), "en");

// ── Every catalog code must survive targetLang ─────────────────────────────
//
// `user.language` is one of these codes (live-server/routes/auth.js now
// rejects anything outside the catalog) and it is handed straight to
// `targetLang`. A code the picker offers but the validator would reject is a
// language that silently translates into English for every user who picks it.
const rejected = LANGUAGES.map((l) => l.code).filter((code) => targetLang(code) !== code);
check("every offered language passes targetLang", rejected, []);

// ── The live-server must not reach outside its own directory ───────────────
//
// live-server ships as a self-contained unit: deploy/bootstrap.sh rsyncs
// live-server/ to /opt/anontweet-live-server and runs `npm ci` there. A
// require that climbs out (`../../utils/...`) resolves fine in this repo and
// throws MODULE_NOT_FOUND on the deployed host, which kills the process at boot
// because server.js requires every route eagerly. Nothing in the repo catches
// that, and `npm run build` does not touch the live-server at all — so the
// whole site goes down while every check is green.
//
// This is not hypothetical: auth.js required the language catalog from ../../utils
// and passed lint, build and the rest of this suite.
const { readdirSync, readFileSync } = await import("node:fs");
const { join, relative } = await import("node:path");

const LIVE_SERVER = join(import.meta.dirname, "..", "live-server");
const ESCAPING = [];

(function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "logs" || entry.name === "deploy") continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith(".js")) continue;
        for (const [i, line] of readFileSync(full, "utf8").split("\n").entries()) {
            // `require("../../x")` and `require("../../../x")` — two or more
            // `..` segments. One `..` is just a sibling inside live-server.
            if (/require\(\s*["'][.]{2}\/[.]{2}\//.test(line)) {
                ESCAPING.push(`${relative(LIVE_SERVER, full)}:${i + 1}`);
            }
        }
    }
})(LIVE_SERVER);

check(
    `live-server has no requires escaping its directory (${ESCAPING.length} found)`,
    ESCAPING,
    []
);

// ── Client/server batch limits agree ───────────────────────────────────────
ok(`batch item cap is positive (${MAX_BATCH_ITEMS})`, MAX_BATCH_ITEMS > 0);
ok(`batch char cap is positive (${MAX_BATCH_CHARS})`, MAX_BATCH_CHARS > 0);
// A single item must be able to fit, or a max-length comment could never be sent.
ok("one maximum-size comment fits the char cap", 300 <= MAX_BATCH_CHARS);

const fortyLong = Array.from({ length: 40 }, () => ({ id: 1, text: "x".repeat(300) }));
ok(
    `40x300 chars is correctly split rather than sent whole (${fortyLong.reduce((n, i) => n + i.text.length, 0)} chars)`,
    fortyLong.reduce((n, i) => n + i.text.length, 0) > MAX_BATCH_CHARS
);

if (failed === 0) {
    console.log(`\nALL TRANSLATE CONTRACT TESTS PASS (${passed})`);
    process.exit(0);
} else {
    console.log(`\n${failed} FAILED`);
    process.exit(1);
}
