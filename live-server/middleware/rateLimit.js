const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const jwt = require("jsonwebtoken");
const { createClient } = require("redis");

// ── Redis client (with graceful fallback to in-memory) ──────────
let redisClient = null;
let redisReady = false;

async function initRedis() {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    try {
        redisClient = createClient({ url, socket: { connectTimeout: 3000, reconnectStrategy: (retries) => Math.min(retries * 200, 5000) } });
        redisClient.on("error", (err) => {
            if (redisReady) console.warn("[Redis] Connection lost, falling back to memory:", err.message);
            redisReady = false;
        });
        redisClient.on("ready", () => {
            redisReady = true;
            console.log("[Redis] Connected for rate limiting");
        });
        await redisClient.connect();
    } catch (err) {
        console.warn("[Redis] Not available, using in-memory rate limiting:", err.message);
        redisReady = false;
    }
}

initRedis();

function makeRedisStore(prefix) {
    if (!redisReady || !redisClient) return undefined;
    return new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: `ratelimit:${prefix}:`,
    });
}

// ── Auth token decoder (no DB call) ─────────────────────────────
function decodeToken(req) {
    try {
        const token = req.cookies?.af_session || req.headers.authorization?.split(" ")[1];
        if (!token) return null;
        return jwt.verify(token, process.env.JWT_SECRET || "af_secret");
    } catch {
        return null;
    }
}

// ── Tiered key generator ────────────────────────────────────────
// Authenticated users: rate limit by userId (allows multiple IPs)
// Anonymous: rate limit by IP
function tieredKeyGenerator(req, fallbackFn) {
    const decoded = decodeToken(req);
    if (decoded?.userId) return `auth:${decoded.userId}`;
    return `anon:${fallbackFn(req)}`;
}

// ── Limiters ────────────────────────────────────────────────────

// General API: 300/min auth, 200/min anon
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: (req) => decodeToken(req)?.userId ? 300 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => tieredKeyGenerator(req, (r) => r.ip),
    store: makeRedisStore("api"),
    message: { error: "Too many requests, try again later" },
});

// Auth endpoints: 15/min per IP (keep strict — prevent OTP brute force)
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore("auth"),
    message: { error: "Too many auth attempts, try again later" },
});

// Public read: 400/min auth, 200/min anon
const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: (req) => decodeToken(req)?.userId ? 400 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => tieredKeyGenerator(req, (r) => r.ip),
    store: makeRedisStore("read"),
    message: { error: "Rate limit exceeded" },
});

// Write: 150/min auth, 50/min anon
const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: (req) => decodeToken(req)?.userId ? 150 : 50,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => tieredKeyGenerator(req, (r) => r.ip),
    store: makeRedisStore("write"),
    message: { error: "Rate limit exceeded" },
});

// ── API key verification for Vercel → Live Server ───────────────
function verifyApiKey(req, res, next) {
    const apiKey = req.headers["x-api-key"];
    const validKey = process.env.API_KEY;
    if (!validKey) return next();
    if (req.cookies?.af_session) return next();
    if (apiKey !== validKey) {
        return res.status(401).json({ error: "Invalid API key" });
    }
    next();
}

module.exports = { apiLimiter, authLimiter, readLimiter, writeLimiter, verifyApiKey, initRedis };
