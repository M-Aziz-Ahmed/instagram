const express = require("express");
const mongoose = require("mongoose");
const Post = require("../models/post");
const User = require("../models/user");
const AnalyticsEvent = require("../models/analyticsEvent");
const { optionalAuth } = require("../middleware/auth");
const { resolveLocation } = require("../lib/geo");

const router = express.Router();

// Per-post events a creator can be shown reach for. Anything outside this list
// is dropped rather than stored, so a hostile client can't invent event types.
const POST_EVENTS = new Set([
    "impression",
    "click",
    "profile_click",
    "link_click",
    "hashtag_click",
    "share",
]);

const DEVICE_TYPES = ["mobile", "tablet", "desktop", "bot", ""];

// Normalise the client-reported device the same way the /api/track beacon does,
// so one visitor can't produce two different device shapes depending on which
// endpoint saw them first.
function shapeDevice(d) {
    return {
        type: DEVICE_TYPES.includes(d?.type) ? d.type : "",
        os: typeof d?.os === "string" ? d.os.slice(0, 40) : "",
        browser: typeof d?.browser === "string" ? d.browser.slice(0, 40) : "",
    };
}

function shapeLocation(loc) {
    return {
        country: loc?.country || "",
        countryCode: loc?.countryCode || "",
        region: loc?.region || "",
        city: loc?.city || "",
        lat: loc?.lat ?? null,
        lon: loc?.lon ?? null,
        tz: loc?.tz || "",
    };
}

// POST /post-event — record that a post was seen or interacted with.
//
// Same privacy rules as the general /api/track beacon: the viewer is taken from
// the session, never from the body, and failures are swallowed so analytics can
// never break the page that reported them.
//
// Location and device are recorded here for the same reason the beacon records
// them. Post events are the highest-volume thing in the collection — a single
// feed scroll emits a dozen impressions — so when they were stored bare they
// inflated "Events" and the growth chart while being permanently invisible to
// the globe, the device mix and every geo roll-up. The two numbers on the admin
// analytics page disagreed by exactly that gap.
router.post("/post-event", optionalAuth, async (req, res) => {
    try {
        const { postId, event, sessionId, meta, device } = req.body || {};

        if (!mongoose.isValidObjectId(postId)) return res.status(400).json({ error: "Invalid postId" });
        if (!POST_EVENTS.has(event)) return res.status(400).json({ error: "Invalid event" });

        // Same /24 network cache the beacon uses, so a visitor already counted
        // once costs a map hit rather than another outbound provider call.
        // Kick it off before the validation-heavy work so it overlaps.
        const locationPromise = resolveLocation(req).catch(() => null);

        let resolved = null;
        try {
            resolved = await locationPromise;
        } catch {
            resolved = null;
        }

        await AnalyticsEvent.create({
            type: `post_${event}`,
            postId,
            userId: req.userId || null,
            sessionId: typeof sessionId === "string" ? sessionId.slice(0, 64) : "",
            meta: typeof meta === "string" ? meta.slice(0, 120) : "",
            device: shapeDevice(device),
            location: shapeLocation(resolved?.location),
        });

        res.status(201).json({ ok: true });
    } catch (error) {
        // A failed analytics write must not surface to the caller.
        res.status(200).json({ ok: false });
    }
});

