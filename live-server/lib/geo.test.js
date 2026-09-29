// Verifies live-server/lib/geo.js: the provider-failure classification and the
// circuit breaker.
//
// This is the logic behind "the globe shows 500 events but the total says 2,000".
// Every failed lookup is stored as an event with an empty country and nothing
// ever reported the failure, so a throttled provider was indistinguishable from
// a provider that simply had no answer. These tests pin down that a 429 is
// recognised as a 429, and — the part that actually saves the quota — that
// repeated failures stop outbound calls instead of just recording them.
const geo = require("./geo");

let failures = 0;
function check(label, cond, extra = "") {
    if (!cond) failures++;
    console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
}
function near(a, b) { return Math.abs(a - b) < 0.001; }

// ── fetch doubles ──────────────────────────────────────────────────────────
const realFetch = globalThis.fetch;
let calls = [];
let nextResponse = null;

function stub(handler) {
    calls = [];
    nextResponse = handler;
    globalThis.fetch = (url, opts) => {
        calls.push(String(url));
        return nextResponse(String(url), opts);
    };
}
const okBody = (d) => ({ ok: true, status: 200, json: () => Promise.resolve(d) });
const httpErr = (status) => ({ ok: false, status, json: () => Promise.resolve({}) });
const rejectAs = (name) => () => Promise.reject(Object.assign(new Error("x"), { name }));

const PAYLOAD = {
    status: "success", country: "Pakistan", countryCode: "pk",
    regionName: "Punjab", city: "Lahore", lat: 31.52, lon: 74.36, timezone: "Asia/Karachi",
};

function reset() {
    geo.resetProviderHealth();
    calls = [];
}

