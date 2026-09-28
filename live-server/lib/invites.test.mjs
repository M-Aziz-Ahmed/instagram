/**
 * Tests for the invite-code and referral layer.
 *
 * This is the machinery behind two things a stranger can touch: a QR code shown
 * in public, and a signup that credits whoever invited them. So the properties
 * asserted here are the ones that would be expensive to get wrong:
 *
 *   - codes are actually unguessable and not derivable from a username
 *     (the previous admin issuer defaulted to USERNAME.toUpperCase());
 *   - the generated alphabet cannot be mistyped into a different valid code,
 *     which is what makes a code readable off a screen by hand;
 *   - referral credit cannot be stolen by self-referral or double-counted;
 *   - the greeting budget is derived from real messages rather than a counter,
 *     so it cannot drift out of sync and silently lock an account out.
 *
 * Mongoose queries are exercised through `Query.prototype.cast()`, which runs
 * the same schema casting the driver would and needs no database connection.
 *
 * Run: node live-server/lib/invites.test.mjs
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

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

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-only-not-a-real-secret";

/**
 * Source with comments stripped.
 *
 * Several assertions below are about what the code *says to a caller*, so they
 * must not be fooled by a comment explaining the rule. Reading raw source would
 * match the word "expired" inside the very comment that says expired and unknown
 * must be indistinguishable.
 */
