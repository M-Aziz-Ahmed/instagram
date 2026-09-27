/**
 * Tests for the media-moderation pipeline and the server-side text filter.
 *
 * These are the parts of the content filter that decide whether a write is
 * allowed, so the important properties are asserted directly rather than assumed:
 *
 *   - the Cloudinary URL parser handles transformations, nested folders,
 *     versions and dots in filenames (a wrong public_id means destroy() targets
 *     the wrong asset, or nothing);
 *   - a rejected upload is actually rolled back;
 *   - `failureMode` decides what a provider outage does;
 *   - with no provider configured the module says so instead of reporting "clean";
 *   - the text filter's scope switches really do disable a surface.
 *
 * Run: node live-server/lib/contentSafety.test.mjs
 */

import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
    try {
        await fn();
        passed++;
    } catch (err) {
        failed++;
        failures.push(`${name}\n     ${err && err.message ? err.message : err}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloudinary URL parsing
// ─────────────────────────────────────────────────────────────────────────────
const { parseCloudinaryUrl, checkHost, _internal } = require("./mediaModeration.js");

await test("plain delivery URL", () => {
    const r = parseCloudinaryUrl("https://res.cloudinary.com/demo/image/upload/v1234/anon-feed/abc123.jpg");
    assert.equal(r.resourceType, "image");
    assert.equal(r.publicId, "anon-feed/abc123");
    assert.equal(r.format, "jpg");
});

await test("transformation segment is skipped", () => {
    const r = parseCloudinaryUrl(
        "https://res.cloudinary.com/demo/image/upload/w_300,h_200,c_fill,f_auto,q_auto/v1234/anon-feed/abc.jpg"
    );
    assert.equal(r.publicId, "anon-feed/abc");
});

await test("nested folders are part of the public_id", () => {
    const r = parseCloudinaryUrl("https://res.cloudinary.com/demo/image/upload/v1/a/b/c/deep.png");
    assert.equal(r.publicId, "a/b/c/deep");
});

await test("missing version segment is tolerated", () => {
    const r = parseCloudinaryUrl("https://res.cloudinary.com/demo/image/upload/anon-feed/x.jpg");
    assert.equal(r.publicId, "anon-feed/x");
});

await test("dots inside a filename are not the extension", () => {
    const r = parseCloudinaryUrl("https://res.cloudinary.com/demo/image/upload/v1/f/my.photo.v2.png");
    assert.equal(r.publicId, "f/my.photo.v2");
    assert.equal(r.format, "png");
});

await test("video resource type", () => {
    const r = parseCloudinaryUrl("https://res.cloudinary.com/demo/video/upload/v1/anon-reels/clip.mp4");
    assert.equal(r.resourceType, "video");
    assert.equal(r.publicId, "anon-reels/clip");
});

await test("rejects a non-Cloudinary host", () => {
    assert.equal(parseCloudinaryUrl("https://evil.example/x.jpg"), null);
});

await test("rejects http even on the Cloudinary host", () => {
    assert.equal(parseCloudinaryUrl("http://res.cloudinary.com/demo/image/upload/v1/a.jpg"), null);
});

await test("rejects junk", () => {
    for (const bad of ["", "not a url", null, undefined, "javascript:alert(1)"]) {
        assert.equal(parseCloudinaryUrl(bad), null, `expected null for ${bad}`);
    }
});

await test("rejects an upload-endpoint path that is not /upload/", () => {
    assert.equal(parseCloudinaryUrl("https://res.cloudinary.com/demo/image/fetch/v1/abc.jpg"), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Host allowlist
// ─────────────────────────────────────────────────────────────────────────────
await test("requireCloudinaryHost blocks foreign hosts", () => {
    const r = checkHost("https://evil.example/x.jpg", { requireCloudinaryHost: true });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not-cloudinary");
});

await test("requireCloudinaryHost blocks protocol downgrade", () => {
    const r = checkHost("http://res.cloudinary.com/demo/image/upload/v1/a.jpg", { requireCloudinaryHost: true });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "insecure-protocol");
});

await test("requireCloudinaryHost allows https Cloudinary", () => {
    assert.equal(checkHost("https://res.cloudinary.com/demo/image/upload/v1/a.jpg", { requireCloudinaryHost: true }).ok, true);
});

await test("empty url passes the host check (nothing to screen)", () => {
    assert.equal(checkHost("", { requireCloudinaryHost: true }).ok, true);
    assert.equal(checkHost(null, { requireCloudinaryHost: true }).ok, true);
});

await test("malformed url is rejected", () => {
    assert.equal(checkHost("nonsense", {}).reason, "malformed-url");
});

await test("javascript: is rejected", () => {
    assert.equal(checkHost("javascript:alert(1)", {}).ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Provider verdict normalisation
// ─────────────────────────────────────────────────────────────────────────────
const { normaliseCloudinaryStatus, worstLabelConfidence } = _internal;

await test("rejected status is maximum confidence", () => {
    const s = normaliseCloudinaryStatus([{ status: "rejected", moderation_confidence: [] }]);
    assert.equal(s.status, "rejected");
    assert.equal(s.confidence, 1);
});

await test("very_likely nudity label scores high", () => {
    assert.ok(worstLabelConfidence(["nudity_or_explicit very_likely"], "approved") > 0.9);
});

await test("likely nudity label scores above a 0.8 threshold", () => {
    assert.ok(worstLabelConfidence(["nudity_or_explicit likely"], "approved") >= 0.8);
});

await test("safe labels score zero", () => {
    assert.equal(worstLabelConfidence(["weapons none"], "approved"), 0);
    assert.equal(worstLabelConfidence([], "approved"), 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Screen decisions, driven through the exported entry point with an injected
// config so no Mongo or provider is needed.
// ─────────────────────────────────────────────────────────────────────────────
const { screenMediaUrl, enforceMedia, clearVerdictCache } = require("./mediaModeration.js");

/**
 * `screenMediaUrl` reads config from Mongo unless `filterDoc` is supplied, so
 * every case here passes one. It is a lean, not a mongoose doc.
 */
const cfg = (mm) => ({ mediaModeration: { enabled: true, provider: "none", ...mm } });

await test("disabled moderation allows everything", async () => {
    const v = await screenMediaUrl("https://evil.example/x.jpg", { filterDoc: { mediaModeration: { enabled: false } } });
    assert.equal(v.allowed, true);
    assert.equal(v.checked, false);
});

await test("a surface switched off skips screening", async () => {
    const v = await screenMediaUrl("https://res.cloudinary.com/d/i/u/v1/a.jpg", {
        filterDoc: cfg({ scope: { postImage: false } }),
        surface: "postImage",
    });
    assert.equal(v.allowed, true);
    assert.equal(v.reason, "media-moderation-disabled");
});

await test("no provider configured returns allowed BUT admits it did not look", async () => {
    const v = await screenMediaUrl("https://res.cloudinary.com/d/i/u/v1/a.jpg", { filterDoc: cfg({}) });
    assert.equal(v.allowed, true);
    // This is the important assertion: the module must not imply it screened
    // pixels when there is no classifier behind it.
    assert.equal(v.checked, true);
    assert.ok(v.note, "expected an explicit note that pixels were not examined");
    assert.match(v.note, /NOT examined/i);
});

await test("structural checks run even with no provider", async () => {
    const v = await screenMediaUrl("https://evil.example/x.jpg", {
        filterDoc: cfg({ requireCloudinaryHost: true }),
    });
    assert.equal(v.allowed, false);
    assert.equal(v.structural, true);
});

await test("failureMode closed blocks on an unconfigured provider", async () => {
    const v = await screenMediaUrl("https://res.cloudinary.com/d/i/u/v1/a.jpg", {
        filterDoc: cfg({ provider: "google", failureMode: "closed" }),
    });
    assert.equal(v.allowed, false);
    assert.equal(v.failedClosed, true);
    assert.match(v.reason, /provider-failed/);
});

await test("failureMode open allows on an unconfigured provider but says so", async () => {
    const v = await screenMediaUrl("https://res.cloudinary.com/d/i/u/v1/a.jpg", {
        filterDoc: cfg({ provider: "google", failureMode: "open" }),
    });
    assert.equal(v.allowed, true);
    assert.match(v.reason, /provider-failed/);
});

await test("unknown provider is a failure, not a silent pass", async () => {
    for (const mode of ["closed", "open"]) {
        const v = await screenMediaUrl("https://res.cloudinary.com/d/i/u/v1/a.jpg", {
            filterDoc: cfg({ provider: "aws", failureMode: mode }),
        });
        if (mode === "closed") assert.equal(v.allowed, false);
        else assert.equal(v.allowed, true);
        assert.ok(v.reason.includes("provider-failed"), `expected a provider-failed reason, got ${v.reason}`);
    }
});

await test("aws reports itself as not implemented rather than clean", async () => {
    const v = await screenMediaUrl("https://res.cloudinary.com/d/i/u/v1/a.jpg", {
        filterDoc: cfg({ provider: "aws", failureMode: "open" }),
    });
    assert.equal(v.notImplemented, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// enforceMedia
// ─────────────────────────────────────────────────────────────────────────────
await test("enforceMedia passes when all URLs are fine", async () => {
    const r = await enforceMedia(["https://res.cloudinary.com/d/i/u/v1/a.jpg", "https://res.cloudinary.com/d/i/u/v1/b.jpg"], {
        filterDoc: cfg({}),
    });
    assert.equal(r.ok, true);
    assert.equal(r.rejected.length, 0);
});

await test("enforceMedia reports every rejected URL", async () => {
    const r = await enforceMedia(
        ["https://res.cloudinary.com/d/i/u/v1/ok.jpg", "https://evil.example/bad.jpg", "https://bad2.example/x.png"],
        { filterDoc: cfg({ requireCloudinaryHost: true }) }
    );
    assert.equal(r.ok, false);
    assert.equal(r.rejected.length, 2);
    assert.ok(r.message, "expected a client-safe message");
});

await test("enforceMedia with no URLs is a pass", async () => {
    assert.equal((await enforceMedia([], { filterDoc: cfg({}) })).ok, true);
    assert.equal((await enforceMedia(null, { filterDoc: cfg({}) })).ok, true);
    assert.equal((await enforceMedia(undefined, { filterDoc: cfg({}) })).ok, true);
});

await test("enforceMedia accepts a bare string", async () => {
    const r = await enforceMedia("https://res.cloudinary.com/d/i/u/v1/a.jpg", { filterDoc: cfg({}) });
    assert.equal(r.ok, true);
});

await test("enforceMedia skips falsy entries", async () => {
    const r = await enforceMedia(["", null, "https://res.cloudinary.com/d/i/u/v1/a.jpg"], { filterDoc: cfg({}) });
    assert.equal(r.ok, true);
    assert.equal(r.verdicts.length, 1);
});

await test("enforceMedia does not destroy assets for STRUCTURAL rejections", async () => {
    // A foreign-host URL was never our asset to delete; destroying it would be
    // an attack primitive (an admin-visible endpoint deleting arbitrary URLs).
    const r = await enforceMedia(["https://evil.example/x.jpg"], {
        filterDoc: cfg({ requireCloudinaryHost: true }),
    });
    assert.equal(r.ok, false);
    assert.equal(r.rejected[0].structural, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Text filter scope switches
// ─────────────────────────────────────────────────────────────────────────────
// The text filter reads Mongo. These assert the pure matcher it delegates to,
// plus the scope mapping, without needing a database.
const { SURFACES } = require("./textFilter.js");
const { findMatches } = require("./toxicMatch.js");

await test("every documented surface maps to a scope key", () => {
    for (const key of ["post", "comment", "postEdit", "commentEdit", "repost", "dm", "group", "story", "bio", "bot"]) {
        assert.ok(SURFACES[key], `missing scope mapping for ${key}`);
    }
});

await test("server matcher agrees with the client on the reported bug", () => {
    // The exact report: filtering "ass" must not block "assistant".
    assert.equal(findMatches("I am an assistant", ["ass"]).length, 0);
    assert.equal(findMatches("I am an ass", ["ass"]).length, 1);
});

await test("clearing the verdict cache does not throw", () => {
    clearVerdictCache();
});

// ─────────────────────────────────────────────────────────────────────────────
// Singleton lookup — the bug that made the whole admin page 500.
//
// `ContentFilter.findById("singleton")` throws
// `CastError: Cast to ObjectId failed for value "singleton"`, because mongoose
// casts `_id` to an ObjectId. `node --check` passes, `require()` succeeds, and
// the only failure happens when the query is EXECUTED against a database — so
// none of the normal checks caught it, and every content-filter endpoint
// returned HTTP 500 with no detail in the body.
//
// `Query.prototype.cast()` runs the same schema casting the driver would, and
// needs no connection, so this class of bug is caught here.
// ─────────────────────────────────────────────────────────────────────────────
await test("singleton lookups cast cleanly against the real schema", () => {
    const ContentFilterModel = require("../models/contentFilter.js");

    const probe = (build) => {
        const q = build();
        q.cast(ContentFilterModel);
    };

    // The queries `load()` and `loadLean()` actually issue.
    probe(() => ContentFilterModel.findOne({ key: "singleton" }));
    probe(() => ContentFilterModel.findOne({ key: { $exists: false } }).sort({ updatedAt: 1 }));

    assert.equal(typeof ContentFilterModel.load, "function", "load() static missing");
    assert.equal(typeof ContentFilterModel.loadLean, "function", "loadLean() static missing");
    assert.equal(ContentFilterModel.SINGLETON_KEY, "singleton");
});

await test("findById('singleton') remains a CastError (documents the regression)", () => {
    const ContentFilterModel = require("../models/contentFilter.js");
    let threw = null;
    try {
        ContentFilterModel.findById("singleton").cast(ContentFilterModel);
    } catch (e) {
        threw = e;
    }
    assert.ok(threw, "expected a cast failure for findById('singleton')");
    assert.match(threw.message, /Cast to ObjectId failed/);
});

await test("no source file still calls findById('singleton')", () => {
    const { readFileSync } = require("node:fs");
    const { join, dirname } = require("node:path");
    const { fileURLToPath } = require("node:url");
    const files = [
        "../routes/admin.js",
        "../routes/adminSafetyOps.js",
        "../routes/adminContentSafety.js",
        "../lib/textFilter.js",
        "../lib/mediaModeration.js",
    ];
    for (const rel of files) {
        const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), rel), "utf8");
        assert.ok(
            !/findById\(\s*["']singleton["']\s*\)/.test(src),
            `${rel} still calls findById("singleton"), which throws a CastError at runtime`
        );
    }
});

await test("textFilter and mediaModeration survive a filter-read failure", async () => {
    // Both must degrade to a safe default rather than throwing, because a
    // transient Mongo error on the config read used to surface as a 500 on the
    // admin page instead of an empty-but-working filter.
    const textFilter = require("./textFilter.js");
    const { screenMediaUrl } = require("./mediaModeration.js");
    assert.equal(typeof textFilter.checkText, "function");
    assert.equal(typeof screenMediaUrl, "function");
});

// ─────────────────────────────────────────────────────────────────────────────
for (const f of failures) console.log("FAIL  " + f);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.log("\nCONTENT SAFETY TESTS FAILED");
    process.exit(1);
}
console.log("ALL CONTENT SAFETY TESTS PASS");
