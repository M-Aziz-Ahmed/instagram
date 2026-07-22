const dns = require("dns");
const fetch = require("node-fetch");
const https = require("https");

dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);

const dnsCache = new Map();
const DNS_CACHE_TTL = 30 * 60 * 1000;
const resolving = new Map();

function resolve(host) {
    if (dnsCache.has(host)) {
        const entry = dnsCache.get(host);
        if (Date.now() - entry.time < DNS_CACHE_TTL) return Promise.resolve(entry.ip);
    }
    if (resolving.has(host)) return resolving.get(host);

    const p = new Promise((resolve, reject) => {
        dns.resolve4(host, (err, addresses) => {
            resolving.delete(host);
            if (err || !addresses || !addresses.length) return reject(err || new Error("No addresses"));
            const ip = addresses[0];
            dnsCache.set(host, { ip, time: Date.now() });
            resolve(ip);
        });
    });
    resolving.set(host, p);
    return p;
}

const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 10,
    lookup: (hostname, opts, cb) => {
        resolve(hostname).then(
            (ip) => cb(null, ip, 4),
            (err) => cb(err)
        );
    },
});

function bypassFetch(url, opts = {}) {
    return fetch(url, { ...opts, agent });
}

module.exports = { bypassFetch };
