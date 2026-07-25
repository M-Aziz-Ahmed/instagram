const { logServer } = require("../logService");

const SKIP_PATHS = ["/health", "/favicon", "/_next", "/socket.io"];

function requestLogger(req, res, next) {
    if (SKIP_PATHS.some((p) => req.path?.startsWith(p))) return next();

    const start = Date.now();
    const originalEnd = res.end;

    res.end = function (...args) {
        const duration = Date.now() - start;
        const username = req.userId || req.user?.username || null;

        logServer("http_request", {
            method: req.method,
            path: req.originalUrl || req.url,
            statusCode: res.statusCode,
            duration,
            username,
            ip: req.ip || req.connection?.remoteAddress,
            level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
            message: `${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${duration}ms`,
        });

        originalEnd.apply(this, args);
    };

    next();
}

module.exports = { requestLogger };
