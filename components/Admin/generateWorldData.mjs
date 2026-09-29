// Regenerates components/Admin/worldData.js from a Natural Earth TopoJSON.
//
//   node components/Admin/generateWorldData.mjs
//
// WHY THIS EXISTS: worldData.js used to be a bare array of coastline rings with
// the country identity thrown away, so the globe could draw the shape of the
// world but could never say what any of it was called, and could not tell a
// country that had visitors from one that did not. Everything the map now shows
// — country names, borders, the highlight on countries with traffic — needs to
// know which ring belongs to which country, so that is what this emits.
//
// Input:  world-atlas countries-110m.json (Natural Earth 110m, public domain).
//         Its geometries carry a numeric ISO 3166-1 id; the app's geo lookups
//         produce alpha-2 ("PK"), so a numeric -> alpha-2 table joins them.
//
// Output: one entry per country — { iso2, name, label: [lon, lat], rings } —
//         where `label` is a point guaranteed to be inside the country, used to
//         print its name on the globe.
//
// Run offline: the two inputs are fetched once and cached next to this file.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOPO = join(HERE, "worldData.topo.json");
const ISO = join(HERE, "worldData.iso.json");
const OUT = join(HERE, "worldData.js");

// Natural Earth 110m, public domain.
const TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
// ISO 3166-1 numeric -> alpha-2, so a country can be joined to the alpha-2 code
// the geo provider returns.
const ISO_URL = "https://raw.githubusercontent.com/mledoze/countries/master/countries.json";

// Rings smaller than this (in square degrees) are dropped: at globe scale they
// are sub-pixel, and there are thousands of them.
const MIN_RING_AREA = 0.02;
// Coordinates are rounded to this many decimals. 110m source data is already
// coarse, so this costs no visible detail and roughly halves the file.
const PRECISION = 2;

const round = (n) => Number(n.toFixed(PRECISION));

// ── TopoJSON decoding ──────────────────────────────────────────────────────
// The format is small enough to decode here rather than take a dependency:
// coordinates are quantised to integers, delta-encoded along each arc, and
// scaled back into degrees by a single transform.
function decodeArcs(topology) {
    const [sx, sy] = topology.transform.scale;
    const [tx, ty] = topology.transform.translate;
    return topology.arcs.map((arc) => {
        let x = 0;
        let y = 0;
        return arc.map(([dx, dy]) => {
            x += dx;
            y += dy;
            return [x * sx + tx, y * sy + ty];
        });
    });
}

// An arc index is a reference into the shared arc list; a negative index means
// "traverse this arc backwards" (bitwise complement of the real index).
function arcPoints(index, arcs) {
    const reversed = index < 0;
    const arc = arcs[reversed ? ~index : index];
    return reversed ? [...arc].reverse() : arc;
}

// Stitch a ring's arc references into one closed loop. Consecutive arcs share
// an endpoint, so the duplicate is dropped rather than left as a zero-length
// segment.
function ringFromArcs(indexes, arcs) {
    const ring = [];
    for (const index of indexes) {
        for (const point of arcPoints(index, arcs)) {
            const last = ring[ring.length - 1];
            if (last && Math.abs(last[0] - point[0]) < 1e-9 && Math.abs(last[1] - point[1]) < 1e-9) continue;
            ring.push(point);
        }
    }
    if (ring.length > 1) {
        const [fx, fy] = ring[0];
        const [lx, ly] = ring[ring.length - 1];
        if (Math.abs(fx - lx) > 1e-9 || Math.abs(fy - ly) > 1e-9) ring.push([fx, fy]);
    }
    return ring;
}

function polygonsOf(geometry, arcs) {
    if (geometry.type === "Polygon") return [geometry.arcs];
    if (geometry.type === "MultiPolygon") return geometry.arcs;
    return [];
}

// ── geometry helpers ───────────────────────────────────────────────────────
function signedArea(ring) {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
    }
    return a / 2;
}

