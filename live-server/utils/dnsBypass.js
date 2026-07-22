const https = require("https");

const DOH_SERVERS = [
    { ip: "1.1.1.1", host: "1.1.1.1", path: "/dns-query" },
    { ip: "8.8.8.8", host: "dns.google", path: "/resolve" },
];

const dnsCache = new Map();
const DNS_CACHE_TTL = 30 * 60 * 1000;

function httpsRequest(ip, hostname, path, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            method: "GET",
            hostname: ip,
            port: 443,
            path,
            headers: { Host: hostname, Accept: "application/dns-json" },
            servername: hostname,
            timeout,
        }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
                catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
        req.end();
    });
}

async function dohResolve(host) {
    const cached = dnsCache.get(host);
    if (cached && Date.now() - cached.time < DNS_CACHE_TTL) return cached.ip;

    for (const server of DOH_SERVERS) {
        try {
            let path;
            if (server.host === "1.1.1.1") {
                path = `${server.path}?name=${encodeURIComponent(host)}&type=A`;
            } else {
                path = `${server.path}?name=${encodeURIComponent(host)}&type=A`;
            }
            const data = await httpsRequest(server.ip, server.host, path);
            const aRecord = (data.Answer || []).find((r) => r.type === 1);
            if (aRecord && aRecord.data) {
                dnsCache.set(host, { ip: aRecord.data, time: Date.now() });
                return aRecord.data;
            }
        } catch (e) {
            console.error(`DoH failed via ${server.host}: ${e.message}`);
        }
    }
    throw new Error(`All DoH servers failed for ${host}`);
}

function httpsGetByIp(ip, hostname, path, opts = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            method: opts.method || "GET",
            hostname: ip,
            port: 443,
            path,
            headers: { ...opts.headers, Host: hostname },
            servername: hostname,
            timeout: opts.timeout || 20000,
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
        req.end();
    });
}

async function bypassFetch(url, opts = {}) {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const path = parsed.pathname + parsed.search;

    const ip = await dohResolve(host);
    return httpsGetByIp(ip, host, path, opts);
}

module.exports = { bypassFetch, dohResolve };
