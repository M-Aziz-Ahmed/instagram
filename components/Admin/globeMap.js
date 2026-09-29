"use client";

// The basemap half of the admin globe: projection maths plus the painting of an
// actual world map — ocean, graticule, filled land, country borders and country
// names — rather than an anonymous wireframe coastline.
//
// Split out of Globe.jsx so it can be exercised without a browser. The failure
// mode here is silent: a wrong projection or a degenerate path does not throw,
// it just draws an unreadable or empty map. So the tests here run the real
// painting code against a recording canvas and assert on the commands it emits.
//
// The interactive half — dots, hit-testing, zoom tiers, drag — stays in Globe.jsx.

// Explicit extension: the bundler resolves this either way, but the test suite
// imports this module through Node's ESM loader, which does not guess.
import WORLD_COUNTRIES from "./worldData.js";

export const DEG = Math.PI / 180;

export const TILT = -22;
export const ZOOM_BAND_MAX = 14;
export const MAX_LABELS = 70;

// Basemap palette. One palette rather than a light/dark pair: the globe is a
// self-contained surface, and these values read correctly on both the light and
// the dark admin shell.
const OCEAN_IN = "rgba(28, 64, 110, 1)";
const OCEAN_OUT = "rgba(8, 22, 42, 1)";
const LAND = "rgba(96, 124, 100, 0.62)";
const LAND_HOT = "rgba(122, 196, 96, 0.80)";
const BORDER = "rgba(214, 233, 222, 0.26)";
const BORDER_HOT = "rgba(163, 230, 53, 0.95)";
const GRATICULE = "rgba(148, 197, 255, 0.10)";
const LABEL = "rgba(226, 240, 233, 0.92)";
const LABEL_HOT = "#bef264";
// Shared with Globe.jsx, which labels the traffic dots with the same halo so a
// number stays readable over a bright coastline.
export const LABEL_HALO = "rgba(4, 12, 24, 0.85)";

// A country is named once its largest ring covers at least this many square
// degrees at the current zoom, and the bar falls as you zoom in so smaller
// places appear. Tuned so a whole-globe view names the continents and the large
// countries, and a deep zoom names towns' host countries.
const minLabelArea = (z) => Math.max(1.5, 55 / Math.pow(z, 1.7));

// Largest-ring area per country, used to decide what is big enough to be worth
// naming. Computed once at import (10k points) rather than per frame.
export const AREA_BY_ISO = (() => {
    const map = new Map();
    for (const country of WORLD_COUNTRIES) {
        let biggest = 0;
        for (const ring of country.rings) {
            let a = 0;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
            }
            biggest = Math.max(biggest, Math.abs(a) / 2);
        }
        map.set(country.iso2, biggest);
    }
    return map;
})();

// ISO alpha-2 -> basemap country. Looked up per frame when placing labels, so it
// is a Map rather than a linear find through 177 entries.
export const BY_ISO = new Map(WORLD_COUNTRIES.map((c) => [c.iso2, c]));

export function toVec(lon, lat) {
    const phi = (lon * Math.PI) / 180;
    const theta = (lat * Math.PI) / 180;
    return {
        x: Math.cos(theta) * Math.sin(phi),
        y: Math.sin(theta),
        z: Math.cos(theta) * Math.cos(phi),
    };
}

export function rot(v, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x = v.x * cy + v.z * sy;
    const z1 = v.z * cy - v.x * sy;
    return { x, y: v.y * cp - z1 * sp, z: v.y * sp + z1 * cp };
}

// Forward projection onto the canvas. `r` is the *scaled* sphere radius — this
// is the value zoom multiplies. Passing the canvas centre as the radius (as
// this used to) made the globe a fixed size, so zoom only ever grew the dots.
export function project(lon, lat, yaw, pitch, cx, cy, r) {
    const v = rot(toVec(lon, lat), yaw, pitch);
    if (v.z <= 0.02) return null;
    return { sx: cx + v.x * r, sy: cy - v.y * r, z: v.z };
}

// Inverse projection: which lon/lat lands on this canvas point? Used to centre
// the view (double-click) and to label the current focus.
export function unproject(sx, sy, yaw, pitch, cx, cy, r) {
    const ux = (sx - cx) / r;
    const uy = (cy - sy) / r;
    const d = 1 - ux * ux - uy * uy;
    if (d <= 0) return null; // outside the sphere's silhouette
    const uz = Math.sqrt(d);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cyf = Math.cos(yaw), syf = Math.sin(yaw);
    const y = cp * uy + sp * uz;
    const z1 = -sp * uy + cp * uz;
    const x = ux * cyf - z1 * syf;
    const z = z1 * cyf + ux * syf;
    return {
        lon: Math.atan2(x, z) / DEG,
        lat: Math.asin(Math.max(-1, Math.min(1, y))) / DEG,
    };
}

export function clampDeg(v, lo, hi) {
    let d = ((v + 180) % 360 + 360) % 360 - 180;
    return Math.max(lo, Math.min(hi, d));
}

