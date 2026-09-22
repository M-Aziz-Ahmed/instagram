"use client";

// Dependency-free interactive 3D globe on <canvas>.
//   • Drag to spin (yaw) and tilt (pitch) — full 360° view.
//   • Scroll to zoom; zooming in switches from COUNTRY dots to the CITY dots
//     around the view centre (the data only has country + city granularity).
//   • ⏸ button stops the auto-rotation, ▶ resumes it; the ⟲ resets the view.
import { useCallback, useEffect, useRef, useState } from "react";
import WORLD_RINGS from "./worldData";

const DEG = Math.PI / 180;
const TILT = -22;
const LAND = "rgba(108, 122, 137, 0.55)";
const GRID = "rgba(148, 163, 184, 0.16)";
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 3.4;
const Z_CITIES = 1.55; // zoom level where city dots replace country dots

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

function clampDeg(v, lo, hi) {
    let d = ((v + 180) % 360 + 360) % 360 - 180;
    return Math.max(lo, Math.min(hi, d));
}

function wrapDelta(lon, cLon) {
    return ((lon - cLon + 180 + 360) % 360) - 180;
}

export default function Globe({
    countries = [],
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

    const project = useCallback((lon, lat, yaw, pitch, r) => {
        const v = rot(toVec(lon, lat), yaw, pitch);
        if (v.z <= 0.02) return null;
        return { sx: r + v.x * r, sy: r - v.y * r, z: v.z };
    }, []);

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
        const R = (Math.min(cw, ch) / 2) * 0.92 * z;
        const yaw = s.yaw;
        const pitch = s.pitchDeg * DEG;
        const cx = cw / 2;
        const cy = ch / 2;

        // orbit ring hint
        ctx.setLineDash([3, 7]);
        ctx.strokeStyle = "rgba(59,130,246,0.22)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, R + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // graticule
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        for (let lat = -60; lat <= 60; lat += 30) {
            ctx.beginPath();
            let pen = false;
            for (let lon = -180; lon <= 180; lon += 6) {
                const p = project(lon, lat, yaw, pitch, cx);
                if (p) { if (!pen) { ctx.moveTo(p.sx, p.sy); pen = true; } else ctx.lineTo(p.sx, p.sy); }
                else pen = false;
            }
            ctx.stroke();
        }
        for (let lon = -180; lon < 180; lon += 30) {
            ctx.beginPath();
            let pen = false;
            for (let lat = -90; lat <= 90; lat += 4) {
                const p = project(lon, lat, yaw, pitch, cx);
                if (p) { if (!pen) { ctx.moveTo(p.sx, p.sy); pen = true; } else ctx.lineTo(p.sx, p.sy); }
                else pen = false;
            }
            ctx.stroke();
        }

        // landmasses (front-facing polylines)
        ctx.strokeStyle = LAND;
        ctx.lineWidth = 1.25;
        ctx.lineJoin = "round";
        for (const ring of WORLD_RINGS) {
            ctx.beginPath();
            let pen = false;
            for (const [lon, lat] of ring) {
                const p = project(lon, lat, yaw, pitch, cx);
                if (p) { if (!pen) { ctx.moveTo(p.sx, p.sy); pen = true; } else ctx.lineTo(p.sx, p.sy); }
                else pen = false;
            }
            ctx.stroke();
        }

        // Which dots do we draw? Zoomed out → countries; zoomed in → the
        // cities nearest to the view centre (so you can drill down).
        const zoomed = z >= Z_CITIES;
        let list;
        if (zoomed) {
            const cLon = clampDeg((yaw / DEG) * -1, -180, 180);
            const cLat = clampDeg(s.pitchDeg, -90, 90);
            const halfLon = 120 / z;
            const halfLat = 72 / z;
            list = cities
                .filter((c) => c.lat != null && c.lon != null)
                .filter((c) => Math.abs(wrapDelta(c.lon, cLon)) <= halfLon && Math.abs(c.lat - cLat) <= halfLat)
                .slice(0, 40);
        } else {
            list = countries;
        }

        const saved = [];
        if (list.length) {
            const maxCount = Math.max(1, ...list.map((p) => p.count || 1));
            for (const pt of list) {
                if (typeof pt.lat !== "number" || typeof pt.lon !== "number") continue;
                const p = project(pt.lon, pt.lat, yaw, pitch, cx);
                if (!p) continue;
                const rr = zoomed
                    ? 1.6 + Math.sqrt(pt.count / maxCount) * 3.4
                    : 2 + Math.sqrt(pt.count / maxCount) * 5.5;
                const alpha = 0.45 + (pt.count / maxCount) * 0.55;
                const col = zoomed ? "59, 130, 246" : "88, 204, 2";

                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rr + 4, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${col}, ${alpha * 0.18})`;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rr, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${col}, ${alpha})`;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rr * 0.45, 0, Math.PI * 2);
                ctx.fillStyle = "#ffffff";
                ctx.fill();

                saved.push({
                    code: pt.code,
                    name: zoomed ? pt.name || pt.city || pt.label : pt.name,
                    sub: zoomed ? pt.country : "",
                    count: pt.count || 1,
                    sx: p.sx,
                    sy: p.sy,
                    r: rr,
                });
            }
        }

        // hit-test against the last known pointer position
        const ptr = s.pointer;
        let hit = null;
        if (ptr) {
            hit = saved.find((dot) => Math.hypot(dot.sx - ptr.x, dot.sy - ptr.y) <= Math.max(12, dot.r + 8)) || null;
        }
        const prev = s.hover;
        if ((prev == null && hit != null) || (prev != null && hit == null) || (prev && hit && (prev.code !== hit.code || prev.name !== hit.name || prev.sub !== hit.sub))) {
            s.hover = hit;
        }

        // inner shadow at the limb for depth
        const grad = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 1.02);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.07)");
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
    }, [project, countries, cities, width, height]);

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
    const onWheel = (e) => {
        e.preventDefault();
        const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, stateRef.current.zoom - e.deltaY * 0.002));
        setZoom(next);
        stateRef.current.zoom = next;
    };
    const resetView = () => {
        stateRef.current.yaw = 0;
        stateRef.current.pitchDeg = TILT;
        setZoom(1);
        stateRef.current.zoom = 1;
        setHover(null);
        stateRef.current.hover = null;
    };

    const zoomedMode = zoom >= Z_CITIES;

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
                onDoubleClick={resetView}
            />

            {/* controls */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5">
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
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0 1 13.66-4.66M20 14a8 8 0 0 1-13.66 4.66" /></svg>
                </button>
            </div>

            {/* mode hint */}
            <div className="absolute bottom-2 left-3 text-[11px] text-gray-400 dark:text-gray-500 font-medium">
                {zoomedMode ? `🔍 cities near centre — ${(cities || []).length} total` : `🌍 country dots · ${(countries || []).length} countries`}
                <span className="hidden sm:inline"> · drag to spin</span>
                <span className="hidden md:inline"> · scroll to zoom{zoomedMode ? " · zoom out for countries" : ", zoom in for cities"}</span>
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
                        {hover.name} <span className={zoomedMode ? "text-[#3b82f6]" : "text-[#58cc02]"}>{hover.count}</span>
                    </p>
                    <p className="text-[10px] text-gray-400">
                        {hover.sub ? `${hover.sub} · ` : ""}{hover.count === 1 ? "event" : "events"}
                        {zoomedMode && hover.sub ? " · zoom out for country dots" : ""}
                    </p>
                </div>
            )}
        </div>
    );
}