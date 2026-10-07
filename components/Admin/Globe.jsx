"use client";

// Interactive 3D globe on <canvas>, drawn as an actual map rather than a
// wireframe.
//   • Drag to spin (yaw) and tilt (pitch) — full 360° view.
//   • Scroll / +− to zoom; the projection radius actually scales with zoom, so
//     zooming in moves you from whole-world → country → state/region →
//     city/town, revealing progressively smaller places.
//   • ⏸ stops the auto-rotation, ▶ resumes it; ⟲ resets the view.
//
// The basemap comes from components/Admin/worldData.js, which carries one entry
// per country with its rings AND its identity. That identity is the whole point:
// with it the globe can print country names, draw real borders, and tint the
// countries that actually have traffic, instead of showing an anonymous
// coastline that cannot be read.
//
// Dot selection is tiered by zoom, and culling is done by projecting candidates
// and testing them against the canvas rect — not by approximating a
// centre/window in degrees — so what you see is exactly what is on screen.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    DEG, LABEL_HALO, TILT, ZOOM_BAND_MAX,
    clampDeg, paintBasemap, project, unproject,
} from "./globeMap";
import {
    ZOOM_MIN, ZOOM_MAX, Z_REGIONS, Z_CITIES, MAX_DOTS,
    tierForZoom, floorForZoom, applyVisibilityFloor, placeableCandidates,
} from "./globeVisibility";

