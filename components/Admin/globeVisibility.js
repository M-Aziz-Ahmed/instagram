// Which places the globe draws at a given zoom.
//
// Pure logic, no React and no canvas, so it can be asserted on directly —
// globeMap.js holds the projection for the same reason. The bug this exists to
// prevent is silent: a cull that is too aggressive does not throw, it just
// renders an empty map, which is exactly what an admin reports as "the globe
// is broken" when in fact it is working and hiding everything.

export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 40;   // deep enough to isolate a single town
export const Z_REGIONS = 1.6; // zoom at which country dots give way to state/region dots
export const Z_CITIES = 4.5;  // zoom at which region dots give way to city/town dots

// Below a place's event count drops under this zoom-dependent floor it is
// hidden, so zooming in progressively reveals smaller towns.
//
// The floor FALLS as you zoom in (60/z²): ~23 events per place at the region
// threshold, ~3 at the city threshold, 1 once fully zoomed in. That direction
// is right, but it leaves a dead band immediately after each tier switch. A
// site with a handful of users zooms past Z_REGIONS, the tier flips to
// "region", the floor is still ~23, and every region falls under it — so the
// map goes blank at exactly the zoom a user reaches for when looking for their
// own town, and only reappears once they have zoomed far enough for the floor
// to relax. On a small app the whole middle of the zoom range shows nothing.
export const minVisibleCount = (z) => Math.max(1, Math.round(60 / (z * z)));

// How many places must survive the floor at any zoom, whatever their counts.
export const MIN_ALWAYS_VISIBLE = 12;

// Cap on dots actually drawn per frame; keeps the canvas cheap regardless of
// how many distinct places exist.
export const MAX_DOTS = 420;

/** Which tier of place a zoom level draws. */
export function tierForZoom(z) {
    return z >= Z_CITIES ? "city" : z >= Z_REGIONS ? "region" : "country";
}

/** The event-count floor for a tier at a zoom. Countries have no floor. */
export function floorForZoom(tier, z) {
    return tier === "country" ? 1 : minVisibleCount(z);
}

/**
 * Apply the floor without ever producing an empty map.
 *
 * `candidates` must already be sorted by count descending, each shaped
 * `{ pt }`. Returns the subset to draw.
 *
 * The floor is a de-noising device, so it is relaxed until at least
 * `MIN_ALWAYS_VISIBLE` places survive and switched off entirely when the tier
 * has fewer places than that. The busiest places are therefore always drawn,
 * which is what makes zooming in a reliable way to look for a specific town.
 */
export function applyVisibilityFloor(candidates, floor) {
    if (!candidates || candidates.length <= MIN_ALWAYS_VISIBLE) {
        return (candidates || []).slice(0, MAX_DOTS);
    }
    const kept = candidates.filter((c) => (c.pt.count || 1) >= floor);
    if (kept.length >= MIN_ALWAYS_VISIBLE) return kept.slice(0, MAX_DOTS);
    return candidates.slice(0, MIN_ALWAYS_VISIBLE);
}

/**
 * Places with usable coordinates, busiest first, in the shape
 * `applyVisibilityFloor` expects. Coordinates must be real numbers: the globe
 * skips anything else, and a string coordinate would survive a `!= null` filter
 * upstream and then vanish here.
 */
export function placeableCandidates(source) {
    return (source || [])
        .filter((pt) => typeof pt?.lat === "number" && typeof pt?.lon === "number")
        .sort((a, b) => (b.count || 1) - (a.count || 1))
        .map((pt) => ({ pt }));
}