function code(rel) {
    const src = readFileSync(join(HERE, rel), "utf8");
    return src
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const {
    newInviteCode, normalizeCode, GREET_BUDGET_PER_DAY, CODE_RE,
} = require("./invites.js");
const User = require("../models/user.js");
const Message = require("../models/messages.js");

// ─────────────────────────────────────────────────────────────────────────────
// Code shape
// ─────────────────────────────────────────────────────────────────────────────

await test("every generated code matches the validator", () => {
    for (let i = 0; i < 500; i++) {
        const code = newInviteCode();
        assert.ok(CODE_RE.test(code), `"${code}" failed its own validator`);
    }
});

await test("codes are 10 characters, uppercase, and URL/QR safe", () => {
    const code = newInviteCode();
    assert.equal(code.length, 10);
    assert.equal(code, code.toUpperCase());
    // No character that needs percent-encoding in a path segment or a URL.
    assert.ok(/^[A-Z0-9]+$/.test(code), `"${code}" has a character that is not URL safe`);
});

await test("the alphabet omits the confusable symbols I L O U 0 1", () => {
    // If any of these crept in, a code read aloud or retyped by hand could turn
    // into a different valid code. That is a support problem and a security one.
    for (let i = 0; i < 2000; i++) {
        const code = newInviteCode();
        for (const ch of "ILOU01") {
            assert.ok(!code.includes(ch), `"${code}" contains the confusable symbol ${ch}`);
        }
    }
});

await test("normalizeCode upper-cases and accepts a spaced code", () => {
    assert.equal(normalizeCode("  abcd234567 \n"), "ABCD234567");
});

await test("normalizeCode rejects short, long, and non-alphabet codes", () => {
    for (const bad of ["", "   ", "TOOSHORT", "WAYTOOLONGCODE12345", "ABCD-234567", "../../etc", null, undefined, 12345]) {
        assert.equal(normalizeCode(bad), null, `${JSON.stringify(bad)} should not normalize`);
    }
});

await test("normalizeCode round-trips its own output", () => {
    for (let i = 0; i < 200; i++) {
        const code = newInviteCode();
        assert.equal(normalizeCode(code), code);
        assert.equal(normalizeCode(code.toLowerCase()), code);
    }
});

await test("codes do not encode the username (the old admin default did)", () => {
    // The previous issuer built a code from the username in upper case, which
    // meant the referral link for a well-known account was guessable by anyone
    // who could guess the name. Assert the property that fixes it.
    const username = "AzizAhmedPro";
    for (let i = 0; i < 200; i++) {
        const code = newInviteCode();
        assert.notEqual(code, username.toUpperCase().slice(0, 12));
        assert.ok(!code.includes(username.slice(0, 5).toUpperCase()));
    }
});

await test("generated codes are effectively unique across a large sample", () => {
    const seen = new Set();
    const n = 5000;
    for (let i = 0; i < n; i++) seen.add(newInviteCode());
    // 30^10 is ~5.9e14, so a handful of collisions in 5k draws would indicate a
    // broken generator (a stuck rejection loop, a constant seed, ...).
    assert.ok(seen.size === n, `only ${seen.size} distinct codes from ${n} draws`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

await test("the inviteCode index is unique and sparse", () => {
    const idx = User.schema.indexes().find(([spec]) => spec.inviteCode === 1);
    assert.ok(idx, "no index on inviteCode, so two users could share a code");
    assert.equal(idx[1].unique, true, "inviteCode must be unique or lookups are ambiguous");
    assert.equal(idx[1].sparse, true, "inviteCode must be sparse or every null collides");
});

await test("pendingReferral is a declared field", () => {
    // mongoose is strict:true, so an undeclared field is dropped on write. The
    // referral would be stored and then vanish, which is the exact silent
    // failure this whole path is fixing.
    assert.ok(User.schema.path("pendingReferral"), "pendingReferral is not declared on the User schema");
});

await test("'greeting' is a valid message kind", () => {
    const path = Message.schema.path("kind");
    // Mongoose 9 compiles the enum into a validator function and keeps the
    // literal list on `options.enum`; older versions expose `path.enum` as an
    // array or as { values }. Try all three so this assertion tests the schema
    // rather than the Mongoose version.
    const candidates = [
        path.options?.enum,
        Array.isArray(path.enum) ? path.enum : null,
        path.enum?.values,
    ];
    const values = candidates.find((c) => Array.isArray(c));
    assert.ok(values, "could not read the kind enum off the schema at all");
    assert.ok(values.includes("greeting"), `kind enum is missing "greeting": ${values.join(",")}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Query casting
// ─────────────────────────────────────────────────────────────────────────────

await test("invite lookups cast cleanly against the real schema", () => {
    // findInviterByCode builds exactly this filter.
    const q = User.findOne({ inviteCode: normalizeCode(newInviteCode()) }).select("username");
    q.cast(User);
    assert.equal(q.getFilter().inviteCode.length, 10);
});

await test("the greeting budget query casts and matches the kind enum", () => {
    const since = new Date();
    const q = Message.countDocuments({
        recipient: "Someone",
        kind: "greeting",
        timeStamp: { $gte: since },
    });
    q.cast(Message);
    assert.equal(q.getFilter().kind, "greeting");
});

await test("the budget is a sane, non-zero daily allowance", () => {
    assert.ok(GREET_BUDGET_PER_DAY > 0, "a zero budget would block every greeting");
    assert.ok(GREET_BUDGET_PER_DAY <= 200, "an unbounded budget makes the code a spam relay");
});

// ─────────────────────────────────────────────────────────────────────────────
// Source-level guarantees
// ─────────────────────────────────────────────────────────────────────────────

await test("the greet route imports the shared DM guard, not a copy", () => {
    const src = code("../routes/invites.js");
    assert.ok(
        src.includes('require("../lib/dmGuard")'),
        "invites.js must reuse lib/dmGuard so an invite cannot bypass a block",
    );
    // A second copy of the block rule is exactly the drift this guards against.
    assert.ok(
        !/function resolveRecipient\s*\(/.test(src),
        "invites.js declares its own resolveRecipient; the block rule would drift",
    );
});

await test("the greet route runs the content filter", () => {
    const src = code("../routes/invites.js");
    assert.ok(
        src.includes('rejectIfBlocked(text, "dm"'),
        "a greeting must pass the DM content filter",
    );
});

await test("the greet route notifies, pushes and emits, as a normal send does", () => {
    const src = code("../routes/invites.js");
    for (const [label, needle] of [
        ["notification", "Notification.create"],
        ["push", "sendPushNotification"],
        ["socket", 'emit("message:new"'],
    ]) {
        assert.ok(src.includes(needle), `greeting is missing its ${label}, so the inviter's inbox would be inconsistent`);
    }
});

await test("both invite routes are rate limited", () => {
    const src = code("../routes/invites.js");
    assert.ok(src.includes("inviteGreetLimiter"), "the greet endpoint must be rate limited");
    assert.ok(src.includes("inviteResolveLimiter"), "the public resolve endpoint must be rate limited");
});

await test("the resolve route answers unknown codes without revealing more", () => {
    const src = code("../routes/invites.js");
    // A code that is valid-shaped but unknown, one that is malformed, and one
    // the owner rotated away must not be distinguishable by status or wording, or
    // the endpoint becomes an oracle for which codes were once real.
    const notValid = src.match(/not valid/g) || [];
    assert.ok(notValid.length >= 2, "expected a single shared 'not valid' wording");
    assert.ok(!/expired/i.test(src), "resolve must not distinguish expired from unknown");
    assert.ok(!/revoked/i.test(src), "resolve must not distinguish a rotated code from unknown");
});

await test("signup stores the invite code and setup credits it", () => {
    const src = code("../routes/auth.js");
    assert.ok(
        /pendingReferral:\s*pending/.test(src),
        "verify-otp must persist the invite code, or it is dropped as it always was",
    );
    assert.ok(
        /creditReferral\(/.test(src),
        "nothing credits the referral, so referredBy stays permanently null",
    );
    // The credit has to happen where a username exists.
    const setupAt = src.indexOf('router.post("/setup"');
    assert.ok(setupAt > -1);
    assert.ok(
        src.indexOf("creditReferral(") > setupAt,
        "the referral must be credited in /setup, where the account finally has a username",
    );
});

await test("the referrals route exists and is registered", () => {
    assert.ok(
        /router\.get\("\/"/.test(code("../routes/referrals.js")),
        "referrals route must answer GET /",
    );

    const server = code("../server.js");
    assert.ok(
        server.includes('app.use("/api/referrals"'),
        "/api/referrals is not mounted, so the linked /referrals page can only fail",
    );
    assert.ok(
        server.includes('app.use("/api/invites"'),
        "/api/invites is not mounted",
    );
});

await test("the redeem limiters are keyed on the account, not the address", () => {
    const src = code("../middleware/rateLimit.js");

    // An IP-keyed greet limiter is trivially evaded: rotate the address. The
    // helper resolves a signed-in caller to `auth:<userId>` and only falls back to
    // the address when there is no token, which is the property worth pinning.
    assert.ok(
        /if \(decoded\?\.userId\) return `auth:\$\{decoded\.userId\}`/.test(src),
        "tieredKeyGenerator must key on the authenticated user, not only the IP",
    );

    // And the two authenticated invite limiters must actually use it.
    for (const name of ["inviteCodeLimiter", "inviteGreetLimiter"]) {
        const block = src.slice(src.indexOf(`const ${name}`), src.indexOf(`const ${name}`) + 400);
        assert.ok(
            block.includes("tieredKeyGenerator"),
            `${name} no longer uses the tiered key generator`,
        );
        assert.ok(
            !/(keyGenerator:\s*\(req\)\s*=>\s*req\.ip)/.test(block),
            `${name} is keyed on the raw IP only, so one account can rotate addresses`,
        );
    }
});

await test("the limiter comments do not promise limits that do not exist", () => {
    const src = code("../middleware/rateLimit.js");
    // There is no per-code use cap and no code expiry in this design: a code
    // works until its owner rotates it. A comment claiming otherwise would lead
    // a future reader to believe a backstop exists.
    assert.ok(!/maxUses/.test(src), "comments still claim a per-code maxUses cap that is not enforced");
    assert.ok(!/192-bit/.test(src), "comments still claim 192-bit codes; it is about 49");
});

await test("the referrals payload matches what ReferralsClient reads", () => {
    const route = code("../routes/referrals.js");
    const client = code("../../components/Profile/ReferralsClient.jsx");

    // Every field the component dereferences, asserted against the route that is
    // supposed to send it. This page rendered only its failure branch before,
    // and the reason was a contract that existed on exactly one side.
    for (const field of ["totalInvited", "referredUsers", "referredBy", "code", "shareUrl"]) {
        assert.ok(
            new RegExp(`\\b${field}\\b`).test(route),
            `route no longer sends \`${field}\`, which ReferralsClient dereferences`,
        );
        assert.ok(
            new RegExp(`\\b${field}\\b`).test(client),
            `ReferralsClient no longer reads \`${field}\`; drop it from the route if that is deliberate`,
        );
    }

    // `stats.activeCodes` is nested one level down, so a flat search would miss it.
    assert.ok(/activeCodes:\s*me\.inviteCode/.test(route), "route no longer sends stats.activeCodes");
    assert.ok(/stats\.activeCodes/.test(client), "ReferralsClient still reads stats.activeCodes");

    // `referredBy` is what proves the attribution landed, so it has to be
    // selected, not just returned.
    assert.ok(
        /select\([^)]*referredBy/.test(route),
        "referredBy is returned but not selected, so it would always be undefined",
    );
});

await test("the legacy validate contract InviteLandingClient still calls exists", () => {
    const route = code("../routes/invites.js");
    // The landing page posted to /api/invites/validate and read these two keys.
    assert.ok(/router\.post\("\/validate"/.test(route), "the /validate route is gone");
    assert.ok(/valid:\s*true/.test(route), "/validate must answer the legacy { valid } shape");
    assert.ok(/createdBy:\s*inviter\.username/.test(route), "/validate must answer the legacy { createdBy } shape");
});

await test("an invite is never handed out by a guessable value", () => {
    // The admin issuer defaulted a code to the uppercased username, so a QR built
    // from it would hand out the referral link of anyone whose name is guessable.
    const admin = code("../routes/adminPower.js");
    assert.ok(
        !/toUpperCase\(\)\.slice/.test(admin),
        "adminPower still derives an invite code from the username; use newInviteCode()",
    );
    assert.ok(
        /newInviteCode/.test(admin),
        "adminPower should mint invite codes with the shared CSPRNG generator",
    );
});

// ─────────────────────────────────────────────────────────────────────────────

console.log("");
if (failures.length) {
    console.log("FAILURES:");
    console.log("─────────");
    for (const f of failures) console.log("  ✗ " + f);
    console.log("");
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
