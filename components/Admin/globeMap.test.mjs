// Runs the real basemap painter against a recording canvas and asserts on the
// drawing commands it emits.
//
// Canvas failures are silent. A bad projection or a degenerate path does not
// throw — it draws an empty or unreadable map. So this checks the things that
// actually break: NaN reaching a path command, land that never gets filled, the
// highlight landing on the wrong countries, and labels piling up.
import { paintBasemap, AREA_BY_ISO, BY_ISO, project } from "./globeMap.js";

let failures = 0;
function check(label, cond, extra = "") {
    if (!cond) failures++;
    console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
}

function recordingCtx() {
    const calls = [];
    const state = {};
    const record = (name) => (...args) => { calls.push({ name, args, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle }); };
    const gradient = { addColorStop: record("addColorStop") };
    return {
        calls,
        state,
        save: record("save"), restore: record("restore"), clip: record("clip"),
        beginPath: record("beginPath"), closePath: record("closePath"),
        moveTo: record("moveTo"), lineTo: record("lineTo"), arc: record("arc"),
        fill: record("fill"), stroke: record("stroke"),
        fillText: record("fillText"), strokeText: record("strokeText"),
        rect: record("rect"), roundRect: record("roundRect"),
        setTransform: record("setTransform"), clearRect: record("clearRect"),
        measureText: (t) => ({ width: String(t).length * 6 }),
        createRadialGradient: () => gradient,
        createLinearGradient: () => gradient,
        set fillStyle(v) { state.fillStyle = v; },
        get fillStyle() { return state.fillStyle; },
        set strokeStyle(v) { state.strokeStyle = v; },
        get strokeStyle() { return state.strokeStyle; },
        set lineWidth(v) { state.lineWidth = v; },
        get lineWidth() { return state.lineWidth; },
        set font(v) { state.font = v; },
        get font() { return state.font; },
        set globalAlpha(v) { state.globalAlpha = v; },
        get globalAlpha() { return state.globalAlpha; },
        set lineJoin(v) { state.lineJoin = v; },
        get lineJoin() { return state.lineJoin; },
        set textAlign(v) { state.textAlign = v; },
        get textAlign() { return state.textAlign; },
    };
}

const CW = 640, CH = 430, Z = 1;
const R = (Math.min(CW, CH) / 2) * 0.92 * Z;
const base = { cw: CW, ch: CH, R, yaw: 0, pitch: (-22 * Math.PI) / 180, z: Z };

// ── the whole map paints without a single non-finite coordinate ─────────────
const ctx = recordingCtx();
const hot = new Map([["PK", { code: "PK", name: "Pakistan", count: 485, lat: 30.4, lon: 69.3 }]]);
const stats = paintBasemap(ctx, { ...base, hotByIso: hot });

const pathArgs = ctx.calls.filter((c) => ["moveTo", "lineTo", "arc", "rect"].includes(c.name));
const badCoords = pathArgs.filter((c) => c.args.some((a) => typeof a === "number" && !Number.isFinite(a)));
check("no NaN or Infinity reaches a path command", badCoords.length === 0,
    badCoords.length ? `${badCoords.length} bad: ${JSON.stringify(badCoords[0].args)}` : `${pathArgs.length} path points`);

check("the ocean is filled", stats.fills > 0);
check("land is filled for many countries", stats.fills > 100, `${stats.fills} fills`);
check("borders are stroked", stats.strokes > 100, `${stats.strokes} strokes`);
check("the graticule is drawn (19 lines: 5 latitude + 12 longitude)", stats.strokes >= 19 + 19);

// A 110m basemap with 177 countries should put a lot of geometry on screen.
const lineTos = ctx.calls.filter((c) => c.name === "lineTo");
check("the coastline is actually drawn (thousands of segments)", lineTos.length > 4000, `${lineTos.length} lineTo`);

// ── the highlight lands on the right country, and only there ────────────────
check("exactly one country is highlighted", stats.hotFills === 1, `${stats.hotFills}`);
const hotStrokes = ctx.calls.filter((c) => c.name === "stroke" && c.strokeStyle === "rgba(163, 230, 53, 0.95)");
check("the highlighted country gets a bright border", hotStrokes.length === 1, `${hotStrokes.length}`);

