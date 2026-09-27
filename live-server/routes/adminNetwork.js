/**
 * Admin API: Social Graph & Community Health.
 *
 * Mounted at /api/admin/network.
 *
 * An anonymous social network has one structural problem that ordinary
 * engagement metrics hide: nobody knows anyone. A feed can post volume all day
 * while the graph is a dust cloud of disconnected pairs, and that is the state
 * where a product is one notification away from dying. These endpoints measure
 * the graph itself.
 *
 * Verified against the User schema: `followers` and `following` are arrays of
 * USERNAMES (not ids), `mutedUsers` and `blockedUsers` likewise, and there is no
 * edge document — the follow is a value on both endpoints with no timestamp.
 *
 * That last point is a hard limit, stated rather than worked around: without a
 * follow timestamp, "followed 200 accounts in 10 minutes" CANNOT be detected.
 * Any endpoint claiming to do so would be inventing data. The spam heuristics
 * here are therefore based on ratio and account age, which are observable.
 */

const express = require("express");

const User = require("../models/user");
const Post = require("../models/post");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

const SCAN_CAP = 20000;

const clamp = (v, min, max, dflt) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, n));
};

const lower = (s) => String(s ?? "").toLowerCase();

/**
 * Load the follow graph.
 *
 * Follows are stored redundantly on BOTH sides (A.following contains B and
 * B.followers contains A), so reciprocity can be measured exactly — but only if
 * the two sides actually agree. A pair where A follows B and B does not follow
 * A back is detected here as an `asymmetric` edge, which is the single most
 * useful integrity signal in the whole file: it means one side failed to update.
 */
async function loadGraph(limit = SCAN_CAP) {
    const users = await User.find({})
        .select("username followers following createdAt suspended")
        .limit(limit)
        .lean();

    const index = new Map();
    for (const u of users) {
        if (u.username) index.set(lower(u.username), u);
    }

    let edges = 0;
    let reciprocal = 0;
    let oneWay = 0;
    let dangling = 0; // following a username that no longer exists

    const degrees = new Map(); // username -> { out, in }
    const bump = (name, field) => {
        if (!degrees.has(name)) degrees.set(name, { out: 0, in: 0 });
        degrees.get(name)[field] += 1;
    };

    for (const u of users) {
        const me = lower(u.username);
        if (!me) continue;
        for (const target of u.following || []) {
            const t = lower(target);
            if (!t || t === me) continue;
            edges += 1;
            const other = index.get(t);
            if (!other) {
                // Resolve the target BEFORE counting degree. Counting the inbound
                // edge first put deleted accounts into the degrees map while they
                // were absent from `users`, so `degrees.size` drifted above the
                // user count and `isolatedPct` was computed over two different
                // denominators.
                dangling += 1;
                continue;
            }
            bump(me, "out");
            bump(t, "in");
            if ((other.following || []).some((f) => lower(f) === me)) reciprocal += 1;
            else oneWay += 1;
        }
    }

    return { users, index, degrees, edges, reciprocal, oneWay, dangling, truncated: users.length > limit };
}