function fontFor(px) {
    return `${px}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
}

/**
 * Paint ocean, graticule, land and country names.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} o
 * @param {number} o.cw canvas width in CSS pixels
 * @param {number} o.ch canvas height in CSS pixels
 * @param {number} o.R   sphere radius in CSS pixels (already multiplied by zoom)
 * @param {number} o.yaw radians
 * @param {number} o.pitch radians
 * @param {number} o.z zoom level, for label sizing and thresholds
 * @param {Map<string, object>} o.hotByIso ISO alpha-2 -> country with traffic
 * @param {number} [o.dotClearance] radius of the largest traffic dot that will be
 *   drawn over this, so a country's name can be placed clear of it
 * @param {boolean} [o.halo] draw the outer atmosphere glow
 * @returns {{labels: number, fills: number, strokes: number}} counts, for tests
 */
export function paintBasemap(ctx, o) {
    const { cw, ch, R, yaw, pitch, z, hotByIso } = o;
    const cx = cw / 2;
    const cy = ch / 2;
    const wholeGlobeInView = R * 1.04 <= Math.min(cw, ch) / 2;
    const stats = { labels: 0, fills: 0, strokes: 0, hotFills: 0 };

    // ── atmosphere: a soft halo just outside the silhouette ─────────────────
    if (o.halo !== false && wholeGlobeInView) {
        const halo = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.16);
        halo.addColorStop(0, "rgba(96, 165, 250, 0.20)");
        halo.addColorStop(1, "rgba(96, 165, 250, 0)");
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.16, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();
    }

    // ── ocean ──────────────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    const sea = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.08, cx, cy, R * 1.05);
    sea.addColorStop(0, OCEAN_IN);
    sea.addColorStop(1, OCEAN_OUT);
    ctx.fillStyle = sea;
    ctx.fill();
    stats.fills++;

    // Everything from here to the dots is map furniture and must not spill past
    // the coastline into the page. Only worth doing while the sphere is smaller
    // than the canvas; once it overflows, the canvas edge is the clip and a huge
    // clip circle would only cost fill rate.
    const needsClip = R < Math.max(cw, ch);
    if (needsClip) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.clip();
    }

    // ── graticule ──────────────────────────────────────────────────────────
    ctx.strokeStyle = GRATICULE;
    ctx.lineWidth = 1;
    for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let pen = false;
        for (let lon = -180; lon <= 180; lon += 6) {
            const p = project(lon, lat, yaw, pitch, cx, cy, R);
            if (p) { if (!pen) { ctx.moveTo(p.sx, p.sy); pen = true; } else ctx.lineTo(p.sx, p.sy); }
            else pen = false;
        }
        ctx.stroke();
        stats.strokes++;
    }
    for (let lon = -180; lon < 180; lon += 30) {
        ctx.beginPath();
        let pen = false;
        for (let lat = -90; lat <= 90; lat += 4) {
            const p = project(lon, lat, yaw, pitch, cx, cy, R);
            if (p) { if (!pen) { ctx.moveTo(p.sx, p.sy); pen = true; } else ctx.lineTo(p.sx, p.sy); }
            else pen = false;
        }
        ctx.stroke();
        stats.strokes++;
    }

    // ── land ───────────────────────────────────────────────────────────────
    //
    // A ring that runs over the horizon is drawn as one subpath per visible
    // run: the pen lifts at the back face and is put down again on the way
    // round, and fill() closes each run. That is what a country straddling the
    // limb actually looks like — cut off by the edge of the world — and it is
    // why Russia still reads as Russia when half of it is behind the globe,
    // instead of vanishing.
    //
    // Projection happens ONCE here and the screen-space paths are kept for both
    // the fill and the border pass. The coastline is 10k points and this runs
    // every animation frame, so projecting it twice for two different paint
    // operations is a real cost at 60fps.
    const projected = [];
    for (const country of WORLD_COUNTRIES) {
        const subpaths = [];
        for (const ring of country.rings) {
            let cur = null;
            for (const [lon, lat] of ring) {
                const p = project(lon, lat, yaw, pitch, cx, cy, R);
                if (p) {
                    if (!cur) { cur = []; subpaths.push(cur); }
                    cur.push(p.sx, p.sy);
                } else {
                    cur = null;
                }
            }
        }
        if (subpaths.length) projected.push({ iso2: country.iso2, subpaths });
    }

    const tracePath = (subpaths) => {
        ctx.beginPath();
        for (const sp of subpaths) {
            ctx.moveTo(sp[0], sp[1]);
            for (let i = 2; i < sp.length; i += 2) ctx.lineTo(sp[i], sp[i + 1]);
        }
    };

    for (const shape of projected) {
        tracePath(shape.subpaths);
        const hot = hotByIso.has(shape.iso2);
        ctx.fillStyle = hot ? LAND_HOT : LAND;
        ctx.fill();
        stats.fills++;
        if (hot) stats.hotFills++;
    }

    // Borders on top of the fill, so they read as borders rather than as the
    // outline of a blob of colour.
    ctx.lineJoin = "round";
    for (const shape of projected) {
        tracePath(shape.subpaths);
        const hot = hotByIso.has(shape.iso2);
        ctx.strokeStyle = hot ? BORDER_HOT : BORDER;
        ctx.lineWidth = hot ? 1.8 : 0.8;
        ctx.stroke();
        stats.strokes++;
    }

    if (needsClip) ctx.restore();

    // ── country names ──────────────────────────────────────────────────────
    // Drawn outside the clip so a name sitting near the limb is not sliced in
    // half by the coastline.
    const placed = [];
    const fits = (x, y, w, h) => {
        for (const b of placed) {
            if (x < b[2] && x + w > b[0] && y < b[3] && y + h > b[1]) return false;
        }
        placed.push([x, y, x + w, y + h]);
        return true;
    };

    const baseFont = Math.max(9, Math.min(15, 9 + Math.log2(Math.max(1, z)) * 3));
    const areaBar = minLabelArea(z);
    // How far above its dot a country's name has to sit. The dot is painted
    // after this function returns, straight over these coordinates, and its
    // radius scales with event count — so a fixed offset either leaves a gap at
    // low zoom or is swallowed by the blob at high zoom.
    const clearance = (Number.isFinite(o.dotClearance) ? o.dotClearance : 8) + 5;

    // Countries with traffic first: they are the answer to the question the map
    // is on screen to answer, so they win every collision. Their name comes from
    // the API, not the basemap, because a place can be a territory the 110m
    // basemap has no separate shape for (Hong Kong is folded into China) and
    // the API's name is the one the admin recognises.
    ctx.textAlign = "center";
    for (const [iso, c] of hotByIso) {
        const base = BY_ISO.get(iso);
        // Prefer the observed centroid: it is where the visitors were, not where
        // the cartographer put the label.
        const lon = Number.isFinite(c.lon) ? c.lon : base?.label?.[0];
        const lat = Number.isFinite(c.lat) ? c.lat : base?.label?.[1];
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const p = project(lon, lat, yaw, pitch, cx, cy, R);
        if (!p) continue;
        if (p.sx < 8 || p.sx > cw - 8 || p.sy < 8 || p.sy > ch - 8) continue;
        const px = baseFont + 1;
        ctx.font = fontFor(px);
        const text = c.name && c.name.length > 22 ? `${c.name.slice(0, 21)}…` : (c.name || iso);
        const w = ctx.measureText(text).width;
        // ABOVE the point, clear of the dot, not on it. The traffic dot is drawn
        // after this function returns, at exactly these coordinates, and a dot
        // scaled by event count is wide enough to paint straight over the
        // country's own name — which is how "Pakistan" ended up invisible under
        // a green blob labelled 485.
        const ty = p.sy - clearance;
        // Halo rather than a filled box: a box over a coastline hides the very
        // geography the label is naming.
        ctx.lineWidth = 3;
        ctx.strokeStyle = LABEL_HALO;
        ctx.strokeText(text, p.sx, ty);
        ctx.fillStyle = LABEL_HOT;
        ctx.fillText(text, p.sx, ty);
        placed.push([p.sx - w / 2 - 4, ty - px, p.sx + w / 2 + 4, ty + 4]);
        stats.labels++;
    }

    // Then the rest of the world, biggest first, so when names collide it is
    // the small countries that lose their label rather than Russia.
    const rest = [];
    for (const country of WORLD_COUNTRIES) {
        if (!country.iso2 || hotByIso.has(country.iso2)) continue;
        if ((AREA_BY_ISO.get(country.iso2) || 0) < areaBar) continue;
        const [lon, lat] = country.label;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const p = project(lon, lat, yaw, pitch, cx, cy, R);
        if (!p) continue;
        if (p.sx < 10 || p.sx > cw - 10 || p.sy < 10 || p.sy > ch - 10) continue;
        rest.push({ name: country.name, x: p.sx, y: p.sy, area: AREA_BY_ISO.get(country.iso2) || 0, depth: p.z });
    }
    rest.sort((a, b) => b.area - a.area);

    ctx.font = fontFor(baseFont);
    for (const c of rest) {
        if (stats.labels >= MAX_LABELS) break;
        const text = c.name.length > 20 ? `${c.name.slice(0, 19)}…` : c.name;
        const w = ctx.measureText(text).width;
        if (!fits(c.x - w / 2 - 3, c.y - baseFont, w + 6, baseFont + 6)) continue;
        stats.labels++;
        // Fade toward the limb so names on the far side of the curve do not
        // compete with names facing the reader.
        ctx.globalAlpha = 0.35 + 0.65 * c.depth;
        ctx.lineWidth = 3;
        ctx.strokeStyle = LABEL_HALO;
        ctx.strokeText(text, c.x, c.y);
        ctx.fillStyle = LABEL;
        ctx.fillText(text, c.x, c.y);
        ctx.globalAlpha = 1;
    }
    ctx.textAlign = "left";

    return stats;
}
