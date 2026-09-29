/**
 * Contract tests for the media vault.
 *
 * The interesting behaviour is a routing decision — whose cloud does this
 * account's media land in — and a quota that can only partly be enforced. Both
 * are pinned here, along with the negative assertions that matter most: that no
 * secret is stored, and that a client cannot choose its own upload target.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(HERE, rel), "utf8");
function code(rel) {
    return read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

let passed = 0;
const failures = [];
async function test(name, fn) {
    try { await fn(); passed++; } catch (err) { failures.push({ name, message: err.message }); }
}

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-only-not-a-real-secret";

const {
    resolveMediaTarget, assertWithinQuota, remainingBytes,
    SITE_TIER_QUOTA_BYTES,
} = require("./mediaVault.js");
const connModel = require("../models/userMediaConnection.js");
const { cloudinaryReady, googleDriveReady } = connModel;

const USER_TIER = { providers: { cloudinary: { cloudName: "mycloud", uploadPreset: "anonfeed" } } };

// ── Routing: whose cloud does the media go to? ────────────────────────────
await test("a connected user always writes to their own cloud", () => {
    // Even an admin, and even with a grant active: their account beats ours.
    const t = resolveMediaTarget({ isAdmin: true, videoUploadAllowed: true }, USER_TIER);
    assert.equal(t.tier, "user");
    assert.equal(t.cloudName, "mycloud");
    assert.equal(t.uploadPreset, "anonfeed");
    assert.equal(t.quotaBytes, 0, "their cloud must not be billed to a quota of ours");
});

await test("a grant without a connection writes to the site tier, metered", () => {
    const t = resolveMediaTarget({ videoUploadAllowed: true }, null);
    assert.equal(t.tier, "site");
    assert.equal(t.canUpload, true);
    assert.equal(t.quotaBytes, SITE_TIER_QUOTA_BYTES);
});

await test("an admin without a connection still gets the site tier", () => {
    const t = resolveMediaTarget({ isAdmin: true }, null);
    assert.equal(t.tier, "site");
    assert.equal(t.canUpload, true);
});

await test("an ordinary account gets no upload target and a real alternative", () => {
    const t = resolveMediaTarget({}, null);
    assert.equal(t.canUpload, false);
    assert.equal(t.tier, null);
    // A link post is free and always available, so this is a redirect, not a wall.
    assert.equal(t.alternative, "link");
});

await test("a half-configured connection is not treated as connected", () => {
    // A cloud name with no preset cannot upload; routing to it would produce a
    // broken composer rather than falling back to something that works.
    const broken = { providers: { cloudinary: { cloudName: "mycloud", uploadPreset: "" } } };
    assert.equal(cloudinaryReady(broken), false);
    const t = resolveMediaTarget({ isAdmin: true }, broken);
    assert.equal(t.tier, "site", "should fall back to the site tier, not to a broken target");
});

await test("the readiness helpers agree with the router", () => {
    assert.equal(cloudinaryReady(USER_TIER), true);
    assert.equal(cloudinaryReady(null), false);
    assert.equal(cloudinaryReady({ providers: { cloudinary: {} } }), false);
    assert.equal(googleDriveReady(null), false);
    assert.equal(googleDriveReady({ providers: { googleDrive: { refreshToken: "x" } } }), true);
});

// ── Quotas ───────────────────────────────────────────────────────────────
await test("the user tier is not subject to our quota at all", () => {
    const t = resolveMediaTarget({ isAdmin: true }, USER_TIER);
    assert.equal(assertWithinQuota(t, { storedBytes: 10 * 1024 ** 3 }, 10 * 1024 ** 3), null);
    assert.equal(remainingBytes(t, { storedBytes: 999 * 1024 ** 3 }), Infinity);
});

await test("the site tier refuses media that would cross the allowance", () => {
    const t = resolveMediaTarget({ isAdmin: true }, null);
    const usage = { storedBytes: SITE_TIER_QUOTA_BYTES - 10 };
    const refusal = assertWithinQuota(t, usage, 100);
    assert.ok(refusal, "expected a refusal");
    assert.equal(refusal.status, 413);
    // A refusal with no remedy is a dead end; the remedy is the feature.
    assert.ok(/own storage|link/i.test(refusal.remedy), "a refusal must say what to do instead");
});

await test("the site tier allows media that still fits", () => {
    const t = resolveMediaTarget({ isAdmin: true }, null);
    assert.equal(assertWithinQuota(t, { storedBytes: 0 }, 1024), null);
    assert.equal(assertWithinQuota(t, null, 1024), null);
});

await test("remaining never goes negative", () => {
    const t = resolveMediaTarget({ isAdmin: true }, null);
    assert.equal(remainingBytes(t, { storedBytes: SITE_TIER_QUOTA_BYTES + 5000 }), 0);
});

// ── The security properties ──────────────────────────────────────────────
await test("no API secret is ever stored", () => {
    // The whole design rests on uploads using an unsigned preset, which is why
    // a secret would be both unnecessary and a liability.
    const model = code("../models/userMediaConnection.js");
    assert.ok(
        !/api_?secret/i.test(model),
        "the connection must not hold an API secret; a preset is not a credential",
    );
    const vault = code("./mediaVault.js");
    assert.ok(!/api_?secret/i.test(vault), "mediaVault must not handle a secret");
});

await test("the connect route never echoes the stored values back", () => {
    const route = code("../routes/mediaVault.js");
    const connect = route.slice(route.indexOf('router.post("/cloudinary"'));
    // It validates and stores. Returning the values would be pointless — the
    // client already sent them — and is the shape a "here is your config" leak
    // would take.
    assert.ok(
        !/cloudName/.test(connect.slice(connect.indexOf("} catch"), connect.indexOf("} catch") + 400)),
        "the connect response must not echo the cloud name or preset",
    );
});

await test("no provider secret can reach the client", () => {
    // /status returns only what the browser needs to upload, which is the
    // public cloud name and preset, and nothing else from the connection.
    const route = code("../routes/mediaVault.js");
    const status = route.slice(route.indexOf('router.get("/status"'), route.indexOf('router.post("/cloudinary"'));
    const body = (status.split("return res.json")[1] || "");

    // Matched on the KEY form, not the bare word. `refreshToken` legitimately
    // appears in a read — `connected: !!conn.providers.googleDrive.refreshToken` —
    // and what must never happen is a token being SENT. A key is what would put
    // one in the payload.
    assert.ok(
        !/refreshToken\s*:/.test(body) && !/accessToken\s*:/.test(body),
        "/status must not return stored OAuth tokens",
    );
    assert.ok(/connected:\s*!!/.test(body), "drive state must be reduced to a boolean, not a token");
    assert.ok(/cloudinaryReadyValues/.test(status), "the cloud values must come from the public-only helper");
});

await test("a client cannot choose its own upload target", () => {
    // The dangerous shape is a route that accepts a target from the request.
    // Every route must derive the target from the session instead.
    const route = code("../routes/mediaVault.js");
    assert.ok(
        !/req\.body\.(tier|provider|target|cloudName)\s*\?\s*[^:]*:\s*/.test(route),
        "a route must not let the body choose the storage tier",
    );
    assert.ok(!/req\.body\.tier/.test(route), "the tier must never be read from the body");
    // The connect route reads cloudName, but only to STORE it on that user.
    assert.ok(/connectCloudinary\(req\.userId/.test(route), "a connection must always be scoped to the session user");
});

