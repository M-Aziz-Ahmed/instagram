const jwt = require("jsonwebtoken");
const User = require("../models/user");

// The secret is the root of trust for every session in the app, so there is no
// usable default. Previously an unset JWT_SECRET silently fell back to a value
// committed in this repo, which meant anyone who had read the source could
// mint a cookie for any account, including isAdmin. Fail loudly at boot
// instead: an operator has to set it explicitly.
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
    throw new Error(
        "JWT_SECRET is not set. Generate one with `openssl rand -hex 32` and add it " +
        "to live-server/.env before starting the server. Refusing to start with a " +
        "default signing key."
    );
}

// One place that decides where a session token comes from. The header is
// checked first so an `Authorization: Bearer` client keeps working, then the
// cookie the browser app uses. Two routes used to carry their own copy of this
// logic - along with their own hardcoded signing secret - and every duplicated
// copy was one more thing to keep in sync.
function readToken(req) {
    const header = req.headers?.authorization;
    if (header?.startsWith("Bearer ")) return header.slice(7).trim() || null;
    return req.cookies?.af_session || null;
}

function verifyToken(req, res, next) {
    try {
        const token = readToken(req);
        if (!token) return res.status(401).json({ error: "Unauthorized" });

        const decoded = jwt.verify(token, SECRET);
        req.userId = decoded.userId;
        req.session = decoded;
        next();
    } catch {
        return res.status(401).json({ error: "Invalid session" });
    }
}

function optionalAuth(req, res, next) {
    try {
        const token = readToken(req);
        if (!token) return next();

        const decoded = jwt.verify(token, SECRET);
        req.userId = decoded.userId;
        req.session = decoded;
    } catch {
        // silently ignore invalid token
    }
    next();
}

async function requireAdmin(req, res, next) {
    try {
        const token = readToken(req);
        if (!token) return res.status(401).json({ error: "Unauthorized" });

        const decoded = jwt.verify(token, SECRET);
        req.userId = decoded.userId;
        req.session = decoded;

        const user = await User.findById(decoded.userId).select("isAdmin").lean();
        if (!user?.isAdmin) return res.status(403).json({ error: "Forbidden" });

        next();
    } catch {
        return res.status(401).json({ error: "Invalid session" });
    }
}

function requirePermission(permission) {
    return async (req, res, next) => {
        try {
            const token = readToken(req);
            if (!token) return res.status(401).json({ error: "Unauthorized" });

            const decoded = jwt.verify(token, SECRET);
            req.userId = decoded.userId;
            req.session = decoded;

            const user = await User.findById(decoded.userId).select("isAdmin roles").populate("roles", "permissions").lean();
            if (!user) return res.status(401).json({ error: "User not found" });

            if (user.isAdmin) return next();

            const hasPermission = (user.roles || []).some((role) =>
                (role.permissions || []).includes(permission)
            );
            if (!hasPermission) return res.status(403).json({ error: "Forbidden", required: permission });

            next();
        } catch {
            return res.status(401).json({ error: "Invalid session" });
        }
    };
}

// Exported so every module verifies with the *same* secret. Several routes used
// to re-derive their own (`process.env.JWT_SECRET || "<hardcoded>"`), which
// reintroduced the exact hole above the moment JWT_SECRET was unset: the central
// middleware would refuse to boot, but those routes would have happily verified
// a token signed with a value committed in this repo. One source of truth, one
// fail-closed check.
module.exports = { verifyToken, optionalAuth, requireAdmin, requirePermission, SECRET };
