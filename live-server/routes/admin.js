const express = require("express");
const User = require("../models/user");
const Role = require("../models/role");
const Ad = require("../models/ad");
const { AD_SLOTS } = require("../models/ad");
const { creditGems, debitGems, isProUserDoc } = require("../lib/economy");
const GemTransaction = require("../models/gemTransaction");
const SiteSetting = require("../models/siteSettings");
const { getFlags, invalidate: invalidateFlags } = require("../lib/featureFlags");
const Post = require("../models/post");
const ContentFilter = require("../models/contentFilter");
const textFilter = require("../lib/textFilter");
const mediaModeration = require("../lib/mediaModeration");
const toxicMatch = require("../lib/toxicMatch");
const ModerationLog = require("../models/moderationLog");
const Community = require("../models/community");
const AnalyticsEvent = require("../models/analyticsEvent");
const A = require("../analyticsHelpers");
const { requireAdmin, requirePermission } = require("../middleware/auth");
const { getLogs } = require("../logBuffer");
const { VALID_PERMISSIONS } = require("../models/role");
const { logModeration, logUser, logSystem } = require("../logService");
const { isValidPin, hashPin } = require("../utils/pin");

const router = express.Router();

// â”€â”€ Gems â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// There is no payment provider, so gems enter the economy through admins (and
// in-app rewards). These endpoints are therefore the whole distribution story
// for now, and they are the only place a balance can be moved by hand.

const adminUsername = (req) => {
    return req.adminUser?.username || req.session?.username || "admin";
};

// POST /gems/grant  { username, amount, note? }
// POST /gems/deduct { username, amount, note? }
async function adjustGems(req, res, sign) {
    try {
        const { username, amount, note } = req.body || {};
        const delta = Math.floor(Number(amount));
        const who = String(username || "").trim();

        if (!who) return res.status(400).json({ error: "A username is required" });
        if (!Number.isFinite(delta) || delta === 0) {
            return res.status(400).json({ error: "Amount must be a non-zero number" });
        }

        const target = await User.findOne({ username: who }).select("_id username").lean();
        if (!target) return res.status(404).json({ error: "User not found" });

        const move = sign > 0 ? creditGems : debitGems;
        const reason = sign > 0 ? "admin_grant" : "admin_deduct";

        const result = await move(
            target._id,
            Math.abs(delta),
            reason,
            { note: String(note || "").slice(0, 200), by: adminUsername(req) }
        );

        // A null result from a debit means the guard rejected it: the account
        // does not have that many gems. Refusing is the point - an admin cannot
        // push a balance negative through the manual path either.
        if (!result) {
            return res.status(402).json({ error: "Not enough gems to deduct" });
        }

        logUser?.(`gems ${sign > 0 ? "granted" : "deducted"}`, { target: who, amount: Math.abs(delta), by: adminUsername(req) });
        return res.json({ ok: true, username: result.username, gems: result.balance });
    } catch (err) {
        console.error("admin gems error:", err);
        return res.status(500).json({ error: "Failed to adjust gems" });
    }
}

router.post("/gems/grant", requireAdmin, (req, res) => adjustGems(req, res, 1));
router.post("/gems/deduct", requireAdmin, (req, res) => adjustGems(req, res, -1));

// POST /gems/pro  { username, months } â€” grant Pro directly, bypassing gems.
// Useful for staff, testers and compensation, and the only way to grant Pro
// today since there is no checkout.
router.post("/gems/pro", requireAdmin, async (req, res) => {
    try {
        const { username, months } = req.body || {};
        const who = String(username || "").trim();
        const term = Math.min(Math.max(parseInt(months, 10) || 1, 1), 36);

        if (!who) return res.status(400).json({ error: "A username is required" });

        const target = await User.findOne({ username: who }).select("proUntil").lean();
        if (!target) return res.status(404).json({ error: "User not found" });

        // Extend from the current expiry when still active, otherwise from now.
        const from = isProUserDoc(target) ? new Date(target.proUntil) : new Date();
        const proUntil = new Date(from.getTime() + term * 30 * 24 * 60 * 60 * 1000);

        const updated = await User.findByIdAndUpdate(
            target._id,
            { $set: { proUntil } },
            { new: true }
        ).select("username proUntil");

        return res.json({ ok: true, username: updated.username, proUntil: updated.proUntil });
    } catch (err) {
        console.error("admin pro grant error:", err);
        return res.status(500).json({ error: "Failed to grant Pro" });
    }
});

// GET /gems/ledger?username=&limit=&skip=
// Read-only view of the append-only gem ledger.
//
// The write endpoints above can move a balance but cannot explain how it got
// there, and "an admin typed the wrong number" is only provable with a history.
// This is that history: the same rows a purchase writes, filterable by account.
router.get("/gems/ledger", requireAdmin, async (req, res) => {
    try {
        const { username, reason } = req.query;
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
        const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

        const query = {};
        // Usernames are matched exactly rather than by regex: this is an audit
        // trail, and a pattern match here would let a stray `.` pull in other
        // people's rows.
        if (username) query.user = String(username).trim();
        if (reason) query.reason = String(reason).trim();

        const [rows, total] = await Promise.all([
            GemTransaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            GemTransaction.countDocuments(query),
        ]);

        // Net movement per account across the whole filtered set, so an admin
        // can see at a glance whether an account was drained or farmed.
        const net = await GemTransaction.aggregate([
            { $match: query },
            { $group: { _id: "$user", total: { $sum: "$amount" } } },
            { $sort: { total: 1 } },
            { $limit: 20 },
        ]);

        return res.json({ rows, total, limit, skip, net });
    } catch (err) {
        console.error("admin gem ledger error:", err);
        return res.status(500).json({ error: "Failed to load gem ledger" });
    }
});

// GET /flags
router.get("/flags", requireAdmin, async (req, res) => {
    try {
        return res.json({ flags: await getFlags() });
    } catch (err) {
        console.error("admin flags read error:", err);
        return res.status(500).json({ error: "Failed to load flags" });
    }
});

