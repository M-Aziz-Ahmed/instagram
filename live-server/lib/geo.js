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

/** One provider call, shared by both caching strategies. */
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

function fetchLocation(ip) {
    const url = LOOKUP_URL.replace("{ip}", encodeURIComponent(ip));
    return fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })
        .then((r) => (r.ok ? r.json() : null))
        .then(shapeLocation)
        .catch(() => null);
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

    const hit = cache.get(network);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const pending = inflight.get(network);
    if (pending) return pending;

    // The provider wants a bare IP, not the masked network.
    const ip = network.replace(/\/(24|64)$/, "");

    const promise = fetchLocation(ip)
        .then((value) => {
            remember(cache, network, {
                value,
                expiresAt: Date.now() + (value ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
            }, CACHE_MAX);
            return value;
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

    const promise = fetchLocation(ip)
        .then((value) => {
            remember(preciseCache, ip, {
                value,
                expiresAt: Date.now() + (value ? PRECISE_TTL_MS : NEGATIVE_TTL_MS),
            }, PRECISE_CACHE_MAX);
            return value;
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

module.exports = { resolveLocation, networkKey, clientIp, isRoutable };