// GET /
router.get("/", optionalAuth, async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ error: "Username required" });

        const user = await User.findOne({ username })
            .select("username avatarUrl isVerified roles createdAt")
            .populate("roles", "name badge color").lean();

        if (!user) return res.status(404).json({ error: "User not found" });

        // Analytics used to be readable for any username, which leaked every
        // creator's performance numbers to anyone who asked. It is now the
        // owner or an admin only.
        if (!req.userId) return res.status(401).json({ error: "Sign in required" });
        const viewer = await User.findById(req.userId).select("username isAdmin").lean();
        if (!viewer || (viewer.username !== user.username && !viewer.isAdmin)) {
            return res.status(403).json({ error: "Not your analytics" });
        }

        const posts = await Post.find({ sender: username, isRemoved: { $ne: true } })
            .select("_id text imageUrl likes commentCount comments viewCount mentions hashtags timeStamp")
            .sort({ timeStamp: -1 }).lean();

        const totalPosts = posts.length;
        const totalLikes = posts.reduce((sum, p) => sum + (p.likes?.length || 0), 0);
        const totalComments = posts.reduce((sum, p) => sum + (p.commentCount ?? p.comments?.length ?? 0), 0);
        // Legacy lifetime counter, kept for continuity with the old dashboard.
        const totalViews = posts.reduce((sum, p) => sum + (p.viewCount || 0), 0);

        // ── Real time series ────────────────────────────────────────────────
        // The old charts bucketed each post's whole lifetime likes/comments/views
        // onto the day it was published, so a post from March showed one huge
        // spike and nothing after. Impressions, clicks and reach are now derived
        // from timestamped events, which is what a day axis can actually mean.
        const postIds = posts.map((p) => p._id);
        const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

        const events = postIds.length
            ? await AnalyticsEvent.find({
                postId: { $in: postIds },
                createdAt: { $gte: since },
            })
                .select("type postId userId sessionId meta createdAt")
                .lean()
            : [];

        const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
        const emptySeries = (days) => {
            const out = {};
            for (let i = days - 1; i >= 0; i--) {
                out[dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000))] = 0;
            }
            return out;
        };

        const DAYS = 28;
        const impressionsByDay = emptySeries(DAYS);
        const clicksByDay = emptySeries(DAYS);
        const reachByDay = emptySeries(DAYS);
        const perPost = new Map();
        // Reach is people, not hits, so a viewer's first impression of a post is
        // the only one that counts toward the unique total.
        const seenByViewer = new Set();

        // Only days that exist in the zero-filled range may be incremented.
        // Without this guard a clock-skewed or out-of-window event would append
        // a phantom 29th bar and break the chart's x-axis.
        const bump = (series, key, by = 1) => {
            if (!Object.prototype.hasOwnProperty.call(series, key)) return;
            series[key] += by;
        };

        // postsByDay is sparse and all-time (it only holds days a post was
        // actually published on), so it needs the unguarded form.
        const count = (map, key, by = 1) => { map[key] = (map[key] || 0) + by; };

        for (const ev of events) {
            const day = dayKey(ev.createdAt);
            const pid = String(ev.postId);
            const row = perPost.get(pid) || { impressions: 0, clicks: 0, reach: 0 };
            const kind = String(ev.type || "").replace(/^post_/, "");

            if (kind === "impression") {
                row.impressions += 1;
                bump(impressionsByDay, day);
                const who = ev.userId ? `u:${ev.userId}` : ev.sessionId ? `s:${ev.sessionId}` : null;
                if (who && !seenByViewer.has(`${pid}|${who}`)) {
                    seenByViewer.add(`${pid}|${who}`);
                    row.reach += 1;
                    bump(reachByDay, day);
                }
            } else if (POST_EVENTS.has(kind)) {
                row.clicks += 1;
                bump(clicksByDay, day);
            }

            perPost.set(pid, row);
        }

        const postById = new Map(posts.map((p) => [String(p._id), p]));
        const withEvents = [...perPost.entries()]
            .map(([pid, row]) => {
                const p = postById.get(pid);
                if (!p) return null;
                return {
                    id: p._id,
                    text: p.text?.slice(0, 100) || "",
                    imageUrl: p.imageUrl,
                    // All-time counters, reported as plain totals.
                    likes: p.likes?.length || 0,
                    comments: p.commentCount ?? p.comments?.length ?? 0,
                    views: p.viewCount || 0,
                    timeStamp: p.timeStamp,
                    // Windowed counters.
                    impressions: row.impressions,
                    clicks: row.clicks,
                    reach: row.reach,
                    // Deliberately clicks/impressions and not
                    // (likes+comments+clicks)/impressions: likes and comments are
                    // all-time while impressions only cover the window, so mixing
                    // them yields a "rate" that can exceed 100%.
                    clickThroughRate: row.impressions > 0
                        ? Number(((row.clicks / row.impressions) * 100).toFixed(2))
                        : null,
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.impressions - a.impressions);

        const totalImpressions = events.filter((e) => e.type === "post_impression").length;
        const totalClicks = withEvents.reduce((s, p) => s + p.clicks, 0);
        const totalReach = withEvents.reduce((s, p) => s + p.reach, 0);

        // Posts per day is genuinely a publish-date series, so it stays.
        const postsByDay = {};
        posts.forEach((post) => { count(postsByDay, dayKey(post.timeStamp)); });

        const engagementRate = totalPosts > 0
            ? ((totalLikes + totalComments) / totalPosts).toFixed(1)
            : 0;

        const topPosts = withEvents.slice(0, 5);

        const hashtagCount = {};
        posts.forEach((post) => {
            (post.hashtags || []).forEach((tag) => { hashtagCount[tag] = (hashtagCount[tag] || 0) + 1; });
        });
        const topHashtags = Object.entries(hashtagCount)
            .sort(([, a], [, b]) => b - a).slice(0, 10)
            .map(([tag, count]) => ({ tag, count }));

        return res.json({
            user: {
                username: user.username, avatarUrl: user.avatarUrl,
                isVerified: user.isVerified,
                roles: (user.roles || []).map((r) => ({
                    id: r._id?.toString() ?? "", name: r.name ?? "",
                    badge: r.badge ?? "", color: r.color ?? "",
                })),
                createdAt: user.createdAt,
            },
            stats: {
                totalPosts, totalLikes, totalComments, totalViews,
                engagementRate: parseFloat(engagementRate),
                // Event-derived, last 28 days. Zero-filled so the chart has a
                // continuous x-axis instead of collapsing gaps.
                totalImpressions, totalClicks, totalReach,
                clickThroughRate: totalImpressions > 0
                    ? Number(((totalClicks / totalImpressions) * 100).toFixed(2))
                    : 0,
                windowDays: DAYS,
            },
            charts: { postsByDay, impressionsByDay, clicksByDay, reachByDay },
            topPosts, topHashtags,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch analytics" });
    }
});

module.exports = router;