// PATCH /flags  { maintenance?, signupsOpen?, posting?, uploads?, dms?, ... }
//
// Setting maintenance stops every write except /api/admin and /api/auth, so
// this endpoint and the auth routes are exempt from the gate by design - an
// operator has to be able to log in and turn the switch back off.
router.patch("/flags", requireAdmin, async (req, res) => {
    try {
        const body = req.body || {};

        // Only these keys are writable, and only as real booleans. Taking an
        // allow-list means a typo like { postingg: false } is rejected instead
        // of being written into the document as an unknown field.
        const ALLOWED = new Set([
            "maintenance", "signupsOpen",
            "posting", "uploads", "dms", "liveStreams", "voiceChat", "comments",
        ]);
        const toBool = (v) => v === true || v === "true" || v === 1 || v === "1";
        const toStr = (v) => String(v).slice(0, 300);

        const set = {};
        const features = {};
        let maintenanceMessage;

        for (const [k, v] of Object.entries(body)) {
            if (!ALLOWED.has(k)) continue;
            if (k === "maintenance") {
                // A bare `maintenance: true` toggles it on; an object can also
                // carry the message shown to users.
                if (v && typeof v === "object") {
                    if (v.active !== undefined) set["maintenance.active"] = toBool(v.active);
                    if (v.message !== undefined) maintenanceMessage = toStr(v.message);
                } else {
                    set["maintenance.active"] = toBool(v);
                }
            } else if (k === "signupsOpen") {
                set.signupsOpen = toBool(v);
            } else {
                features[k] = toBool(v);
            }
        }

        const update = {};
        if (Object.keys(set).length) update.$set = set;
        if (maintenanceMessage !== undefined) {
            update.$set = { ...(update.$set || {}), "maintenance.message": maintenanceMessage };
        }
        if (Object.keys(features).length) update.$set = { ...(update.$set || {}), features };
        if (Object.keys(update).length) update.updatedAt = new Date();
        update.updatedBy = adminUsername(req);

        if (Object.keys(update).length) {
            await SiteSetting.findOneAndUpdate(
                { key: "config" },
                { $set: update },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );
        }

        // Drop the read cache so the change takes effect on the next request
        // rather than up to TTL_MS later.
        invalidateFlags();

        const flags = await getFlags();
        logSystem?.("admin_flags_updated", { flags, by: adminUsername(req) });
        return res.json({ ok: true, flags });
    } catch (err) {
        console.error("admin flags write error:", err);
        return res.status(500).json({ error: "Failed to update flags" });
    }
});

