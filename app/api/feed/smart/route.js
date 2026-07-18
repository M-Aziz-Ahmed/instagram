import connectDB from "@/utils/db";
import Post from "@/models/post";
import User from "@/models/user";

// Helper: fetch N posts from a query, excluding already-seen IDs
async function fetchBatch(matchStage, limit, excludeIds = []) {
    const pipeline = [];
    if (Object.keys(matchStage).length > 0) {
        pipeline.push({ $match: matchStage });
    }
    if (excludeIds.length > 0) {
        pipeline.push({ $match: { _id: { $nin: excludeIds } } });
    }
    pipeline.push({ $sort: { timeStamp: -1 } });
    pipeline.push({ $limit: limit });
    return Post.aggregate(pipeline).allowDiskUse(true);
}

export async function GET(request) {
    try {
        await connectDB();
        const { searchParams } = new URL(request.url);
        const username = searchParams.get("username");
        const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
        const before = searchParams.get("before");
        const lang = searchParams.get("lang");

        // If not logged in, return chronological feed
        if (!username) {
            const matchStage = { ...getDefaultMatch(before) };
            const posts = await Post.aggregate([
                { $match: matchStage },
                { $sort: { timeStamp: -1 } },
                { $limit: limit },
            ]).allowDiskUse(true);

            return Response.json({
                posts: await enrichPosts(posts),
                hasMore: posts.length === limit,
            });
        }

        // Fetch user data
        const viewer = await User.findOne({ username })
            .select("following mutedWords closeFriends")
            .lean();

        if (!viewer) {
            const posts = await Post.aggregate([
                { $match: getDefaultMatch(before) },
                { $sort: { timeStamp: -1 } },
                { $limit: limit },
            ]).allowDiskUse(true);
            return Response.json({ posts: await enrichPosts(posts), hasMore: posts.length === limit });
        }

        const following = viewer.following || [];
        const timeFilter = before ? { timeStamp: { $lt: new Date(before) } } : {};

        // Muted words filter
        const mutedWords = (viewer.mutedWords || []).map(w => w.toLowerCase());
        const escapedMuted = mutedWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const mutedPattern = escapedMuted.length > 0 ? escapedMuted.join("|") : null;
        const mutedWordCondition = mutedPattern ? {
            $not: {
                $regexMatch: {
                    input: { $toLower: "$text" },
                    regex: mutedPattern,
                },
            },
        } : null;

        // Close friends visibility filter
        const visibilityCondition = {
            $or: [
                { visibility: { $ne: "closeFriends" } },
                { sender: { $in: viewer.closeFriends || [] } },
                { sender: username },
            ],
        };

        // Expiry filter
        const expiryCondition = {
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        };

        const allSeenIds = [];
        const allPosts = [];

        // Pattern: 3 followed, 2 liked, 2 interest, repeat
        const PATTERN = [
            { type: "followed", count: 3 },
            { type: "liked", count: 2 },
            { type: "interest", count: 2 },
        ];

        const batchSize = limit + 20; // Fetch extra to account for dedup
        let fetched = 0;

        // Build batch match stages
        const followedMatch = {
            sender: { $in: following },
            ...timeFilter,
            ...expiryCondition,
        };
        if (mutedWordCondition) followedMatch.$expr = mutedWordCondition;

        // For "liked" posts, find posts the user has liked or reacted to
        const likedMatch = {
            $or: [
                { likes: username },
                { "reactions.like": username },
                { "reactions.love": username },
                { "reactions.fire": username },
            ],
            sender: { $ne: username },
            ...timeFilter,
            ...expiryCondition,
        };
        if (mutedWordCondition) likedMatch.$expr = mutedWordCondition;

        // For "interest" — find hashtags from posts the user liked/followed, then fetch posts with those hashtags
        let interestTags = [];
        if (following.length > 0) {
            const samplePosts = await Post.find({
                $or: [{ sender: { $in: following } }, { likes: username }],
                hashtags: { $exists: true, $ne: [] },
            })
                .select("hashtags")
                .limit(50)
                .lean();
            const tagCounts = {};
            samplePosts.forEach(p => {
                (p.hashtags || []).forEach(t => {
                    tagCounts[t] = (tagCounts[t] || 0) + 1;
                });
            });
            interestTags = Object.entries(tagCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([tag]) => tag);
        }

        const interestMatch = interestTags.length > 0 ? {
            hashtags: { $in: interestTags },
            sender: { $ne: username },
            ...timeFilter,
            ...expiryCondition,
        } : null;
        if (interestMatch && mutedWordCondition) interestMatch.$expr = mutedWordCondition;

        // Fallback: everything else
        const fallbackMatch = {
            sender: { $ne: username },
            ...timeFilter,
            ...expiryCondition,
        };
        if (mutedWordCondition) fallbackMatch.$expr = mutedWordCondition;

        // Generate pattern slots
        const slots = [];
        for (let i = 0; i < Math.ceil(batchSize / 7); i++) {
            PATTERN.forEach(p => slots.push(p));
        }

        // Fetch all posts upfront (capped)
        const [followedPosts, likedPosts, interestPosts, fallbackPosts] = await Promise.all([
            fetchBatch(followedMatch, Math.min(following.length > 0 ? batchSize : 0, 30), []),
            fetchBatch(likedMatch, Math.min(batchSize, 30), []),
            interestMatch ? fetchBatch(interestMatch, Math.min(batchSize, 30), []) : Promise.resolve([]),
            fetchBatch(fallbackMatch, Math.min(batchSize, 30), []),
        ]);

        // Interleave by pattern
        const followedPool = [...followedPosts];
        const likedPool = [...likedPosts];
        const interestPool = [...interestPosts];
        const fallbackPool = [...fallbackPosts];

        const seenIds = new Set();
        const result = [];

        for (const slot of slots) {
            if (result.length >= batchSize) break;

            let pool;
            if (slot.type === "followed") pool = followedPool;
            else if (slot.type === "liked") pool = likedPool;
            else if (slot.type === "interest") pool = interestPool;
            else pool = fallbackPool;

            let added = 0;
            while (added < slot.count && pool.length > 0) {
                const post = pool.shift();
                const idStr = post._id.toString();
                if (!seenIds.has(idStr)) {
                    seenIds.add(idStr);
                    result.push(post);
                    added++;
                }
            }

            // If pool ran out, pull from fallback
            while (added < slot.count && fallbackPool.length > 0) {
                const post = fallbackPool.shift();
                const idStr = post._id.toString();
                if (!seenIds.has(idStr)) {
                    seenIds.add(idStr);
                    result.push(post);
                    added++;
                }
            }
        }

        // Fill remaining from fallback if needed
        while (result.length < batchSize && fallbackPool.length > 0) {
            const post = fallbackPool.shift();
            const idStr = post._id.toString();
            if (!seenIds.has(idStr)) {
                seenIds.add(idStr);
                result.push(post);
            }
        }

        // Sort by timestamp (maintain chronological within pattern)
        result.sort((a, b) => new Date(b.timeStamp) - new Date(a.timeStamp));

        const sliced = result.slice(0, limit);
        const hasMore = result.length > limit || fallbackPool.length > 0 || followedPool.length > 0;

        const enriched = await enrichPosts(sliced);

        return Response.json({ posts: enriched, hasMore });
    } catch (err) {
        console.error("Smart feed error:", err);
        return Response.json({ error: "Failed" }, { status: 500 });
    }
}

