const fetch = require("node-fetch");
const https = require("https");

const DOH_ENDPOINTS = [
    "https://1.1.1.1/dns-query",
    "https://dns.google/resolve",
];

const dnsCache = new Map();
const DNS_CACHE_TTL = 30 * 60 * 1000;
const pending = new Map();

async function dohLookup(host) {
    const cached = dnsCache.get(host);
    if (cached && Date.now() - cached.time < DNS_CACHE_TTL) return cached.ip;
    if (pending.has(host)) return pending.get(host);

    const p = (async () => {
        for (const endpoint of DOH_ENDPOINTS) {
            try {
                const url = `${endpoint}?name=${encodeURIComponent(host)}&type=A`;
                const res = await fetch(url, {
                    headers: { "Accept": "application/dns-json" },
                    timeout: 5000,
                });
                if (!res.ok) continue;
                const data = await res.json();
                const aRecord = (data.Answer || []).find((r) => r.type === 1);
                if (aRecord && aRecord.data) {
                    dnsCache.set(host, { ip: aRecord.data, time: Date.now() });
                    return aRecord.data;
                }
            } catch {}
        }
        throw new Error(`DoH failed for ${host}`);
    })();

    pending.set(host, p);
    try {
        const ip = await p;
        return ip;
    } finally {
        pending.delete(host);
    }
}

const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 10,
    lookup: (hostname, opts, cb) => {
        dohLookup(hostname).then(
            (ip) => cb(null, ip, 4),
            (err) => cb(err)
        );
    },
});

function bypassFetch(url, opts = {}) {
    return fetch(url, { ...opts, agent });
}

module.exports = { bypassFetch };