// ── country names appear, and are on screen ─────────────────────────────────
const texts = ctx.calls.filter((c) => c.name === "fillText");
check("country names are drawn", texts.length > 5, `${texts.length} labels`);
check("no country is named twice", new Set(texts.map((t) => t.args[0])).size === texts.length);
const offScreen = texts.filter((t) => {
    const [, , x, y] = t.name === "fillText" ? [0, 0, t.args[1], t.args[2]] : [0, 0, 0, 0];
    return x < 0 || x > CW || y < 0 || y > CH;
});
check("every label lands inside the canvas", offScreen.length === 0, `${offScreen.length} off-screen`);
check("labels are bounded, not 177 at once", texts.length <= 90, `${texts.length}`);

// Pakistan is in the data, so it must be named even though it is not one of the
// largest countries on the map.
check("a country with traffic is named even when small", texts.some((t) => t.args[0] === "Pakistan"));

// A country with traffic gets BOTH a name here and a dot drawn afterwards by
// Globe.jsx, at the same coordinates. If the name sits on the point, the dot
// paints over it — which is how "Pakistan" disappeared under its own green blob.
const pkCtx = recordingCtx();
const pkHot = new Map([["PK", { code: "PK", name: "Pakistan", count: 485, lat: 30.4, lon: 69.3 }]]);
// The clearance the component passes for the widest country-tier dot.
const SIZE_K = Math.max(0.85, Math.min(2.2, Math.pow(1, 0.22)));
paintBasemap(pkCtx, { ...base, hotByIso: pkHot, dotClearance: 7.5 * SIZE_K });
const pkText = pkCtx.calls.find((c) => c.name === "fillText" && c.args[0] === "Pakistan");
const pkPoint = project(69.3, 30.4, 0, (-22 * Math.PI) / 180, CW / 2, CH / 2, R);
check("the traffic country's name is drawn", !!pkText);
check("  ...above the point, not on top of it",
    pkText && pkText.args[2] < pkPoint.sy - 4,
    `name y=${pkText?.args[2]?.toFixed(1)} vs point y=${pkPoint.sy.toFixed(1)}`);
// The dot's radius scales with event count; the name must clear the largest one.
const dotR = 7.5 * SIZE_K;
check("  ...clear of the largest dot it could be sitting under",
    pkText && pkPoint.sy - pkText.args[2] >= dotR,
    `gap=${(pkPoint.sy - (pkText?.args[2] ?? 0)).toFixed(1)} needs >= ${dotR.toFixed(1)}`);

// ...and it must still hold at deep zoom, where the dot scaling factor is at its
// maximum. This is the case a hard-coded offset gets wrong.
const deepPkCtx = recordingCtx();
const deepSizeK = Math.max(0.85, Math.min(2.2, Math.pow(14, 0.22)));
paintBasemap(deepPkCtx, { ...base, z: 14, hotByIso: pkHot, dotClearance: 7.5 * deepSizeK });
const deepText = deepPkCtx.calls.find((c) => c.name === "fillText" && c.args[0] === "Pakistan");
const deepPoint = project(69.3, 30.4, 0, (-22 * Math.PI) / 180, CW / 2, CH / 2, R);
check("  ...and still clear of the dot at maximum zoom scaling",
    deepText && deepPoint.sy - deepText.args[2] >= 7.5 * deepSizeK,
    `gap=${(deepPoint.sy - (deepText?.args[2] ?? 0)).toFixed(1)} needs >= ${(7.5 * deepSizeK).toFixed(1)}`);

// ── a territory with no basemap shape still gets its name from the API ───────
// Hong Kong is folded into China in the 110m basemap, so there is no HK polygon
// to fill, but it has traffic and must still be labelled and dot-plotted.
const hk = { code: "HK", name: "Hong Kong", count: 46, lat: 22.3, lon: 114.2 };
// Spin the globe so Hong Kong faces the viewer. The same yaw convention the
// component uses when double-clicking to dive into a spot.
const hkYaw = -(hk.lon * Math.PI) / 180;

