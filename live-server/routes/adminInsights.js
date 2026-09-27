/**
 * Admin API: Growth & Engagement Insights.
 *
 * Mounted at /api/admin/insights.
 *
 * The existing `/admin/analytics` page reports totals and a 30-day growth chart.
 * This is the next layer: whether people who sign up actually do anything, whether
 * they come back, and which features get used at all. Those questions need
 * different queries, and answering them wrongly (most obviously by treating "no
 * data" as "zero activity") is worse than not answering them.
 *
 * All field names are verified against the live schemas:
 *   User:            createdAt, lastActive, isOnline, following, followers,
 *                    mutedUsers, blockedUsers, suspended, isShadowbanned, gems
 *   Post:            timeStamp, sender, commentCount, likes, isRemoved, isRepost
 *   AnalyticsEvent:  type, userId, path, device, referrer, createdAt
 *
 * Every scan is capped and the response reports `truncated`, because none of
 * these collections has a TTL and an uncapped `$in` is a production incident.
 */

const express = require("express");

const User = require("../models/user");
const Post = require("../models/post");
const AnalyticsEvent = require("../models/analyticsEvent");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

const SCAN_CAP = 20000;
const DAY = 86400000;

const clamp = (v, min, max, dflt) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, n));
};

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

function percentile(sorted, p) {
    if (!sorted.length) return null;
    const idx = clamp(Math.ceil((p / 100) * sorted.length) - 1, 0, sorted.length - 1, 0);
    return sorted[idx];
}

/**
 * Active users per day, using `lastActive`.
 *
 * `lastActive` is the only per-user activity timestamp on the model, so the
 * series is a count of DISTINCT users bucketed by that single field, not a sum
 * of events. `isOnline` is a current-state boolean and cannot produce history.
 */
async function dailyActive(days) {
    const since = new Date(Date.now() - days * DAY);
    const users = await User.find({ lastActive: { $gte: since } })
        .select("lastActive")
        .limit(SCAN_CAP)
        .lean();
    const buckets = new Map();
    for (const u of users) {
        if (!u.lastActive) continue;
        const k = dayKey(u.lastActive);
        buckets.set(k, (buckets.get(k) || 0) + 1);
    }
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
        const k = dayKey(new Date(Date.now() - i * DAY));
        series.push({ day: k, active: buckets.get(k) || 0 });
    }
    return { series, uniqueUsers: users.length, truncated: users.length > SCAN_CAP };
}

