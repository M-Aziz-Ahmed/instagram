// Server-side IP → location, with two caching strategies.
//
// WHY THERE ARE TWO:
// The aggregate globe only ever asks "roughly where", so it resolves once per
// /24 network and every address behind that NAT shares one answer. That is the
// right trade for a counter: it is cheap, and a city is all a dot needs.
//
// A subscriber record is a different question. "Where was this account made
// from" is a record about one specific connection, and if the lookup was served
// from the /24 cache then the coordinates attached to it are the network's
// centroid, not the address — an account in one town can be recorded as the
// middle of a /24 that spans three. Worse, the raw address is thrown away, so
// there is nothing left to hand to an ISP. `precise: true` skips the network
// bucketing entirely and looks the exact address up.
//
// Privacy: only country / region / city / timezone are derived. The raw address
// is returned to the caller but is only ever persisted where explicitly
// requested (see lib/subscriberLocation.js), never as a by-product of telemetry.

const LOOKUP_URL =
  process.env.GEO_LOOKUP_URL || "http://ip-api.com/json/{ip}?fields=status,country,countryCode,regionName,city,lat,lon,timezone";
const LOOKUP_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // a day is plenty for a country-level stat
const CACHE_MAX = 5000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000; // don't hammer a failing provider

// A subscriber record is worth a day of caching too — an address rarely moves,
// and the point of the cache is to stay inside the provider's rate limit.
const PRECISE_TTL_MS = 12 * 60 * 60 * 1000;
const PRECISE_CACHE_MAX = 2000;

const cache = new Map(); // network -> { value, expiresAt }
const inflight = new Map(); // network -> Promise
const preciseCache = new Map(); // exact address -> { value, expiresAt }
const preciseInflight = new Map(); // exact address -> Promise

// ── provider health ────────────────────────────────────────────────────────
//
// The provider this defaults to (keyless ip-api.com) allows 45 requests a
// minute. Exceeding it returns 429 for the rest of the window, and every one of
// those events is then stored with an EMPTY country — silently, because the
// beacon is fire-and-forget and never reports failure. The symptom is an admin
// page where the "Events" total is four times the located total and nobody can
// tell why.
//
// So a 429 (or any burst of failures) trips a breaker: outbound calls stop for
// a cool-off instead of each one burning a negative-cache entry and hammering a
// provider that has already said no. Real failures are counted by reason and
// exposed on the admin panel, so "geo is broken" is a number rather than a
// mystery.
const BREAKER_THRESHOLD = 8;      // consecutive failures before opening
const BREAKER_COOLOFF_MS = 5 * 60 * 1000;
const HEALTH_WINDOW_MS = 60 * 60 * 1000;

let consecutiveFailures = 0;
let breakerOpenUntil = 0;
// Rolling per-reason tallies, trimmed by age on read so the map stays bounded
// without a background timer.
const failureLog = new Map();

function recordFailure(reason) {
    consecutiveFailures++;
    failureLog.set(reason, { count: (failureLog.get(reason)?.count || 0) + 1, lastAt: Date.now() });
    if (consecutiveFailures >= BREAKER_THRESHOLD) {
        breakerOpenUntil = Date.now() + BREAKER_COOLOFF_MS;
        consecutiveFailures = 0;
    }
}

function recordSuccess() {
    consecutiveFailures = 0;
}

function breakerOpen() {
    return Date.now() < breakerOpenUntil;
}

/** Provider health, for the admin panel. No IPs, no addresses — counts only. */
function providerHealth() {
    const now = Date.now();
    const failures = {};
    let total = 0;
    for (const [reason, entry] of failureLog) {
        if (now - entry.lastAt > HEALTH_WINDOW_MS) continue;
        failures[reason] = entry.count;
        total += entry.count;
    }
    return {
        provider: LOOKUP_URL.replace(/\{ip\}/, "{ip}").replace(/^https?:\/\//, "").split("/")[0],
        breakerOpen: breakerOpen(),
        breakerOpenForMs: Math.max(0, breakerOpenUntil - now),
        failuresLastHour: total,
        failuresByReason: failures,
        cacheSize: cache.size,
        note: "Failures are stored events with no country. Bot traffic is counted here only if the provider was asked about it.",
    };
}

/** Test hook: clears health + breaker state. */
function resetProviderHealth() {
    consecutiveFailures = 0;
    breakerOpenUntil = 0;
    failureLog.clear();
}

/** Bucket an address to its /24 so a whole network shares one lookup. */
function networkKey(ip) {
    if (!ip) return "";
    if (ip.includes(":")) {
        // IPv6: keep the first four hextets (/64), which is a typical home prefix.
        return ip.split(":").slice(0, 4).join(":") + "::/64";
    }
    const parts = ip.split(".");
    if (parts.length !== 4) return ip;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

/**
 * Strip ports, IPv4-mapped IPv6 prefixes and trusted-proxy headers.
 * req.ip is already populated by Express when trust proxy is configured, so we
 * prefer that and only fall back to the raw socket.
 */
function clientIp(req) {
    const raw = req.ip || req.socket?.remoteAddress || "";
    if (!raw) return "";
    let ip = String(raw);
    if (ip.startsWith("::ffff:")) ip = ip.slice(7);
    if (ip.startsWith("[")) ip = ip.slice(1, ip.indexOf("]"));
    return ip.replace(/%.*$/, "");
}

/** Private/reserved ranges, which no provider will geolocate meaningfully. */
function isRoutable(ip) {
    if (!ip) return false;
    if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return false;
    const p = ip.split(".");
    if (p.length !== 4) return true; // not dotted-quad; assume IPv6 public
    const [a, b] = [Number(p[0]), Number(p[1])];
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false; // link-local, incl. cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    return true;
}

/** One provider answer, normalised. Only country/region/city/timezone survive. */
function shapeLocation(d) {
    if (!d || d.status !== "success" || !(d.country || d.countryCode)) return null;
    return {
        country: typeof d.country === "string" ? d.country.slice(0, 64) : "",
        countryCode: typeof d.countryCode === "string" ? d.countryCode.slice(0, 3).toUpperCase() : "",
        region: typeof d.regionName === "string" ? d.regionName.slice(0, 64) : "",
        city: typeof d.city === "string" ? d.city.slice(0, 64) : "",
        lat: Number.isFinite(d.lat) ? d.lat : null,
        lon: Number.isFinite(d.lon) ? d.lon : null,
        tz: typeof d.timezone === "string" ? d.timezone.slice(0, 32) : "",
    };
}

/**
 * One provider call. Resolves to a location or to { fail: "<reason>" }.
 *
 * The reason matters and used to be thrown away: a 429 (throttled), a 5xx, a
 * network error and a "this address is not in the database" answer all used to
 * collapse into the same `null`, so the admin page could only ever report that
 * some events had no country. The admin panel now shows the split.
 */
function fetchLocation(ip) {
    const url = LOOKUP_URL.replace("{ip}", encodeURIComponent(ip));
    return fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })
        .then((r) => {
            if (r.status === 429) return { fail: "throttled" };
            if (!r.ok) return { fail: `http_${r.status}` };
            return r.json().then((d) => {
                const value = shapeLocation(d);
                return value ? { value } : { fail: "not_found" };
            });
        })
        .catch((err) => {
            // A timeout is its own bucket: it means the provider is slow or
            // unreachable, which is a different problem from being rate-limited.
            if (err?.name === "TimeoutError" || err?.name === "AbortError") return { fail: "timeout" };
            return { fail: "network_error" };
        });
}


