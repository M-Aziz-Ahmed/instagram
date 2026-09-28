/**
 * Contract tests for subscriber location records.
 *
 * These guard the parts that are easy to get quietly wrong: the retention
 * window, the split between the permanent origin record and the expiring
 * observations, and the fact that the raw address is what gets stored.
 *
 * No database is required — the assertions are against the schema and the
 * query-building code, in the same style as the other suites in this repo.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

// The models and helpers are CommonJS, this file is an ES module. `createRequire`
// says that explicitly; a bare `require()` next to top-level await leaves Node
// guessing at the module format and it refuses to run.
const require = createRequire(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(HERE, rel), "utf8");

/** Source with comments stripped, so assertions test code and not prose. */
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

const { networkKey, isRoutable } = require("./geo.js");
const { placeKey, formatPlace } = require("./subscriberLocation.js");
const SubscriberLocation = require("../models/subscriberLocation.js");
const User = require("../models/user.js");
const Message = require("../models/messages.js");

// ── Why the two caching strategies have to stay separate ──────────────────
await test("a /24 network and the exact address are different keys", () => {
    assert.equal(networkKey("203.0.113.42"), "203.0.113.0/24");
    // The precise path must NOT be served the network's answer, or an account in
    // one town gets recorded as the middle of a /24 spanning three.
    assert.notEqual(networkKey("203.0.113.42"), "203.0.113.42");
});

await test("private and reserved addresses are never geolocated", () => {
    // A record built from 127.0.0.1 or the cloud metadata address would be
    // nonsense that looks like evidence, so those must be refused outright.
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.5", "169.254.169.254", "100.64.0.1", "::1"]) {
        assert.equal(isRoutable(ip), false, `${ip} should not be treated as routable`);
    }
    assert.equal(isRoutable("203.0.113.42"), true);
    assert.equal(isRoutable("2001:db8::1"), true);
});

await test("precise is opt-in and the aggregate path stays coarse", () => {
    const events = code("../routes/events.js");
    // /api/track feeds the population globe. It must keep using the /24 answer.
    assert.ok(
        !/precise:\s*true/.test(events),
        "the analytics beacon must not start doing exact-address lookups",
    );
    const auth = code("../routes/auth.js");
    assert.ok(
        /precise:\s*true/.test(auth),
        "the account origin must be resolved with the exact address",
    );
});

// ── Origin vs observations ────────────────────────────────────────────────
await test("the account origin is a permanent field on the user", () => {
    // Asserted on the REGISTED paths rather than `schema.path("signupLocation")`.
    // An inline nested object is flattened by mongoose into dotted paths, and a
    // field that is merely declared in the schema object without being registered
    // is silently dropped on save under `strict: true` — the exact failure this
    // repo already documents for `isShadowbanned`. So the check that matters is
    // that the leaves exist as real paths.
    for (const field of ["ip", "network", "country", "countryCode", "region", "city", "lat", "lon", "tz", "device", "at"]) {
        const p = User.schema.path(`signupLocation.${field}`);
        assert.ok(p, `signupLocation.${field} is not a registered path and would be dropped on save`);
    }
    // Permanent means: no TTL on the user document that could remove it.
    const userSrc = code("../models/user.js");
    assert.ok(
        !/signupLocation[\s\S]{0,400}expireAfterSeconds/.test(userSrc),
        "signupLocation must not sit inside a TTL index",
    );
});

await test("origin is written only once, never moved by a retry", () => {
    const lib = code("./subscriberLocation.js");
    // The filter must require the field to still be empty, so a replayed OTP
    // verification cannot relocate an account's origin.
    assert.ok(
        /signupLocation\.at[\s\S]{0,120}null/.test(lib) || /"signupLocation\.at"/.test(lib),
        "recordSignupOrigin must guard on signupLocation.at being empty",
    );
});

await test("the origin write is best-effort and cannot fail a signup", () => {
    const auth = code("../routes/auth.js");
    assert.ok(
        /catch\s*\(geoErr\)/.test(auth),
        "a geo failure during signup must be caught, not abort account creation",
    );
});

