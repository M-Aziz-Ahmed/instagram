"use client";

// Dependency-free interactive 3D globe on <canvas>.
//   • Drag to spin (yaw) and tilt (pitch) — full 360° view.
//   • Scroll / +− to zoom; the projection radius actually scales with zoom, so
//     zooming in moves you from whole-world → country → state/region →
//     city/town, revealing progressively smaller places.
//   • ⏸ stops the auto-rotation, ▶ resumes it; ⟲ resets the view.
//
// Dot selection is tiered by zoom, and culling is done by projecting candidates
// and testing them against the canvas rect — not by approximating a
// centre/window in degrees — so what you see is exactly what is on screen.
import { useCallback, useEffect, useRef, useState } from "react";
import WORLD_RINGS from "./worldData";

const DEG = Math.PI / 180;
const TILT = -22;
const LAND = "rgba(108, 122, 137, 0.55)";
const GRID = "rgba(148, 163, 184, 0.16)";

const ZOOM_MIN = 0.7;
const ZOOM_MAX = 40;   // deep enough to isolate a single town
const Z_REGIONS = 1.6; // zoom at which country dots give way to state/region dots
const Z_CITIES = 4.5;  // zoom at which region dots give way to city/town dots

// Zoom bands. A place is drawn once the zoom is deep enough to read it, and
// hidden again past ZOOM_BAND_MAX so the view doesn't turn into confetti.
const ZOOM_BAND_MAX = 14;
// Below a place's event count drops under this zoom-dependent floor it is
// hidden, so zooming in progressively reveals smaller towns.
const minVisibleCount = (z) => Math.max(1, Math.round(60 / (z * z)));
// Cap on dots actually drawn per frame; keeps the canvas cheap regardless of
// how many distinct places exist.
const MAX_DOTS = 420;

function toVec(lon, lat) {
    const phi = (lon * Math.PI) / 180;
    const theta = (lat * Math.PI) / 180;
    return {
        x: Math.cos(theta) * Math.sin(phi),
        y: Math.sin(theta),
        z: Math.cos(theta) * Math.cos(phi),
    };
}

function rot(v, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x = v.x * cy + v.z * sy;
    const z1 = v.z * cy - v.x * sy;
    return { x, y: v.y * cp - z1 * sp, z: v.y * sp + z1 * cp };
}

// Forward projection onto the canvas. `r` is the *scaled* sphere radius — this
// is the value zoom multiplies. Passing the canvas centre as the radius (as
// this used to) made the globe a fixed size, so zoom only ever grew the dots.
function project(lon, lat, yaw, pitch, cx, cy, r) {
    const v = rot(toVec(lon, lat), yaw, pitch);
    if (v.z <= 0.02) return null;
    return { sx: cx + v.x * r, sy: cy - v.y * r, z: v.z };
}