function getDefaultMatch(before) {
    const match = {
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    };
    if (before) match.timeStamp = { $lt: new Date(before) };
    return match;
}

async function enrichPosts(posts) {
    if (posts.length === 0) return posts;

    const allUsernames = new Set();
    posts.forEach((p) => {
        allUsernames.add(p.sender);
        (p.comments || []).forEach((c) => allUsernames.add(c.sender));
        if (p._originalPost?.sender) allUsernames.add(p._originalPost.sender);
    });

    const users = await User.find({ username: { $in: [...allUsernames] } })
        .select("username avatarUrl isVerified isAdmin roles")
        .populate("roles", "name badge color")
        .lean();

    const userMap = {};
    users.forEach((u) => {
        userMap[u.username] = {
            avatarUrl: u.avatarUrl || "",
            isVerified: u.isVerified || false,
            isAdmin: u.isAdmin || false,
            roles: (u.roles || []).map((r) => ({
                id: r._id?.toString() ?? "",
                name: r.name ?? "",
                badge: r.badge ?? "",
                color: r.color ?? "",
            })),
        };
    });

    return posts.map((p) => ({
        ...p,
        _author: userMap[p.sender] || null,
        _originalPost: p._originalPost ? {
            ...p._originalPost,
            _author: userMap[p._originalPost.sender] || null,
        } : null,
        comments: (p.comments || []).map((c) => ({
            ...c,
            _author: userMap[c.sender] || null,
        })),
    }));
}
