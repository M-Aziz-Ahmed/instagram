const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Post = require("../models/post");

const router = express.Router();
const SECRET = process.env.JWT_SECRET || "anonfeed_jwt_secret_change_in_production_32chars";

// GET /me
router.get("/me", async (req, res) => {
    try {
        const token = req.cookies?.af_session;
        if (!token) return res.json({ ok: false, reason: "no session", session: null });

        let decoded = null;
        try {
            decoded = jwt.verify(token, SECRET);
        } catch (e) {
            return res.json({ ok: false, reason: "invalid token", session: null });
        }

        const user = await User.findById(decoded.userId).lean();
        if (!user) return res.json({ ok: false, reason: "user not found", session: decoded, user: null });
        return res.json({ ok: true, session: decoded, user });
    } catch (err) {
        console.error("/debug/me error:", err);
        return res.status(500).json({ ok: false, error: String(err) });
    }
});

// GET /posts
router.get("/posts", async (req, res) => {
    try {
        const posts = await Post.find({}).limit(5).lean();
        return res.json({ ok: true, count: posts.length, sample: posts.slice(0, 5) });
    } catch (err) {
        console.error("/debug/posts error:", err);
        return res.status(500).json({ ok: false, error: String(err) });
    }
});

// GET /decode
router.get("/decode", (req, res) => {
    try {
        const token = req.cookies?.af_session || null;
        if (!token) return res.json({ ok: true, token: null, decoded: null });

        let decoded = null;
        try {
            decoded = jwt.decode(token);
        } catch (err) {
            decoded = { error: String(err) };
        }
        return res.json({ ok: true, token, decoded });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, error: String(err) });
    }
});

// GET /verify
router.get("/verify", (req, res) => {
    try {
        const token = req.cookies?.af_session || null;
        if (!token) return res.json({ ok: false, error: "no token" });
        try {
            const payload = jwt.verify(token, SECRET);
            return res.json({ ok: true, payload });
        } catch (err) {
            return res.json({ ok: false, error: String(err?.message ?? err) });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, error: String(err) });
    }
});

// GET /
router.get("/", (req, res) => {
    try {
        const raw = req.headers?.cookie || null;
        const af = req.cookies?.af_session || null;
        return res.json({ ok: true, rawCookieHeader: raw, af_session: af });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, error: String(err) });
    }
});

module.exports = router;
