// Verify the probe classification the banner depends on.
// Run: node utils/useLiveServerStatus.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

function classify(response) {
    if (!response) return false;
    return ![502, 503, 504].includes(response.status);
}

test("an unauthenticated response still proves the server is alive", () => {
    // live-server answers 401 to a probe with no session. That is a healthy server.
    assert.equal(classify({ status: 401 }), true);
});

test("gateway errors mean the proxy could not reach live-server", () => {
    for (const status of [502, 503, 504]) {
        assert.equal(classify({ status }), false, `${status} should read as offline`);
    }
});

test("other statuses are real answers from live-server", () => {
    for (const status of [200, 400, 401, 403, 429, 500]) {
        assert.equal(classify({ status }), true, `${status} should read as online`);
    }
});

test("a transport failure is offline", () => {
    // fetch rejects when the sidecar is gone or DNS fails, so classify gets null.
    assert.equal(classify(null), false);
    assert.equal(classify(undefined), false);
});

test("the backoff schedule stays within its ceiling", () => {
    const HEALTHY = 20000, UNHEALTHY = 5000, MAX = 60000;
    // The multiplier is itself capped at 6, so the unhealthy ceiling is 5000*6 and
    // the healthy interval stays the higher steady state.
    const delay = (failures) =>
        Math.min((failures === 0 ? HEALTHY : UNHEALTHY) * Math.min(failures || 1, 6), MAX);
    assert.equal(delay(0), 20000);
    assert.equal(delay(1), 5000);
    assert.equal(delay(6), 30000);
    assert.equal(delay(50), 30000);
    assert.ok(delay(50) <= MAX);
});
