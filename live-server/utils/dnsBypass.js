const dns = require("dns");
const fetch = require("node-fetch");
const https = require("https");
const http = require("http");

const DNS_SERVERS = ["8.8.8.8", "1.1.1.1", "8.8.4.4"];
const dnsCache = new Map();
const DNS_CACHE_TTL = 30 * 60 * 1000;

function customLookup(hostname, opts, cb) {
    const cached = dnsCache.get(hostname);
    if (cached && Date.now() - cached.time < DNS_CACHE_TTL) {
        return cb(null, cached.ip, 4);
    }

    let resolved = false;
    let remaining = DNS_SERVERS.length;

    for (const server of DNS_SERVERS) {
        const resolver = new dns.Resolver();
        resolver.setServers([server]);
        resolver.resolve4(hostname, (err, addresses) => {
            if (resolved) return;
            if (!err && addresses && addresses.length > 0) {
                resolved = true;
                dnsCache.set(hostname, { ip: addresses[0], time: Date.now() });
                cb(null, addresses[0], 4);
                return;
            }
            remaining--;
            if (remaining === 0) {
                resolved = true;
                cb(new Error(`DNS resolution failed for ${hostname}`));
            }
        });
    }
}

const httpsAgent = new https.Agent({ lookup: customLookup, keepAlive: true });
const httpAgent = new http.Agent({ lookup: customLookup, keepAlive: true });

function bypassFetch(url, opts = {}) {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    return fetch(url, {
        ...opts,
        agent: isHttps ? httpsAgent : httpAgent,
    });
}

module.exports = { bypassFetch };
