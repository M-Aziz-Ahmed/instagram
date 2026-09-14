const fetch = require("node-fetch");
const dns = require("dns");
const net = require("net");
const { URL } = require("url");

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const MAX_FETCH_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 4;

const PRIVATE_PREFIXES = [
    { ip: "0.0.0.0", bits: 8 },
    { ip: "10.0.0.0", bits: 8 },
    { ip: "100.64.0.0", bits: 10 },
    { ip: "127.0.0.0", bits: 8 },
    { ip: "169.254.0.0", bits: 16 },
    { ip: "172.16.0.0", bits: 12 },
    { ip: "192.0.0.0", bits: 24 },
    { ip: "192.168.0.0", bits: 16 },
    { ip: "198.18.0.0", bits: 15 },
    { ip: "224.0.0.0", bits: 4 },
    { ip: "240.0.0.0", bits: 4 },
    { ip: "::", bits: 128 },
    { ip: "::1", bits: 128 },
    { ip: "fc00::", bits: 7 },
    { ip: "fe80::", bits: 10 },
    { ip: "ff00::", bits: 8 },
];

function ipToInt(ip) {
    return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isBlockedIp(ip) {
    const trimmed = String(ip || "").trim().toLowerCase();
    if (net.isIPv6(trimmed)) {
        const lower = trimmed.split("%")[0].toLowerCase();
        return PRIVATE_PREFIXES.some(({ ip: prefix, bits }) => {
            if (!net.isIPv6(prefix)) return false;
            const a = BigInt("0x" + lower.split(":").map((p) => p || "0").join("").padEnd(32, "0"));
            const b = BigInt("0x" + prefix.split(":").map((p) => p || "0").join("").padEnd(32, "0"));
            return (a >> BigInt(128 - bits)) === (b >> BigInt(128 - bits));
        });
    }
    if (!net.isIPv4(trimmed)) return true;
    const int = ipToInt(trimmed);
    return PRIVATE_PREFIXES.some(({ ip: prefix, bits }) => {
        if (net.isIPv6(prefix)) return false;
        const shift = 32 - bits;
        return (int >>> shift) === (ipToInt(prefix) >>> shift);
    });
}

async function resolveHost(hostname) {
    const records = await new Promise((resolve, reject) => {
        dns.lookup(hostname, { all: true, family: 4 }, (err, addresses) => {
            if (err && err.code === "ENOTFOUND") {
                dns.lookup(hostname, { all: true, family: 6 }, (e2, addrs2) => {
                    if (e2) return reject(e2);
                    resolve(addrs2);
                });
            } else if (err) {
                reject(err);
            } else {
                resolve(addresses);
            }
        });
    });
    return (records || []).map((r) => r.address);
}

async function assertSafeUrl(rawUrl) {
    let u;
    try {
        u = new URL(rawUrl);
    } catch {
        throw new Error("Invalid URL");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Unsupported protocol");
    if (u.port && u.port !== "80" && u.port !== "443") throw new Error("Non-standard port");

    const hostname = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(hostname) && isBlockedIp(hostname)) throw new Error("Blocked address");

    const addresses = await resolveHost(hostname);
    if (!addresses.length) throw new Error("Unresolvable host");
    if (addresses.some((addr) => isBlockedIp(addr))) throw new Error("Blocked address");

    return u;
}

async function fetchWithRedirects(urlString, redirectsLeft = MAX_REDIRECTS) {
    const target = await assertSafeUrl(urlString);
    const res = await fetch(target.href, {
        headers: {
            "User-Agent": UA,
            Accept: "text/html,application/xhtml+xml",
        },
        redirect: "manual",
        timeout: FETCH_TIMEOUT_MS,
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        if (redirectsLeft <= 0) throw new Error("Too many redirects");
        const next = new URL(res.headers.get("location"), target).href;
        return fetchWithRedirects(next, redirectsLeft - 1);
    }
    return { target, res };
}

async function readHtmlLimited(body, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let received = 0;
        let done = false;
        const finish = (html) => {
            if (done) return;
            done = true;
            resolve(html);
        };
        body.on("data", (chunk) => {
            if (done) return;
            received += chunk.length;
            if (received > maxBytes) {
                body.destroy();
                finish(Buffer.concat(chunks).toString("utf8"));
                return;
            }
            chunks.push(chunk);
        });
        body.on("end", () => finish(Buffer.concat(chunks).toString("utf8")));
        body.on("error", () => finish(Buffer.concat(chunks).toString("utf8")));
    });
}

const META_ATTR_RE = /(?:name|property|itemprop)\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']*)["']|content\s*=\s*["']([^"']*)["'][^>]*(?:name|property)\s*=\s*["']([^"']+)["']/gi;