/** GET /overview — headline graph shape. */
router.get("/overview", requireAdmin, async (req, res) => {
    try {
        const g = await loadGraph();
        const total = g.users.length;
        // Degrees are only counted for accounts that exist, so this map and
        // `users` are the same population and the percentage is coherent.
        const withOut = Array.from(g.degrees.values()).filter((d) => d.out > 0).length;
        const withIn = Array.from(g.degrees.values()).filter((d) => d.in > 0).length;
        const isolated = Array.from(g.degrees.entries()).filter(([, d]) => d.out === 0 && d.in === 0).length;
        // An account that neither follows nor is followed never enters the
        // degrees map at all, so it must be counted from `users` directly or the
        // isolated figure silently excludes the most isolated accounts.
        const trulyIsolated = Math.max(0, total - Array.from(g.degrees.values()).filter((d) => d.out > 0 || d.in > 0).length);

        const maxEdges = total * (total - 1);
        const reciprocityPct = g.edges > 0 ? Number(((g.reciprocal / g.edges) * 100).toFixed(1)) : null;

        return res.json({
            users: total,
            edges: g.edges,
            reciprocalEdges: g.reciprocal,
            oneWayEdges: g.oneWay,
            reciprocityPct,
            density: maxEdges > 0 ? Number((g.edges / maxEdges).toFixed(6)) : null,
            danglingFollows: g.dangling,
            danglingPct: g.edges > 0 ? Number(((g.dangling / g.edges) * 100).toFixed(1)) : null,
            accounts: {
                withOutgoing: withOut,
                withIncoming: withIn,
                // An account with both is counted in withOutgoing AND
                // withIncoming. These three are NOT a partition and must not be
                // summed or fed to a chart as slices.
                notAPartition: true,
                isolated: trulyIsolated,
                isolatedPct: total > 0 ? Number(((trulyIsolated / total) * 100).toFixed(1)) : null,
                // The one clean split: connected vs. not.
                connected: total - trulyIsolated,
            },
            truncated: g.truncated,
            scanCap: SCAN_CAP,
            note: "Follows are stored on both endpoints, so reciprocity is measured exactly — and an edge present on one side but not the other is itself an integrity signal. withOutgoing/withIncoming/isolated overlap by design and cannot be added together; use accounts.connected + accounts.isolated for a true partition.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /degrees — distribution of in/out degree, plus the extremes. */
router.get("/degrees", requireAdmin, async (req, res) => {
    try {
        const g = await loadGraph();
        const limit = clamp(req.query.limit, 1, 100, 25);

        const rows = [];
        for (const [username, d] of g.degrees) {
            rows.push({ username, following: d.out, followers: d.in, total: d.out + d.in });
        }
        rows.sort((a, b) => b.total - a.total);

        // Histogram over total degree, so the shape is visible and not just the
        // top of the list.
        const buckets = { "0": 0, "1-2": 0, "3-5": 0, "6-10": 0, "11-25": 0, "26-100": 0, "100+": 0 };
        for (const r of rows) {
            const d = r.total;
            const k = d === 0 ? "0" : d <= 2 ? "1-2" : d <= 5 ? "3-5" : d <= 10 ? "6-10" : d <= 25 ? "11-25" : d <= 100 ? "26-100" : "100+";
            buckets[k] += 1;
        }

        return res.json({
            top: rows.slice(0, limit),
            buckets,
            accounts: rows.length,
            truncated: g.truncated,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/**
 * GET /asymmetric — follows that exist on one side only.
 *
 * This is a data-integrity bug detector, not a user-behaviour report. If A
 * follows B, B should follow A. When that is false the follow write updated one
 * document and not the other, which means the follower's own view and everyone
 * else's disagree.
 */
router.get("/asymmetric", requireAdmin, async (req, res) => {
    try {
        const limit = clamp(req.query.limit, 1, 500, 100);
        const g = await loadGraph();
        const rows = [];

        for (const u of g.users) {
            const me = lower(u.username);
            if (!me) continue;
            for (const target of u.following || []) {
                const t = lower(target);
                if (!t || t === me) continue;
                const other = g.index.get(t);
                if (!other) continue; // dangling, reported separately
                if (!(other.following || []).some((f) => lower(f) === me)) {
                    rows.push({ follower: u.username, followee: other.username || t });
                }
            }
        }

        return res.json({
            rows: rows.slice(0, limit),
            total: rows.length,
            shown: Math.min(limit, rows.length),
            truncated: g.truncated,
            note: "A follow recorded on one account but not returned by the other. Each of these is a write that only half succeeded.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /ratio-outliers — accounts following far more than they are followed.
 *  The observable signature of a follow-spam account. */
router.get("/ratio-outliers", requireAdmin, async (req, res) => {
    try {
        const limit = clamp(req.query.limit, 1, 200, 25);
        const minFollowing = clamp(req.query.minFollowing, 10, 10000, 50);
        const g = await loadGraph();
        const now = Date.now();

        const rows = [];
        for (const [username, d] of g.degrees) {
            if (d.out < minFollowing) continue;
            const ratio = d.in === 0 ? null : d.out / d.in;
            if (ratio !== null && ratio < 5) continue; // follows <= 5x its followers
            const u = g.index.get(username);
            const ageDays = u?.createdAt ? Math.floor((now - new Date(u.createdAt)) / 86400000) : null;
            rows.push({
                username,
                following: d.out,
                followers: d.in,
                ratio: ratio === null ? null : Number(ratio.toFixed(1)),
                ageDays,
                // Following a lot on a brand-new account is the real tell, and
                // unlike a follow-rate burst it is actually observable here.
                newAccount: ageDays !== null && ageDays <= 30,
            });
        }
        rows.sort((a, b) => b.following - a.following);

        return res.json({
            rows: rows.slice(0, limit),
            minFollowing,
            truncated: g.truncated,
            limitation: "Follows carry no timestamp, so follow-VELOCITY (e.g. 200 follows in 10 minutes) cannot be detected. These signals are based on ratio and account age, which are observable.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /ghosts — accounts that are connected to nobody, or connected but mute. */
router.get("/ghosts", requireAdmin, async (req, res) => {
    try {
        const limit = clamp(req.query.limit, 1, 200, 50);
        const g = await loadGraph();

        const candidates = [];
        for (const u of g.users) {
            const me = lower(u.username);
            if (!me) continue;
            const d = g.degrees.get(me) || { out: 0, in: 0 };
            if (d.out > 0 || d.in > 0) continue;
            candidates.push({
                username: u.username,
                createdAt: u.createdAt,
                ageDays: u.createdAt ? Math.floor((Date.now() - new Date(u.createdAt)) / 86400000) : null,
                suspended: !!u.suspended,
            });
        }
        candidates.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

        // One batched post query for the returned page only.
        const names = candidates.slice(0, limit).map((c) => c.username);
        const posts = names.length
            ? await Post.find({ sender: { $in: names } }).select("sender timeStamp").limit(SCAN_CAP).lean()
            : [];
        const postCount = new Map();
        const lastPost = new Map();
        for (const p of posts) {
            postCount.set(p.sender, (postCount.get(p.sender) || 0) + 1);
            const t = new Date(p.timeStamp).getTime();
            if (!lastPost.has(p.sender) || t > lastPost.get(p.sender)) lastPost.set(p.sender, t);
        }

        const rows = candidates.slice(0, limit).map((c) => ({
            ...c,
            posts: postCount.get(c.username) || 0,
            lastPostAt: lastPost.has(c.username) ? new Date(lastPost.get(c.username)) : null,
            kind: (postCount.get(c.username) || 0) === 0 ? "registered-and-left" : "posted-but-unfollowed",
        }));

        return res.json({
            rows,
            totalIsolated: candidates.length,
            truncated: g.truncated,
            note: "Zero following and zero followers. 'registered-and-left' accounts signed up, posted nothing and follow nobody — the clearest sign of a bad first-run experience.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /moderation-edges — block and mute usage. */
router.get("/moderation-edges", requireAdmin, async (req, res) => {
    try {
        const g = await loadGraph();
        let blocked = 0;
        let muted = 0;
        const blockers = [];
        const muters = [];
        const blockedTargets = new Set();

        for (const u of g.users) {
            const b = (u.blockedUsers || []).filter(Boolean);
            const m = (u.mutedUsers || []).filter(Boolean);
            blocked += b.length;
            muted += m.length;
            for (const t of b) blockedTargets.add(lower(t));
            if (b.length) blockers.push({ username: u.username, blocked: b.length });
            if (m.length) muters.push({ username: u.username, muted: m.length });
        }
        blockers.sort((a, b) => b.blocked - a.blocked);
        muters.sort((a, b) => b.muted - a.muted);

        // A block is supposed to be symmetric. Measure how often it is not.
        // The loop only inspects targets that still exist, so the three numbers
        // need not sum to blockedEdges — the difference is blocks pointing at
        // deleted accounts, which is reported rather than folded away.
        let symmetric = 0;
        let oneSided = 0;
        let unclassified = 0;
        for (const [username] of g.degrees) {
            const u = g.index.get(username);
            for (const target of u?.blockedUsers || []) {
                const other = g.index.get(lower(target));
                if (!other) { unclassified += 1; continue; }
                if ((other.blockedUsers || []).some((x) => lower(x) === username)) symmetric += 1;
                else oneSided += 1;
            }
        }
        // If an account never appears in the degrees map (no follows at all) its
        // blocks are not visited by the loop above.
        const visited = new Set();
        for (const [username] of g.degrees) visited.add(username);
        for (const u of g.users) {
            const key = lower(u.username);
            if (visited.has(key) || !(u.blockedUsers || []).length) continue;
            unclassified += (u.blockedUsers || []).filter(Boolean).length;
        }

        return res.json({
            blockedEdges: blocked,
            mutedEdges: muted,
            distinctBlockedAccounts: blockedTargets.size,
            topBlockers: blockers.slice(0, 15),
            topMuters: muters.slice(0, 15),
            symmetry: {
                symmetric,
                oneSided,
                // Blocks of accounts that no longer exist, so symmetric +
                // oneSided + unclassified === blockedEdges.
                unclassified,
                oneSidedPct: symmetric + oneSided > 0
                    ? Number(((oneSided / (symmetric + oneSided)) * 100).toFixed(1))
                    : null,
                denominator: symmetric + oneSided,
            },
            truncated: g.truncated,
            note: "oneSidedPct is over blocks whose target still exists; blocks of deleted accounts are counted as unclassified. A one-sided block is the EXPECTED output here — routes/users.js writes only the blocker's list and never notifies or adds the target — so this measures how often two people block each other, not a defect.",
            hiddenRequests: "Follow REQUESTS to private accounts are stored in User.pendingFollowRequests and create no edge until accepted, so un-accepted requests are invisible to this graph and it can look sparser than the real relationship count.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /reach — per-account reach, which drives moderation priority. */
router.get("/reach", requireAdmin, async (req, res) => {
    try {
        const limit = clamp(req.query.limit, 1, 100, 25);
        const g = await loadGraph();
        const rows = Array.from(g.degrees.entries())
            .map(([username, d]) => ({ username, followers: d.in, following: d.out }))
            .sort((a, b) => b.followers - a.followers)
            .slice(0, limit);

        // Post counts for the returned page, in one query.
        const names = rows.map((r) => r.username);
        const posts = names.length
            ? await Post.find({ sender: { $in: names } }).select("sender").limit(SCAN_CAP).lean()
            : [];
        const counts = new Map();
        for (const p of posts) counts.set(p.sender, (counts.get(p.sender) || 0) + 1);

        return res.json({
            rows: rows.map((r) => ({ ...r, posts: counts.get(r.username) || 0, reachPerPost: counts.get(r.username) ? Number((r.followers / counts.get(r.username)).toFixed(1)) : null })),
            note: "Reach per post = followers / posts. A high number means one post from this account is seen by many people, which is why it matters for moderation priority.",
            truncated: g.truncated,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

module.exports = router;