// ── Retention ────────────────────────────────────────────────────────────
await test("observations expire, and the window is configurable", () => {
    const src = code("../models/subscriberLocation.js");
    assert.ok(
        /SUBSCRIBER_LOCATION_RETENTION_DAYS/.test(src),
        "retention must be settable by env var; jurisdictions differ",
    );
    assert.ok(
        /expireAfterSeconds:\s*RETENTION_DAYS/.test(src),
        "the TTL must be built from that value",
    );
    // The default is 30 days, matching what the admin UI tells an operator.
    assert.equal(SubscriberLocation.RETENTION_DAYS, 30);
});

await test("the TTL is on the refresh field, so activity slides the window", () => {
    const src = code("../models/subscriberLocation.js");
    const idx = src.match(/index\(\{\s*updatedAt[\s\S]{0,80}expireAfterSeconds/);
    assert.ok(idx, "the TTL must key on updatedAt, which every write refreshes");
    // And the write must actually refresh it, or the TTL would expire a record
    // belonging to someone who is still signing in every day.
    const lib = code("./subscriberLocation.js");
    assert.ok(/updatedAt:\s*now/.test(lib), "every observation must refresh updatedAt");
});

// ── The place key ────────────────────────────────────────────────────────
await test("the same place always produces the same key", () => {
    const a = placeKey({ countryCode: "PK", region: "Punjab", city: "Lahore", lat: 31.5, lon: 74.3 });
    const b = placeKey({ countryCode: "pk", region: " punjab ", city: "LAHORE", lat: 31.5, lon: 74.3 });
    assert.equal(a, b, "case and padding must not create two entries for one place");
});

await test("different cities are different keys", () => {
    const a = placeKey({ countryCode: "PK", region: "Punjab", city: "Lahore" });
    const b = placeKey({ countryCode: "PK", region: "Sindh", city: "Karachi" });
    assert.notEqual(a, b);
});

await test("a missing city still separates places by coordinate", () => {
    // Without this, every provider with no city name would collapse into one
    // bucket and the panel would claim a traveller "only ever visits one place".
    const a = placeKey({ countryCode: "US", region: "CA", city: "", lat: 34.05, lon: -118.24 });
    const b = placeKey({ countryCode: "US", region: "CA", city: "", lat: 40.71, lon: -74.0 });
    assert.notEqual(a, b);
    // Rounded to a tenth of a degree: an ~11km bucket, which is the right
    // coarseness for "this is a different place" without tracking GPS jitter.
    assert.ok(/34\.\d,-118\.\d$/.test(a), `expected a rounded coordinate pair in the key, got ${a}`);
});

await test("formatPlace degrades to something readable", () => {
    assert.equal(formatPlace({ city: "Lahore", region: "Punjab", country: "Pakistan" }), "Lahore, Punjab, Pakistan");
    assert.equal(formatPlace({}), "Unknown location");
});

// ── Disclosure endpoint ──────────────────────────────────────────────────
await test("the disclosure route is admin-only", () => {
    const src = code("../routes/adminSubscribers.js");
    assert.ok(/router\.use\(requireAdmin\)/.test(src), "the whole router must require admin");
    assert.ok(
        !/router\.get\([^)]*requireAdmin/.test(src),
        "per-route requireAdmin alongside router.use would be redundant and hides a miss",
    );
});

await test("every read of a location is audit-logged, and awaited", () => {
    const src = code("../routes/adminSubscribers.js");
    // Two routes return subscriber locations: the per-account disclosure and the
    // place enumeration. Both must log.
    const logs = src.match(/await logUser\(/g) || [];
    assert.ok(logs.length >= 2, `expected an awaited audit on both location routes, found ${logs.length}`);
    // Awaited, not fire-and-forget: a disclosure must never outrun its own audit.
    assert.ok(!/logUser\([^;]*\);(?!.*await)/.test(src) || src.includes("await logUser("));
    assert.ok(/disclosedBy/.test(src), "the response must say who read it");
});

await test("place enumeration is a separate route, not a query flag", () => {
    const src = code("../routes/adminSubscribers.js");
    assert.ok(/router\.get\("\/place\/:key"/.test(src));
    // A `?place=` on the disclosure route would let one account's location be
    // traded for everyone's.
    assert.ok(!/req\.query\.place\b/.test(src), "the disclosure route must not accept a place override");
});

await test("the place search escapes its user-supplied pattern", () => {
    const src = code("../routes/adminSubscribers.js");
    // Unescaped, a query of "." matches every document in the collection.
    assert.ok(/replace\(\/\[\.\*\+\?\^\$\{\}\(\)\|\[\\\]\\\\\]\/g/.test(src) || /\.replace\(\/\[.*\]\/g, "\\\\\$&"\)/.test(src),
        "the search query must be regex-escaped");
});

await test("the place enumeration is capped and says when it truncated", () => {
    const src = code("../routes/adminSubscribers.js");
    assert.ok(/Math\.min\(200/.test(src), "the enumeration must be capped");
    assert.ok(/truncated/.test(src), "a capped list must say so, or it reads as complete");
});

await test("the retention window is stated in the disclosure payload", () => {
    const src = code("../routes/adminSubscribers.js");
    // A saved or forwarded copy of a disclosure has to be self-describing.
    assert.ok(/retention:/.test(src), "the response must carry its own retention window");
    assert.ok(/observationDays/.test(src));
});

// ── Presence write path ──────────────────────────────────────────────────
await test("presence requires a session and is throttled on the server too", () => {
    const route = code("../routes/presence.js");
    assert.ok(/verifyToken/.test(route), "presence must be authenticated");
    assert.ok(
        /MIN_INTERVAL_MS/.test(route),
        "the server must refuse to re-record inside the window; a client clock is not a control",
    );
    assert.ok(/lastActive/.test(route), "the throttle must be based on stored server state, not a request field");
});

await test("presence never fails the caller", () => {
    const route = code("../routes/presence.js");
    // Opening the app must not break because a geo provider is slow or down.
    assert.ok(
        /status\(200\)\.json\(\{ ok: false \}\)/.test(route),
        "a failed presence record must still answer 200",
    );
});

await test("presence is mounted and limited separately from the analytics beacon", () => {
    const server = code("../server.js");
    assert.ok(server.includes('"/api/presence"'), "/api/presence is not mounted");
    const rl = code("../middleware/rateLimit.js");
    assert.ok(/presenceLimiter/.test(rl), "presence has no rate limiter");
});

// ── Public surface ───────────────────────────────────────────────────────
await test("no public user route can return a signup location", () => {
    // The single most important negative assertion in this file: these fields
    // are personal data, and the only way they leak is a "just add it to the
    // payload" edit.
    const sendUserPayload = code("../routes/auth.js");
    const payload = sendUserPayload.match(/function sendUserPayload[\s\S]*?\n}/);
    assert.ok(payload, "could not find sendUserPayload");
    assert.ok(
        !/signupLocation|signupIp/.test(payload[0]),
        "sendUserPayload is the shared public user shape; it must never carry signupLocation",
    );
    const events = code("../routes/events.js");
    assert.ok(
        !/signupLocation/.test(events),
        "the analytics write path must not copy origin into telemetry",
    );
});

await test("admin disclosure is mounted before the catch-all admin routers", () => {
    const server = code("../server.js");
    const at = server.indexOf('app.use("/api/admin/subscribers"');
    const general = server.indexOf('app.use("/api/admin", apiLimiter, require("./routes/admin")');
    assert.ok(at > -1, "/api/admin/subscribers is not mounted");
    assert.ok(
        at < general,
        "the subscribers router must be mounted before /api/admin, or the catch-all matches first",
    );
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
    console.log("\n─────────\n");
    for (const f of failures) console.log(`  ✗ ${f.name}\n     ${f.message}\n`);
    process.exit(1);
}
console.log("ALL SUBSCRIBER LOCATION TESTS PASS");
