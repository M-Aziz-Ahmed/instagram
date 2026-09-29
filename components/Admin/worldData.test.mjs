// Verifies the generated basemap in worldData.js.
//
// The property that matters most is that a country's label anchor is INSIDE that
// country. A label is placed by projecting a single lon/lat onto the globe and
// printing text there, so an anchor in the sea does not produce a slightly
// misplaced label — it produces Pakistan's name floating in the Arabian Sea, or
// Italy's printed over the Adriatic. Natural Earth's own country centroids have
// exactly that problem for every crescent and archipelago, which is why the
// generator computes anchors by scanline instead; this test is what stops that
// from silently regressing.
import WORLD_COUNTRIES from "./worldData.js";

let failures = 0;
function check(label, cond, extra = "") {
    if (!cond) failures++;
    console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
}

// Standard even-odd ray cast. The anchor is compared against every ring of the
// country and must be inside an odd number of them.
function insideRing(ring, x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y)) {
            const t = (y - yi) / (yj - yi);
            if (x < xi + t * (xj - xi)) inside = !inside;
        }
    }
    return inside;
}

function ringArea(ring) {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    return a / 2;
}

function mainRing(c) {
    return c.rings.reduce((best, r) => (Math.abs(ringArea(r)) > Math.abs(ringArea(best)) ? r : best), c.rings[0]);
}

function bbox(ring) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return { minX, maxX, minY, maxY };
}

// ── shape ──────────────────────────────────────────────────────────────────
check("has countries", WORLD_COUNTRIES.length > 150, `${WORLD_COUNTRIES.length}`);

let unclosed = 0, outOfRange = 0, tooShort = 0, nan = 0;
for (const c of WORLD_COUNTRIES) {
    for (const r of c.rings) {
        if (r.length < 4) tooShort++;
        if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) unclosed++;
        for (const [x, y] of r) {
            if (!Number.isFinite(x) || !Number.isFinite(y)) nan++;
            else if (x < -180 || x > 180 || y < -90 || y > 90) outOfRange++;
        }
    }
}
check("every ring is closed", unclosed === 0, `${unclosed} open`);
check("every ring has >= 4 points", tooShort === 0, `${tooShort} degenerate`);
check("every coordinate is finite and in range", nan === 0 && outOfRange === 0, `nan=${nan} outOfRange=${outOfRange}`);

// ── identity ───────────────────────────────────────────────────────────────
// The whole point of regenerating this file: the old one had no country identity
// at all, which is why nothing on the globe could be named or highlighted.
const isos = WORLD_COUNTRIES.map((c) => c.iso2);
check("iso2 codes are unique", new Set(isos.filter(Boolean)).size === isos.filter(Boolean).length);
check("iso2 codes are 2 letters or empty",
    isos.every((v) => v === "" || /^[A-Z]{2}$/.test(v)),
    isos.filter((v) => v && !/^[A-Z]{2}$/.test(v)).join(","));
check("almost every country is ISO-coded (only de-facto states lack a code)",
    isos.filter(Boolean).length >= WORLD_COUNTRIES.length - 4,
    `unmapped: ${WORLD_COUNTRIES.filter((c) => !c.iso2).map((c) => c.name).join(", ") || "none"}`);

// The countries the admin dashboard actually keys on must be present, or their
// traffic dots would sit on a map that cannot show them.
for (const [iso, name] of [["PK", "Pakistan"], ["HK", "Hong Kong"], ["US", "United States"], ["GB", "United Kingdom"]]) {
    const hit = WORLD_COUNTRIES.find((c) => c.iso2 === iso);
    // Hong Kong has no 110m polygon of its own (it is folded into China), so it
    // is expected to be absent from the basemap while still being drawn from the
    // event data. Everything else must resolve.
    if (iso === "HK") {
        check("HK is absent from 110m basemap (known, documented)", hit === undefined);
    } else {
        check(`${iso} present in basemap`, !!hit, hit?.name || "");
        if (hit) check(`${iso} name looks like ${name}`, hit.name.toLowerCase().includes(name.toLowerCase().slice(0, 5)), hit.name);
    }
}

// ── the important one: labels land inside their country ────────────────────
let outside = [];
for (const c of WORLD_COUNTRIES) {
    const [lx, ly] = c.label;
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) { outside.push(`${c.name}(non-finite)`); continue; }
    const hits = c.rings.filter((r) => insideRing(r, lx, ly)).length;
    if (hits % 2 !== 1) outside.push(c.name);
}
check("every label anchor is inside its own country", outside.length === 0,
    outside.length ? outside.join(", ") : "all 177 inside");

// A centroid-based anchor would fail this specific list; these are the shapes
// the generator's scanline exists for.
for (const name of ["Norway", "Italy", "Chile", "Croatia", "Japan", "Greece"]) {
    const c = WORLD_COUNTRIES.find((w) => w.name === name);
    if (!c) { check(`${name} present`, false); continue; }
    const [lx, ly] = c.label;
    const inside = c.rings.filter((r) => insideRing(r, lx, ly)).length % 2 === 1;
    check(`${name} label is inside it (not the centroid in the sea)`, inside, `[${lx}, ${ly}]`);
}

let outsideBox = [];
for (const c of WORLD_COUNTRIES) {
    // Against the MAIN ring, which is the one the anchor was derived from. Using
    // rings[0] here would be wrong for every country whose first ring is a small
    // offshore island (France, Russia, the UK, Indonesia, …).
    const b = bbox(mainRing(c));
    const [lx, ly] = c.label;
    if (lx < b.minX || lx > b.maxX || ly < b.minY || ly > b.maxY) outsideBox.push(c.name);
}
check("every label anchor is within its main ring's bounding box", outsideBox.length === 0,
    outsideBox.join(", "));

// Sanity on actual numbers, so a bad transform in the generator cannot pass on
// geometry alone.
const pk = WORLD_COUNTRIES.find((c) => c.iso2 === "PK");
check("Pakistan's label is in Pakistan, not the Arabian Sea",
    pk && pk.label[0] > 60 && pk.label[0] < 78 && pk.label[1] > 23 && pk.label[1] < 37,
    pk ? `[${pk.label}]` : "missing");
const br = WORLD_COUNTRIES.find((c) => c.iso2 === "BR");
check("Brazil's label is inside Brazil",
    br && br.label[0] > -74 && br.label[0] < -34 && br.label[1] > -34 && br.label[1] < 6,
    br ? `[${br.label}]` : "missing");

console.log(failures === 0 ? "\nALL WORLD DATA TESTS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
