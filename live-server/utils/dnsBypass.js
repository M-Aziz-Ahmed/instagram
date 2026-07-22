const dns = require("dns");
const dnsPromises = require("dns").promises;
const fetch = require("node-fetch");
const https = require("https");
const http = require("http");

const DNS_SERVERS = ["8.8.8.8", "1.1.1.1", "8.8.4.4"];
const dnsCache = new Map();
const DNS_CACHE_TTL = 30 * 60 * 1000;

async function resolveDns(host) {
    const cached = dnsCache.get(host);
    if (cached && Date.now() - cached.time < DNS_CACHE_TTL) return cached.ip;

    for (const server of DNS_SERVERS) {
        try {
            const resolver = new dns.Resolver();
            resolver.setServers([server]);
            const ip = await new Promise((resolve, reject) => {
                resolver.resolve4(host, (err, addresses) => {
                    if (err) reject(err);
                    else resolve(addresses[0]);
                });
            });
            if (ip) {
                dnsCache.set(host, { ip, time: Date.now() });
                return ip;
            }
        } catch {}
    }
    return null;
}

function bypassFetch(url, opts = {}) {
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        return fetch(url, opts);
    }

    const host = parsedUrl.hostname;

    return resolveDns(host).then((ip) => {
        if (!ip) return fetch(url, opts);

        const isHttps = parsedUrl.protocol === "https:";
        const port = parsedUrl.port || (isHttps ? 443 : 80);
        const agent = isHttps ? https : http;

        const headers = { ...opts.headers, Host: host };

        return new Promise((resolve, reject) => {
            const req = agent.request({
                method: opts.method || "GET",
                hostname: ip,
                port,
                path: parsedUrl.pathname + parsedUrl.search,
                headers,
                timeout: opts.timeout || 20000,
                servername: host,
            }, (res) => {
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () => {
                    const buffer = Buffer.concat(chunks);
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        headers: res.headers,
                        buffer: () => Promise.resolve(buffer),
                        json: () => Promise.resolve(JSON.parse(buffer.toString())),
                        text: () => Promise.resolve(buffer.toString()),
                    });
                });
            });
            req.on("error", reject);
            req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
            if (opts.body) req.write(opts.body);
            req.end();
        });
    });
}

module.exports = { bypassFetch, resolveDns };
