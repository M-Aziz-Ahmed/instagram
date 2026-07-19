const jwt = require("jsonwebtoken");
const User = require("../models/user");

const SECRET = process.env.JWT_SECRET || "anonfeed_jwt_secret_change_in_production_32chars";

function verifyToken(req, res, next) {
    try {
        const token = req.cookies?.af_session;
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
        const token = req.cookies?.af_session;
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
        const token = req.cookies?.af_session;
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

module.exports = { verifyToken, optionalAuth, requireAdmin };
