const rateLimit = require("express-rate-limit");

// General API rate limit: 100 requests per minute per IP
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, try again later" },
});

// Auth rate limit: 10 requests per minute per IP (prevent OTP spam)
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many auth attempts, try again later" },
});

// Public read endpoints: 60 requests per minute per IP
const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Rate limit exceeded" },
});

// Write endpoints: 30 requests per minute per IP
const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Rate limit exceeded" },
});

// API key verification middleware for Vercel -> Live Server
// Vercel sends this header on server-side API calls
function verifyApiKey(req, res, next) {
    const apiKey = req.headers["x-api-key"];
    const validKey = process.env.API_KEY;

    // Skip if no API key configured (dev mode)
    if (!validKey) return next();

    // Allow requests from browser (with session cookie) without API key
    if (req.cookies?.af_session) return next();

    // Require API key for server-to-server calls
    if (apiKey !== validKey) {
        return res.status(401).json({ error: "Invalid API key" });
    }
    next();
}

module.exports = { apiLimiter, authLimiter, readLimiter, writeLimiter, verifyApiKey };
