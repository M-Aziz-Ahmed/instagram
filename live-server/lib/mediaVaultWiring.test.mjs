/**
 * Wiring tests for the media vault.
 *
 * The routing logic is covered in mediaVault.test.mjs. This file covers the
 * parts where the feature is only real if the rest of the app actually consults
 * it: the composer picking its upload target, the post route refusing
 * over-quota media, and the settings route existing so the "manage" link is not
 * a dead end.
 *
 * A media vault that nothing reads is a very expensive no-op: users would
 * connect storage and still upload to the site.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
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

// ── The composer must use the resolved target ────────────────────────────
await test("the composer uploads to the resolved cloud, not a compile-time constant", () => {
    const compose = code("components/Feed/Compose.jsx");
    // The old build had these two constants and used them for every upload,
    // which is the bug this whole feature exists to fix.
    assert.ok(
        !/const CLOUD_NAME\s*=/.test(compose),
        "the site cloud must not be a module constant in the composer any more",
    );
    assert.ok(
        !/const UPLOAD_PRESET\s*=/.test(compose),
        "the site preset must not be a module constant in the composer any more",
    );
    // Both upload paths must go through the hook.
    const uploads = compose.match(/api\.cloudinary\.com\/v1_1\/\$\{[^}]+\}/g) || [];
    assert.ok(uploads.length >= 2, `expected image and video uploads, found ${uploads.length}`);
    for (const u of uploads) {
        assert.ok(/\$\{media\.cloudName\}/.test(u), `upload target is not the resolved one: ${u}`);
    }
    assert.ok(/fd\.append\("upload_preset",\s*media\.uploadPreset\)/.test(compose),
        "the preset sent to the provider must be the resolved one");
});

await test("the composer falls back to the site cloud while status is unknown", () => {
    // A blocking spinner on a settings lookup would be a worse bug than the one
    // being fixed, so the fallback has to exist and be the site values.
    const hook = code("components/Feed/useMediaTarget.js");
    assert.ok(/NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME/.test(hook), "the site cloud must remain the fallback");
    assert.ok(/NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET/.test(hook));
    assert.ok(
        /usingOwnStorage\s*\?\s*status\.cloud\.cloudName\s*:\s*SITE_CLOUD/.test(hook),
        "own storage must win, and the site cloud must be the fallback",
    );
    // A 404 from an un-deployed route is a normal state, not an error to show.
    assert.ok(/if \(!res\.ok\) return;/.test(hook), "a missing status route must not surface an error");
});

await test("a completed upload is reported so the running total can be kept", () => {
    const compose = code("components/Feed/Compose.jsx");
    assert.ok(/media\.noteUsage\(/.test(compose), "uploads must report their size");
    const hook = code("components/Feed/useMediaTarget.js");
    assert.ok(
        /result\.bytes \|\| file\.size/.test(compose),
        "the size must come from the provider response, not only the browser's view of the file",
    );
    assert.ok(/api\/media-vault\/usage/.test(hook), "the usage endpoint is not called");
    // Fire-and-forget: the bytes already went to the provider, so a failure to
    // note it must not fail the post.
    assert.ok(/\.catch\(\(\) => \{\}\)/.test(hook), "reporting usage must not be able to fail the upload");
});

// ── The post route must enforce ──────────────────────────────────────────
await test("the post route refuses over-quota media at attach time", () => {
    const posts = code("live-server/routes/posts.js");
    assert.ok(/require\("\.\.\/lib\/mediaVault"\)/.test(posts), "the post route does not know about the vault");
    assert.ok(/assertWithinQuota/.test(posts), "no quota check on the post route");
    // It must gate on media actually being attached, not every text post.
    assert.ok(
        /finalImageUrls\.length > 0 \|\| videoUrl/.test(posts),
        "the quota check must only apply to posts that carry media",
    );
    assert.ok(
        /res\.status\(refusal\.status\)\.json\(refusal\)/.test(posts),
        "a refusal must be returned to the client, not just logged",
    );
});

await test("the post route's gate and the vault's gate resolve the same tier", () => {
    const posts = code("live-server/routes/posts.js");
    // `getUserPermissions` returns `{ isAdmin, permissions }`; passing `roles`
    // here would resolve a different tier than the post gate above it.
    assert.ok(
        /\{ isAdmin: isAdminUser, permissions \}/.test(posts),
        "the vault gate must be given the same flat permission list the post gate uses",
    );
});

await test("video URLs from a user's own cloud are still accepted", () => {
    const posts = code("live-server/routes/posts.js");
    // The host allowlist is `res.cloudinary.com`, not the site's cloud NAME, so
    // a delivery URL from any connected cloud passes. This is load-bearing:
    // pinning it to the site cloud would reject every BYO upload at post time.
    assert.ok(
        /CLOUDINARY_HOSTS\s*=\s*new Set\(\["res\.cloudinary\.com"/.test(posts),
        "the allowlist must stay host-based or own-storage uploads are rejected",
    );
    assert.ok(
        !/CLOUDINARY_CLOUD_NAME/.test(posts),
        "the post route must not pin uploads to the site's own cloud name",
    );
});

// ── Settings surface ─────────────────────────────────────────────────────
await test("the settings route exists, because two links point at it", () => {
    assert.ok(existsSync(join(ROOT, "app", "settings", "page.jsx")), "/settings has no page");
    // Every `href="/settings"` in the codebase has to resolve, or the "manage
    // your storage" affordance is a dead end with a 404 behind it.
    for (const rel of ["components/Feed/StorageHint.jsx", "components/Settings/MediaVaultPanel.jsx"]) {
        const src = read(rel);
        const hrefs = src.match(/href="\/settings"/g) || [];
        for (const h of hrefs) {
            assert.strictEqual(h, 'href="/settings"', `malformed settings href in ${rel}: ${h}`);
        }
    }
    // And the page must actually mount the panel that the "manage" link exists for.
    const page = read("app/settings/page.jsx");
    assert.ok(/MediaVaultPanel/.test(page), "/settings does not render the panel it links to");
});

await test("the drive section only renders when the server is configured", () => {
    // Google credentials are optional; rendering a button that always fails is
    // worse than not offering it.
    const panel = code("components/Settings/MediaVaultPanel.jsx");
    assert.ok(
        /if \(!drive\?\.configured\) return null;/.test(panel),
        "the Drive section must hide itself when the server has no Google credentials",
    );
    // And the shared-drive caveat has to be stated, because it is the whole
    // tradeoff of the Drive path.
    assert.ok(/anyone with the link/i.test(panel), "the shared-link consequence of Drive must be stated");
});

await test("the drive callback identifies the account by state, not by a query parameter", () => {
    const route = code("live-server/routes/mediaVaultDrive.js");
    const cb = route.slice(route.indexOf('router.get("/drive/callback"'));
    assert.ok(/consumeState\(state\)/.test(cb), "the callback must verify the state parameter");
    assert.ok(
        /router\.get\("\/drive\/callback",\s*readLimiter/.test(cb),
        "the Google redirect is a top-level navigation and must not require verifyToken",
    );
    // It must never take a username from the URL.
    assert.ok(
        !/req\.query\.user|req\.query\.username/.test(route),
        "the OAuth callback must not trust an account name from the query string",
    );
});

await test("drive tokens are encrypted at rest and never returned", () => {
    const lib = code("live-server/lib/googleDrive.js");
    assert.ok(/aes-256-gcm/.test(lib), "Drive tokens must be encrypted before they touch the database");
    assert.ok(/function encrypt/.test(lib) && /function decrypt/.test(lib));
    const route = code("live-server/routes/mediaVaultDrive.js");
    // The status route reports booleans, never tokens.
    const status = route.slice(route.indexOf('router.get("/drive/status"'), route.indexOf('router.get("/drive/auth"'));
    const body = (status.split("return res.json")[1] || "");
    assert.ok(!/refreshToken\s*:/.test(body) && !/accessToken\s*:/.test(body),
        "drive status must not return tokens");
    // `connected` is a boolean shorthand, so the check is that it was computed
    // as one rather than passed straight through from a token.
    assert.ok(/const connected = !!/.test(status), "drive state must be derived as a boolean");
    assert.ok(/\bconnected,/.test(body) || /connected:\s*!!/.test(body),
        "drive status must send the boolean, not a token");
});

await test("drive asks for app-scoped permissions, not the whole Drive", () => {
    const lib = code("live-server/lib/googleDrive.js");
    // The broad `drive` scope is a restricted-scope verification project and
    // would expose everything the user owns.
    const scopes = lib.slice(lib.indexOf("const SCOPES"), lib.indexOf("function config"));
    assert.ok(
        !/"https:\/\/www\.googleapis\.com\/auth\/drive"/.test(scopes),
        "the broad drive scope must not be requested",
    );
    assert.ok(/drive\.file/.test(scopes), "the app-scoped drive.file scope is what is needed");
});

await test("drive lists only shared files, because unshared ones cannot play", () => {
    const lib = code("live-server/lib/googleDrive.js");
    // The picker offering a file that will 404 at post time is a bug the user
    // pays for at publish time, not at connect time.
    assert.ok(/mimeType contains 'video\/'/.test(lib), "only video files should be listed");
    assert.ok(
        /fileShared/.test(lib) && /permissions/.test(lib),
        "a shared check must exist, or unshared files are offered as if they would work",
    );
});

await test("the composer's storage hint stays quiet until it is actionable", () => {
    const hint = code("components/Feed/StorageHint.jsx");
    // A permanent meter above the composer is nagging.
    assert.ok(
        /if \(!hasMedia && !near\) return null;/.test(hint),
        "the metered bar must only appear when media is staged or the limit is near",
    );
    // And nothing in it may talk about the site's costs.
    assert.ok(
        !/\b(cost|save|money|bandwidth|billing|cheap)\b/i.test(hint),
        "the storage hint must not mention the site's costs",
    );
});

await test("nothing user-facing claims the site cannot read the media", () => {
    // Moderation fetches the file to screen it, so "we can't read it" would be
    // false. "We keep only a reference" is true and is what the copy must say.
    //
    // Scoped to claims about the SITE. The panel also says an upload preset
    // "cannot read, change or delete anything already there", which is about
    // Cloudinary's permission model and is accurate — matching it here would be
    // a false positive, which is how this kind of check stops being trusted.
    const falseClaims = [
        /we (can't|cannot|can't ever) (read|see|access) your/i,
        /(this site|we) (never|don't|dont) (read|view|access) (your )?(media|video|photo)/i,
    ];
    for (const rel of ["components/Settings/MediaVaultPanel.jsx", "components/Feed/StorageHint.jsx"]) {
        for (const claim of falseClaims) {
            assert.ok(!claim.test(read(rel)), `${rel} makes a false claim about site access to media`);
        }
    }
    // The true framing must be present, since it is the actual benefit.
    assert.ok(
        /keeps only a reference/.test(read("components/Settings/MediaVaultPanel.jsx")),
        "the accurate 'we keep only a reference' framing should be the one used",
    );
    // And the preset limitation should be stated, because it is the reason no
    // secret is ever asked for.
    assert.ok(
        /cannot read, change or delete/.test(read("components/Settings/MediaVaultPanel.jsx")),
        "the preset's actual limitation should be explained where the user types it",
    );
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
    console.log("\n─────────\n");
    for (const f of failures) console.log(`  ✗ ${f.name}\n     ${f.message}\n`);
    process.exit(1);
}
console.log("ALL MEDIA VAULT WIRING TESTS PASS");