(async () => {
    // ── success path ────────────────────────────────────────────────────────
    reset();
    stub(() => Promise.resolve(okBody(PAYLOAD)));
    const hit = await geo.resolveLocation({ ip: "39.32.10.5" });
    check("resolves a country", hit?.location?.countryCode === "PK", hit?.location?.countryCode);
    check("uppercases the code", hit?.location?.countryCode === "PK");
    check("carries city and coords", hit?.location?.city === "Lahore" && near(hit.location.lat, 31.52));
    check("buckets to a /24", hit?.network === "39.32.10.0/24", hit?.network);
    check("records no failure on success", geo.providerHealth().failuresLastHour === 0);

    // ── negative caching: the whole reason the quota survived before ────────
    const firstCalls = calls.length;
    await geo.resolveLocation({ ip: "39.32.10.99" }); // same /24
    check("a second address in the same /24 costs no extra request", calls.length === firstCalls,
        `was ${firstCalls}, now ${calls.length}`);

    // ── failure classification ──────────────────────────────────────────────
    const cases = [
        [httpErr(429), "throttled", "429 is recognised as throttling"],
        [httpErr(500), "http_500", "a 5xx is not mistaken for throttling"],
        [httpErr(404), "http_404", "a 404 is not mistaken for throttling"],
        [rejectAs("AbortError"), "timeout", "an aborted call is a timeout"],
        [rejectAs("TypeError"), "network_error", "a dead socket is a network error"],
        [() => Promise.resolve(okBody({ status: "fail" })), "not_found", "a provider 'fail' is not_found, not an error"],
    ];
    for (const [responder, reason, label] of cases) {
        reset();
        stub(() => (typeof responder === "function" ? responder() : Promise.resolve(responder)));
        // A distinct /24 each time so the negative cache never answers first.
        const res = await geo.resolveLocation({ ip: `8.8.${cases.findIndex((c) => c[1] === reason)}.1.1` });
        const h = geo.providerHealth();
        check(label, res?.location === null || res?.location === undefined, `got ${JSON.stringify(res?.location)}`);
        check(`  ...and is tallied as "${reason}"`, h.failuresByReason[reason] === 1, JSON.stringify(h.failuresByReason));
    }

    // ── the breaker ─────────────────────────────────────────────────────────
    // This is the behaviour that actually protects the quota: after a burst of
    // refusals the module stops asking, rather than keeping knocking on a
    // provider that has already said no and negative-caching every attempt.
    // Each address gets its own /24 so the negative cache never answers first,
    // and all of them are public — a private range would be rejected by
    // isRoutable before the breaker was ever consulted.
    reset();
    stub(() => Promise.resolve(httpErr(429)));
    for (let i = 0; i < 8; i++) {
        await geo.resolveLocation({ ip: `45.${i}.0.1` });
    }
    const askedWhileOpen = calls.length;
    check("breaker opens after a burst of refusals", geo.providerHealth().breakerOpen === true,
        `asked ${askedWhileOpen} times`);
    await geo.resolveLocation({ ip: "203.0.113.9" });
    check("an open breaker makes NO further provider calls", calls.length === askedWhileOpen,
        `asked ${askedWhileOpen}, then ${calls.length - askedWhileOpen} more`);

    // A subscriber record is a different question and must not be sacrificed to
    // the aggregate globe's breaker.
    stub(() => Promise.resolve(httpErr(429)));
    const before = calls.length;
    await geo.resolveLocation({ ip: "198.51.100.7" }, { precise: true });
    check("precise lookups ignore the breaker", calls.length === before + 1,
        `asked ${calls.length - before} more`);

    // A success clears the streak, so one flaky call cannot latch the breaker.
    reset();
    let flaky = 0;
    stub(() => (++flaky % 2 === 0
        ? Promise.resolve(okBody(PAYLOAD))
        : Promise.resolve(httpErr(429))));
    for (let i = 0; i < 20; i++) {
        await geo.resolveLocation({ ip: `46.${i}.0.1` });
    }
    check("alternating success/failure never opens the breaker", geo.providerHealth().breakerOpen === false,
        `failures=${geo.providerHealth().failuresLastHour}`);
    check("...but the failures are still counted", geo.providerHealth().failuresLastHour === 10,
        `${geo.providerHealth().failuresLastHour}`);

    // ── unroutable addresses are never asked about at all ───────────────────
    // Before this guard, private and cloud-metadata ranges each spent a request
    // from the same 45/minute budget and always failed.
    reset();
    stub(() => Promise.resolve(okBody(PAYLOAD)));
    for (const ip of ["192.168.1.5", "10.0.0.1", "127.0.0.1", "169.254.169.254", "100.64.0.1", "172.16.9.9"]) {
        const r = await geo.resolveLocation({ ip });
        check(`${ip} is not sent to the provider`, r?.location == null);
    }
    check("no provider calls were made for unroutable addresses", calls.length === 0, `${calls.length} calls`);

    // ── existing helpers still hold ─────────────────────────────────────────
    check("isRoutable accepts a public address", geo.isRoutable("8.8.8.8") === true);
    check("isRoutable rejects loopback", geo.isRoutable("127.0.0.1") === false);
    check("isRoutable rejects link-local (cloud metadata)", geo.isRoutable("169.254.169.254") === false);
    check("networkKey masks to /24", geo.networkKey("1.2.3.4") === "1.2.3.0/24");
    check("networkKey masks IPv6 to /64", geo.networkKey("2001:db8:1:2::9") === "2001:db8:1:2::/64");

    // ── health reporting leaks nothing ──────────────────────────────────────
    reset();
    stub(() => Promise.resolve(httpErr(429)));
    await geo.resolveLocation({ ip: "9.9.9.1" });
    const health = geo.providerHealth();
    const serialised = JSON.stringify(health);
    check("health reports the provider host", health.provider === "ip-api.com", health.provider);
    check("health counts failures", health.failuresLastHour === 1);
    check("health contains no address", !/\d+\.\d+\.\d+\.\d+/.test(serialised), serialised);

    globalThis.fetch = realFetch;
    console.log(failures === 0 ? "\nALL GEO TESTS PASS" : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
    globalThis.fetch = realFetch;
    console.error("ERROR", e);
    process.exit(1);
});
