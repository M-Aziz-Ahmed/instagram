// ─────────────────────────────────────────────────────────────
// Pure analytics helpers for the admin dashboard. Everything here
// is deterministic and testable without a running MongoDB.
// ─────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");

// Local date bucket key (YYYY-MM-DD) honoring an IANA timezone (defaults to
// the server's own wall clock). Returns the date only — year/month/week are
// derived in the callers.
function dayKey(d, tz) {
    const date = d instanceof Date ? d : new Date(d);
    if (!tz || tz === "local") {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
    try {
        const parts = new Intl.DateTimeFormat("en-CA", {
            year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz,
        }).formatToParts(date);
        const get = (t) => parts.find((p) => p.type === t)?.value;
        return `${get("year")}-${get("month")}-${get("day")}`;
    } catch {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
}

function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

function iso(date) {
    return date.toISOString();
}

// Which key does a timestamp fall under for a granularity?
function bucketKey(d, granularity, tz) {
    const day = dayKey(d, tz);
    if (granularity === "day") return day;
    if (granularity === "week") {
        const date = new Date(d);
        const dow = (date.getDay() + 6) % 7; // Monday = 0
        const monday = addDays(date, -dow);
        return dayKey(monday, tz);
    }
    if (granularity === "month") return day.slice(0, 7); // YYYY-MM
    if (granularity === "year") return day.slice(0, 4); // YYYY
    return day;
}

// Full bucket list for [from, to] inclusive at a granularity. Returns
// [{ key, label }] where label is human-readable for charts.
function buckets(from, to, granularity, tz) {
    const out = [];
    const cursor = new Date(from);
    const end = new Date(to);
    let guard = 0;
    while (cursor <= end && guard < 4000) {
        const key = bucketKey(cursor, granularity, tz);
        const last = out[out.length - 1];
        if (!last || last.key !== key) {
            out.push({ key, label: labelForKey(cursor, granularity) });
        }
        cursor.setDate(cursor.getDate() + 1);
        guard++;
    }
    return out;
}

function labelForKey(date, granularity) {
    if (granularity === "year") return String(date.getFullYear());
    if (granularity === "month") {
        return date.toLocaleString("en-US", { month: "short", year: "2-digit" });
    }
    if (granularity === "week") {
        const dow = (date.getDay() + 6) % 7;
        const monday = addDays(date, -dow);
        return `${pad(monday.getMonth() + 1)}/${pad(monday.getDate())}`;
    }
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

// Count documents by bucket. `dateField` is the field name (`createdAt`,
// `timeStamp`…). Returns a Map<key, count>.
function bucketCounts(docs, dateField, granularity, tz) {
    const map = new Map();
    for (const doc of docs) {
        const d = doc[dateField];
        if (!d) continue;
        const key = bucketKey(d, granularity, tz);
        map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
}

// Distinct users per bucket (approximated by counting unique sessionId/userId
// within each bucket via a Set — fine at dashboard scale).
function bucketDistinct(docs, dateField, idField, granularity, tz) {
    const map = new Map();
    for (const doc of docs) {
        const d = doc[dateField];
        const id = doc[idField];
        if (!d) continue;
        const key = bucketKey(d, granularity, tz);
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(String(id));
    }
    const out = new Map();
    for (const [k, set] of map) out.set(k, set.size);
    return out;
}

// Merge maps into a zero-filled array matching `buckets`.
function toSeries(bucketList, ...maps) {
    return bucketList.map((b) => {
        const row = { ...b };
        maps.forEach((map, i) => { row[`v${i}`] = map.get(b.key) || 0; });
        return row;
    });
}

// ── Device / location roll-ups (from lean AnalyticsEvent docs) ──

function deviceBreakdown(events) {
    const groups = { type: {}, os: {}, browser: {} };
    for (const ev of events) {
        const d = ev.device || {};
        const t = d.type || "";
        const os = d.os || "Unknown";
        const b = d.browser || "Unknown";
        groups.type[t || "unknown"] = (groups.type[t || "unknown"] || 0) + 1;
        groups.os[os] = (groups.os[os] || 0) + 1;
        groups.browser[b] = (groups.browser[b] || 0) + 1;
    }
    const sortDesc = (obj) => Object.entries(obj)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 12)
        .map(([label, count]) => ({ label, count }));
    return {
        type: sortDesc(groups.type),
        os: sortDesc(groups.os),
        browser: sortDesc(groups.browser),
    };
}

// Shape the $group output of the /analytics/locations roll-ups into the flat
// records the globe consumes. Kept here (rather than inline in the route) so
// the field mapping is unit-testable — a wrong field name here silently blanks
// a whole tier of the map.
function mapCountryRollup(r) {
    return {
        code: r._id,
        name: r.name || r._id,
        count: r.count,
        lat: r.lat ?? null,
        lon: r.lon ?? null,
    };
}

function mapRegionRollup(r) {
    return {
        code: `${r._id.country}:${r._id.region || ""}`,
        name: r.name || r._id.region || "",
        country: r.country || r._id.country || "",
        countryCode: r._id.country || "",
        count: r.count,
        lat: r.lat ?? null,
        lon: r.lon ?? null,
    };
}

function mapCityRollup(r) {
    return {
        code: `${r._id.country}:${r._id.region || ""}:${r._id.city || ""}`,
        name: r.name || r._id.city || "",
        city: r.name || r._id.city || "",
        region: r.region || r._id.region || "",
        country: r.countryName || r._id.country || "",
        countryCode: r._id.country || "",
        count: r.count,
        lat: r.lat ?? null,
        lon: r.lon ?? null,
    };
}

// Countries only get coordinates from the city-level geo lookup, so a country
// row can arrive without them. Backfill from the first city that has a fix.
function backfillCountryCoords(countryList, cityList) {
    for (const c of countryList) {
        if (c.lat == null || c.lon == null) {
            const hit = cityList.find((ct) => ct.countryCode === c.code && ct.lat != null && ct.lon != null);
            if (hit) { c.lat = hit.lat; c.lon = hit.lon; }
        }
    }
    return countryList;
}

function growthPercent(current, previous) {
    if (!previous || previous <= 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 1000) / 10;
}

module.exports = {
    pad, dayKey, bucketKey, buckets, labelForKey,
    bucketCounts, bucketDistinct, toSeries,
    deviceBreakdown, growthPercent,
    mapCountryRollup, mapRegionRollup, mapCityRollup, backfillCountryCoords,
};