// ZOOM_MIN / ZOOM_MAX / Z_REGIONS / Z_CITIES / MAX_DOTS are imported from
// globeVisibility.js, which keeps the draw loop and the tests on one source of
// truth for the thresholds.
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
    const [selected, setSelected] = useState(null);
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

    // Which countries have traffic, keyed by ISO alpha-2. The globe's basemap is
    // static geometry, so this is the join that lets it know Pakistan is worth
    // pointing at and Mongolia is not. Countries with traffic are always named
    // and always tinted, however small they are — a small country with visitors
    // is the interesting case, not an edge case.
    const hotByIso = useMemo(() => {
        const map = new Map();
        for (const c of countries) {
            if (c?.code) map.set(c.code, c);
        }
        return map;
    }, [countries]);

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
        // off-screen, so the decorative limb shading would be meaningless.
        const wholeGlobeInView = R * 1.04 <= Math.min(cw, ch) / 2;

        // Keep dots a readable size on screen as we zoom, rather than letting
        // them balloon with the sphere. Hoisted above the basemap call so the
        // map painter can place a country's name clear of the biggest dot that
        // will land on it.
        const sizeK = Math.max(0.85, Math.min(2.2, Math.pow(z, 0.22)));

        // The map itself — ocean, coastlines, borders and country names — lives
        // in globeMap.js so it can be rendered and asserted on without a browser.
        // Skipped once the sphere is so large that a hairline coastline is just
        // noise over the dots.
        if (z <= ZOOM_BAND_MAX) {
            // Widest dot the country tier can draw: base 2 + full span 5.5.
            paintBasemap(ctx, { cw, ch, R, yaw, pitch, z, hotByIso, dotClearance: 7.5 * sizeK });
        }

        // Which tier of place do we draw? Zoomed out → countries, then
        // states/regions, then cities/towns. Each tier only holds places big
        // enough to be meaningful at that zoom.
        const tier = tierForZoom(z);
        const source = tier === "city" ? cities : tier === "region" ? regions : countries;

        // Cull by projecting: keep anything that actually lands on screen.
        // This is exact, so dots never vanish from a region they belong to.
        const candidates = [];
        for (const pt of source || []) {
            if (typeof pt?.lat !== "number" || typeof pt?.lon !== "number") continue;
            const p = project(pt.lon, pt.lat, yaw, pitch, cx, cy, R);
            if (!p) continue;
            if (p.sx < -40 || p.sx > cw + 40 || p.sy < -40 || p.sy > ch + 40) continue;
            candidates.push({ pt, sx: p.sx, sy: p.sy, z: p.z });
        }

        // Biggest first, then keep the cap — so when there are more places than
        // we can draw, the ones that survive are the ones that matter.
        candidates.sort((a, b) => (b.pt.count || 1) - (a.pt.count || 1));
        const shown = applyVisibilityFloor(candidates, floorForZoom(tier, z));

        const col = tier === "country" ? "163, 230, 53" : tier === "region" ? "168, 85, 247" : "59, 130, 246";
        const baseR0 = tier === "country" ? 2 : tier === "region" ? 1.8 : 1.6;
        const spanR = tier === "country" ? 5.5 : tier === "region" ? 4 : 3.4;

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

            // A ring on the selected dot, so the current selection survives
            // zooming, auto-rotation and changing tier — the only state that
            // makes a selection legible is a selected state you can see.
            if (selected && selected.code === pt.code && selected.name === (tier === "city" ? pt.name || pt.city || pt.label : pt.name)) {
                ctx.beginPath();
                ctx.arc(sx, sy, rr + 7, 0, Math.PI * 2);
                ctx.strokeStyle = "rgba(255,255,255,0.95)";
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(sx, sy, rr + 10, 0, Math.PI * 2);
                ctx.strokeStyle = "rgba(37,99,235,0.85)";
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            saved.push({
                code: pt.code,
                key: pt.key || "",
                name: tier === "city" ? pt.name || pt.city || pt.label : pt.name,
                sub: tier === "city" ? [pt.region, pt.country].filter(Boolean).join(", ") : tier === "region" ? pt.country || "" : "",
                count: pt.count || 1,
                // Carried through so a clicked dot can be re-centred and looked up
                // by coordinate, instead of the click only producing a name.
                lat: pt.lat,
                lon: pt.lon,
                sx, sy, r: rr,
            });
        }

        // A count next to every dot, not just at the deeper tiers. The previous
        // version drew no label at all on the country tier, so the zoomed-out
        // default view was a globe of coloured dots with no numbers on it — the
        // one view where the numbers matter most.
        if (shown.length) {
            ctx.textAlign = "left";
            for (const d of saved) {
                const text = (d.count || 1).toLocaleString();
                ctx.font = `600 ${Math.max(9, Math.min(12, 9 + Math.log2(Math.max(1, z)) * 1.6))}px ui-sans-serif, system-ui, sans-serif`;
                const w = ctx.measureText(text).width;
                const x = d.sx + d.r + 4;
                const y = d.sy + 3.5;
                ctx.lineWidth = 3;
                ctx.strokeStyle = LABEL_HALO;
                ctx.strokeText(text, x, y);
                ctx.fillStyle = "#ffffff";
                ctx.fillText(text, x, y);
            }
        }

        // Place names for the deeper tiers, now that the country tier has the
        // basemap's own names above it.
        if (tier !== "country" && z >= (tier === "city" ? 2.4 : 1.15)) {
            const labelMin = Math.max(1, Math.round(30 / z));
            const labelShown = saved.filter((d) => (d.count || 1) >= labelMin).slice(0, 45);
            ctx.font = `${10 + Math.min(4, z * 0.18)}px ui-sans-serif, system-ui, sans-serif`;
            ctx.textAlign = "center";
            for (const d of labelShown) {
                const lab = (d.name || d.code || "").slice(0, 20);
                if (!lab) continue;
                ctx.lineWidth = 3;
                ctx.strokeStyle = LABEL_HALO;
                ctx.strokeText(lab, d.sx, d.sy + d.r + 12);
                ctx.fillStyle = "#dbeafe";
                ctx.fillText(lab, d.sx, d.sy + d.r + 12);
            }
            ctx.textAlign = "left";
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
            grad.addColorStop(1, "rgba(0,0,0,0.16)");
            ctx.beginPath();
            ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
        }
    }, [countries, regions, cities, width, height, selected, hotByIso]);

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
                return h ? { code: h.code, key: h.key, name: h.name, sub: h.sub, count: h.count, lat: h.lat, lon: h.lon, sx: h.sx, sy: h.sy } : null;
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
        s.downX = e.clientX;
        s.downY = e.clientY;
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
        setSelected(null);
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

    /**
     * Click a dot to select its place.
     *
     * A click is only treated as a selection when the pointer did not drag: the
     * same element handles spinning, so every drag would otherwise end in a
     * "selected" place the user never chose. The drag distance is measured
     * because a slow drag can still end inside the same pixel.
     *
     * Selection is internal state on purpose. The globe is a population view, and
     * the per-account records live behind the admin's Locations tab; handing a
     * callback out for a parent to implement and then not implementing it would
     * be an extension point nobody uses.
     */
    const onClick = (e) => {
        const s = stateRef.current;
        const moved = Math.hypot(e.clientX - (s.downX ?? e.clientX), e.clientY - (s.downY ?? e.clientY));
        if (moved > 5) return;
        setSelected(s.hover || null);
    };

    const tier = tierForZoom(zoom);
    // What the footer reports has to match what the canvas draws, or "12 cities"
    // next to an empty map reads as a bug even when it is correct. This used to
    // be the raw array length, which ignored the event-count floor entirely — so
    // it routinely claimed far more places than survived it. Report the number
    // that actually passes the floor at this zoom instead.
    //
    // Rotation and viewport culling still hide some of these at any instant
    // (the far side of the sphere is not visible by design), which the draw
    // loop accounts for and this cannot — so this is the count of places on the
    // globe, not of pixels currently lit.
    const tierSource = tier === "city" ? cities : tier === "region" ? regions : countries;
    const tierCount = applyVisibilityFloor(
        placeableCandidates(tierSource),
        floorForZoom(tier, zoom),
    ).length;

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
                onClick={onClick}
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

            {/* legend: what the bright countries mean */}
            {hotByIso.size > 0 && (
                <div className="absolute bottom-8 left-3 flex items-center gap-2 text-[10px] font-semibold text-gray-300 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(122,196,96,0.9)", border: "1px solid rgba(163,230,53,0.95)" }} />
                        country with traffic
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "rgb(163,230,53)" }} />
                        {hotByIso.size} total
                    </span>
                </div>
            )}

            {/* mode hint */}
            <div className="absolute bottom-2 left-3 text-[11px] text-gray-300 dark:text-gray-500 font-medium">
                {tier === "country" && `🌍 countries · ${tierCount} with data · zoom ${zoom.toFixed(2)}`}
                {tier === "region" && `🗺️ states / regions · ${tierCount} · ≥ ${minVisibleCount(zoom)} events · zoom ${zoom.toFixed(2)}`}
                {tier === "city" && `📍 cities / towns · ${tierCount} · ≥ ${minVisibleCount(zoom)} events · zoom ${zoom.toFixed(2)}`}
                <span className="hidden sm:inline"> · drag to spin</span>
                <span className="hidden md:inline"> · scroll or +/− to zoom · double-click to dive in</span>
            </div>
            <div className="absolute bottom-2 right-3 text-[11px] text-gray-300 dark:text-gray-500 font-medium">
                {paused ? "▶ paused" : "auto-rotating"}
            </div>

            {/* The selected place, pinned to the corner. The hover tooltip
                disappears as soon as the pointer moves off a dot, which meant
                there was previously no way to see what you had just clicked. */}
            {selected && (
                <div className="absolute top-2 left-2 max-w-[14rem] bg-white/95 dark:bg-gray-900/95 backdrop-blur border border-blue-300 dark:border-blue-800 rounded-xl px-3 py-2 shadow-sm">
                    <div className="flex items-start gap-2">
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                                {selected.name}
                            </p>
                            {selected.sub && (
                                <p className="text-[10px] text-gray-400 truncate">{selected.sub}</p>
                            )}
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                {selected.count} event{selected.count === 1 ? "" : "s"}
                                {Number.isFinite(selected.lat) && Number.isFinite(selected.lon)
                                    ? ` · ${Number(selected.lat).toFixed(2)}, ${Number(selected.lon).toFixed(2)}`
                                    : ""}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelected(null)}
                            aria-label="Clear selection"
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                    </div>
                    <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-1">
                        Selected — the admin&apos;s Locations tab lists the accounts seen here
                    </p>                </div>
            )}

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
