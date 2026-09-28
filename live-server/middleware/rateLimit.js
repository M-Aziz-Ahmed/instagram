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
            return jwt.verify(token, require("./auth").SECRET);
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

// General API: 500/min auth, 300/min anon
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: (req) => decodeToken(req)?.userId ? 500 : 300,
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

// Public read: 10000/min auth, 5000/min anon (effectively disabled)
const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: (req) => decodeToken(req)?.userId ? 10000 : 5000,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => tieredKeyGenerator(req, (r) => r.ip),
    store: makeRedisStore("read"),
    message: { error: "Rate limit exceeded" },
});

// Write: 200/min auth, 100/min anon
const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: (req) => decodeToken(req)?.userId ? 200 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => tieredKeyGenerator(req, (r) => r.ip),
    store: makeRedisStore("write"),
    message: { error: "Rate limit exceeded" },
});

// ── Invites ───────────────────────────────────────────────────────
// An invite code is a bearer capability, so the endpoints that mint or redeem
// one are the places worth being strict about.

// Minting your own code: cheap, authenticated, and rate limited mainly to stop a
// script churning documents. 10/min is far above what a person needs.
const inviteCodeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => tieredKeyGenerator(req, (r) => r.ip),
    store: makeRedisStore("invite-code"),
    message: { error: "Slow down a moment before requesting another code" },
});

// Resolving a code is the ONLY endpoint here that is public, which makes it the
// enumeration surface: a caller can probe codes and learn which are live.
//
// The code is 10 symbols over a 30-symbol alphabet, so it carries about 49 bits
// (10 * log2(30)), not enough to make a direct guess worthwhile but far more than
// makes a sequential walk feasible. The cap is what bounds the walk anyway, and
// it is the only thing that bounds it: the limiter's store is Redis when Redis is
// configured and process memory otherwise, so a restart or a failover resets the
// count. Keyed per account when signed in, and per IP when not, because an
// anonymous caller has no account to key on and a shared NAT address is precisely
// the case where the tighter anonymous cap is correct.
const inviteResolveLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: (req) => decodeToken(req)?.userId ? 60 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => tieredKeyGenerator(req, (r) => r.ip),
    store: makeRedisStore("invite-resolve"),
    message: { error: "Too many scans, try again shortly" },
});

// Redeeming: each redemption starts a real conversation, so this is the endpoint
// that can be used to mail strangers. 5/min per account is generous for a human
// introducing themselves and hostile to a script. This limiter is NOT the only
// backstop — it is the first one, and it is the only one keyed on the attacker.
//
// Two limits sit behind it: a per-inviter budget of 40 greetings per rolling 24h
// (`GREET_BUDGET_PER_DAY`, enforced in lib/invites), and the ordinary DM path
// itself, so every redemption is a block-checked, content-filtered message the
// recipient can mute, block or delete. What does NOT exist, despite a comment
// that used to claim otherwise, is a per-code use cap or a code expiry: a code
// works until its owner rotates it. Do not assume one is enforced here.
const inviteGreetLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => tieredKeyGenerator(req, (r) => r.ip),
    store: makeRedisStore("invite-greet"),
    message: { error: "Too many greetings sent — wait a minute and try again" },
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

module.exports = {
    apiLimiter, authLimiter, readLimiter, writeLimiter, verifyApiKey, initRedis,
    // Built here rather than in the invite router so the caps sit beside every
    // other limit in the file and can be compared at a glance.
    inviteCodeLimiter, inviteResolveLimiter, inviteGreetLimiter,
};