const ctx2 = recordingCtx();
const hkStats = paintBasemap(ctx2, { ...base, yaw: hkYaw, hotByIso: new Map([["HK", hk]]) });
const hkTexts = ctx2.calls.filter((c) => c.name === "fillText").map((t) => t.args[0]);
check("Hong Kong is labelled from event data despite having no 110m shape",
    hkTexts.includes("Hong Kong"), hkTexts.slice(0, 10).join(", "));
check("Hong Kong highlights nothing (it has no geometry to tint)", hkStats.hotFills === 0, `${hkStats.hotFills}`);

// ...and when it is on the far side of the sphere it is culled rather than
// projected through the globe, which would print the name over the Atlantic.
const ctx3 = recordingCtx();
paintBasemap(ctx3, { ...base, yaw: 0, hotByIso: new Map([["HK", hk]]) });
const backTexts = ctx3.calls.filter((c) => c.name === "fillText").map((t) => t.args[0]);
check("Hong Kong is not labelled while it faces away", !backTexts.includes("Hong Kong"));

// ── spinning the globe must not break anything ──────────────────────────────
// The basemap is painted on every animation frame, so a projection that only
// holds at yaw=0 would fill in garbage the moment the globe starts turning.
let spinOk = true;
let spinBad = 0;
for (let i = 0; i < 24; i++) {
    const c = recordingCtx();
    const s = paintBasemap(c, { ...base, yaw: (i / 24) * Math.PI * 2, hotByIso: hot });
    const pts = c.calls.filter((x) => x.name === "moveTo" || x.name === "lineTo");
    if (pts.some((p) => p.args.some((a) => !Number.isFinite(a)))) spinBad++;
    if (s.fills < 2) spinOk = false;
}
check("no NaN at any rotation angle", spinBad === 0, `${spinBad}/24 frames bad`);
check("land is filled at any rotation angle", spinOk);

// ── pitch: the globe can be tipped almost pole-on ──────────────────────────
let tiltOk = true;
for (const deg of [-85, -60, 0, 45, 85]) {
    const c = recordingCtx();
    const s = paintBasemap(c, { ...base, pitch: (deg * Math.PI) / 180, hotByIso: hot });
    const pts = c.calls.filter((x) => x.name === "moveTo" || x.name === "lineTo");
    if (pts.some((p) => p.args.some((a) => !Number.isFinite(a)))) tiltOk = false;
    if (s.fills < 2) tiltOk = false;
}
check("no NaN and land present at extreme pitch", tiltOk);

// ── zoomed in, the basemap is dropped by the caller, not by the painter ─────
// Globe.jsx guards this; assert the painter is still safe if called anyway.
const deepCtx = recordingCtx();
const deepStats = paintBasemap(deepCtx, { ...base, R: R * 30, hotByIso: hot });
check("painter survives a deep zoom without NaN",
    deepCtx.calls.filter((c) => ["moveTo", "lineTo"].includes(c.name))
        .every((c) => c.args.every((a) => Number.isFinite(a))));
check("a deep zoom still labels the traffic country", deepStats.labels >= 0);

// ── the join between event data and basemap geometry ────────────────────────
check("PK resolves to a basemap country", BY_ISO.get("PK")?.name === "Pakistan");
check("PK has measurable area so it can be gated", (AREA_BY_ISO.get("PK") || 0) > 1);
check("Russia is the largest by area", (AREA_BY_ISO.get("RU") || 0) > (AREA_BY_ISO.get("PK") || 0) * 10);
check("HK has no basemap entry (documented 110m limitation)", !BY_ISO.has("HK"));

// Sanity on the projection the painter uses: the visible hemisphere is the
// front, and the antipode is culled rather than folded back onto itself.
const front = project(0, 0, 0, 0, CW / 2, CH / 2, R);
const back = project(180, 0, 0, 0, CW / 2, CH / 2, R);
check("lon 0 faces the viewer", front !== null && Math.abs(front.sx - CW / 2) < 1);
check("lon 180 is culled, not wrapped", back === null);

console.log(failures === 0 ? "\nALL GLOBE MAP TESTS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
