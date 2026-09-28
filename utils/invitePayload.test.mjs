/**
 * Tests for utils/invitePayload.mjs — the client half of the invite code
 * contract. `live-server/lib/invites.test.mjs` covers the server half; the two
 * alphabets have to agree, and these tests pin that down.
 */
import assert from "node:assert/strict";
import { CODE_LENGTH, extractInviteCode, normalizeCode } from "./invitePayload.mjs";

let passed = 0;
const failures = [];

async function test(name, fn) {
    try {
        await fn();
        passed++;
    } catch (err) {
        failures.push({ name, message: err.message });
    }
}

const CODE = "7KQR3M9X2P";

await test("a bare code is accepted", () => {
    assert.equal(extractInviteCode(CODE), CODE);
});

await test("case and surrounding whitespace do not matter", () => {
    assert.equal(extractInviteCode(`  ${CODE.toLowerCase()}  `), CODE);
    assert.equal(extractInviteCode(`\n${CODE}\t`), CODE);
});

await test("an invite path is accepted, relative or absolute", () => {
    assert.equal(extractInviteCode(`/invite/${CODE}`), CODE);
    assert.equal(extractInviteCode(`https://anontweet.duckdns.org/invite/${CODE}`), CODE);
    assert.equal(extractInviteCode(`http://localhost:3000/invite/${CODE}`), CODE);
});

await test("query strings and fragments are ignored", () => {
    assert.equal(extractInviteCode(`/invite/${CODE}?ref=qr&utm=x`), CODE);
    assert.equal(extractInviteCode(`https://host/invite/${CODE}#top`), CODE);
    assert.equal(extractInviteCode(`/invite/${CODE}/?ref=1`), CODE);
});

await test("the host in a scanned URL is ignored, not trusted", () => {
    // The code is the only thing that survives parsing. Nothing here can send a
    // user anywhere, which is the property that makes a hostile QR harmless.
    assert.equal(extractInviteCode(`https://evil.example/invite/${CODE}`), CODE);
});

await test("a URL that is not an invite link is rejected", () => {
    assert.equal(extractInviteCode("https://evil.example/pwn"), null);
    assert.equal(extractInviteCode("https://evil.example/invite"), null);
    assert.equal(extractInviteCode("https://evil.example/settings/7KQR3M9X2P"), null);
});

await test("ambiguous glyphs are rejected rather than guessed", () => {
    // I, L, O, U, 0 and 1 are not in the alphabet. A scan that produced one is
    // not near-miss-corrected here, because "correcting" it would let any
    // string near a real code resolve to it.
    for (const bad of ["0KQR3M9X2P", "1KQR3M9X2P", "IKQR3M9X2P", "LKQR3M9X2P", "OKQR3M9X2P", "UKQR3M9X2P"]) {
        assert.equal(extractInviteCode(bad), null, `${bad} should be rejected`);
    }
});

await test("wrong length is rejected", () => {
    assert.equal(extractInviteCode(CODE.slice(0, CODE_LENGTH - 1)), null);
    assert.equal(extractInviteCode(`${CODE}X`), null);
});

await test("empty and absent input are rejected", () => {
    for (const bad of ["", "   ", null, undefined, 0, {}]) {
        assert.equal(extractInviteCode(bad), null, `${String(bad)} should be rejected`);
    }
});

await test("the code length is the agreed one", () => {
    assert.equal(CODE.length, CODE_LENGTH);
});

await test("normalizeCode agrees with extractInviteCode", () => {
    assert.equal(normalizeCode(CODE), CODE);
    assert.equal(normalizeCode("nope"), null);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
    console.log("\n─────────\n");
    for (const f of failures) console.log(`  ✗ ${f.name}\n     ${f.message}\n`);
    process.exit(1);
}
console.log("ALL INVITE PAYLOAD TESTS PASS");