function parseMeta(html) {
    const meta = {};
    let m;
    const attrRe = /(?:name|property|itemprop)\s*=\s*["']([^"']+)["']/i;
    const contentRe = /content\s*=\s*["']([^"']*)["']/i;
    const tagRe = /<meta[^>]*>/gi;
    let tag;
    while ((tag = tagRe.exec(html)) !== null) {
        const attr = attrRe.exec(tag[0]);
        const content = contentRe.exec(tag[0]);
        if (!attr || !content) continue;
        const key = attr[1].toLowerCase().trim();
        if (!meta[key]) meta[key] = content[1];
    }
    return meta;
}

function clean(s, max = 500) {
    if (!s) return "";
    return String(s)
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
}

// LRU cache: url -> { at, value }
const cache = new Map();
const CACHE_MAX = 500;
const CACHE_TTL_MS = 30 * 60 * 1000;

function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
        cache.delete(key);
        return undefined;
    }
    return hit.value;
}

function cacheSet(key, value) {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, { at: Date.now(), value });
    if (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
    }
}

function extractUrl(text) {
    if (!text) return null;
    const m = String(text).match(/https?:\/\/[^\s<>"'\u2026]+/i);
    if (!m) return null;
    return m[0].replace(/[),.;:!?]+$/, "") || null;
}

function sanitizePreview(raw, baseUrl) {
    if (!raw || (!raw.title && !raw.description && !raw.image)) return null;
    const preview = {
        url: raw.url || baseUrl.href,
        title: clean(raw.title, 300),
        description: clean(raw.description, 500),
        image: raw.image || "",
        domain: raw.domain || baseUrl.hostname.replace(/^www\./, ""),
        siteName: clean(raw.siteName, 100),
        favicon: raw.favicon || "",
    };
    if (!preview.title && !preview.description) return null;
    return preview;
}

function normalizeClientPreview(preview) {
    if (!preview || typeof preview !== "object") return null;
    const url = String(preview.url || "").trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url)) return null;
    const cleanField = (v, max) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
    const result = {
        title: cleanField(preview.title, 300),
        description: cleanField(preview.description, 500),
        image: cleanField(preview.image, 1000),
        url,
        domain: cleanField(preview.domain, 200) || (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })(),
        siteName: cleanField(preview.siteName, 100),
        favicon: cleanField(preview.favicon, 1000) || "",
    };
    if (!result.title && !result.description && !result.image) return null;
    return result;
}

async function resolveLinkPreview(text, clientPreview, fallbackTimeoutMs = 3500) {
    const normalized = normalizeClientPreview(clientPreview);
    if (normalized) return normalized;

    const firstUrl = extractUrl(text);
    if (!firstUrl) return null;

    try {
        const result = await Promise.race([
            fetchLinkPreview(firstUrl),
            new Promise((resolve) => setTimeout(() => resolve(null), fallbackTimeoutMs)),
        ]);
        return result || null;
    } catch {
        return null;
    }
}

async function fetchLinkPreview(urlString) {
    const cached = cacheGet(urlString);
    if (cached !== undefined) return cached;

    let result = null;
    try {
        const { target, res } = await fetchWithRedirects(urlString);

        const contentType = String(res.headers.get("content-type") || "").toLowerCase();
        if (res.ok && (contentType.includes("text/html") || contentType.includes("application/xhtml"))) {
            const html = await readHtmlLimited(res.body, MAX_FETCH_BYTES);
            const meta = parseMeta(html);
            const origin = target.origin;

            const pick = (...keys) => {
                for (const k of keys) {
                    if (meta[k]) return meta[k];
                }
                return "";
            };

            const ogTitle = pick("og:title", "twitter:title", "title");
            const ogDesc = pick("og:description", "twitter:description", "description", "og:description");
            const ogImage = pick("og:image", "og:image:url", "twitter:image", "twitter:image:src");
            const ogSite = pick("og:site_name", "twitter:site");

            const title = clean(ogTitle || pick("title"), 300);
            const description = clean(ogDesc, 500);

            const favicon =
                clean(pick("og:logo"), 300) ||
                (() => {
                    const m = html.match(/<link[^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*href=["']([^"']+)["']/i);
                    return m ? m[1] : "";
                })() ||
                `${origin}/favicon.ico`;

            const abs = (value) => {
                if (!value) return "";
                try {
                    return new URL(value, origin).href;
                } catch {
                    return "";
                }
            };

            result = sanitizePreview(
                {
                    title,
                    description,
                    image: abs(ogImage) || "",
                    url: target.href,
                    domain: target.hostname.replace(/^www\./, ""),
                    siteName: clean(ogSite, 100),
                    favicon: abs(favicon),
                },
                target
            );
        }
    } finally {
        cacheSet(urlString, result);
    }

    return result;
}

module.exports = { extractUrl, fetchLinkPreview, normalizeClientPreview, resolveLinkPreview, assertSafeUrl };