// Inverse projection: which lon/lat lands on this canvas point? Used to centre
// the view (double-click) and to label the current focus.
function unproject(sx, sy, yaw, pitch, cx, cy, r) {
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

function clampDeg(v, lo, hi) {
    let d = ((v + 180) % 360 + 360) % 360 - 180;
    return Math.max(lo, Math.min(hi, d));
}

export default function Globe({
    countries = [],
    regions = [],
    cities = [],
    width = 600,
    height = 420,
    autoRotate = true,
}) {
    const canvasRef = useRef(null);
    const [zoom, setZoom] = useState(1);
    const [hover, setHover] = useState(null);
    const [paused, setPaused] = useState(!autoRotate);
    const stateRef = useRef({
        yaw: 0,
        pitchDeg: TILT,
        drag: false,
        lastX: 0,
        lastY: 0,
        paused: !autoRotate,
        zoom: 1,
        pointer: null,
        hover: null,
    });
    // pauseable helicopter torque… just so the loop knows whether to spin
    const ROT_PER_FRAME = (Math.PI * 2) / (75 * 60); // full turn ~75s at 60fps

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cw = canvas.clientWidth || width;
        const ch = canvas.clientHeight || height;
        if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
            canvas.width = cw * dpr;
            canvas.height = ch * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);

        const s = stateRef.current;
        const z = s.zoom;
        const cx = cw / 2;
        const cy = ch / 2;
        // The sphere radius the zoom level maps to. At z=1 the globe fits the
        // shorter axis; deeper zooms grow it past the viewport, which is what
        // makes zooming in actually feel like moving closer.
        const baseR = (Math.min(cw, ch) / 2) * 0.92;
        const R = baseR * z;
        const yaw = s.yaw;
        const pitch = s.pitchDeg * DEG;
        // Once the sphere is much larger than the viewport its silhouette is
        // off-screen, so the decorative ring/limb would be meaningless.
        const wholeGlobeInView = R * 1.04 <= Math.min(cw, ch) / 2;

        if (wholeGlobeInView) {
            ctx.setLineDash([3, 7]);
            ctx.strokeStyle = "rgba(59,130,246,0.22)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, R + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // graticule
        ctx.strokeStyle = GRID;
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
        }

        // landmasses (front-facing polylines); thin out when deeply zoomed so
        // the coastline doesn't drown the dots.
        if (z < ZOOM_BAND_MAX) {
            ctx.strokeStyle = LAND;
            ctx.lineWidth = 1.25 + Math.min(0.9, z * 0.12);
            ctx.lineJoin = "round";
            const step = z > 3 ? 3 : 1; // sub-sample the rings when zoomed in
            for (const ring of WORLD_RINGS) {
                ctx.beginPath();
                let pen = false;
                for (let i = 0; i < ring.length; i += step) {
                    const [lon, lat] = ring[i];
                    const p = project(lon, lat, yaw, pitch, cx, cy, R);
                    if (p) { if (!pen) { ctx.moveTo(p.sx, p.sy); pen = true; } else ctx.lineTo(p.sx, p.sy); }
                    else pen = false;
                }
                ctx.stroke();
            }
        }

        // Which tier of place do we draw? Zoomed out → countries, then
        // states/regions, then cities/towns. Each tier only holds places big
        // enough to be meaningful at that zoom.
        const tier = z >= Z_CITIES ? "city" : z >= Z_REGIONS ? "region" : "country";
        const source = tier === "city" ? cities : tier === "region" ? regions : countries;
        const minCount = tier === "country" ? 1 : minVisibleCount(z);

        // Cull by projecting: keep anything that actually lands on screen.
        // This is exact, so dots never vanish from a region they belong to and
        // the "cities" count in the footer always matches what is drawn.
        const candidates = [];
        for (const pt of source || []) {
            if (typeof pt?.lat !== "number" || typeof pt?.lon !== "number") continue;
            if (tier !== "country" && (pt.count || 1) < minCount) continue;
            const p = project(pt.lon, pt.lat, yaw, pitch, cx, cy, R);
            if (!p) continue;
            if (p.sx < -40 || p.sx > cw + 40 || p.sy < -40 || p.sy > ch + 40) continue;
            candidates.push({ pt, sx: p.sx, sy: p.sy, z: p.z });
        }

        // Biggest first, then keep the cap — so when there are more places than
        // we can draw, the ones that survive are the ones that matter.
        candidates.sort((a, b) => (b.pt.count || 1) - (a.pt.count || 1));
        const shown = candidates.slice(0, MAX_DOTS);

        const col = tier === "country" ? "88, 204, 2" : tier === "region" ? "168, 85, 247" : "59, 130, 246";
        const baseR0 = tier === "country" ? 2 : tier === "region" ? 1.8 : 1.6;
        const spanR = tier === "country" ? 5.5 : tier === "region" ? 4 : 3.4;
        // Keep dots a readable size on screen as we zoom, rather than letting
        // them balloon with the sphere.
        const sizeK = Math.max(0.85, Math.min(2.2, Math.pow(z, 0.22)));

        const maxCount = Math.max(1, ...shown.map((c) => c.pt.count || 1));
        const saved = [];
        for (const c of shown) {
            const { pt, sx, sy } = c;
            const rr = (baseR0 + Math.sqrt((pt.count || 1) / maxCount) * spanR) * sizeK;
            // Fade with depth so the far side of the sphere recedes.
            const alpha = (tier === "country" ? 0.45 : 0.55) + (Math.sqrt((pt.count || 1) / maxCount)) * (tier === "country" ? 0.5 : 0.4);
            const depth = 0.35 + 0.65 * c.z;

            ctx.beginPath();
            ctx.arc(sx, sy, rr + 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${col}, ${alpha * 0.18 * depth})`;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(sx, sy, rr, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${col}, ${Math.min(1, alpha * depth)})`;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(sx, sy, rr * 0.45, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.fill();

            saved.push({
                code: pt.code,
                name: tier === "city" ? pt.name || pt.city || pt.label : pt.name,
                sub: tier === "city" ? [pt.region, pt.country].filter(Boolean).join(", ") : tier === "region" ? pt.country || "" : "",
                count: pt.count || 1,
                sx, sy, r: rr,
            });
        }

        // place labels at the deeper tiers (most visited first)
        if (tier !== "country" && z >= (tier === "city" ? 2.4 : 1.15)) {
            const labelMin = Math.max(1, Math.round(30 / z));
            const labelShown = saved.filter((d) => (d.count || 1) >= labelMin).slice(0, 45);
            ctx.font = `${10 + Math.min(4, z * 0.18)}px ui-sans-serif, system-ui, sans-serif`;
            ctx.textAlign = "center";
            for (const d of labelShown) {
                const lab = (d.name || d.code || "").slice(0, 20);
                if (!lab) continue;
                ctx.beginPath();
                ctx.fillStyle = "rgba(15,23,42,0.72)";
                const tw = ctx.measureText(lab).width;
                if (ctx.roundRect) ctx.roundRect(d.sx - tw / 2 - 3, d.sy + d.r + 2, tw + 6, 13, 3);
                else ctx.rect(d.sx - tw / 2 - 3, d.sy + d.r + 2, tw + 6, 13);
                ctx.fill();
                ctx.fillStyle = "#dbeafe";
                ctx.fillText(lab, d.sx, d.sy + d.r + 12);
            }
        }

        // hit-test against the last known pointer position
        const ptr = s.pointer;
        let hit = null;
        if (ptr) {
            hit = saved.find((dot) => Math.hypot(dot.sx - ptr.x, dot.sy - ptr.y) <= Math.max(12, dot.r + 8)) || null;
        }
        s.hover = hit;

        // inner shadow at the limb for depth
        if (wholeGlobeInView) {
            const grad = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 1.02);
            grad.addColorStop(0, "rgba(0,0,0,0)");
            grad.addColorStop(1, "rgba(0,0,0,0.07)");
            ctx.beginPath();
            ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
        }
    }, [countries, regions, cities, width, height]);

    useEffect(() => {
        let raf;
        const loop = () => {
            const s = stateRef.current;
            if (!s.paused && !s.drag) s.yaw += ROT_PER_FRAME * 1.4;
            draw();
            const h = s.hover;
            setHover((prev) => {
                if (prev == null && h == null) return prev;
                if (prev && h && prev.code === h.code && prev.name === h.name && prev.sub === h.sub && prev.count === h.count) return prev;
                return h ? { code: h.code, name: h.name, sub: h.sub, count: h.count, sx: h.sx, sy: h.sy } : null;
            });
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [draw, ROT_PER_FRAME]);

    const togglePaused = () => setPausedInternal(!stateRef.current.paused);
    const setPausedInternal = (p) => { stateRef.current.paused = p; setPaused(p); };

    const onPointerDown = (e) => {
        const s = stateRef.current;
        s.drag = true;
        s.lastX = e.clientX;
        s.lastY = e.clientY;
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e) => {
        const s = stateRef.current;
        const rect = e.currentTarget.getBoundingClientRect();
        s.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        if (s.drag) {
            s.yaw += (e.clientX - s.lastX) * 0.008;
            s.pitchDeg = clampDeg(s.pitchDeg + (e.clientY - s.lastY) * 0.25, -85, 85);
            s.lastX = e.clientX;
            s.lastY = e.clientY;
        }
    };
    const onPointerUp = () => { stateRef.current.drag = false; };
    const onLeave = () => { stateRef.current.pointer = null; stateRef.current.hover = null; setHover(null); };
    const setZoomS = (next) => {
        const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
        setZoom(clamped);
        stateRef.current.zoom = clamped;
    };
    const onWheel = (e) => {
        e.preventDefault();
        setZoomS(stateRef.current.zoom * Math.exp(-e.deltaY * 0.0011));
    };
    const zoomBy = (f) => setZoomS(stateRef.current.zoom * f);
    const resetView = () => {
        stateRef.current.yaw = 0;
        stateRef.current.pitchDeg = TILT;
        setZoomS(1);
        setHover(null);
        stateRef.current.hover = null;
    };
    const zoomToPointer = (e) => {
        // Invert the projection to find the spot under the cursor, re-centre on
        // it and dive in (Google-Maps-style double-click).
        const s = stateRef.current;
        const rect = e.currentTarget.getBoundingClientRect();
        const cw = rect.width || width;
        const ch = rect.height || height;
        const R = (Math.min(cw, ch) / 2) * 0.92 * s.zoom;
        const cx = cw / 2;
        const cy = ch / 2;
        const hit = unproject(e.clientX - rect.left, e.clientY - rect.top, s.yaw, s.pitchDeg * DEG, cx, cy, R);
        if (!hit) {
            if (s.zoom >= ZOOM_MAX) resetView();
            return;
        }
        s.yaw = -hit.lon * DEG;
        s.pitchDeg = clampDeg(hit.lat, -85, 85);
        setZoomS(Math.min(ZOOM_MAX, s.zoom * 1.65));
        setHover(null);
        s.hover = null;
    };

    const tier = zoom >= Z_CITIES ? "city" : zoom >= Z_REGIONS ? "region" : "country";
    const tierCount = tier === "city" ? (cities || []).length : tier === "region" ? (regions || []).length : (countries || []).length;

    return (
        <div className="relative select-none" style={{ width, height }}>
            <canvas
                ref={canvasRef}
                style={{ width: "100%", height: "100%", touchAction: "none", cursor: hover ? "pointer" : "grab" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onLeave}
                onWheel={onWheel}
                onDoubleClick={zoomToPointer}
            />

            {/* controls */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5">
                <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/90 dark:bg-gray-900/90 backdrop-blur border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <button
                        type="button"
                        onClick={() => zoomBy(1.5)}
                        aria-label="Zoom in"
                        className="w-9 h-8 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
                    </button>
                    <button
                        type="button"
                        onClick={() => zoomBy(1 / 1.5)}
                        aria-label="Zoom out"
                        className="w-9 h-8 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-t border-gray-200 dark:border-gray-700"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M5 12h14" /></svg>
                    </button>
                </div>
                <button
                    type="button"
                    onClick={togglePaused}
                    aria-label={paused ? "Resume rotation" : "Pause rotation"}
                    className="w-9 h-9 rounded-xl bg-white/90 dark:bg-gray-900/90 backdrop-blur border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                >
                    {paused ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    ) : (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
                    )}
                </button>
                <button
                    type="button"
                    onClick={resetView}
                    aria-label="Reset view"
                    className="w-9 h-9 rounded-xl bg-white/90 dark:bg-gray-900/90 backdrop-blur border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0 1 13.66-4.66M20 14a8 8 0 0 1-13.66 4.66" /></svg>
                </button>
            </div>

            {/* mode hint */}
            <div className="absolute bottom-2 left-3 text-[11px] text-gray-400 dark:text-gray-500 font-medium">
                {tier === "country" && `🌍 countries · ${tierCount} with data · zoom ${zoom.toFixed(2)}`}
                {tier === "region" && `🗺️ states / regions · ${tierCount} · ≥ ${minVisibleCount(zoom)} events · zoom ${zoom.toFixed(2)}`}
                {tier === "city" && `📍 cities / towns · ${tierCount} · ≥ ${minVisibleCount(zoom)} events · zoom ${zoom.toFixed(2)}`}
                <span className="hidden sm:inline"> · drag to spin</span>
                <span className="hidden md:inline"> · scroll or +/− to zoom · double-click to dive in</span>
            </div>
            <div className="absolute bottom-2 right-3 text-[11px] text-gray-400 dark:text-gray-500 font-medium">
                {paused ? "▶ paused" : "auto-rotating"}
            </div>

            {hover && (
                <div
                    className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-lg"
                    style={{ left: Math.max(4, Math.min(96, (hover.sx / Math.max(1, width)) * 100)) + "%", top: Math.max(8, (hover.sy / Math.max(1, height)) * 100) + "%" }}
                >
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                        {hover.name}{" "}
                        <span className={tier === "country" ? "text-[#58cc02]" : tier === "region" ? "text-purple-500" : "text-[#3b82f6]"}>
                            {hover.count}
                        </span>
                    </p>
                    <p className="text-[10px] text-gray-400">
                        {hover.sub ? `${hover.sub} · ` : ""}
                        {hover.count === 1 ? "event" : "events"}
                        {tier === "city" && hover.sub ? " · zoom out for regions" : ""}
                    </p>
                </div>
            )}
        </div>
    );
}
