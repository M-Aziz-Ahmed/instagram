const dgram = require("dgram");
const fetch = require("node-fetch");
const https = require("https");

const DNS_SERVERS = ["8.8.8.8", "1.1.1.1", "8.8.4.4"];
const dnsCache = new Map();
const DNS_CACHE_TTL = 30 * 60 * 1000;
const pending = new Map();

function buildDnsQuery(host) {
    const labels = host.split(".");
    const header = Buffer.alloc(12);
    header.writeUInt16BE(0x1234, 0); // transaction id
    header.writeUInt16BE(0x0100, 2); // flags: standard query
    header.writeUInt16BE(1, 4); // questions
    header.writeUInt16BE(0, 6); // answers
    header.writeUInt16BE(0, 8); // authority
    header.writeUInt16BE(0, 10); // additional

    let offset = 12;
    for (const label of labels) {
        header.writeUInt8(label.length, offset++);
        header.write(label, offset, label.length);
        offset += label.length;
    }
    header.writeUInt8(0, offset++); // end of name
    header.writeUInt16BE(1, offset); offset += 2; // type A
    header.writeUInt16BE(1, offset); offset += 2; // class IN

    return header.slice(0, offset);
}

function parseDnsResponse(buf) {
    const answerCount = buf.readUInt16BE(6);
    let offset = 12;
    // skip question
    while (buf[offset] !== 0) offset += buf[offset] + 1;
    offset += 5; // null + type + class

    for (let i = 0; i < answerCount; i++) {
        if ((buf[offset] & 0xC0) === 0xC0) offset += 2;
        else { while (buf[offset] !== 0) offset += buf[offset] + 1; offset++; }
        const type = buf.readUInt16BE(offset); offset += 2;
        offset += 2; // class
        offset += 4; // ttl
        const rdLength = buf.readUInt16BE(offset); offset += 2;
        if (type === 1 && rdLength === 4) {
            return `${buf[offset]}.${buf[offset + 1]}.${buf[offset + 2]}.${buf[offset + 3]}`;
        }
        offset += rdLength;
    }
    return null;
}

function dnsLookup(host, timeout = 3000) {
    const cached = dnsCache.get(host);
    if (cached && Date.now() - cached.time < DNS_CACHE_TTL) return Promise.resolve(cached.ip);
    if (pending.has(host)) return pending.get(host);

    const p = new Promise((resolve, reject) => {
        let tried = 0;
        const tryNext = () => {
            if (tried >= DNS_SERVERS.length) return reject(new Error(`DNS failed for ${host}`));
            const server = DNS_SERVERS[tried++];
            const socket = dgram.createSocket("udp4");
            const timer = setTimeout(() => { socket.close(); tryNext(); }, timeout);

            socket.on("message", (msg) => {
                clearTimeout(timer);
                socket.close();
                const ip = parseDnsResponse(msg);
                if (ip) {
                    dnsCache.set(host, { ip, time: Date.now() });
                    resolve(ip);
                } else {
                    tryNext();
                }
            });
            socket.on("error", () => { clearTimeout(timer); socket.close(); tryNext(); });
            socket.send(buildDnsQuery(host), 53, server);
        };
        tryNext();
    });
    p.finally(() => pending.delete(host));
    pending.set(host, p);
    return p;
}

const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 10,
    lookup: (hostname, opts, cb) => {
        dnsLookup(hostname).then(
            (ip) => cb(null, ip, 4),
            (err) => cb(err)
        );
    },
});

function bypassFetch(url, opts = {}) {
    return fetch(url, { ...opts, agent });
}

module.exports = { bypassFetch };
