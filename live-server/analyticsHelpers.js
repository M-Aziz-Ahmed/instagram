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

// Only the top N labels per dimension are ever drawn, and a $group over an
// unbounded number of distinct strings is the one thing that can still grow
// with traffic. Matches the caps on the location roll-ups.
const DEVICE_TOP_N = 12;

// Device / OS / browser mix as a Mongo aggregate.
//
// This replaced a query that pulled 30,000 event documents into Node and counted
// them in JavaScript. That had two problems: it capped silently, so past 30,000
// events the donut was drawing percentages of a partial set while still claiming
// a total, and it cost one document per event to produce three numbers.
//
// A $facet does all three dimensions in a single pass over the matched events,
// so the cost is proportional to the events scanned rather than to the number of
// documents serialised into the Node heap, and the total is exact at any volume.
//
// The "unknown"/"Unknown" buckets are deliberate and not cosmetic: they are how
// an event that arrived without a usable device — or, before per-post tracking
// recorded a device at all, every post event — shows up in the breakdown instead
// of vanishing.
const UNKNOWN_TYPE = "unknown";
const UNKNOWN_LABEL = "Unknown";

// "" is the schema default, and $ifNull only replaces null/missing, so the empty
// string has to be folded in explicitly or every default-valued event would form
// its own bucket instead of landing in Unknown.
function labelOr(field, fallback) {
    return { $cond: [{ $eq: [{ $ifNull: [field, ""] }, ""] }, fallback, field] };
}

function deviceBreakdownPipeline(match, topN = DEVICE_TOP_N) {
    const facet = (field, fallback) => ([
        { $group: { _id: labelOr(field, fallback), count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: topN },
    ]);
    return [
        { $match: match },
        {
            $facet: {
                type: facet("$device.type", UNKNOWN_TYPE),
                os: facet("$device.os", UNKNOWN_LABEL),
                browser: facet("$device.browser", UNKNOWN_LABEL),
                total: [{ $count: "n" }],
            },
        },
    ];
}

// Shape the $facet output into the flat arrays the charts consume.
function mapDeviceBreakdown(rows) {
    const f = rows || {};
    const toList = (arr) => (arr || []).map((r) => ({ label: r._id, count: r.count }));
    return {
        type: toList(f.type),
        os: toList(f.os),
        browser: toList(f.browser),
        total: f.total?.[0]?.n || 0,
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

// Event types that count as a click on a post, for the top-posts roll-up.
const POST_CLICK_TYPES = ["post_click", "post_profile_click", "post_link_click", "post_hashtag_click"];

// Pipeline for the per-post counts behind /analytics/posts.
//
// Kept here so it can be unit-tested: every clause is a classification decision
// about which event type means what, and getting one wrong silently mislabels a
// column rather than throwing.
function postCountsPipeline(match) {
    return [
        { $match: match },
        {
            $group: {
                _id: "$postId",
                impressions: { $sum: { $cond: [{ $eq: ["$type", "post_impression"] }, 1, 0] } },
                clicks: { $sum: { $cond: [{ $in: ["$type", POST_CLICK_TYPES] }, 1, 0] } },
                shares: { $sum: { $cond: [{ $eq: ["$type", "post_share"] }, 1, 0] } },
            },
        },
        // Any interaction implies the post was rendered, so the viewer set below
        // is taken over every post_* event rather than impressions only.
        { $sort: { impressions: -1, clicks: -1 } },
    ];
}

// Pipeline for the distinct-viewer ("reach") set behind /analytics/posts.
//
// THE TRAP THIS EXISTS TO DOCUMENT: reach is a set of distinct viewers, and the
// test for "does this event have a viewer" has to be built from real BOOLEANS.
//
// The natural-looking version is wrong:
//     $or: [{ $ifNull: ["$userId", false] }, { $ifNull: ["$sessionId", false] }]
// $or tests the TRUTHINESS of its operands, and Mongo coerces "" to TRUE. So an
// event with an empty sessionId satisfied the test and was added to the set as
// the literal key "|", inflating reach by one for every such event.
//
// Also note $nin is a query operator and does not exist in an aggregation
// expression; the aggregation spelling of "is neither empty nor missing" is
// $not + $in.
//
// The key is the ACCOUNT when there is one, falling back to the browser session.
// Keying on sessionId alone is the obvious cheap choice and it counts browsers,
// not people: someone who reads the site on a phone and a laptop becomes two
// viewers, which is exactly the inflation "reach" is supposed to not have.
//
// THE RESIDUAL CASE, stated plainly rather than hidden: a visitor who browses
// anonymously and then signs in emits an anonymous event (keyed by session) and
// a signed-in event (keyed by account) for the same post, and is counted twice.
// Folding those together needs a session→account map across the whole window,
// which means materialising every distinct viewer in memory — the same thing
// this roll-up was rewritten to avoid. The trade is deliberate: account-first
// fixes the common case (one person, several devices) and leaves the rare one
// (one person, one session, signing in halfway) counted twice.
function viewerSetPipeline(match) {
    return [
        { $match: match },
        {
            $group: {
                _id: "$postId",
                viewers: {
                    $addToSet: {
                        $cond: [
                            { $or: [
                                { $not: { $in: [{ $ifNull: ["$userId", ""] }, ["", null]] } },
                                { $not: { $in: [{ $ifNull: ["$sessionId", ""] }, ["", null]] } },
                            ] },
                            { $concat: [
                                { $cond: [
                                    { $not: { $in: [{ $ifNull: ["$userId", ""] }, ["", null]] } },
                                    "u:", "s:",
                                ] },
                                { $cond: [
                                    { $not: { $in: [{ $ifNull: ["$userId", ""] }, ["", null]] } },
                                    { $ifNull: ["$userId", ""] },
                                    { $ifNull: ["$sessionId", ""] },
                                ] },
                            ] },
                            "$$REMOVE",
                        ],
                    },
                },
            },
        },
    ];
}


module.exports = {
    pad, dayKey, bucketKey, buckets, labelForKey,
    bucketCounts, bucketDistinct, toSeries,
    deviceBreakdownPipeline, mapDeviceBreakdown, growthPercent,
    mapCountryRollup, mapRegionRollup, mapCityRollup, backfillCountryCoords,
    POST_CLICK_TYPES, postCountsPipeline, viewerSetPipeline,
};
