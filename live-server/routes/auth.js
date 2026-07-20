const express = require("express");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const OTP = require("../models/otp");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();
const SECRET = process.env.JWT_SECRET || "anonfeed_jwt_secret_change_in_production_32chars";
const MAX_AGE = 31536000000;

function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function isProd() {
    return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
});

function sendUserPayload(user) {
    return {
        id:          user._id.toString(),
        email:       user.email,
        username:    user.username,
        bio:         user.bio,
        avatarColor: user.avatarColor,
        avatarUrl:   user.avatarUrl || "",
        isVerified:  user.isVerified || false,
        isAdmin:     user.isAdmin || false,
        roles:       (user.roles || []).filter(Boolean).map((r) => ({
            id:    r._id?.toString() ?? "",
            name:  r.name  ?? "",
            badge: r.badge ?? "",
            color: r.color ?? "",
        })),
        bookmarks:       user.bookmarks || [],
        following:       user.following || [],
        followers:       user.followers || [],
        language:        user.language || "en",
        autoTranslate:   user.autoTranslate || false,
        liveStreamAllowed: user.liveStreamAllowed || false,
        voiceChatBanned:   user.voiceChatBanned || false,
        needsSetup: !user.username,
    };
}

// POST /send-otp
router.post("/send-otp", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: "Valid email required" });
        }

        const recent = await OTP.countDocuments({
            email:     email.toLowerCase(),
            expiresAt: { $gt: new Date(Date.now() - 10 * 60 * 1000) },
        });
        if (recent >= 3) {
            return res.status(429).json({ error: "Too many attempts. Wait 10 minutes." });
        }

        const code = generateCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await OTP.create({ email: email.toLowerCase(), code, expiresAt });

        try {
            await transporter.sendMail({
                from: process.env.GMAIL_USER,
                to: email,
                subject: "Your AnonTweet Login Code",
                html: `
                    <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px">
                        <h1 style="font-size:24px;font-weight:900;margin:0 0 8px">AnonTweet</h1>
                        <p style="color:#6b7280;margin:0 0 24px">Your one-time login code:</p>
                        <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;letter-spacing:8px;font-size:36px;font-weight:900;color:#111">
                            ${code}
                        </div>
                        <p style="color:#9ca3af;font-size:12px;margin:16px 0 0">
                            This code expires in 10 minutes. If you didn't request this, ignore this email.
                        </p>
                    </div>
                `,
            });
        } catch (emailError) {
            console.error("Failed to send OTP email:", emailError);
            return res.status(500).json({ error: "Failed to send email. Please try again." });
        }

        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to send OTP" });
    }
});

// POST /verify-otp
router.post("/verify-otp", async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) {
            return res.status(400).json({ error: "Email and code required" });
        }

        const otp = await OTP.findOne({
            email:     email.toLowerCase(),
            code,
            used:      false,
            expiresAt: { $gt: new Date() },
        });

        if (!otp) {
            return res.status(401).json({ error: "Invalid or expired code" });
        }

        otp.used = true;
        await otp.save();

        let user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            const isAdmin = email.toLowerCase() === (process.env.ADMIN_EMAIL || "").toLowerCase();
            user = await User.create({ email: email.toLowerCase(), isAdmin });
        } else if (!user.isAdmin && email.toLowerCase() === (process.env.ADMIN_EMAIL || "").toLowerCase()) {
            user.isAdmin = true;
            await user.save();
        }

        const token = jwt.sign({ userId: user._id.toString() }, SECRET, { expiresIn: "365d" });
        const needsSetup = !user.username;

        let userData = null;
        if (!needsSetup) {
            await user.populate("roles");
            userData = sendUserPayload(user);
        }

        const secure = isProd();
        const sameSite = secure ? "none" : "lax";
        res.cookie("af_session", token, {
            httpOnly: true,
            secure,
            sameSite,
            maxAge: MAX_AGE,
            path: "/",
        });
        return res.json({ ok: true, needsSetup, userId: user._id, user: userData });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Verification failed" });
    }
});