// GET /users
router.get("/users", requireAdmin, async (req, res) => {
    try {
        const users = await User.find({}).populate("roles").sort({ createdAt: -1 }).lean();
        return res.json(users.map((u) => ({
            id:         u._id.toString(),
            username:   u.username,
            email:      u.email,
            isVerified: u.isVerified || false,
            isAdmin:    u.isAdmin || false,
            isPro:      isProUserDoc(u),
            liveStreamAllowed: u.liveStreamAllowed || false,
            videoUploadAllowed: u.videoUploadAllowed || false,
            voiceChatBanned: u.voiceChatBanned || false,
            voiceChatBannedUntil: u.voiceChatBannedUntil || null,
            voiceChatBannedReason: u.voiceChatBannedReason || "",
            avatarColor: u.avatarColor,
            avatarUrl:  u.avatarUrl || "",
            gems:       u.gems || 0,
            proUntil:   u.proUntil || null,
            roles:      (u.roles || []).map((r) => ({ id: r._id.toString(), name: r.name, badge: r.badge, color: r.color })),
        })));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// PATCH /users
router.patch("/users", requireAdmin, async (req, res) => {
    try {
        const { userId, isVerified, isAdmin: makeAdmin, liveStreamAllowed, videoUploadAllowed, voiceChatBanned, voiceChatBannedUntil, voiceChatBannedReason, addRole, removeRole } = req.body;
        if (!userId) return res.status(400).json({ error: "userId required" });

        const update = {};
        if (isVerified !== undefined) update.isVerified = isVerified;
        if (makeAdmin !== undefined) update.isAdmin = makeAdmin;
        if (liveStreamAllowed !== undefined) update.liveStreamAllowed = liveStreamAllowed;
        // Explicit per-user grant for direct video upload. This only ever adds
        // capability - it is not a ban, so an admin turning it off will not
        // strip a role that already carries `upload_video`.
        if (videoUploadAllowed !== undefined) update.videoUploadAllowed = !!videoUploadAllowed;
        if (voiceChatBanned !== undefined) update.voiceChatBanned = voiceChatBanned;
        if (voiceChatBannedUntil !== undefined) update.voiceChatBannedUntil = voiceChatBannedUntil;
        if (voiceChatBannedReason !== undefined) update.voiceChatBannedReason = voiceChatBannedReason;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        if (addRole) user.roles.addToSet(addRole);
        if (removeRole) user.roles.pull(removeRole);
        Object.assign(user, update);
        await user.save();
        await user.populate("roles");

        const changes = [];
        if (isVerified !== undefined) changes.push(`verified=${isVerified}`);
        if (makeAdmin !== undefined) changes.push(`admin=${makeAdmin}`);
        if (liveStreamAllowed !== undefined) changes.push(`live=${liveStreamAllowed}`);
        if (addRole) changes.push(`added role`);
        if (removeRole) changes.push(`removed role`);
        logUser("user_updated", req.userId?.toString(), { targetUser: user.username, message: `User ${user.username} updated: ${changes.join(", ")}`, meta: { userId: user._id.toString(), changes } });

        return res.json({
            ok: true,
            user: {
                id: user._id.toString(), username: user.username,
                isVerified: user.isVerified, isAdmin: user.isAdmin,
                isPro: isProUserDoc(user),
                roles: user.roles.map((r) => ({ id: r._id.toString(), name: r.name, badge: r.badge, color: r.color })),
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// POST /users â€” admin creates a user with a login PIN ("create user with a code")
router.post("/users", requireAdmin, async (req, res) => {
    try {
        const { email, username, pin } = req.body;
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: "Valid email required" });
        }
        if (!username?.trim() || !/^[a-zA-Z0-9_]{2,30}$/.test(username.trim())) {
            return res.status(400).json({ error: "Username must be 2\u201330 characters (letters, numbers, underscores)" });
        }
        if (!isValidPin(pin)) {
            return res.status(400).json({ error: "PIN must be 4\u20138 digits" });
        }

        const emailLower = email.toLowerCase();
        const existing = await User.findOne({
            $or: [{ email: emailLower }, { username: { $regex: `^${username.trim()}$`, $options: "i" } }],
        }).lean();
        if (existing) {
            return res.status(409).json({ error: "A user with this email or username already exists" });
        }

        const user = await User.create({
            email:      emailLower,
            username:   username.trim(),
            pinHash:    hashPin(pin),
            pinChangedAt: new Date(),
            isVerified: false,
        });

        logUser("user_created", req.userId?.toString(), { targetUser: user.username, message: `Admin created user ${user.username}`, meta: { userId: user._id.toString() } });
        return res.status(201).json({ ok: true, user: { id: user._id.toString(), email: user.email, username: user.username } });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to create user" });
    }
});

// GET /roles
router.get("/roles", requireAdmin, async (req, res) => {
    try {
        const roles = await Role.find({}).sort({ createdAt: -1 }).lean();
        return res.json(roles.map((r) => ({ id: r._id.toString(), name: r.name, badge: r.badge, color: r.color, permissions: r.permissions || [] })));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// POST /roles
router.post("/roles", requireAdmin, async (req, res) => {
    try {
        const { name, badge, color } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: "Name required" });
        const role = await Role.create({ name: name.trim(), badge: badge || "\u2B50", color: color || "#6b7280" });
        return res.status(201).json({ id: role._id.toString(), name: role.name, badge: role.badge, color: role.color });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// DELETE /roles
router.delete("/roles", requireAdmin, async (req, res) => {
    try {
        const { id } = req.body;
        await Role.findByIdAndDelete(id);
        await User.updateMany({ roles: id }, { $pull: { roles: id } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// POST /roles/seed-normal â€” create "Normal User" role (no badge) and assign to all users without roles
router.post("/roles/seed-normal", requireAdmin, async (req, res) => {
    try {
        let normalRole = await Role.findOne({ name: "Normal User" });
        if (!normalRole) {
            normalRole = await Role.create({
                name: "Normal User",
                badge: "",
                color: "#6b7280",
                permissions: [
                    "create_post", "delete_own_post",
                    "create_comment", "delete_own_comment",
                    "react", "bookmark", "repost",
                    "use_voice_chat", "use_live_stream", "access_entertainment",
                    // No `upload_video`: it is opt-in only. Adding it here would
                    // hand direct video upload to every seeded user, which is the
                    // cost this permission exists to prevent. Grant it to a
                    // trusted role, or per-user from the Users panel.
                ],
            });
        }

        const result = await User.updateMany(
            { roles: { $eq: [] } },
            { $addToSet: { roles: normalRole._id } }
        );

        return res.json({
            roleId: normalRole._id.toString(),
            roleName: normalRole.name,
            usersUpdated: result.modifiedCount,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// GET /ads
router.get("/ads", requireAdmin, async (req, res) => {
    try {
        const ads = await Ad.find({}).sort({ createdAt: -1 }).lean();
        return res.json(ads);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// POST /ads
router.post("/ads", requireAdmin, async (req, res) => {
    try {
        const { title, description, imageUrl, linkUrl, adType, adsterraCode, adsenseSlot, adsenseClient, adSize, ctaText, slot, startDate, endDate, isActive } = req.body;
        if (!title?.trim()) return res.status(400).json({ error: "Title required" });

        const ad = await Ad.create({
            title: title.trim().slice(0, 100),
            description: (description || "").trim().slice(0, 300),
            imageUrl: imageUrl || "",
            linkUrl: linkUrl || "",
            adType: adType || "custom",
            adsterraCode: adsterraCode || "",
            adsenseSlot: adsenseSlot || "",
            adsenseClient: adsenseClient || "",
            adSize: adSize || "",
            ctaText: ctaText || "Learn More",
            // An unknown placement is stored as "" (unassigned) rather than
            // rejected, so a typo cannot silently put an ad on the wrong page.
            slot: AD_SLOTS.includes(slot) ? slot : "",
            startDate: startDate || null,
            endDate: endDate || null,
            isActive: isActive !== false,
            createdBy: "admin",
        });

        return res.status(201).json(ad);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to create ad" });
    }
});

// PATCH /ads
router.patch("/ads", requireAdmin, async (req, res) => {
    try {
        const { id, ...updates } = req.body;
        if (!id) return res.status(400).json({ error: "id required" });

        const ad = await Ad.findByIdAndUpdate(id, { ...updates, updatedAt: new Date() }, { returnDocument: 'after' }).lean();
        if (!ad) return res.status(404).json({ error: "Ad not found" });
        return res.json(ad);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// DELETE /ads
router.delete("/ads", requireAdmin, async (req, res) => {
    try {
        const id = req.query.id;
        if (!id) return res.status(400).json({ error: "id required" });
        await Ad.findByIdAndDelete(id);
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// PATCH /ads/:id
router.patch("/ads/:id", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, imageUrl, linkUrl, adType, adsterraCode, adsenseSlot, adsenseClient, adSize, ctaText, slot, startDate, endDate, isActive } = req.body;

        const ad = await Ad.findByIdAndUpdate(id, {
            ...(title !== undefined && { title: title.trim().slice(0, 100) }),
            ...(description !== undefined && { description: description.trim().slice(0, 300) }),
            ...(imageUrl !== undefined && { imageUrl }),
            ...(linkUrl !== undefined && { linkUrl }),
            ...(adType !== undefined && { adType }),
            ...(adsterraCode !== undefined && { adsterraCode }),
            ...(adsenseSlot !== undefined && { adsenseSlot }),
            ...(adsenseClient !== undefined && { adsenseClient }),
            ...(adSize !== undefined && { adSize }),
            ...(ctaText !== undefined && { ctaText }),
            ...(slot !== undefined && { slot: AD_SLOTS.includes(slot) ? slot : "" }),
            ...(startDate !== undefined && { startDate: startDate || null }),
            ...(endDate !== undefined && { endDate: endDate || null }),
            ...(isActive !== undefined && { isActive }),
            updatedAt: new Date(),
        }, { returnDocument: 'after' }).lean();

        if (!ad) return res.status(404).json({ error: "Ad not found" });
        return res.json(ad);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// DELETE /ads/:id
router.delete("/ads/:id", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await Ad.findByIdAndDelete(id);
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// POST /ads/:id/track
router.post("/ads/:id/track", async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body;
        const update = {};
        if (action === "impression") update.$inc = { impressions: 1 };
        else if (action === "click") update.$inc = { clicks: 1 };
        else return res.status(400).json({ error: "Invalid action" });

        await Ad.findByIdAndUpdate(id, update);
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// GET /analytics
// Admin-only: this rollup reports every user, every post and the site-wide
// leaderboards, so it was readable by anyone who asked for it.
router.get("/analytics", requireAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalPosts = await Post.countDocuments();

        const users = await User.find().select("username createdAt").lean();
        const posts = await Post.find()
            .select("sender likes comments viewCount timeStamp hashtags mentions")
            .lean();

        const totalLikes = posts.reduce((sum, p) => sum + (p.likes?.length || 0), 0);
        const totalComments = posts.reduce((sum, p) => sum + (p.comments?.length || 0), 0);
        const totalViews = posts.reduce((sum, p) => sum + (p.viewCount || 0), 0);

        const postsByDay = {}, usersByDay = {}, likesByDay = {}, commentsByDay = {};

        posts.forEach((post) => {
            const date = new Date(post.timeStamp).toISOString().split("T")[0];
            postsByDay[date] = (postsByDay[date] || 0) + 1;
            likesByDay[date] = (likesByDay[date] || 0) + (post.likes?.length || 0);
            commentsByDay[date] = (commentsByDay[date] || 0) + (post.comments?.length || 0);
        });

        users.forEach((user) => {
            const date = new Date(user.createdAt).toISOString().split("T")[0];
            usersByDay[date] = (usersByDay[date] || 0) + 1;
        });

        const postCounts = {};
        posts.forEach((post) => { postCounts[post.sender] = (postCounts[post.sender] || 0) + 1; });
        const topPosters = Object.entries(postCounts)
            .sort(([, a], [, b]) => b - a).slice(0, 10)
            .map(([username, count]) => ({ username, count }));

        const likeCounts = {};
        posts.forEach((post) => {
            (post.likes || []).forEach((username) => { likeCounts[username] = (likeCounts[username] || 0) + 1; });
        });
        const topLikers = Object.entries(likeCounts)
            .sort(([, a], [, b]) => b - a).slice(0, 10)
            .map(([username, count]) => ({ username, count }));

        const hashtagCount = {};
        posts.forEach((post) => {
            (post.hashtags || []).forEach((tag) => { hashtagCount[tag] = (hashtagCount[tag] || 0) + 1; });
        });
        const topHashtags = Object.entries(hashtagCount)
            .sort(([, a], [, b]) => b - a).slice(0, 10)
            .map(([tag, count]) => ({ tag, count }));

        const topPosts = [...posts]
            .sort((a, b) => ((b.likes?.length || 0) + (b.comments?.length || 0)) - ((a.likes?.length || 0) + (a.comments?.length || 0)))
            .slice(0, 10)
            .map((p) => ({
                id: p._id, sender: p.sender, text: p.text?.slice(0, 100) || "",
                likes: p.likes?.length || 0, comments: p.comments?.length || 0,
                views: p.viewCount || 0, timeStamp: p.timeStamp,
            }));

        return res.json({
            stats: {
                totalUsers, totalPosts, totalLikes, totalComments, totalViews,
                avgPostsPerUser: totalUsers > 0 ? (totalPosts / totalUsers).toFixed(1) : 0,
            },
            charts: { postsByDay, usersByDay, likesByDay, commentsByDay },
            topPosters, topLikers, topHashtags, topPosts,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch admin analytics" });
    }
});

// â”€â”€ Growth analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// /analytics/growth?granularity=day|week|month|year&days=30&tz=Asia/Karachi
// Time series of users, posts, tracked events and active users, bucketed in
// the specified timezone (defaults to the server's local time).
const GRAN_CLAMP = { day: 90, week: 156, month: 60, year: 10 };

router.get("/analytics/growth", requireAdmin, async (req, res) => {
    try {
        const granularity = ["day", "week", "month", "year"].includes(req.query.granularity) ? req.query.granularity : "day";
        const days = Math.max(7, Math.min(parseInt(req.query.days, 10) || 30, (GRAN_CLAMP[granularity] || 90) * 7));
        const tz = typeof req.query.tz === "string" && req.query.tz ? req.query.tz : "local";

        const to = new Date();
        const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

        const [users, posts, events] = await Promise.all([
            User.find({ createdAt: { $gte: from } }).select("createdAt").lean().limit(50000),
            Post.find({ timeStamp: { $gte: from } }).select("timeStamp").lean().limit(50000),
            AnalyticsEvent.find({ createdAt: { $gte: from } }).select("createdAt userId sessionId").lean().limit(50000),
        ]);

        const list = A.buckets(from, to, granularity, tz);
        const series = A.toSeries(
            list,
            A.bucketCounts(users, "createdAt", granularity, tz),
            A.bucketCounts(posts, "timeStamp", granularity, tz),
            A.bucketCounts(events, "createdAt", granularity, tz),
            A.bucketDistinct(events, "createdAt", "userId", granularity, tz),
        ).map((row) => ({ key: row.key, label: row.label, users: row.v0, posts: row.v1, events: row.v2, active: row.v3 }));

        const totals = series.reduce((acc, r) => {
            acc.users += r.users; acc.posts += r.posts; acc.events += r.events;
            return acc;
        }, { users: 0, posts: 0, events: 0 });

        return res.json({ granularity, tz, from, to, series, totals });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch growth analytics" });
    }
});

// /analytics/overview â€” headline numbers + day-over-day deltas.
router.get("/analytics/overview", requireAdmin, async (req, res) => {
    try {
        const tz = typeof req.query.tz === "string" && req.query.tz ? req.query.tz : "local";
        const now = new Date();
        const todayKey = A.dayKey(now, tz);
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

        const [totalUsers, totalPosts, newToday, newYesterday, postsToday, postsYesterday, eventsToday, eventsYesterday, active24h, topCountries] = await Promise.all([
            User.countDocuments(),
            Post.countDocuments(),
            User.countDocuments({ createdAt: { $gte: startOfToday } }),
            User.countDocuments({ createdAt: { $gte: startOfYesterday, $lt: startOfToday } }),
            Post.countDocuments({ timeStamp: { $gte: startOfToday } }),
            Post.countDocuments({ timeStamp: { $gte: startOfYesterday, $lt: startOfToday } }),
            AnalyticsEvent.countDocuments({ createdAt: { $gte: startOfToday } }),
            AnalyticsEvent.countDocuments({ createdAt: { $gte: startOfYesterday, $lt: startOfToday } }),
            AnalyticsEvent.distinct("userId", { createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, userId: { $ne: null } }),
            AnalyticsEvent.aggregate([
                { $match: { createdAt: { $gte: startOfToday }, "location.countryCode": { $ne: "" } } },
                { $group: { _id: "$location.countryCode", name: { $first: "$location.country" }, count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 },
            ]),
        ]);

        return res.json({
            tz,
            totals: { users: totalUsers, posts: totalPosts },
            today: {
                key: todayKey,
                newUsers: newToday, newUsersDelta: A.growthPercent(newToday, newYesterday),
                posts: postsToday, postsDelta: A.growthPercent(postsToday, postsYesterday),
                events: eventsToday, eventsDelta: A.growthPercent(eventsToday, eventsYesterday),
            },
            active24h: active24h.filter(Boolean).length,
            topCountries: (topCountries || []).map((c) => ({ code: c._id, name: c.name || c._id, count: c.count })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch overview" });
    }
});

// /analytics/devices?days=30 â€” device/os/browser mix + totals.
router.get("/analytics/devices", requireAdmin, async (req, res) => {
    try {
        const days = Math.max(1, Math.min(parseInt(req.query.days, 10) || 30, 365));
        const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const events = await AnalyticsEvent.find({ createdAt: { $gte: from } })
            .select("device").lean().limit(30000);
        return res.json({ days, ...A.deviceBreakdown(events), tracked: events.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch device analytics" });
    }
});

// /analytics/locations?days=30 â€” country + state/region + city roll-ups with
// coordinates for the globe, plus helper icons for the dots.
//
// Rolled up by Mongo rather than by pulling documents into Node: the previous
// implementation fetched up to 30 000 raw events and counted them in JS, so
// cost scaled with traffic and silently truncated past the cap. A $group makes
// the result proportional to the number of distinct places, not the number of
// events, and never truncates the totals.
router.get("/analytics/locations", requireAdmin, async (req, res) => {
    try {
        const days = Math.max(1, Math.min(parseInt(req.query.days, 10) || 30, 365));
        const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const match = {
            createdAt: { $gte: from },
            "location.countryCode": { $nin: ["", null] },
        };

        // The three levels the globe drills through. Each returns rows that are
        // already aggregated and capped — the only thing that scales with size.
        // The last three are the geo-coverage denominator, so the page can say
        // what share of tracked events were placeable and what the rest were.
        const [countries, regions, cities, total, totalEvents, unlocated] = await Promise.all([
            AnalyticsEvent.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: "$location.countryCode",
                        name: { $first: "$location.country" },
                        // Centroid of the points actually seen, not $first. With no
                        // $sort ahead of the group, $first returns whichever document
                        // the server happened to read first, so a country dot could be
                        // plotted wherever one arbitrary visitor happened to be.
                        // $avg also skips nulls, so a few coordinate-less events
                        // cannot drag the fix toward zero.
                        lat:  { $avg: "$location.lat" },
                        lon:  { $avg: "$location.lon" },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
                { $limit: 400 },
            ]).allowDiskUse(true),
            AnalyticsEvent.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: {
                            country: "$location.countryCode",
                            region: "$location.region",
                        },
                        name:    { $first: "$location.region" },
                        country: { $first: "$location.country" },
                        lat:     { $avg: "$location.lat" },
                        lon:     { $avg: "$location.lon" },
                        count:   { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
                { $limit: 1200 },
            ]).allowDiskUse(true),
            AnalyticsEvent.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: {
                            country: "$location.countryCode",
                            region: "$location.region",
                            city: "$location.city",
                        },
                        name:        { $first: "$location.city" },
                        region:      { $first: "$location.region" },
                        countryName: { $first: "$location.country" },
                        lat:         { $avg: "$location.lat" },
                        lon:         { $avg: "$location.lon" },
                        count:       { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
                { $limit: 2000 },
            ]).allowDiskUse(true),
            AnalyticsEvent.countDocuments(match),
            AnalyticsEvent.countDocuments({ createdAt: { $gte: from } }),
            AnalyticsEvent.aggregate([
                { $match: { createdAt: { $gte: from }, "location.countryCode": { $in: ["", null] } } },
                { $group: { _id: "$type", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 8 },
            ]).allowDiskUse(true),
        ]);

        const countryList = countries.map(A.mapCountryRollup);
        const regionList = regions.map(A.mapRegionRollup);
        const cityList = cities.map(A.mapCityRollup);
        A.backfillCountryCoords(countryList, cityList);

        return res.json({
            days,
            countries: countryList,
            regions: regionList,
            cities: cityList,
            totalLocated: total,
            // Reported alongside the located count because the two are easy to
            // mistake for each other: the "Events" stat card counts every event
            // in the period, this counts only the ones geo could place. Showing
            // the denominator and what is missing from it is the difference
            // between "the globe is broken" and "these events have no location".
            totalEvents,
            locatedShare: totalEvents > 0 ? Number(((total / totalEvents) * 100).toFixed(1)) : 0,
            unlocatedByType: unlocated.map((r) => ({ type: r._id || "unknown", count: r.count })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch location analytics" });
    }
});

// /analytics/posts?days=30&limit=20&sort=impressions — site-wide top posts.
//
// These events have been recorded (and indexed, see models/analyticsEvent.js)
// since per-post tracking shipped, but nothing ever aggregated them outside the
// per-creator endpoint, which only ever looks at one author's own posts. This
// is the missing site-wide read.
//
// Reach is a distinct-viewer count, which needs an $addToSet, and an $addToSet
// over every event in the window is proportional to traffic — the one thing the
// locations roll-up above was rewritten to avoid. So the counts are grouped
// first (cheap, no set), reduced to the top N ids, and only those N are asked
// for their viewer sets. Memory then scales with the size of the leaderboard
// rather than with the size of the window. Both pipelines live in
// analyticsHelpers.js so their classification rules stay unit-tested.
const POST_SORTABLE = ["impressions", "reach", "clicks", "shares", "likes"];

router.get("/analytics/posts", requireAdmin, async (req, res) => {
    try {
        const days = Math.max(1, Math.min(parseInt(req.query.days, 10) || 30, 365));
        const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 100));
        const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const postMatch = { createdAt: { $gte: from }, postId: { $ne: null } };

        const counts = await AnalyticsEvent.aggregate([
            ...A.postCountsPipeline(postMatch),
            { $limit: limit * 4 }, // over-fetch, so a `likes` sort can still fill the board
        ]).allowDiskUse(true);

        if (!counts.length) return res.json({ days, sort: "impressions", posts: [] });

        const ids = counts.map((c) => c._id);
        const viewerRows = await AnalyticsEvent.aggregate(
            A.viewerSetPipeline({ ...postMatch, postId: { $in: ids } }),
        ).allowDiskUse(true);

        const reachByPost = new Map(viewerRows.map((r) => [String(r._id), r.viewers.length]));
        const docs = await Post.find({ _id: { $in: ids } })
            .select("sender text imageUrl likes commentCount timeStamp isRemoved")
            .lean();
        const docById = new Map(docs.map((d) => [String(d._id), d]));

        let posts = counts
            .map((c) => {
                const d = docById.get(String(c._id));
                if (!d) return null; // deleted post, or removed from the collection
                const impressions = c.impressions;
                const clicks = c.clicks;
                return {
                    id: d._id,
                    sender: d.sender,
                    text: d.text?.slice(0, 120) || "",
                    imageUrl: d.imageUrl || "",
                    timeStamp: d.timeStamp,
                    isRemoved: !!d.isRemoved,
                    impressions,
                    clicks,
                    shares: c.shares,
                    reach: reachByPost.get(String(c._id)) || 0,
                    likes: d.likes?.length || 0,
                    // commentCount is the authoritative total; `comments` is only
                    // a bounded window of the most recent ones.
                    comments: d.commentCount || 0,
                    // Same caveat as the per-creator view: likes/comments are
                    // lifetime while impressions only cover the window, so a CTR
                    // built from both can exceed 100%.
                    clickThroughRate: impressions > 0
                        ? Number(((clicks / impressions) * 100).toFixed(2))
                        : null,
                };
            })
            .filter(Boolean);

        // `likes` is a field on the post, not on the event, so it can only be
        // applied after the posts have been loaded. Validated against a list
        // rather than interpolated into the pipeline.
        const sort = POST_SORTABLE.includes(req.query.sort) ? req.query.sort : "impressions";
        posts.sort((a, b) => (b[sort] || 0) - (a[sort] || 0) || b.impressions - a.impressions);

        return res.json({ days, sort, posts: posts.slice(0, limit) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch post analytics" });
    }
});

// GET /logs
router.get("/logs", requireAdmin, (req, res) => {
    try {
        const { level, since, limit } = req.query;
        const logs = getLogs({ level, since, limit: parseInt(limit) || 200 });
        return res.json(logs);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// GET /permissions â€” list all valid permission keys
router.get("/permissions", requireAdmin, (req, res) => {
    return res.json(VALID_PERMISSIONS);
});

// PATCH /roles/:id/permissions â€” set permissions for a role
router.patch("/roles/:id/permissions", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;
        if (!Array.isArray(permissions)) return res.status(400).json({ error: "permissions array required" });

        const valid = permissions.filter((p) => VALID_PERMISSIONS.includes(p));
        const role = await Role.findByIdAndUpdate(id, { permissions: valid }, { returnDocument: "after" }).lean();
        if (!role) return res.status(404).json({ error: "Role not found" });
        return res.json({ id: role._id.toString(), name: role.name, badge: role.badge, color: role.color, permissions: role.permissions });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// GET /moderation â€” list moderation logs
router.get("/moderation", requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
        const logs = await ModerationLog.find({}).sort({ timeStamp: -1 }).limit(limit).lean();
        return res.json(logs.map((l) => ({
            id: l._id.toString(),
            postId: l.postId?.toString() || "",
            action: l.action,
            moderator: l.moderator,
            reason: l.reason,
            postOwner: l.postOwner,
            postPreview: l.postPreview,
            timeStamp: l.timeStamp,
        })));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// GET /moderation/flagged â€” list removed posts
router.get("/moderation/flagged", requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
        const posts = await Post.find({ isRemoved: true }).sort({ removedAt: -1 }).limit(limit).lean();
        return res.json(posts.map((p) => ({
            id: p._id.toString(),
            text: (p.text || "").slice(0, 200),
            sender: p.sender,
            imageUrl: p.imageUrl || "",
            removedBy: p.removedBy,
            removedReason: p.removedReason,
            removedAt: p.removedAt,
            timeStamp: p.timeStamp,
        })));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// POST /moderation/remove â€” take down a post
router.post("/moderation/remove", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const { postId, reason } = req.body;
        if (!postId) return res.status(400).json({ error: "postId required" });

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ error: "Post not found" });

        const moderator = await User.findById(req.userId).select("username").lean();

        post.isRemoved = true;
        post.removedBy = moderator?.username || "admin";
        post.removedReason = reason || "No reason provided";
        post.removedAt = new Date();
        await post.save();

        await ModerationLog.create({
            postId: post._id,
            action: "remove",
            moderator: moderator?.username || "admin",
            reason: reason || "No reason provided",
            postOwner: post.sender,
            postPreview: (post.text || "").slice(0, 200),
        });

        logModeration("post_removed", { username: moderator?.username, targetUser: post.sender, message: `Post removed by ${moderator?.username}: ${reason || "No reason"}`, meta: { postId: post._id.toString() } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// POST /moderation/restore â€” restore a taken-down post
router.post("/moderation/restore", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const { postId } = req.body;
        if (!postId) return res.status(400).json({ error: "postId required" });

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ error: "Post not found" });

        const moderator = await User.findById(req.userId).select("username").lean();

        post.isRemoved = false;
        post.removedBy = null;
        post.removedReason = "";
        post.removedAt = null;
        await post.save();

        await ModerationLog.create({
            postId: post._id,
            action: "restore",
            moderator: moderator?.username || "admin",
            reason: "Restored by moderator",
            postOwner: post.sender,
            postPreview: (post.text || "").slice(0, 200),
        });

        logModeration("post_restored", { username: moderator?.username, targetUser: post.sender, message: `Post restored by ${moderator?.username}`, meta: { postId: post._id.toString() } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// GET /content-filter — get content filter settings
router.get("/content-filter", requireAdmin, async (req, res) => {
    try {
        const filter = await ContentFilter.load();
        return res.json(publicFilterShape(filter));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/**
 * Every key the admin UI can read or write. Built from the schema so the two can
 * never drift, and used for BOTH the GET response and the PATCH whitelist.
 *
 * The old PATCH hard-coded four keys and did `Object.assign(filter, update)`.
 * Because the schema is `strict: true`, any field added here but not declared in
 * models/contentFilter.js would be silently dropped while still returning HTTP
 * 200 — a save that reports success and persists nothing. `sanitiseFilterPatch`
 * therefore validates against this same list.
 */
function publicFilterShape(filter) {
    const doc = filter && typeof filter.toObject === "function" ? filter.toObject() : filter || {};
    return {
        toxicWords: doc.toxicWords || [],
        nudityKeywords: doc.nudityKeywords || [],
        allowedWords: doc.allowedWords || [],
        blockNudity: doc.blockNudity !== false,
        blurToxicWords: doc.blurToxicWords !== false,
        matchOptions: {
            wholeWord: doc.matchOptions?.wholeWord !== false,
            leetspeak: doc.matchOptions?.leetspeak === true,
            caseSensitive: doc.matchOptions?.caseSensitive === true,
            minLength: doc.matchOptions?.minLength ?? 0,
        },
        textScope: { ...(doc.textScope || {}) },
        mediaModeration: { ...(doc.mediaModeration || {}) },
        links: { ...(doc.links || {}) },
        autoAction: { ...(doc.autoAction || {}) },
        updatedAt: doc.updatedAt || null,
        updatedBy: doc.updatedBy || "",
    };
}

const STRING_ARRAY_FIELDS = ["toxicWords", "nudityKeywords", "allowedWords"];
const BOOLEAN_FIELDS = ["blockNudity", "blurToxicWords"];

/**
 * Coerce a PATCH body into a safe partial update.
 *
 * Deep-merges the nested objects rather than replacing them, so saving one
 * toggle does not blank out the rest of `mediaModeration`. Returns
 * `{ update, rejected }` — `rejected` names anything refused, so the UI can tell
 * the admin rather than silently ignoring them.
 */
function sanitiseFilterPatch(body) {
    const update = {};
    const rejected = [];

    for (const field of STRING_ARRAY_FIELDS) {
        if (body[field] === undefined) continue;
        if (!Array.isArray(body[field])) {
            rejected.push(`${field} must be an array`);
            continue;
        }
        update[field] = body[field]
            .map((w) => String(w ?? "").trim())
            .filter(Boolean)
            .slice(0, 5000);
    }

    for (const field of BOOLEAN_FIELDS) {
        if (body[field] === undefined) continue;
        if (typeof body[field] !== "boolean") {
            rejected.push(`${field} must be a boolean`);
            continue;
        }
        update[field] = body[field];
    }

    // Nested sections, each with its own allowlist of scalar fields.
    const SECTIONS = {
        matchOptions: {
            wholeWord: "boolean",
            leetspeak: "boolean",
            caseSensitive: "boolean",
            minLength: "clampedNumber",
        },
        textScope: null, // all booleans, derived from the schema below
        mediaModeration: {
            enabled: "boolean",
            provider: "enum:cloudinary,google,aws,none",
            threshold: "clampedNumber01",
            action: "enum:block,flag,blur",
            failureMode: "enum:closed,open",
            requireCloudinaryHost: "boolean",
            destroyOnReject: "boolean",
            cacheResults: "boolean",
            cacheTtlHours: "clampedNumber",
        },
        links: {
            blockAllLinks: "boolean",
            blockPhishingPatterns: "boolean",
        },
        autoAction: {
            autoHideFlaggedPosts: "boolean",
            suspendAfterOffences: "clampedNumber",
            offenceWindowHours: "clampedNumber",
            suspendHours: "clampedNumber",
        },
    };

    // Sections whose every field is a boolean. `textScope` has no non-boolean
    // fields; `mediaModeration` does (provider/threshold/action/failureMode), so
    // it is validated by its rules table above like any other mixed section.
    const ALL_BOOLEAN_SECTIONS = new Set(["textScope"]);

    for (const [section, rules] of Object.entries(SECTIONS)) {
        if (body[section] === undefined) continue;
        const incoming = body[section];
        if (typeof incoming !== "object" || incoming === null || Array.isArray(incoming)) {
            rejected.push(`${section} must be an object`);
            continue;
        }
        const sectionUpdate = {};

        if (ALL_BOOLEAN_SECTIONS.has(section)) {
            for (const [key, value] of Object.entries(incoming)) {
                if (typeof value !== "boolean") {
                    rejected.push(`${section}.${key} must be a boolean`);
                    continue;
                }
                sectionUpdate[key] = value;
            }
            continue;
        }

        for (const [key, value] of Object.entries(incoming)) {
            // `mediaModeration.scope` is a nested map of booleans.
            if (key === "scope" && section === "mediaModeration") {
                if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                    const scopeUpdate = {};
                    for (const [sk, sv] of Object.entries(value)) {
                        if (typeof sv === "boolean") scopeUpdate[sk] = sv;
                        else rejected.push(`mediaModeration.scope.${sk} must be a boolean`);
                    }
                    if (Object.keys(scopeUpdate).length) sectionUpdate.scope = scopeUpdate;
                } else {
                    rejected.push("mediaModeration.scope must be an object");
                }
                continue;
            }

            const rule = rules[key];
            if (!rule) {
                // Previously this silently ignored unknown keys, which is how a
                // typo in the UI looked like a successful save.
                rejected.push(`${section}.${key} is not a recognised setting`);
                continue;
            }
            if (rule === "boolean") {
                if (typeof value !== "boolean") { rejected.push(`${section}.${key} must be a boolean`); continue; }
                sectionUpdate[key] = value;
            } else if (rule === "clampedNumber") {
                const n = Number(value);
                if (!Number.isFinite(n) || n < 0) { rejected.push(`${section}.${key} must be a non-negative number`); continue; }
                sectionUpdate[key] = n;
            } else if (rule === "clampedNumber01") {
                const n = Number(value);
                if (!Number.isFinite(n) || n < 0 || n > 1) { rejected.push(`${section}.${key} must be between 0 and 1`); continue; }
                sectionUpdate[key] = n;
            } else if (rule.startsWith("enum:")) {
                const allowed = rule.slice(5).split(",");
                if (!allowed.includes(String(value))) {
                    rejected.push(`${section}.${key} must be one of: ${allowed.join(", ")}`);
                    continue;
                }
                sectionUpdate[key] = String(value);
            }
        }
        if (Object.keys(sectionUpdate).length) update[section] = sectionUpdate;
    }

    // Domain lists live inside `links` but are arrays, not booleans.
    if (body.links && typeof body.links === "object") {
        for (const field of ["blockedDomains", "allowedDomains"]) {
            if (body.links[field] === undefined) continue;
            if (!Array.isArray(body.links[field])) {
                rejected.push(`links.${field} must be an array`);
                continue;
            }
            update.links = update.links || {};
            update.links[field] = body.links[field]
                .map((d) => String(d ?? "").trim().toLowerCase())
                .filter(Boolean)
                .slice(0, 5000);
        }
    }

    return { update, rejected };
}

// PATCH /content-filter — update content filter settings
router.patch("/content-filter", requireAdmin, async (req, res) => {
    try {
        const { update, rejected } = sanitiseFilterPatch(req.body || {});
        if (rejected.length) {
            return res.status(400).json({ error: "Invalid content filter update", rejected });
        }
        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: "Nothing to update" });
        }

        const filter = await ContentFilter.load();
        // Deep-merge the nested sections so a partial patch (one toggle) does not
        // discard the other keys in the same section.
        for (const [key, value] of Object.entries(update)) {
            if (
                value && typeof value === "object" && !Array.isArray(value) &&
                filter[key] && typeof filter[key] === "object" && !Array.isArray(filter[key])
            ) {
                filter[key] = { ...filter[key].toObject?.() ?? filter[key], ...value };
            } else {
                filter[key] = value;
            }
        }
        filter.updatedAt = new Date();
        filter.updatedBy = req.admin?.username || req.user?.username || "admin";
        await filter.save();

        // The hot caches in textFilter/mediaModeration hold up to 15s of the old
        // config, so an admin disabling the filter would appear to do nothing
        // for a few seconds and then start blocking everything.
        textFilter.invalidateCache();
        mediaModeration.clearVerdictCache();

        return res.json(publicFilterShape(filter));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// POST /content-filter/test — dry-run text through the real matcher.
// This is what makes the filter tunable: an admin can confirm that "ass" now
// leaves "assistant" alone before saving a change that would block real posts.
router.post("/content-filter/test", requireAdmin, async (req, res) => {
    try {
        const { text = "", useLiveConfig = true, list = "nudityKeywords" } = req.body || {};
        if (!["nudityKeywords", "toxicWords"].includes(list)) {
            return res.status(400).json({ error: 'list must be "nudityKeywords" or "toxicWords"' });
        }
        const filter = useLiveConfig ? await ContentFilter.load() : null;
        const doc = filter ? (typeof filter.toObject === "function" ? filter.toObject() : filter) : {};

        // `list` matters: the reported bug was a word in the BLUR list blurring
        // the wrong text, and this endpoint only ever checked the BLOCK list. An
        // admin who added "ass" to Toxic Words and pasted "assistant" here would
        // have been told the text passes — which reads as the fix not working.
        const keywords = Array.isArray(doc[list]) ? doc[list] : [];
        const options = doc.matchOptions || { wholeWord: true };
        const allowlist = Array.isArray(doc.allowedWords) ? doc.allowedWords : [];

        const value = String(text).slice(0, 5000);
        const rawMatches = toxicMatch.findMatches(value, keywords, options);
        const matches = allowlist.length
            ? toxicMatch.filterAllowed(value, rawMatches, allowlist)
            : rawMatches;

        return res.json({
            list,
            matches: matches.map((m) => ({ word: m.word, start: m.start, end: m.end })),
            wouldBlock: matches.length > 0,
            segments: toxicMatch.segmentByMatches(value, keywords, { ...options, allowlist }),
            totalMatches: matches.length,
            config: {
                wholeWord: options.wholeWord !== false,
                leetspeak: options.leetspeak === true,
                caseSensitive: options.caseSensitive === true,
                minLength: options.minLength ?? 0,
                keywordCount: keywords.length,
                allowlistCount: allowlist.length,
                surfaceEnabled: doc.textScope?.posts !== false,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// GET /content-filter/public — the list the client blurs against.
// No auth in Express, but the Next proxy still requires a session cookie for
// /api/admin/* (see proxy.js PUBLIC_PATHS), so this is not truly anonymous.
router.get("/content-filter/public", async (req, res) => {
    try {
        const filter = await ContentFilter.loadLean();
        if (!filter) {
            return res.json({
                toxicWords: [],
                allowedWords: [],
                matchOptions: { wholeWord: true },
                blurToxicWords: true,
            });
        }
        return res.json({
            toxicWords: filter.toxicWords || [],
            allowedWords: filter.allowedWords || [],
            // The client MUST use the same matching rules as the server,
            // otherwise a word the server blocks is shown unblurred, or vice
            // versa — a filter that is only cosmetic on one side.
            matchOptions: {
                wholeWord: filter.matchOptions?.wholeWord !== false,
                leetspeak: filter.matchOptions?.leetspeak === true,
                caseSensitive: filter.matchOptions?.caseSensitive === true,
                minLength: filter.matchOptions?.minLength ?? 0,
            },
            blurToxicWords: filter.blurToxicWords !== false,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// GET /content-filter/stats — hit counts per configured term, so the admin can
// see which entries are actually firing and prune the ones that only cause
// false positives.
router.get("/content-filter/stats", requireAdmin, async (req, res) => {
    try {
        const filter = await ContentFilter.load();
        const doc = typeof filter.toObject === "function" ? filter.toObject() : filter;
        const options = doc.matchOptions || { wholeWord: true };
        const allowlist = doc.allowedWords || [];

        // One pass over recent content rather than a query per term.
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
        const recent = await Post.find({ timeStamp: { $gte: since } })
            .select("text comments.text")
            .lean()
            .limit(2000);

        const counts = {};
        const bump = (word) => { counts[word] = (counts[word] || 0) + 1; };

        for (const post of recent) {
            const haystacks = [post.text];
            if (Array.isArray(post.comments)) for (const c of post.comments) haystacks.push(c.text);
            for (const h of haystacks) {
                if (!h) continue;
                const found = allowlist.length
                    ? toxicMatch.filterAllowed(h, toxicMatch.findMatches(h, doc.toxicWords || [], options), allowlist)
                    : toxicMatch.findMatches(h, doc.toxicWords || [], options);
                for (const m of found) bump(m.word.toLowerCase());
            }
        }

        const entries = (doc.toxicWords || []).map((word) => ({
            word,
            hits: counts[String(word).toLowerCase()] || 0,
        }));
        entries.sort((a, b) => b.hits - a.hits);

        return res.json({
            entries,
            totalHits: entries.reduce((n, e) => n + e.hits, 0),
            postsScanned: recent.length,
            windowDays: 30,
            unusedEntries: entries.filter((e) => e.hits === 0).map((e) => e.word),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// GET /debug/user-permissions/:userId â€” debug the permission resolution chain for a user
router.get("/debug/user-permissions/:userId", requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId).lean();
        if (!user) return res.status(404).json({ error: "User not found" });

        const rawRoles = (user.roles || []).map((r) => r.toString());
        const populatedUser = await User.findById(userId).select("isAdmin roles").populate("roles", "permissions name badge color").lean();

        const roleDetails = (populatedUser.roles || []).map((r) => ({
            id: r._id?.toString(),
            name: r.name,
            badge: r.badge,
            color: r.color,
            permissions: r.permissions || [],
        }));

        const allPerms = roleDetails.flatMap((r) => r.permissions);
        const uniquePerms = [...new Set(allPerms)];

        return res.json({
            userId: user._id.toString(),
            username: user.username,
            isAdmin: user.isAdmin,
            suspended: user.suspended || false,
            rawRoleIds: rawRoles,
            roleCount: roleDetails.length,
            roles: roleDetails,
            resolvedPermissions: uniquePerms,
        });
    } catch (error) {
        console.error("[debug/user-permissions] Error:", error.message, error.stack);
        return res.status(500).json({ error: error.message });
    }
});

// PATCH /users/:id/suspend â€” suspend/unsuspend a user
router.patch("/users/:id/suspend", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { suspended, suspendedUntil, suspendedReason } = req.body;

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: "User not found" });

        user.suspended = !!suspended;
        user.suspendedUntil = suspendedUntil || null;
        user.suspendedReason = suspendedReason || "";
        await user.save();

        logUser(suspended ? "user_suspended" : "user_unsuspended", user.username, { targetUser: user.username, message: `User ${suspended ? "suspended" : "unsuspended"}: ${user.username}`, level: suspended ? "warn" : "info" });
        return res.json({ ok: true, suspended: user.suspended });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// â”€â”€ Community Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /communities â€” list all communities for admin
router.get("/communities", requireAdmin, async (req, res) => {
    try {
        const { search, sort = "memberCount", page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const query = {};
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { creator: { $regex: search, $options: "i" } },
            ];
        }
        const sortObj = sort === "newest" ? { createdAt: -1 } : sort === "name" ? { name: 1 } : { memberCount: -1 };
        const communities = await Community.find(query).sort(sortObj).skip(skip).limit(parseInt(limit)).lean();
        const total = await Community.countDocuments(query);
        return res.json({ communities, total });
    } catch (error) {
        console.error("Admin communities error:", error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// DELETE /communities/:id â€” admin delete any community
router.delete("/communities/:id", requireAdmin, async (req, res) => {
    try {
        const community = await Community.findByIdAndDelete(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });
        logModeration("community_deleted", "admin", { target: community.name, level: "warn" });
        return res.json({ ok: true });
    } catch (error) {
        console.error("Admin community delete error:", error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

// PATCH /communities/:id â€” admin edit any community
router.patch("/communities/:id", requireAdmin, async (req, res) => {
    try {
        const community = await Community.findById(req.params.id);
        if (!community) return res.status(404).json({ error: "Community not found" });

        const allowed = ["name", "description", "avatarUrl", "bannerUrl", "color", "settings", "rules", "flairs"];
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                if (key === "settings") {
                    Object.assign(community.settings, req.body.settings);
                } else if (key === "flairs") {
                    community.flairs = (req.body.flairs || []).map((f, i) => ({
                        id: f.id || `flair-${Date.now()}-${i}`,
                        name: f.name,
                        color: f.color || "#3b82f6",
                        emoji: f.emoji || "",
                    }));
                } else if (key === "rules") {
                    community.rules = req.body.rules || [];
                } else {
                    community[key] = req.body[key];
                }
            }
        }
        await community.save();
        return res.json(community);
    } catch (error) {
        console.error("Admin community update error:", error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

module.exports = router;
