"use client";

// Dependency-free rotating 3D globe on <canvas>. Drag to spin, wheel to zoom,
// hover a dot for its country. Dots = where users are using the app from.
import { useCallback, useEffect, useRef, useState } from "react";
import WORLD_RINGS from "./worldData";

const TILT = -24; // lift the north pole a touch
const LAND = "rgba(108, 122, 137, 0.55)";
const GRID = "rgba(148, 163, 184, 0.16)";

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

export default function Globe({ points = [], width = 600, height = 420, autoRotate = true }) {
    const canvasRef = useRef(null);
    const [zoom, setZoom] = useState(1);
    const [hover, setHover] = useState(null);
    const stateRef = useRef({ yaw: 0, drag: false, lastX: 0, lastY: 0, auto: autoRotate, zoom: 1, pointer: null, hover: null });

    const ROT_PER_FRAME = (Math.PI * 2) / (60 * 60); // ~60s per full turn at 60fps

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

        const R = (Math.min(cw, ch) / 2) * 0.92 * stateRef.current.zoom;
        const yaw = stateRef.current.yaw;
        const pitch = (TILT * Math.PI) / 180;
        const cx = cw / 2;

        // orbit ring hint
        ctx.setLineDash([3, 7]);
        ctx.strokeStyle = "rgba(59,130,246,0.25)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, ch / 2, R + 8, 0, Math.PI * 2);
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

        // usage dots
        const saved = [];
        if (points.length) {
            const maxCount = Math.max(1, ...points.map((p) => p.count || 1));
            for (const pt of points) {
                if (typeof pt.lat !== "number" || typeof pt.lon !== "number") continue;
                const p = project(pt.lon, pt.lat, yaw, pitch, cx);
                if (!p) continue;
                const rr = 2 + Math.sqrt(pt.count / maxCount) * 5.5;
                const alpha = 0.45 + (pt.count / maxCount) * 0.55;

                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rr + 4, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(88, 204, 2, ${alpha * 0.18})`;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rr, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(88, 204, 2, ${alpha})`;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rr * 0.45, 0, Math.PI * 2);
                ctx.fillStyle = "#ffffff";
                ctx.fill();

                saved.push({ code: pt.code, name: pt.name, count: pt.count || 1, sx: p.sx, sy: p.sy, r: rr });
            }
        }

        // hit-test against the last known pointer position
        const ptr = stateRef.current.pointer;
        let hit = null;
        if (ptr) {
            hit = saved.find((s) => Math.hypot(s.sx - ptr.x, s.sy - ptr.y) <= Math.max(12, s.r + 8)) || null;
        }
        const prev = stateRef.current.hover;
        if ((prev == null && hit != null) || (prev != null && hit == null) || (prev && hit && (prev.code !== hit.code || prev.name !== hit.name))) {
            stateRef.current.hover = hit;
        }

        // inner shadow at the limb for depth
        const grad = ctx.createRadialGradient(cx, ch / 2, R * 0.55, cx, ch / 2, R * 1.02);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.07)");
        ctx.beginPath();
        ctx.arc(cx, ch / 2, R * 1.02, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
    }, [project, points, width, height]);

    useEffect(() => {
        let raf;
        const loop = () => {
            if (stateRef.current.auto && !stateRef.current.drag) stateRef.current.yaw += ROT_PER_FRAME * 1.4;
            draw();
            // propagate hover to React state (only when it changed)
            const h = stateRef.current.hover;
            setHover((prev) => {
                if (prev == null && h == null) return prev;
                if (prev && h && prev.code === h.code && prev.name === h.name && prev.count === h.count) return prev;
                return h ? { code: h.code, name: h.name, count: h.count, sx: h.sx, sy: h.sy } : null;
            });
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [draw, ROT_PER_FRAME]);

    const onPointerDown = (e) => {
        stateRef.current.drag = true;
        stateRef.current.lastX = e.clientX;
        stateRef.current.lastY = e.clientY;
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        stateRef.current.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        if (stateRef.current.drag) {
            stateRef.current.yaw += (e.clientX - stateRef.current.lastX) * 0.008;
            stateRef.current.lastX = e.clientX;
            stateRef.current.lastY = e.clientY;
        }
    };
    const onPointerUp = () => { stateRef.current.drag = false; };
    const onLeave = () => { stateRef.current.pointer = null; stateRef.current.hover = null; setHover(null); };
    const onWheel = (e) => {
        e.preventDefault();
        const next = Math.max(0.7, Math.min(2.4, stateRef.current.zoom - e.deltaY * 0.002));
        setZoom(next);
        stateRef.current.zoom = next;
    };
    const onDoubleClick = () => { setZoom(1); stateRef.current.zoom = 1; stateRef.current.yaw = 0; };

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
                onDoubleClick={onDoubleClick}
            />
            {hover && (
                <div
                    className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-lg"
                    style={{ left: Math.max(4, Math.min(96, (hover.sx / Math.max(1, width)) * 100)) + "%", top: Math.max(8, (hover.sy / Math.max(1, height)) * 100) + "%" }}
                >
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                        {hover.name} <span className="text-[#58cc02]">{hover.count}</span>
                    </p>
                    <p className="text-[10px] text-gray-400">{hover.count === 1 ? "event" : "events"}</p>
                </div>
            )}
            <div className="absolute bottom-2 right-3 text-[11px] text-gray-400 dark:text-gray-500 font-medium">
                drag to spin · scroll to zoom
            </div>
        </div>
    );
}