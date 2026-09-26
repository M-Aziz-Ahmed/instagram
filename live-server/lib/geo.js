// Server-side IP → coarse location, with aggressive caching.
//
// Why this moved off the browser: the client used to call ipinfo.io directly
// on every visitor's device and post the answer back. That handed every user's
// IP to a third party from their own browser, which is a GDPR problem, and it
// meant the numbers in the admin dashboard could be anything a client chose to
// send. Resolving geo here means the raw IP never leaves the server and the
// stored location is derived from the connection rather than self-reported.
//
// Privacy: only country / region / city / timezone are kept, and lookups are
// cached per /24 network so an entire NAT'd network resolves once.

const LOOKUP_URL =
  process.env.GEO_LOOKUP_URL || "http://ip-api.com/json/{ip}?fields=status,country,countryCode,regionName,city,lat,lon,timezone";
const LOOKUP_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // a day is plenty for a country-level stat
const CACHE_MAX = 5000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000; // don't hammer a failing provider

const cache = new Map(); // network -> { value, expiresAt }
const inflight = new Map(); // network -> Promise

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

async function lookup(network) {
    if (!network) return null;

    const hit = cache.get(network);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const pending = inflight.get(network);
    if (pending) return pending;

    // The provider wants a bare IP, not the masked network.
    const ip = network.replace(/\/(24|64)$/, "");
    const url = LOOKUP_URL.replace("{ip}", encodeURIComponent(ip));

    const promise = fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
            let value = null;
            if (d && d.status === "success" && (d.country || d.countryCode)) {
                value = {
                    country: typeof d.country === "string" ? d.country.slice(0, 64) : "",
                    countryCode: typeof d.countryCode === "string" ? d.countryCode.slice(0, 3).toUpperCase() : "",
                    region: typeof d.regionName === "string" ? d.regionName.slice(0, 64) : "",
                    city: typeof d.city === "string" ? d.city.slice(0, 64) : "",
                    lat: Number.isFinite(d.lat) ? d.lat : null,
                    lon: Number.isFinite(d.lon) ? d.lon : null,
                    tz: typeof d.timezone === "string" ? d.timezone.slice(0, 32) : "",
                };
            }

            // Bound the cache so a long-running process can't grow without limit.
            if (cache.size >= CACHE_MAX) {
                const oldest = cache.keys().next().value;
                cache.delete(oldest);
            }
            cache.set(network, {
                value,
                expiresAt: Date.now() + (value ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
            });
            return value;
        })
        .catch(() => null)
        .finally(() => inflight.delete(network));

    inflight.set(network, promise);
    return promise;
}

/**
 * @param {import("express").Request} req
 * @returns {Promise<object|null>} coarse location, or null when unavailable.
 */
async function resolveLocation(req) {
    try {
        return await lookup(networkKey(clientIp(req)));
    } catch {
        return null;
    }
}

module.exports = { resolveLocation, networkKey, clientIp };