/** Bounded insertion, so a long-running process cannot grow without limit. */
function remember(map, key, entry, max) {
    if (map.size >= max) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
    }
    map.set(key, entry);
}

async function lookup(network) {
    if (!network) return null;

    // The provider is called with the masked network's first address, which for
    // a private range is something like 192.168.1.0 — an address that can never
    // geolocate to anything. Bailing here rather than asking keeps those calls
    // out of the request budget, which matters because the free tier this
    // defaults to allows only 45 requests a minute. Wasting quota on addresses
    // that were always going to fail starves the real ones.
    const probe = network.replace(/\/(24|64)$/, "");
    if (!isRoutable(probe)) return null;

    const hit = cache.get(network);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const pending = inflight.get(network);
    if (pending) return pending;

    // The provider has already refused us in bulk. Asking again would only add
    // load, and a throttled provider does not recover faster because we keep
    // knocking.
    if (breakerOpen()) return null;

    const promise = fetchLocation(probe)
        .then((result) => {
            if (result.fail) {
                recordFailure(result.fail);
                remember(cache, network, { value: null, expiresAt: Date.now() + NEGATIVE_TTL_MS }, CACHE_MAX);
                return null;
            }
            recordSuccess();
            remember(cache, network, { value: result.value, expiresAt: Date.now() + CACHE_TTL_MS }, CACHE_MAX);
            return result.value;
        })
        .finally(() => inflight.delete(network));

    inflight.set(network, promise);
    return promise;
}

/**
 * Exact-address lookup, used for subscriber records.
 *
 * Separate cache from `lookup` on purpose: the two have different TTLs and
 * different cardinality, and merging them would let a cheap /24 answer satisfy
 * a request that needs the address itself.
 */
async function lookupPrecise(ip) {
    if (!ip || !isRoutable(ip)) return null;

    const hit = preciseCache.get(ip);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const pending = preciseInflight.get(ip);
    if (pending) return pending;

    // A subscriber record is worth one request even under load, so the breaker
    // is deliberately not consulted here. Only the aggregate globe, which asks
    // about every visitor on every page view, is allowed to give up.
    const promise = fetchLocation(ip)
        .then((result) => {
            if (result.fail) {
                recordFailure(result.fail);
                remember(preciseCache, ip, { value: null, expiresAt: Date.now() + NEGATIVE_TTL_MS }, PRECISE_CACHE_MAX);
                return null;
            }
            recordSuccess();
            remember(preciseCache, ip, { value: result.value, expiresAt: Date.now() + PRECISE_TTL_MS }, PRECISE_CACHE_MAX);
            return result.value;
        })
        .finally(() => preciseInflight.delete(ip));

    preciseInflight.set(ip, promise);
    return promise;
}

/**
 * @param {import("express").Request} req
 * @param {{ precise?: boolean }} [opts]
 *   `precise` resolves the exact address instead of the /24 network. Only for
 *   records where the address itself is the point.
 * @returns {Promise<{ ip: string, network: string, location: object|null }|null>}
 */
async function resolveLocation(req, opts = {}) {
    const ip = clientIp(req);
    if (!ip) return null;
    const network = networkKey(ip);
    try {
        const location = opts.precise
            ? await lookupPrecise(ip)
            : await lookup(network);
        return { ip, network, location };
    } catch {
        return null;
    }
}

module.exports = {
    resolveLocation, networkKey, clientIp, isRoutable,
    providerHealth, resetProviderHealth,
};

