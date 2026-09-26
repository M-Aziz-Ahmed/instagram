const express = require("express");
const Post = require("../models/post");
const User = require("../models/user");
const { getHiddenUsers } = require("../lib/visibility");
const { displayCount } = require("../lib/postComments");

const router = express.Router();

// GET /api/trending — powering /trending and /explore.
//
// This endpoint was whitelisted in proxy.js and consumed by app/trending/page.js
// and components/TrendingSidebar.jsx, but nothing ever implemented it, so both
// surfaces silently rendered their empty state forever. Everything below is
// about not leaking things the feed already refuses to show:
//
//   - close-friends posts never appear in a shared/discovery surface
//   - scheduled and removed posts are excluded
//   - anything the viewer blocked or muted is excluded
//   - expired posts are excluded (the TTL index deletes them, but a TTL sweep
//     can lag by up to a minute)

const WINDOWS = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    all: 365 * 24 * 60 * 60 * 1000,
};

const clamp = (n, min, max, dflt) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return dflt;
    return Math.min(Math.max(Math.trunc(v), min), max);
};

/**
 * Visibility + moderation rules every discovery query shares.
 * @returns {object} a `$match` fragment
 */
function baseMatch(since, hidden) {
    const match = {
        timeStamp: { $gte: since },
        isRemoved: { $ne: true },
        isScheduled: { $ne: true },
        // Discovery surfaces are public by definition; a close-friends post
        // reaching /explore would be a privacy bug.
        visibility: { $ne: "closeFriends" },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    };
    if (hidden && hidden.length) match.sender = { $nin: hidden };
    return match;
}

/** Flatten a post for the card shapes the client already renders. */
function present(p) {
    const likeCount = (p.likes || []).length +
        Object.values(p.reactions || {}).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
    return {
        id: p._id?.toString(),
        sender: p.sender,
        text: p.text || "",
        imageUrl: p.imageUrl || "",
        avatarColor: p.color || "#3b82f6",
        avatarUrl: p.avatarUrl || "",
        isVerified: false, // filled in by the caller from the user map
        likeCount,
        commentCount: displayCount(p),
        viewCount: p.viewCount || 0,
        repostCount: p.repostCount || 0,
        timeStamp: p.timeStamp,
    };
}

/** Attach isVerified for a set of senders in one query. */
async function markVerified(posts) {
    const names = [...new Set(posts.map((p) => p.sender).filter(Boolean))];
    if (!names.length) return posts;
    const users = await User.find({ username: { $in: names } })
        .select("username isVerified")
        .lean();
    const verified = new Set(users.filter((u) => u.isVerified).map((u) => u.username));
    posts.forEach((p) => { p.isVerified = verified.has(p.sender); });
    return posts;
}

router.get("/", async (req, res) => {
    try {
        const windowKey = WINDOWS[req.query.window] ? req.query.window : "week";
        const since = new Date(Date.now() - WINDOWS[windowKey]);
        const tagLimit = clamp(req.query.tags, 0, 30, 10);
        // 0 is meaningful here: the /explore "Tags" tab only wants the tag list,
        // and asking for one hot post anyway would be wasted work.
        const postLimit = clamp(req.query.posts, 0, 30, 10);

        const hidden = req.query.username
            ? await getHiddenUsers(String(req.query.username))
            : [];

        // ── Trending hashtags ────────────────────────────────────────────────
        // Counted over the window, then ordered by volume. Frequency alone lets
        // one tag monopolise the list, so the client gets a plain count and
        // ranks for variety if it wants to.
        const tagRows = tagLimit > 0
            ? await Post.aggregate([
                { $match: { ...baseMatch(since, hidden), hashtags: { $exists: true, $ne: [] } } },
                { $unwind: "$hashtags" },
                { $group: { _id: "$hashtags", count: { $sum: 1 } } },
                { $sort: { count: -1, _id: 1 } },
                { $limit: tagLimit },
            ])
            : [];

        // ── Hot posts ───────────────────────────────────────────────────────
        // Engagement weighted toward recency: a post with 10 likes an hour ago
        // should outrank 20 likes from last week, so score is divided by age.
        const now = Date.now();
        const hotPosts = postLimit > 0
            ? await Post.aggregate([
                { $match: baseMatch(since, hidden) },
                { $addFields: { ageHours: { $divide: [{ $subtract: [now, "$timeStamp"] }, 3600000] } } },
                { $addFields: { engagement: { $add: [
                    { $size: { $ifNull: ["$likes", []] } },
                    { $ifNull: ["$commentCount", 0] },
                    { $multiply: [{ $ifNull: ["$repostCount", 0] }, 2] },
                    { $divide: [{ $ifNull: ["$viewCount", 0] }, 20] },
                ] } } },
                { $addFields: { heat: { $divide: ["$engagement", { $add: [1, { $sqrt: "$ageHours" }] }] } } },
                { $sort: { heat: -1, timeStamp: -1 } },
                { $limit: postLimit },
            ])
            : [];

        res.json({
            window: windowKey,
            hashtags: tagRows.map((r) => ({ tag: r._id, count: r.count })),
            hotPosts: await markVerified(hotPosts.map(present)),
        });
    } catch (err) {
        console.error("[trending] failed:", err.message);
        res.status(500).json({ error: "Trending unavailable" });
    }
});

// GET /api/trending/top — a flat, ranked list for /explore's "Top" tab.
// Supports cursor pagination because "give me the most interesting posts on
// the platform" is unbounded and must not be served in one query.
router.get("/top", async (req, res) => {
    try {
        const limit = clamp(req.query.limit, 1, 48, 24);
        const before = req.query.before ? new Date(Number(req.query.before)) || new Date(req.query.before) : null;
        const since = new Date(Date.now() - WINDOWS.month);

        const hidden = req.query.username
            ? await getHiddenUsers(String(req.query.username))
            : [];

        const match = baseMatch(since, hidden);
        if (before && !Number.isNaN(before.getTime())) match.timeStamp.lt = before;

        const now = Date.now();
        const rows = await Post.aggregate([
            { $match: match },
            { $addFields: { ageHours: { $divide: [{ $subtract: [now, "$timeStamp"] }, 3600000] } } },
            { $addFields: { engagement: { $add: [
                { $size: { $ifNull: ["$likes", []] } },
                { $ifNull: ["$commentCount", 0] },
                { $multiply: [{ $ifNull: ["$repostCount", 0] }, 2] },
                { $divide: [{ $ifNull: ["$viewCount", 0] }, 20] },
            ] } } },
            { $addFields: { heat: { $divide: ["$engagement", { $add: [1, { $sqrt: "$ageHours" }] }] } } },
            { $sort: { heat: -1, timeStamp: -1 } },
            { $limit: limit + 1 }, // one extra to learn whether there's a next page
        ]);

        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);
        const last = page[page.length - 1];

        res.json({
            posts: await markVerified(page.map(present)),
            hasMore,
            nextCursor: hasMore && last ? new Date(last.timeStamp).getTime() : null,
        });
    } catch (err) {
        console.error("[trending/top] failed:", err.message);
        res.status(500).json({ error: "Top posts unavailable" });
    }
});

module.exports = router;