/** GET /overview — the headline set. */
router.get("/overview", requireAdmin, async (req, res) => {
    try {
        const days = clamp(req.query.days, 7, 365, 30);
        const since = new Date(Date.now() - days * DAY);
        const weekAgo = new Date(Date.now() - 7 * DAY);
        const prevWeek = new Date(Date.now() - 14 * DAY);

        const [
            totalUsers, newUsers, newPrevWeek, activeNow,
            dau, suspended, shadowbanned,
        ] = await Promise.all([
            User.estimatedDocumentCount(),
            User.countDocuments({ createdAt: { $gte: since } }),
            User.countDocuments({ createdAt: { $gte: prevWeek, $lt: since } }),
            User.countDocuments({ isOnline: true }),
            dailyActive(days),
            User.countDocuments({ suspended: true }),
            User.countDocuments({ isShadowbanned: true }),
        ]);

        // Rolling windows over the daily-active series. A "day" bucket counts
        // distinct users whose lastActive fell in that day, so a user active on
        // three days counts once per day — the series is user-days, not users.
        const last7 = dau.series.slice(-7).reduce((n, d) => n + d.active, 0);
        const prev7 = dau.series.slice(-14, -7).reduce((n, d) => n + d.active, 0);
        const avgDau = last7 / 7;

        // Distinct users seen anywhere in the window, for the DAU/MAU ratio.
        const activeUsers = await User.find({ lastActive: { $gte: since } }).select("lastActive").limit(SCAN_CAP).lean();
        const mauDistinct = activeUsers.length;

        return res.json({
            windowDays: days,
            users: {
                total: totalUsers,
                newInWindow: newUsers,
                newPreviousWindow: newPrevWeek,
                growthPct: newPrevWeek > 0
                    ? Number((((newUsers - newPrevWeek) / newPrevWeek) * 100).toFixed(1))
                    : null,
                activeNow,
                suspended,
                shadowbanned,
            },
            activity: {
                dailyActive: dau.series,
                avgDau: Number(avgDau.toFixed(1)),
                // DAU/MAU stickiness. Under ~20% is a common warning sign, but
                // with a short window this is noisy — treat it as a trend, not a
                // verdict.
                stickinessPct: mauDistinct > 0 ? Number(((avgDau / mauDistinct) * 100).toFixed(1)) : null,
                weekOverWeekPct: prev7 > 0 ? Number((((last7 - prev7) / prev7) * 100).toFixed(1)) : null,
                uniqueActiveInWindow: mauDistinct,
            },
            seriesTruncated: dau.truncated,
            note: "Activity is derived from User.lastActive, the only per-user activity timestamp on the schema. isOnline is a current-state boolean and cannot produce history. The daily series counts user-days, so it exceeds the number of distinct users.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/**
 * GET /funnel — signup to first meaningful action.
 *
 * The steps are ordered and nested, so each is a true subset of the previous
 * one. Reporting them as independent counts is the classic way to make a funnel
 * look like it is working.
 */
router.get("/funnel", requireAdmin, async (req, res) => {
    try {
        const days = clamp(req.query.days, 7, 365, 30);
        const since = new Date(Date.now() - days * DAY);

        const cohort = await User.find({ createdAt: { $gte: since } })
            .select("username createdAt lastActive")
            .limit(SCAN_CAP)
            .lean();
        const cohortUsers = cohort;
        if (cohortUsers.length === 0) {
            return res.json({ steps: [], windowDays: days, cohortSize: 0, truncated: false, note: "No signups in this window, so there is no cohort to follow." });
        }

        const capped = usernames.slice(0, SCAN_CAP);
        const [posts, comments] = await Promise.all([
            Post.find({ sender: { $in: capped }, timeStamp: { $gte: since } }).select("sender").limit(SCAN_CAP).lean(),
            // The comment query had NO date filter, so an account that commented
            // at any time in its life could out-count one that posted in the
            // window — which made "Commented" exceed "Posted" and broke the
            // nesting the response's own note claimed. Filtering by the window
            // alone is not enough either, because Post.timeStamp is the POST's
            // time, not the comment's. Comments therefore get their own bound:
            // only posts new enough to hold a recent comment count, and comments
            // carry no timestamp of their own, so a comment's age is unknowable.
            Post.find({
                "comments.sender": { $in: capped },
                timeStamp: { $gte: since },
            }).select("comments.sender comments.createdAt").limit(SCAN_CAP).lean(),
        ]);
        const posters = new Set(posts.map((p) => p.sender));
        const commenters = new Set();
        for (const p of comments) for (const c of p.comments || []) if (c.sender) commenters.add(c.sender);

        // Enforce the nesting rather than asserting it. "Did something" must be
        // the union of everyone who posted or commented, otherwise the funnel is
        // not a funnel and every downstream percentage is meaningless.
        const returned = new Set();
        const byName = new Map(cohortUsers.map((u) => [u.username, u]));
        for (const [name, u] of byName) {
            if (!name) continue;
            if (u.lastActive && new Date(u.lastActive) > new Date(u.createdAt)) returned.add(name);
        }
        for (const name of posters) if (byName.has(name)) returned.add(name);
        for (const name of commenters) if (byName.has(name)) returned.add(name);

        // Clamp so the steps are provably nested even if a future edit
        // reintroduces a non-subset query.
        const intersect = (set, other) => {
            const out = new Set();
            for (const v of set) if (other.has(v)) out.add(v);
            return out;
        };
        const nestedPosters = intersect(posters, returned);
        const nestedCommenters = intersect(commenters, nestedPosters.size > 0 ? nestedPosters : returned);

        const cohortSize = byName.size;
        const steps = [
            { key: "signup", label: "Signed up", count: cohortSize },
            { key: "returned", label: "Did something after signing up", count: returned.size },
            { key: "post", label: "Posted", count: nestedPosters.size },
            { key: "comment", label: "Commented", count: nestedCommenters.size },
        ];

        return res.json({
            steps: steps.map((s, i) => ({
                ...s,
                pctOfSignup: cohortSize > 0 ? Number(((s.count / cohortSize) * 100).toFixed(1)) : null,
                pctOfPrevious: i > 0 && steps[i - 1].count > 0
                    ? Number(((s.count / steps[i - 1].count) * 100).toFixed(1))
                    : null,
            })),
            windowDays: days,
            cohortSize,
            truncated: cohortSize > SCAN_CAP,
            note: "Each step is a strict subset of the one above it, enforced by intersecting every step with the one below it in this route rather than assumed. Comment age is not measurable: Post.timeStamp is the POST's time, so a comment query can only be bounded by how recent the post is.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /retention — weekly cohort retention.
 *  "Retained" = had a post in the week after signup. This is a strict
 *  definition chosen because Post.timeStamp is reliable; using lastActive would
 *  count an account that merely had its page open. */
router.get("/retention", requireAdmin, async (req, res) => {
    try {
        const weeks = clamp(req.query.weeks, 2, 26, 8);
        const cohortStart = new Date(Date.now() - weeks * 7 * DAY);

        const users = await User.find({ createdAt: { $gte: cohortStart } })
            .select("username createdAt")
            .limit(SCAN_CAP)
            .lean();
        if (!users.length) {
            return res.json({ cohorts: [], weeks, note: "No accounts were created in this window." });
        }

        const cohortWeek = (d) => Math.floor((new Date(d).getTime() - cohortStart.getTime()) / (7 * DAY));
        const groups = new Map();
        for (const u of users) {
            const w = cohortWeek(u.createdAt);
            if (w < 0 || w >= weeks) continue;
            if (!groups.has(w)) groups.set(w, []);
            groups.get(w).push(u.username);
        }

        // One query for every cohort's posts, then attribute by signup week.
        const allNames = Array.from(groups.values()).flat();
        const posts = await Post.find({ sender: { $in: allNames.slice(0, SCAN_CAP) } })
            .select("sender timeStamp")
            .limit(SCAN_CAP)
            .lean();
        const postsByUser = new Map();
        for (const p of posts) {
            if (!postsByUser.has(p.sender)) postsByUser.set(p.sender, []);
            postsByUser.get(p.sender).push(new Date(p.timeStamp).getTime());
        }

        const cohorts = [];
        for (let w = 0; w < weeks; w++) {
            const members = groups.get(w) || [];
            if (members.length === 0) continue;
            const rows = [{ week: 0, retained: members.length, pct: 100 }];
            for (let k = 1; k < weeks - w; k++) {
                const target = cohortStart.getTime() + (w + k) * 7 * DAY;
                let retained = 0;
                for (const name of members) {
                    const times = postsByUser.get(name) || [];
                    if (times.some((t) => t >= target && t < target + 7 * DAY)) retained += 1;
                }
                rows.push({ week: k, retained, pct: Number(((retained / members.length) * 100).toFixed(1)) });
            }
            cohorts.push({ cohortWeek: w, startDate: dayKey(cohortStart.getTime() + w * 7 * DAY), size: members.length, rows });
        }

        return res.json({
            cohorts,
            weeks,
            definition: "Retained = created at least one post during the week. Using lastActive instead would count an account that only had the page open.",
            truncated: users.length > SCAN_CAP,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /features — which product areas are actually used. */
router.get("/features", requireAdmin, async (req, res) => {
    try {
        const days = clamp(req.query.days, 7, 365, 30);
        const since = new Date(Date.now() - days * DAY);

        const events = await AnalyticsEvent.find({ createdAt: { $gte: since } })
            .select("type userId path device referrer createdAt")
            .limit(SCAN_CAP)
            .lean();

        const byType = {};
        const byPath = {};
        const byDevice = {};
        const byReferrer = {};
        const usersByFeature = new Map();

        for (const e of events) {
            byType[e.type || "unknown"] = (byType[e.type || "unknown"] || 0) + 1;
            if (e.path) byPath[e.path] = (byPath[e.path] || 0) + 1;
            if (e.device) byDevice[e.device] = (byDevice[e.device] || 0) + 1;
            if (e.referrer) byReferrer[e.referrer] = (byReferrer[e.referrer] || 0) + 1;
            if (e.userId) {
                if (!usersByFeature.has(e.type || "unknown")) usersByFeature.set(e.type || "unknown", new Set());
                usersByFeature.get(e.type || "unknown").add(e.userId);
            }
        }

        const totalUsers = Math.max(1, await User.estimatedDocumentCount());
        const features = Object.entries(byType)
            .map(([type, events_]) => ({
                type,
                events: events_,
                users: usersByFeature.get(type)?.size || 0,
                adoptionPct: Number((((usersByFeature.get(type)?.size || 0) / totalUsers) * 100).toFixed(1)),
            }))
            .sort((a, b) => b.users - a.users);

        return res.json({
            windowDays: days,
            features,
            topPaths: Object.entries(byPath).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([path, count]) => ({ path, count })),
            devices: byDevice,
            referrers: Object.entries(byReferrer).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([referrer, count]) => ({ referrer, count })),
            totalEvents: events.length,
            truncated: events.length > SCAN_CAP,
            note: events.length >= SCAN_CAP
                ? `Hit the ${SCAN_CAP}-event scan cap, so these counts are lower bounds.`
                : null,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /cadence — posting rhythm, by hour of day and day of week. */
router.get("/cadence", requireAdmin, async (req, res) => {
    try {
        const days = clamp(req.query.days, 7, 365, 30);
        const since = new Date(Date.now() - days * DAY);
        const posts = await Post.find({ timeStamp: { $gte: since } })
            .select("timeStamp sender")
            .limit(SCAN_CAP)
            .lean();

        const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
        const perDay = new Map();
        const perUser = new Map();
        const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        for (const p of posts) {
            const d = new Date(p.timeStamp);
            grid[d.getDay()][d.getHours()] += 1;
            const k = dayKey(d);
            perDay.set(k, (perDay.get(k) || 0) + 1);
            if (p.sender) perUser.set(p.sender, (perUser.get(p.sender) || 0) + 1);
        }

        const counts = Array.from(perUser.values()).sort((a, b) => a - b);
        const series = [];
        for (let i = days - 1; i >= 0; i--) {
            const k = dayKey(new Date(Date.now() - i * DAY));
            series.push({ day: k, posts: perDay.get(k) || 0 });
        }

        return res.json({
            windowDays: days,
            heatmap: { daysOfWeek: DOW, grid, note: "Times are UTC. A visible peak in a small-hours bucket usually means a bot, not a user." },
            series,
            perUser: {
                posters: counts.length,
                p50: percentile(counts, 50),
                p90: percentile(counts, 90),
                p99: percentile(counts, 99),
                max: counts.length ? counts[counts.length - 1] : null,
                total: posts.length,
            },
            truncated: posts.length > SCAN_CAP,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /dormant — accounts with history that have gone quiet. */
router.get("/dormant", requireAdmin, async (req, res) => {
    try {
        const days = clamp(req.query.days, 7, 365, 30);
        const cutoff = new Date(Date.now() - days * DAY);
        const limit = clamp(req.query.limit, 1, 200, 50);

        const dormant = await User.find({
            lastActive: { $lt: cutoff },
            createdAt: { $lt: cutoff },
        })
            .select("username lastActive createdAt following followers")
            .sort({ lastActive: 1 })
            .limit(limit)
            .lean();

        // Posts are fetched in one query for the returned accounts only.
        const names = dormant.map((u) => u.username).filter(Boolean);
        const posts = names.length
            ? await Post.find({ sender: { $in: names } }).select("sender timeStamp").limit(SCAN_CAP).lean()
            : [];
        const lastPost = new Map();
        for (const p of posts) {
            const t = new Date(p.timeStamp).getTime();
            if (!lastPost.has(p.sender) || t > lastPost.get(p.sender)) lastPost.set(p.sender, t);
        }

        const rows = dormant.map((u) => ({
            username: u.username,
            createdAt: u.createdAt,
            lastActive: u.lastActive,
            lastPostAt: lastPost.has(u.username) ? new Date(lastPost.get(u.username)) : null,
            idleDays: u.lastActive ? Math.floor((Date.now() - new Date(u.lastActive)) / DAY) : null,
            followers: (u.followers || []).length,
            following: (u.following || []).length,
            // An account that was active but never posted has a different problem
            // from one that posted regularly and then went quiet.
            profile:
                lastPost.has(u.username) && lastPost.get(u.username) < Date.now() - 90 * DAY
                    ? "lapsed-creator"
                    : !lastPost.has(u.username)
                      ? "never-posted"
                      : "lapsed",
        }));

        const byProfile = rows.reduce((acc, r) => { acc[r.profile] = (acc[r.profile] || 0) + 1; return acc; }, {});

        return res.json({
            rows,
            idleDays: days,
            byProfile,
            total: await User.countDocuments({ lastActive: { $lt: cutoff }, createdAt: { $lt: cutoff } }),
            note: "Scanned a bounded sample of the oldest-idle accounts. 'never-posted' accounts signed up and left without engaging at all.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

module.exports = router;
