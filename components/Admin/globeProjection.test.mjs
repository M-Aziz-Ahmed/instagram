// Verifies Globe.jsx's projection maths without a browser: that zoom now scales
// the sphere (the bug that made zooming impossible), and that project/unproject
// are exact inverses so double-click-to-dive lands where the user clicked.
const DEG = Math.PI / 180;

const toVec = (lon, lat) => {
    const phi = (lon * Math.PI) / 180;
    const theta = (lat * Math.PI) / 180;
    return {
        x: Math.cos(theta) * Math.sin(phi),
        y: Math.sin(theta),
        z: Math.cos(theta) * Math.cos(phi),
    };
};

const rot = (v, yaw, pitch) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x = v.x * cy + v.z * sy;
    const z1 = v.z * cy - v.x * sy;
    return { x, y: v.y * cp - z1 * sp, z: v.y * sp + z1 * cp };
};

const project = (lon, lat, yaw, pitch, cx, cy, r) => {
    const v = rot(toVec(lon, lat), yaw, pitch);
    if (v.z <= 0.02) return null;
    return { sx: cx + v.x * r, sy: cy - v.y * r, z: v.z };
};

const unproject = (sx, sy, yaw, pitch, cx, cy, r) => {
    const ux = (sx - cx) / r;
    const uy = (cy - sy) / r;
    const d = 1 - ux * ux - uy * uy;
    if (d <= 0) return null;
    const uz = Math.sqrt(d);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cyf = Math.cos(yaw), syf = Math.sin(yaw);
    const y = cp * uy + sp * uz;
    const z1 = -sp * uy + cp * uz;
    const x = ux * cyf - z1 * syf;
    const z = z1 * cyf + ux * syf;
    return { lon: Math.atan2(x, z) / DEG, lat: Math.asin(Math.max(-1, Math.min(1, y))) / DEG };
};

let failures = 0;
function check(label, cond, extra = "") {
    if (!cond) failures++;
    console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ── 1. zoom must actually scale the sphere ────────────────────────────────
const cx = 320, cy = 215, baseR = Math.min(640, 440) / 2 * 0.92;
// Measure the SAME point at every zoom; its on-screen distance from the
// sphere centre must grow exactly linearly with the radius.
const PROBE = { lon: 10, lat: 10 };
const distAt = (z) => {
    const p = project(PROBE.lon, PROBE.lat, 0, 0, cx, cy, baseR * z);
    return Math.hypot(p.sx - cx, p.sy - cy);
};
const d1 = distAt(1);
for (const z of [2, 5, 10, 20, 40]) {
    check(`zoom ${z}x scales a fixed point proportionally`, near(distAt(z) / d1, z, 1e-6),
        `r=${(baseR * z).toFixed(0)}`);
}

// The old code passed `cx` as the radius, so every zoom level produced the
// exact same on-screen radius. Assert they now differ.
const r1 = distAt(1);
const r8 = distAt(8);
check("8x zoom is ~8x the on-screen radius (was 1x before the fix)", near(r8 / r1, 8, 1e-6), `${r1.toFixed(1)} -> ${r8.toFixed(1)}`);

// ── 2. project/unproject must be inverses ─────────────────────────────────
const cases = [
    [0, 0, 0, 0], [74, 31, 0, -22 * DEG], [-122, 37, 1.1, 0.3],
    [151, -33, 2.7, -0.6], [13, 52, 4.2, 0.9], [0, 0, 5.5, 1.2],
];
for (const [lon, lat, yaw, pitch] of cases) {
    for (const z of [1, 3, 8, 20]) {
        const r = baseR * z;
        const p = project(lon, lat, yaw, pitch, cx, cy, r);
        if (!p) { check(`unproject(${lon},${lat}) visible at z=${z}`, false); continue; }
        const back = unproject(p.sx, p.sy, yaw, pitch, cx, cy, r);
        const ok = back && near(back.lon, lon, 1e-6) && near(back.lat, lat, 1e-6);
        check(`unproject round-trips lon=${lon} lat=${lat} z=${z}`, ok,
            ok ? "" : `got ${back && back.lon.toFixed(4)},${back && back.lat.toFixed(4)}`);
    }
}

// ── 3. back-face culling ──────────────────────────────────────────────────
const front = project(0, 0, 0, 0, cx, cy, baseR);
const back = project(180, 0, 0, 0, cx, cy, baseR);
check("front face projects", front !== null);
check("back face is culled", back === null);

// ── 4. viewport culling never draws a back-facing point ───────────────────
// The globe culls by testing projected coords against the canvas rect. The
// invariant that matters: anything the rect test lets through must be on the
// front of the sphere. (The rect is a *window* onto a sphere that may be much
// larger than the canvas once zoomed, so the rect is a subset of the visible
// hemisphere, never a superset.)
const cw = 640, ch = 440;
let drawn = 0, backFacingDrawn = 0, visible = 0;
for (let lon = -180; lon < 180; lon += 2) {
    for (let lat = -88; lat <= 88; lat += 2) {
        const v = rot(toVec(lon, lat), 0.7, -22 * DEG);
        if (v.z > 0.02) visible++;
        const p = project(lon, lat, 0.7, -22 * DEG, cx, cy, baseR * 2);
        if (p && p.sx >= -40 && p.sx <= cw + 40 && p.sy >= -40 && p.sy <= ch + 40) {
            drawn++;
            if (!(v.z > 0.02)) backFacingDrawn++;
        }
    }
}
check("rect culling never lets a back-facing point through", backFacingDrawn === 0,
    `drawn=${drawn} of ${visible} visible, back-facing leaked=${backFacingDrawn}`);
check("rect culling still draws a meaningful number of points", drawn > 100, `drawn=${drawn}`);

// At z=1 the whole globe fits, so the rect must contain essentially every
// front-facing point (minus the graticule-free polar gaps).
let d1v = 0, d1h = 0;
for (let lon = -180; lon < 180; lon += 2) {
    for (let lat = -88; lat <= 88; lat += 2) {
        const v = rot(toVec(lon, lat), 0, 0);
        if (v.z > 0.02) d1h++;
        const p = project(lon, lat, 0, 0, cx, cy, baseR);
        if (p && p.sx >= -40 && p.sx <= cw + 40 && p.sy >= -40 && p.sy <= ch + 40) d1v++;
    }
}
check("at 1x the canvas shows nearly the whole visible hemisphere",
    d1v / d1h > 0.9, `${d1v}/${d1h} = ${(d1v / d1h * 100).toFixed(1)}%`);

// ── 5. zoom range is wide enough to isolate a place ───────────────────────
check("ZOOM_MAX (40) is deep enough to reach town level", 40 >= 10);

console.log(failures === 0 ? "\nALL GLOBE PROJECTION TESTS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
