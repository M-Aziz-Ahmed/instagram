// Asserts that the globe never blanks itself when you zoom in.
//
// The failure this guards against is silent and was reported as "the globe is
// broken / it doesn't show my users' locations": the zoom-dependent event-count
// floor rises as you zoom, so on a site with a small number of events every
// place fell below it at the region and city thresholds and the map went blank
// at exactly the zoom level a user would use to look for their own town. The
// floor is still applied — it is what stops a busy map becoming confetti — but
// it can no longer remove everything.
//
// Run: node components/Admin/globeVisibility.test.mjs
import {
    MAX_DOTS, MIN_ALWAYS_VISIBLE, Z_CITIES, Z_REGIONS,
    applyVisibilityFloor, floorForZoom, minVisibleCount, placeableCandidates, tierForZoom,
} from "./globeVisibility.js";

let failures = 0;
function check(label, cond, extra = "") {
    if (!cond) failures++;
    console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
}

/** Build `n` places whose counts descend from `top`. */
function places(n, top = 40) {
    return Array.from({ length: n }, (_, i) => ({
        code: `C${i}`, name: `Place ${i}`, count: Math.max(1, top - i), lat: 10 + i * 0.01, lon: 20 + i * 0.01,
    }));
}

// ── the floor really does relax as you zoom in (the design intent) ───────────
check("floor falls as you zoom in", minVisibleCount(6) < minVisibleCount(2));
check("floor never drops below 1", minVisibleCount(1e9) === 1);
check("the region tier opens at a high floor", floorForZoom("region", Z_REGIONS) > 20, `floor ${floorForZoom("region", Z_REGIONS)}`);
check("countries have no floor", floorForZoom("country", 40) === 1);
check("cities do have a floor", floorForZoom("city", 2) > 1);

// ── the regression: a small app must stay visible at every zoom ───────────────
//
// Five users, five places, one event each — the smallest real-world dataset.
// Every zoom level must still show something, or the map reads as broken.
// The interesting values are the tier thresholds themselves, where the floor
// opens highest and the old code blanked the map outright.
for (const z of [0.7, 1, Z_REGIONS, 2, 3, Z_CITIES, 6, 12, 40]) {
    const tier = tierForZoom(z);
    const shown = applyVisibilityFloor(placeableCandidates(places(5, 1)), floorForZoom(tier, z));
    check(`quiet site still draws at zoom ${z} (${tier} tier)`, shown.length === 5, `drew ${shown.length}/5`);
}

// ── the exact dead band that produced the bug report ─────────────────────────
//
// A mid-sized site: 30 regions, none with more than 8 events. The moment the
// tier flips to "region" the floor is ~23, so every one of them is filtered out
// and the globe is empty until the zoom is far enough for the floor to relax.
{
    const regions = Array.from({ length: 30 }, (_, i) => ({
        code: `R${i}`, name: `Region ${i}`, count: 8 - (i % 8), lat: 5 + i * 0.1, lon: 5 + i * 0.1,
    }));
    for (const z of [Z_REGIONS, 1.7, 2, 2.5, 3, 3.5, 4, Z_CITIES - 0.01]) {
        const tier = tierForZoom(z);
        const shown = applyVisibilityFloor(placeableCandidates(regions), floorForZoom(tier, z));
        check(`mid-sized site is not blanked at zoom ${z} (${tier})`, shown.length > 0, `drew ${shown.length}/30`);
    }
}

// A single user in a single city is the floor case of the floor case.
for (const z of [1, Z_REGIONS, Z_CITIES, 40]) {
    const shown = applyVisibilityFloor(placeableCandidates(places(1, 1)), floorForZoom(tierForZoom(z), z));
    check(`single place never vanishes at zoom ${z}`, shown.length === 1);
}

// ── the floor must still do its job on a busy site ───────────────────────────
{
    // 200 places, most with 1-2 events. At the region threshold the floor is
    // ~23, which should cull the long tail but leave the busiest ones.
    const busy = Array.from({ length: 200 }, (_, i) => ({
        code: `C${i}`, name: `Place ${i}`, count: i < 15 ? 60 - i : 1, lat: 5 + i * 0.05, lon: 5 + i * 0.05,
    }));
    const shown = applyVisibilityFloor(placeableCandidates(busy), floorForZoom("region", Z_REGIONS));
    check("busy site is still culled at the region tier", shown.length < 200 && shown.length >= 15, `drew ${shown.length}/200`);
    check("busy site keeps the busiest place", shown[0].pt.count === 60);
    check("busy site drops the 1-event tail", !shown.some((c) => c.pt.count === 1));
}

// ── it can never be empty, whatever the data looks like ──────────────────────
{
    // 500 places all with exactly 1 event, at the region threshold where the
    // floor asks for ~23. A naive filter returns zero.
    const flat = Array.from({ length: 500 }, (_, i) => ({
        code: `C${i}`, name: `Place ${i}`, count: 1, lat: 5 + i * 0.01, lon: 5 + i * 0.01,
    }));
    const shown = applyVisibilityFloor(placeableCandidates(flat), floorForZoom("region", Z_REGIONS));
    check("a flat 500-place tier is not blanked", shown.length > 0, `drew ${shown.length}`);
    check("a flat tier still respects the visible minimum", shown.length >= MIN_ALWAYS_VISIBLE, `drew ${shown.length}`);
}

// ── ordering and cap contracts the draw loop relies on ───────────────────────
{
    const shown = applyVisibilityFloor(placeableCandidates(places(600, 600)), 1);
    check("output is capped at MAX_DOTS", shown.length === MAX_DOTS, `drew ${shown.length}`);
    check("output is busiest-first", shown[0].pt.count >= shown[shown.length - 1].pt.count);
}
{
    // Coordinates that survive a `!= null` filter upstream but cannot be drawn.
    const withJunk = [
        { code: "A", name: "Real", count: 5, lat: 10, lon: 20 },
        { code: "B", name: "String coords", count: 99, lat: "10", lon: "20" },
        { code: "C", name: "Null coords", count: 98, lat: null, lon: null },
        { code: "D", name: "Missing", count: 97 },
    ];
    const cands = placeableCandidates(withJunk);
    check("non-numeric coordinates are excluded", cands.length === 1);
    check("the drawable place is the real one", cands[0].pt.code === "A");
}
{
    check("empty input yields empty output", applyVisibilityFloor([], 1).length === 0);
    check("null input does not throw", applyVisibilityFloor(null, 1).length === 0);
}

// ── tier thresholds are the ones the UI advertises ──────────────────────────
check("country tier below the region threshold", tierForZoom(1) === "country");
check("region tier between the thresholds", tierForZoom(2) === "region");
check("city tier at the city threshold", tierForZoom(Z_CITIES) === "city");

console.log("");
if (failures) {
    console.log(`${failures} GLOBE VISIBILITY TEST(S) FAILED`);
    process.exit(1);
}
console.log("ALL GLOBE VISIBILITY TESTS PASS");