// A label anchor guaranteed to be inside the country.
//
// The obvious choice — the polygon's centroid — is wrong for most of the
// countries people actually look at: Norway, Italy, Chile, the Philippines and
// Croatia are crescents or archipelagos whose centroid lands in the sea or in
// the neighbouring country, so the name would be printed somewhere else
// entirely.
//
// Instead, scan the polygon horizontally and take the midpoint of its widest
// interior row. That is always inside, and it lands on the fat part of the
// shape, which is where a cartographer would put the name.
function labelAnchor(ring) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of ring) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minY) || maxY - minY < 1e-6) {
        const [x, y] = ring[0] || [0, 0];
        return [round(x), round(y)];
    }

    const rows = 160;
    let best = null;
    for (let i = 0; i <= rows; i++) {
        const y = minY + ((maxY - minY) * i) / rows;
        // Every edge crossing this scanline contributes an x.
        const xs = [];
        for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
            const [x1, y1] = ring[b];
            const [x2, y2] = ring[a];
            if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
        }
        if (xs.length < 2) continue;
        xs.sort((m, n) => m - n);
        // Widest gap is the widest interior span (pairs are inside/outside).
        let width = 0;
        let mid = 0;
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const w = xs[k + 1] - xs[k];
            if (w > width) {
                width = w;
                mid = (xs[k] + xs[k + 1]) / 2;
            }
        }
        if (width > 0 && (!best || width > best.width)) best = { width, mid, y };
    }
    if (!best) {
        const [x, y] = ring[0];
        return [round(x), round(y)];
    }
    return [round(best.mid), round(best.y)];
}

// ── build ──────────────────────────────────────────────────────────────────
const topology = JSON.parse(readFileSync(TOPO, "utf8"));
const isoList = JSON.parse(readFileSync(ISO, "utf8"));
const arcs = decodeArcs(topology);

const alpha2ByNumeric = new Map();
for (const row of isoList) {
    const numeric = String(row.n ?? "").padStart(3, "0");
    if (numeric !== "000" && row.a2) alpha2ByNumeric.set(numeric, row.a2);
}

const countries = [];
const skipped = [];

for (const geometry of topology.objects.countries.geometries) {
    const iso2 = alpha2ByNumeric.get(String(geometry.id ?? "").padStart(3, "0"));
    const name = geometry.properties?.name || iso2 || "Unknown";

    const rings = [];
    for (const polygon of polygonsOf(geometry, arcs)) {
        for (let i = 0; i < polygon.length; i++) {
            const ring = ringFromArcs(polygon[i], arcs);
            if (ring.length < 4) continue;
            // Holes (interior rings) are not drawn; at globe scale they are
            // invisible and skipping them keeps enclaves from punching holes.
            if (i > 0) continue;
            if (Math.abs(signedArea(ring)) < MIN_RING_AREA) continue;
            rings.push(ring.map(([x, y]) => [round(x), round(y)]));
        }
    }
    if (!rings.length) {
        skipped.push(`${name} (${iso2 || geometry.id})`);
        continue;
    }

    // Label off the biggest ring: it is the mainland, and its interior is the
    // part of the country a reader will recognise.
    const main = rings.reduce((best, r) => (Math.abs(signedArea(r)) > Math.abs(signedArea(best)) ? r : best), rings[0]);

    countries.push({
        iso2: iso2 || "",
        name,
        label: labelAnchor(main),
        rings,
    });
}

countries.sort((a, b) => a.name.localeCompare(b.name));

const body = countries
    .map((c) => `    { iso2: ${JSON.stringify(c.iso2)}, name: ${JSON.stringify(c.name)}, ` +
        `label: [${c.label[0]},${c.label[1]}], rings: ${JSON.stringify(c.rings)} }`)
    .join(",\n");

const out = `// AUTO-GENERATED — do not edit by hand.
// Natural Earth 110m country boundaries (public domain) via world-atlas, joined
// to ISO 3166-1 alpha-2 so a ring can be matched against the countryCode the
// geo provider returns, and reduced to a label point per country.
//
// Regenerate:  node components/Admin/generateWorldData.mjs
//
// ${countries.length} countries. Each entry keeps the country rings (so the map has
// shapes and borders) plus a \`label\` point that is guaranteed to fall inside
// that country, so a name can be printed on the map even where the country's
// shape is a crescent or an archipelago and its centroid is out at sea.
const WORLD_COUNTRIES = [
${body}
];

export default WORLD_COUNTRIES;
`;

writeFileSync(OUT, out, "utf8");

const totalRings = countries.reduce((n, c) => n + c.rings.length, 0);
const totalPoints = countries.reduce((n, c) => n + c.rings.reduce((m, r) => m + r.length, 0), 0);
console.log(`wrote ${OUT}`);
console.log(`  countries : ${countries.length}`);
console.log(`  rings     : ${totalRings}`);
console.log(`  points    : ${totalPoints}`);
console.log(`  unmapped  : ${countries.filter((c) => !c.iso2).map((c) => c.name).join(", ") || "none"}`);
if (skipped.length) console.log(`  skipped   : ${skipped.join(", ")}`);
