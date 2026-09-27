/**
 * Tests for the per-game schema map and the new admin routers' pure logic.
 *
 * The map in lib/gameSchemas.js exists because the eight game models disagree
 * about everything. These tests pin each disagreement to the actual schema, so
 * if a model is changed the map fails loudly rather than silently producing
 * zeroed analytics.
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

const { GAMES, GAME_KEYS, pick, moveLength, statusIsTerminal } = require("./gameSchemas.js");

const modelFile = (key) => join(HERE, "..", "models", `${GAMES[key].model}.js`);
const readModel = (key) => readFileSync(modelFile(key), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The map must agree with the schemas, verified by reading them.
// ─────────────────────────────────────────────────────────────────────────────
await test("every game in the map has a real model file", () => {
    assert.equal(GAME_KEYS.length, 8, "expected 8 games");
    for (const key of GAME_KEYS) {
        const src = readModel(key);
        assert.ok(src.length > 0, `${key} model file missing`);
    }
});

await test("hasCreatedAt matches the model", () => {
    for (const key of GAME_KEYS) {
        const has = /createdAt/.test(readModel(key));
        assert.equal(
            GAMES[key].hasCreatedAt,
            has,
            `${key}: map says hasCreatedAt=${GAMES[key].hasCreatedAt} but the model ${has ? "has" : "lacks"} a createdAt field`
        );
    }
});

await test("moveField exists on the model with the declared type", () => {
    for (const key of GAME_KEYS) {
        const src = readModel(key);
        const field = GAMES[key].moveField;
        const isArrayField = field === "moves" || field === "reactions";
        const re = new RegExp(`^\\s{4}${field}:\\s*\\{[^}]*type:\\s*\\[`, "m");
        const reNum = new RegExp(`^\\s{4}${field}:\\s*\\{[^}]*type:\\s*Number`, "m");
        if (isArrayField) {
            assert.ok(re.test(src), `${key}: expected ${field} to be an array-typed field`);
            assert.equal(GAMES[key].moveField === "reactions" || GAMES[key].moveField === "moves", true);
        } else {
            assert.ok(reNum.test(src), `${key}: expected ${field} to be a Number field`);
        }
    }
});

await test("declared player slots exist on the model", () => {
    for (const key of GAME_KEYS) {
        const src = readModel(key);
        for (const slot of GAMES[key].playerSlots) {
            const [player] = slot.split(".");
            // Two declaration styles are in use: an inline object literal, and a
            // shared sub-schema (`red: playerSchema`). Both declare the path, so
            // both must be accepted.
            const declared = new RegExp(`^\\s{4}${player}:\\s*(\\{|\\w+Schema\\b)`, "m");
            assert.ok(declared.test(src), `${key}: player slot "${player}" is not a field on the model`);
            assert.ok(src.includes("username:"), `${key}: "${player}" has no username field`);
        }
    }
});

await test("battleship is the only game with no player slots", () => {
    const noSlots = GAME_KEYS.filter((k) => GAMES[k].playerSlots.length === 0);
    assert.deepEqual(noSlots, ["battleship"], "a new model may need a player slot added to the map");
});

// ─────────────────────────────────────────────────────────────────────────────
// moveLength: "unknown" must be distinguishable from zero.
// ─────────────────────────────────────────────────────────────────────────────
await test("moveLength handles array fields", () => {
    assert.equal(moveLength({ moves: [1, 2, 3] }, "moves"), 3);
    assert.equal(moveLength({ moves: [] }, "moves"), 0);
    assert.equal(moveLength({ moves: null }, "moves"), null);
    assert.equal(moveLength({}, "moves"), null);
});

await test("moveLength handles number fields", () => {
    assert.equal(moveLength({ moveCount: 12 }, "moveCount"), 12);
    assert.equal(moveLength({ moveCount: 0 }, "moveCount"), 0);
    assert.equal(moveLength({ moveCount: undefined }, "moveCount"), null);
    assert.equal(moveLength({ moveCount: "8" }, "moveCount"), null, "a string must not be silently coerced");
});

await test("moveLength tolerates a number written into an array field", () => {
    // A route updating `moves` with a count instead of an array should still
    // yield a number rather than null.
    assert.equal(moveLength({ moves: 7 }, "moves"), 7);
});

await test("moveLength on a missing document is null", () => {
    assert.equal(moveLength(null, "moves"), null);
    assert.equal(moveLength(undefined, "moveCount"), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// pick: dotted access with safe missing hops.
// ─────────────────────────────────────────────────────────────────────────────
await test("pick reads dotted paths", () => {
    assert.equal(pick({ white: { username: "ana" } }, "white.username"), "ana");
    assert.equal(pick({ players: [{ username: "a" }] }, "players.username"), undefined);
});
await test("pick returns undefined for missing hops instead of throwing", () => {
    assert.equal(pick({}, "white.username"), undefined);
    assert.equal(pick({ white: null }, "white.username"), undefined);
    assert.equal(pick(null, "white.username"), undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Terminal statuses. The whole point: "finished" is not one value.
// ─────────────────────────────────────────────────────────────────────────────
await test("chess finishes with checkmate, not 'win'", () => {
    assert.equal(statusIsTerminal("checkmate", GAMES.chess.terminal), true);
    assert.equal(statusIsTerminal("stalemate", GAMES.chess.terminal), true);
    assert.equal(statusIsTerminal("win", GAMES.chess.terminal), false, "chess never uses 'win'");
    assert.equal(statusIsTerminal("finished", GAMES.chess.terminal), false);
    assert.equal(statusIsTerminal("active", GAMES.chess.terminal), false);
    assert.equal(statusIsTerminal("waiting", GAMES.chess.terminal), false);
});

await test("checkers finishes with 'win'", () => {
    assert.equal(statusIsTerminal("win", GAMES.checkers.terminal), true);
    assert.equal(statusIsTerminal("checkmate", GAMES.checkers.terminal), false);
});

await test("reactionduel finishes with 'finished'", () => {
    assert.equal(statusIsTerminal("finished", GAMES.reactionduel.terminal), true);
    assert.equal(statusIsTerminal("win", GAMES.reactionduel.terminal), false);
});

await test("status matching is case-insensitive and null-safe", () => {
    assert.equal(statusIsTerminal("CHECKMATE", GAMES.chess.terminal), true);
    assert.equal(statusIsTerminal("Checkmate", GAMES.chess.terminal), true);
    assert.equal(statusIsTerminal(null, GAMES.chess.terminal), false);
    assert.equal(statusIsTerminal(undefined, GAMES.chess.terminal), false);
    assert.equal(statusIsTerminal("", GAMES.chess.terminal), false);
});

await test("terminal sets only contain statuses the model will accept", () => {
    // A status outside a model's enum is rejected by mongoose on save, so
    // listing it as terminal makes the analytics and the stuck-game cleanup
    // search for documents that can never exist.
    for (const key of GAME_KEYS) {
        const src = readModel(key);
        const block = src.match(/status:\s*\{[\s\S]*?enum:\s*\[([^\]]*)\]/);
        if (!block) continue; // free-string status, nothing to check
        const allowed = block[1].split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean);
        for (const status of GAMES[key].terminal) {
            assert.ok(
                allowed.includes(status),
                `${key} lists "${status}" as terminal but the model enum is [${allowed.join(", ")}] — mongoose would reject it`
            );
        }
    }
});

await test("every enum-backed game can mark a game abandoned", () => {
    for (const key of GAME_KEYS) {
        const src = readModel(key);
        const block = src.match(/status:\s*\{[\s\S]*?enum:\s*\[([^\]]*)\]/);
        if (!block) continue;
        const allowed = block[1].split(",").map((s) => s.trim().replace(/["']/g, ""));
        if (!allowed.includes("abandoned")) continue;
        assert.ok(
            GAMES[key].terminal.includes("abandoned"),
            `${key} can be abandoned but does not treat it as terminal`
        );
    }
});

await test("terminal sets do not contain in-progress states", () => {
    for (const key of GAME_KEYS) {
        for (const live of ["active", "waiting"]) {
            assert.ok(
                !GAMES[key].terminal.includes(live),
                `${key} lists "${live}" as terminal`
            );
        }
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// The routers must mount, and must not query a field the schema lacks.
// ─────────────────────────────────────────────────────────────────────────────
await test("all three new routers load without a top-level throw", () => {
    const Module = require("node:module");
    const original = Module.prototype.require;
    Module.prototype.require = function patched(id) {
        if (id === "express") {
            return {
                Router: () => ({ get() {}, post() {}, patch() {}, put() {}, delete() {} }),
                json: () => {},
                static: () => {},
            };
        }
        if (id.includes("middleware/auth")) {
            return { requireAdmin: () => {}, requirePermission: () => () => {}, verifyToken: () => {}, optionalAuth: () => {} };
        }
        return original.apply(this, arguments);
    };
    try {
        for (const r of ["adminGames", "adminInsights", "adminNetwork"]) {
            require(`../routes/${r}.js`);
        }
    } finally {
        Module.prototype.require = original;
    }
});

await test("adminNetwork does not claim to detect follow velocity", () => {
    // Follows carry no timestamp, so a velocity claim would be fabricated data.
    // Comments are stripped first: the file's own disclaimer deliberately names
    // the pattern it cannot detect, which is exactly what should be present.
    const raw = readFileSync(join(HERE, "..", "routes", "adminNetwork.js"), "utf8");
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(/limitation/.test(raw), "the network router must state its velocity limitation");
    assert.ok(
        !/followed.*in.*minutes|followRate|perMinute/i.test(code),
        "the network router must not measure follow rate in code — it is not recorded anywhere"
    );
    assert.ok(
        /no timestamp/i.test(raw),
        "the network router should explain WHY velocity is undetectable"
    );
});

await test("insights only queries fields that exist on User", () => {
    const userSrc = readFileSync(join(HERE, "..", "models", "user.js"), "utf8");
    const insightsSrc = readFileSync(join(HERE, "..", "routes", "adminInsights.js"), "utf8");
    for (const field of ["lastActive", "createdAt", "isOnline", "suspended", "isShadowbanned", "username", "followers", "following"]) {
        assert.ok(userSrc.includes(`${field}:`), `User model has no ${field} field`);
    }
    for (const field of ["lastActive", "createdAt", "isOnline", "suspended", "isShadowbanned"]) {
        assert.ok(insightsSrc.includes(field), `insights router should use ${field}`);
    }
    // A field that does NOT exist, to prove the check is not vacuous.
    assert.ok(!userSrc.includes("published:"), "User model unexpectedly has a published field");
    assert.ok(!insightsSrc.includes("published:"), "insights router must not query a non-existent field");
});

// ─────────────────────────────────────────────────────────────────────────────
for (const f of failures) console.log("FAIL  " + f);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.log("\nGAME SCHEMA + ADMIN ANALYTICS TESTS FAILED");
    process.exit(1);
}
console.log("ALL GAME SCHEMA + ADMIN ANALYTICS TESTS PASS");