await test("the vault is authenticated and flag-gated", () => {
    const route = code("../routes/mediaVault.js");
    const routes = route.match(/router\.(get|post|delete)\([^)]*\)/g) || [];
    assert.ok(routes.length >= 5, `expected several routes, found ${routes.length}`);
    const handlers = route.match(/router\.(get|post|delete)\("[^"]*",\s*([^\n]*)/g) || [];
    for (const h of handlers) {
        assert.ok(/verifyToken/.test(h), `route is not authenticated: ${h}`);
    }
    assert.ok(/requireFeature\("mediaVault"\)/.test(route), "the vault must be behind a kill switch");
});

await test("the vault is mounted exactly once", () => {
    const server = code("../server.js");
    const mounts = server.match(/app\.use\("\/api\/media-vault"/g) || [];
    assert.equal(mounts.length, 1, `expected one mount, found ${mounts.length}`);
});

await test("disconnecting does not delete anything in the user's cloud", () => {
    // The files are theirs. A "disconnect" that also purged would be destroying
    // a user's data because they changed a setting on our site.
    const vault = code("./mediaVault.js");
    const fn = vault.slice(vault.indexOf("async function disconnectCloudinary"));
    const body = fn.slice(0, fn.indexOf("}\n"));
    assert.ok(
        !/delete_resources|destroy|remove|\.delete\(|api_?secret/i.test(body),
        "disconnect must only stop pointing at the cloud, never delete from it",
    );
});

await test("the usage endpoint validates a size before adding it", () => {
    const route = code("../routes/mediaVault.js");
    // Both halves matter: a non-number, and a non-positive one. A client that
    // reported a size of 0 or -5 would otherwise decrement the running total.
    assert.ok(/Number\.isFinite\(bytes\)/.test(route), "a non-numeric size must be rejected");
    assert.ok(/bytes\s*<=\s*0/.test(route) || /bytes\s*<\s*1/.test(route), "a non-positive size must be rejected");
    assert.ok(/bytes\s*>\s*2\s*\*\s*1024/.test(route), "an implausible size must be rejected");
    assert.ok(
        /assertWithinQuota/.test(route),
        "recording usage must also enforce the allowance, not just count",
    );
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
    console.log("\n─────────\n");
    for (const f of failures) console.log(`  ✗ ${f.name}\n     ${f.message}\n`);
    process.exit(1);
}
console.log("ALL MEDIA VAULT TESTS PASS");