// GET /me
router.get("/me", optionalAuthMiddleware, async (req, res) => {
    try {
        if (!req.userId) {
            return res.json({ user: null });
        }

        let user = await User.findById(req.userId).populate("roles");
        if (!user) {
            return res.json({ user: null });
        }

        if (!user.isAdmin && user.email.toLowerCase() === (process.env.ADMIN_EMAIL || "").toLowerCase().trim()) {
            user.isAdmin = true;
            user.isVerified = true;
            await user.save();
            user = user.toObject();
        }

        const payload = { user: sendUserPayload(user) };

        const response = res.json(payload);

        // Re-sign if token expiring soon (not applicable for Express res.json, but we can set cookie)
        if (req.session?.exp) {
            const now = Math.floor(Date.now() / 1000);
            const remaining = req.session.exp - now;
            if (remaining < MAX_AGE / 1000 / 2) {
                const newToken = jwt.sign({ userId: user._id.toString() }, SECRET, { expiresIn: "365d" });
                res.cookie("af_session", newToken, {
                    httpOnly: true,
                    secure: isProd(),
                    sameSite: isProd() ? "none" : "lax",
                    maxAge: MAX_AGE,
                    path: "/",
                });
            }
        }

        return response;
    } catch (error) {
        console.error(error);
        return res.json({ user: null });
    }
});

// POST /setup
router.post("/setup", verifyToken, async (req, res) => {
    try {
        const { username, bio, avatarColor, avatarUrl } = req.body;

        if (!username?.trim()) {
            return res.status(400).json({ error: "Username required" });
        }
        if (username.trim().length < 2 || username.trim().length > 30) {
            return res.status(400).json({ error: "Username must be 2\u201330 characters" });
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
            return res.status(400).json({ error: "Username can only contain letters, numbers and underscores" });
        }

        const existing = await User.findOne({
            username: { $regex: `^${username.trim()}$`, $options: "i" },
            _id: { $ne: req.userId },
        });
        if (existing) {
            return res.status(409).json({ error: "Username already taken" });
        }

        const update = {
            username:    username.trim(),
            bio:         bio?.trim() ?? "",
            avatarColor: avatarColor || "#3b82f6",
        };
        if (avatarUrl) update.avatarUrl = avatarUrl;

        const user = await User.findByIdAndUpdate(req.userId, update, { returnDocument: 'after' }).populate("roles");

        return res.json({
            user: sendUserPayload(user),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Setup failed" });
    }
});

// PATCH /profile
router.patch("/profile", verifyToken, async (req, res) => {
    try {
        const { bio, avatarColor, avatarUrl, language, autoTranslate } = req.body;

        const update = {
            bio:         bio?.trim() ?? "",
            avatarColor: avatarColor || "#3b82f6",
        };
        if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;
        if (language) update.language = language;
        if (autoTranslate !== undefined) update.autoTranslate = autoTranslate;

        const user = await User.findByIdAndUpdate(req.userId, update, { returnDocument: 'after' })
            .populate("roles").lean();

        return res.json({
            user: {
                id: user._id.toString(), email: user.email,
                username: user.username, bio: user.bio,
                avatarColor: user.avatarColor, avatarUrl: user.avatarUrl || "",
                isVerified: user.isVerified || false, isAdmin: user.isAdmin || false,
                roles: (user.roles || []).map((r) => ({ id: r._id.toString(), name: r.name, badge: r.badge, color: r.color })),
                language: user.language || "en",
                autoTranslate: user.autoTranslate || false,
                needsSetup: false,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to update profile" });
    }
});

// POST /logout
router.post("/logout", (req, res) => {
    res.clearCookie("af_session", { path: "/" });
    return res.json({ ok: true });
});

// optional auth middleware for /me route
function optionalAuthMiddleware(req, res, next) {
    try {
        const token = req.cookies?.af_session;
        if (!token) return next();
        const decoded = jwt.verify(token, SECRET);
        req.userId = decoded.userId;
        req.session = decoded;
    } catch {
        // ignore invalid token
    }
    next();
}

module.exports = router;
