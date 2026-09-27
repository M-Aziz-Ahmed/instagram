const express = require("express");
const Post = require("../models/post");
const User = require("../models/user");
const Notification = require("../models/notification");
const ContentFilter = require("../models/contentFilter");
const { verifyToken, optionalAuth, requirePermission } = require("../middleware/auth");
const { getHiddenUsers, applySenderExclusion, filterComments } = require("../lib/visibility");
const { isProUserDoc } = require("../lib/economy");
const { requireFeature } = require("../lib/featureFlags");
const { extractVideoLinks } = require("../lib/videoLinks");
const { canUploadVideo } = require("../lib/videoUpload");
const { trimComments, removeComment, displayCount } = require("../lib/postComments");
// Bundles the in-app Notification document and the OS push into one call, so a
// new notification type cannot be added to one channel and forgotten in the
// other. See lib/notify.js.
const { notify } = require("../lib/notify");
const { logServer } = require("../logService");

const router = express.Router();

// Upper bound for a single video post. Long enough for a Reel, short enough that
// a single post cannot be used as free video hosting.
const MAX_VIDEO_SECONDS = 180;

// Content-type filters for GET /api/posts. "all" is the absence of a filter, so
// it is not a member: the client simply omits the param for it.
const FEED_FILTERS = new Set(["media", "video", "links", "polls", "text"]);

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function extractHashtags(text) {
    if (!text) return [];
    const matches = text.match(/#(\w+)/g);
    return matches ? [...new Set(matches.map((h) => h.slice(1).toLowerCase()))] : [];
}

function extractMentions(text, sender) {
    if (!text) return [];
    const matches = text.match(/@(\w+)/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))].filter((u) => u !== sender);
}

async function checkNudity(text) {
    try {
        const filter = await ContentFilter.findOne({}).lean();
        if (!filter || !filter.blockNudity) return false;
        const lower = (text || "").toLowerCase();
        return (filter.nudityKeywords || []).some((kw) => lower.includes(kw.toLowerCase()));
    } catch {
        return false;
    }
}

const DEFAULT_USER_PERMISSIONS = [
    "create_post", "delete_own_post", "create_comment", "delete_own_comment",
    "react", "bookmark", "repost",
];

async function getUserPermissions(userId) {
    try {
        const user = await User.findById(userId).select("isAdmin roles").populate("roles", "permissions").lean();
        if (!user) {
            console.log(`[getUserPermissions] User not found: ${userId}`);
            return { isAdmin: false, permissions: [] };
        }
        if (user.isAdmin) return { isAdmin: true, permissions: [] };
        const roles = user.roles || [];
        if (roles.length === 0) {
            console.log(`[getUserPermissions] userId=${userId} no roles, using default permissions`);
            return { isAdmin: false, permissions: DEFAULT_USER_PERMISSIONS };
        }
        const perms = roles.flatMap((r) => r.permissions || []);
        const uniquePerms = [...new Set(perms)];
        console.log(`[getUserPermissions] userId=${userId} roles=${JSON.stringify(roles.map((r) => ({ id: r._id?.toString(), name: r.name, permissions: r.permissions })))} resolvedPerms=${JSON.stringify(uniquePerms)}`);
        return { isAdmin: false, permissions: uniquePerms };
    } catch (e) {
        console.error("[getUserPermissions] Error:", e.message, e.stack);
        return { isAdmin: false, permissions: [] };
    }
}

const ACHIEVEMENTS = [
    { id: "first_post",     name: "First Post",     icon: "ÃƒÂ°Ã…Â¸Ã…Â½Ã¢â‚¬Â°", description: "Created your first post",           check: async (userId) => (await Post.countDocuments({ sender: (await User.findById(userId).select("username").lean())?.username, isRemoved: { $ne: true } })) >= 1 },
    { id: "posts_10",       name: "Active Voice",    icon: "ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ…Â ", description: "Created 10 posts",                  check: async (userId) => (await Post.countDocuments({ sender: (await User.findById(userId).select("username").lean())?.username, isRemoved: { $ne: true } })) >= 10 },
    { id: "posts_50",       name: "Power Poster",   icon: "ÃƒÂ°Ã…Â¸Ã¢â‚¬â„¢Ã‚Âª", description: "Created 50 posts",                  check: async (userId) => (await Post.countDocuments({ sender: (await User.findById(userId).select("username").lean())?.username, isRemoved: { $ne: true } })) >= 50 },
    { id: "posts_100",      name: "Century Club",   icon: "ÃƒÂ°Ã…Â¸Ã¢â‚¬â„¢Ã‚Â¯", description: "Created 100 posts",                 check: async (userId) => (await Post.countDocuments({ sender: (await User.findById(userId).select("username").lean())?.username, isRemoved: { $ne: true } })) >= 100 },
    { id: "streak_3",       name: "On Fire",         icon: "ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â¥", description: "3-day posting streak",              check: async (userId) => { const u = await User.findById(userId).select("postingStreak").lean(); return (u?.postingStreak || 0) >= 3; } },
    { id: "streak_7",       name: "Week Warrior",   icon: "ÃƒÂ¢Ã…Â¡Ã¢â‚¬ÂÃƒÂ¯Ã‚Â¸Ã‚Â", description: "7-day posting streak",              check: async (userId) => { const u = await User.findById(userId).select("postingStreak").lean(); return (u?.postingStreak || 0) >= 7; } },
    { id: "streak_30",      name: "Unstoppable",    icon: "ÃƒÂ°Ã…Â¸Ã‚ÂÃ¢â‚¬Â ", description: "30-day posting streak",             check: async (userId) => { const u = await User.findById(userId).select("postingStreak").lean(); return (u?.postingStreak || 0) >= 30; } },
    { id: "liked_10",       name: "Crowd Pleaser",  icon: "ÃƒÂ¢Ã‚ÂÃ‚Â¤ÃƒÂ¯Ã‚Â¸Ã‚Â", description: "Received 10 likes total",           check: async (userId) => { const username = (await User.findById(userId).select("username").lean())?.username; const result = await Post.aggregate([{ $match: { sender: username, isRemoved: { $ne: true } } }, { $project: { count: { $size: "$likes" } } }, { $group: { _id: null, total: { $sum: "$count" } } }]); return (result[0]?.total || 0) >= 10; } },
    { id: "liked_100",      name: "Fan Favorite",   icon: "ÃƒÂ°Ã…Â¸Ã‹Å“Ã‚Â", description: "Received 100 likes total",          check: async (userId) => { const username = (await User.findById(userId).select("username").lean())?.username; const result = await Post.aggregate([{ $match: { sender: username, isRemoved: { $ne: true } } }, { $project: { count: { $size: "$likes" } } }, { $group: { _id: null, total: { $sum: "$count" } } }]); return (result[0]?.total || 0) >= 100; } },
    { id: "comment_10",     name: "Conversationalist", icon: "ÃƒÂ°Ã…Â¸Ã¢â‚¬â„¢Ã‚Â¬", description: "Left 10 comments",              check: async (userId) => { const username = (await User.findById(userId).select("username").lean())?.username; const result = await Post.aggregate([{ $match: { isRemoved: { $ne: true } } }, { $unwind: "$comments" }, { $match: { "comments.sender": username } }, { $count: "total" }]); return (result[0]?.total || 0) >= 10; } },
    { id: "views_1000",     name: "Influencer",      icon: "ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ‚ÂÃƒÂ¯Ã‚Â¸Ã‚Â", description: "Posts received 1,000 views",       check: async (userId) => { const username = (await User.findById(userId).select("username").lean())?.username; const result = await Post.aggregate([{ $match: { sender: username, isRemoved: { $ne: true } } }, { $group: { _id: null, total: { $sum: "$viewCount" } } }]); return (result[0]?.total || 0) >= 1000; } },
    { id: "views_10000",    name: "Viral",           icon: "ÃƒÂ°Ã…Â¸Ã…â€™Ã…Â¸", description: "Posts received 10,000 views",      check: async (userId) => { const username = (await User.findById(userId).select("username").lean())?.username; const result = await Post.aggregate([{ $match: { sender: username, isRemoved: { $ne: true } } }, { $group: { _id: null, total: { $sum: "$viewCount" } } }]); return (result[0]?.total || 0) >= 10000; } },
    { id: "bookmarked_10",  name: "Saved",           icon: "ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬â€œ", description: "Your posts were bookmarked 10 times", check: async (userId) => { const username = (await User.findById(userId).select("username").lean())?.username; const result = await Post.aggregate([{ $match: { sender: username, isRemoved: { $ne: true } } }, { $project: { count: { $size: "$likes" } } }, { $group: { _id: null, total: { $sum: "$count" } } }]); return false; } },
    { id: "repost_5",       name: "Amplifier",       icon: "ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Å¾", description: "Posts were reposted 5 times",       check: async (userId) => { const username = (await User.findById(userId).select("username").lean())?.username; const count = await Post.countDocuments({ originalSender: username, isRemoved: { $ne: true } }); return count >= 5; } },
];

async function updateStreak(userId) {
    try {
        const today = new Date().toISOString().split("T")[0];
        const user = await User.findById(userId).select("postingStreak lastPostDate longestStreak").lean();
        if (!user) return;

        if (user.lastPostDate === today) return;

        const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
        let newStreak = 1;
        if (user.lastPostDate === yesterday) {
            newStreak = (user.postingStreak || 0) + 1;
        }
        const newLongest = Math.max(newStreak, user.longestStreak || 0);
        await User.findByIdAndUpdate(userId, { postingStreak: newStreak, lastPostDate: today, longestStreak: newLongest });
    } catch (e) {
        console.error("[updateStreak] Error:", e.message);
    }
}

async function checkAchievements(userId, username) {
    try {
        const user = await User.findById(userId).select("achievements").lean();
        if (!user) return;
        const owned = new Set(user.achievements || []);
        const newAchievements = [];

        for (const ach of ACHIEVEMENTS) {
            if (owned.has(ach.id)) continue;
            try {
                if (await ach.check(userId)) {
                    newAchievements.push(ach.id);
                    owned.add(ach.id);
                }
            } catch {}
        }

        if (newAchievements.length > 0) {
            await User.findByIdAndUpdate(userId, { $addToSet: { achievements: { $each: newAchievements } } });
        }
    } catch (e) {
        console.error("[checkAchievements] Error:", e.message);
    }
}

async function enrichPosts(posts) {
    const allUsernames = new Set();
    const originalPostIds = [];
    const communityIds = new Set();

    posts.forEach((p) => {
        allUsernames.add(p.sender);
        (p.comments || []).forEach((c) => allUsernames.add(c.sender));
        if (p.originalPostId) originalPostIds.push(p.originalPostId);
        if (p.communityId) communityIds.add(p.communityId.toString());
    });

    // Fetch original posts in batch if any
    let originalPostMap = {};
    if (originalPostIds.length > 0) {
        const originalPosts = await Post.find({ _id: { $in: originalPostIds } })
            .select("sender text imageUrl imageUrls audioUrl videoUrl videoDuration videoWidth videoHeight linkPreview color avatarUrl hashtags mentions visibility theme timeStamp likes reactions comments isRepost originalPostId originalSender repostComment repostCount")
            .lean();
        originalPosts.forEach((op) => { originalPostMap[op._id.toString()] = op; });
        // Collect usernames from original posts too
        originalPosts.forEach((op) => {
            allUsernames.add(op.sender);
            (op.comments || []).forEach((c) => allUsernames.add(c.sender));
        });
    }

    if (allUsernames.size === 0 && communityIds.size === 0) return posts;

    const [users, communities] = await Promise.all([
        allUsernames.size > 0
            ? User.find({ username: { $in: [...allUsernames] } })
                .select("username avatarUrl isVerified isAdmin roles postingStreak achievements proUntil")
                .populate("roles", "name badge color")
                .lean()
            : [],
        communityIds.size > 0
            ? require("../models/community").find({ _id: { $in: [...communityIds] } })
                .select("name color avatarUrl")
                .lean()
            : [],
    ]);

    const userMap = {};
    users.forEach((u) => {
        userMap[u.username] = {
            avatarUrl:  u.avatarUrl || "",
            isVerified: u.isVerified || false,
            isAdmin:    u.isAdmin || false,
            isPro:      isProUserDoc(u),
            postingStreak: u.postingStreak || 0,
            achievements: u.achievements || [],
            roles:      (u.roles || []).map((r) => ({
                id:    r._id?.toString() ?? "",
                name:  r.name  ?? "",
                badge: r.badge ?? "",
                color: r.color ?? "",
            })),
        };
    });

    const communityMap = {};
    communities.forEach((c) => {
        communityMap[c._id.toString()] = { name: c.name, color: c.color, avatarUrl: c.avatarUrl };
    });

    return posts.map((p) => {
        const originalPost = p.originalPostId ? originalPostMap[p.originalPostId.toString()] : null;
        return {
            ...p,
            _author: userMap[p.sender] || null,
            _community: p.communityId ? communityMap[p.communityId.toString()] || null : null,
            _originalPost: originalPost ? {
                ...originalPost,
                _author: userMap[originalPost.sender] || null,
            } : null,
            comments: (p.comments || []).map((c) => ({
                ...c,
                _author: userMap[c.sender] || null,
            })),
        };
    });
}

async function enrichPost(post) {
    const allUsernames = new Set();
    allUsernames.add(post.sender);
    (post.comments || []).forEach((c) => allUsernames.add(c.sender));

    const [users, community] = await Promise.all([
        User.find({ username: { $in: [...allUsernames] } })
            .select("username avatarUrl isVerified isAdmin roles postingStreak achievements proUntil")
            .populate("roles", "name badge color")
            .lean(),
        post.communityId
            ? require("../models/community").findById(post.communityId).select("name color avatarUrl").lean()
            : null,
    ]);

    const userMap = {};
    users.forEach((u) => {
        userMap[u.username] = {
            avatarUrl:  u.avatarUrl || "",
            isVerified: u.isVerified || false,
            isAdmin:    u.isAdmin || false,
            isPro:      isProUserDoc(u),
            postingStreak: u.postingStreak || 0,
            achievements: u.achievements || [],
            roles:      (u.roles || []).map((r) => ({
                id:    r._id?.toString() ?? "",
                name:  r.name  ?? "",
                badge: r.badge ?? "",
                color: r.color ?? "",
            })),
        };
    });

    const obj = post.toObject ? post.toObject() : { ...post };
    obj._author = userMap[post.sender] || null;
    obj._community = community ? { name: community.name, color: community.color, avatarUrl: community.avatarUrl } : null;
    obj.comments = (obj.comments || []).map((c) => ({
        ...c,
        _author: userMap[c.sender] || null,
    }));
    return obj;
}

// GET /
router.get("/", async (req, res) => {
    try {
        const { tag, feed, username, lang, before, communityId, filter } = req.query;
        const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);

        let query = {};

        let viewerIsAdmin = false;
        let viewerFollowing = [];
        let viewerCloseFriends = [];
        let hiddenUsers = [];

        if (username) {
            const viewerDoc = await User.findOne({ username }).select("isAdmin following closeFriends blockedUsers mutedUsers").lean();
            viewerIsAdmin = !!viewerDoc?.isAdmin;
            viewerFollowing = viewerDoc?.following || [];
            viewerCloseFriends = viewerDoc?.closeFriends || [];
            // getHiddenUsers is async ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â without await this was a Promise, which
            // made applySenderExclusion's `for (const name of hidden)` throw and
            // took the whole feed down with a 500.
            hiddenUsers = await getHiddenUsers(username, viewerDoc);
        }

        // Expiry filter (always applied)
        query.$and = query.$and || [];
        query.$and.push({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });

        // A post scheduled for the future is not published yet, so it must never
        // appear in a feed.
        //
        // It used to, and the field was explicitly *projected* below, which is
        // what made the leak visible: a scheduled post carried
        // timeStamp = creation time, so it sorted to the top of the feed at full
        // recency score and was fully interactive, hours or days before its
        // publish time. publishScheduledPosts() flips isScheduled to false when
        // the moment arrives, which is the only thing that should make it
        // visible. trending.js and social.js already filtered on this; the feed,
        // the profile timeline and the bookmarks list did not.
        query.isScheduled = { $ne: true };

        if (!viewerIsAdmin) {
            query.isRemoved = { $ne: true };
        }

        if (tag) query.hashtags = tag.toLowerCase();
        if (before) query.timeStamp = { $lt: new Date(before) };

        if (feed === "following" && username) {
            if (!viewerFollowing.length) {
                return res.json({ posts: [], hasMore: false });
            }
            query.sender = { $in: viewerFollowing };
        }

        // Reels is the same query with a video filter applied, rather than a
        // separate endpoint, so block/mute exclusion, expiry, community scope
        // and pagination stay in exactly one place.
        //
        // "Video" means either a file uploaded to Cloudinary *or* a recognised
        // link to a clip on YouTube/Facebook/Instagram/TikTok/Reddit. Both are
        // backed by a partial index, so this stays an index scan rather than a
        // collection scan. Without the second clause a user without the
        // upload_video permission could not appear in reels at all, which
        // would make the link path pointless.
        if (feed === "reels") {
            query.$and.push({
                $or: [
                    { videoUrl: { $type: "string", $ne: "" } },
                    { "linkPreview.videoId": { $type: "string", $ne: "" } },
                ],
            });
        }

        // Content-type filter, applied client-side-by-chip. The feed had no way to
        // say "only show me video" or "only polls", so a user following several
        // media-heavy accounts had to scroll past everything to find the one
        // post they cared about.
        //
        // An unrecognised value is ignored rather than rejected: the chips are
        // the only producer, and a stale client sending an old value should get
        // the normal feed instead of an error.
        //
        // "video" deliberately includes a linked clip, because that is how video
        // appears on the feed for anyone without the upload_video permission —
        // the two are visually identical to a reader.
        if (FEED_FILTERS.has(filter)) {
            switch (filter) {
                case "media":
                    query.$and.push({
                        $or: [
                            { imageUrl: { $type: "string", $ne: "" } },
                            // Quoted: a numeric path segment is not a valid bare
                            // object key, so `imageUrls.0` is a SyntaxError.
                            { "imageUrls.0": { $exists: true } },
                        ],
                    });
                    break;
                case "video":
                    query.$and.push({
                        $or: [
                            { videoUrl: { $type: "string", $ne: "" } },
                            { "linkPreview.videoId": { $type: "string", $ne: "" } },
                        ],
                    });
                    break;
                case "links":
                    query.$and.push({ "linkPreview.videoId": { $type: "string", $ne: "" } });
                    break;
                case "polls":
                    query.$and.push({ "poll.enabled": true });
                    break;
                case "text":
                    // "Text only" has to exclude media explicitly, otherwise it
                    // is just "everything", which is what the All chip is.
                    query.$and.push({
                        text: { $type: "string", $ne: "" },
                        imageUrl: "",
                        imageUrls: { $size: 0 },
                        videoUrl: "",
                        audioUrl: "",
                        "linkPreview.videoId": "",
                    });
                    break;
            }
        }

        // Community filter
        if (communityId) {
            query.communityId = communityId;
        } else if (username) {
            const Community = require("../models/community");
            const memberCommunities = await Community.find({ "members.username": username }).select("_id").lean();
            const communityIds = memberCommunities.map((c) => c._id);
            if (communityIds.length > 0) {
                query.$and.push({ $or: [
                    { communityId: null },
                    { communityId: { $in: communityIds } },
                ]});
            } else {
                query.communityId = null;
            }
        } else {
            query.communityId = null;
        }

        // Visibility filter
        if (username) {
            query.$and.push({ $or: [
                { visibility: { $ne: "closeFriends" } },
                { sender: { $in: viewerCloseFriends } },
                { sender: username },
            ]});
        }

        if (query.$and.length === 0) delete query.$and;

        // Drop posts by accounts the viewer blocked or muted. Applied after the
        // `sender` clauses above so it merges with a `$in` rather than
        // replacing it, and before the query runs so pagination stays correct.
        applySenderExclusion(query, hiddenUsers, username);

        // Fetch more posts than needed for smart ranking
        const fetchLimit = Math.min(limit * 3, 150);
        const rawPosts = await Post.find(query, {
            _id: 1,
            sender: 1,
            text: 1,
            imageUrl: 1,
            imageUrls: 1,
            audioUrl: 1,
            videoUrl: 1,
            videoDuration: 1,
            videoWidth: 1,
            videoHeight: 1,
            color: 1,
            avatarUrl: 1,
            hashtags: 1,
            mentions: 1,
            visibility: 1,
            theme: 1,
            scheduledAt: 1,
            isScheduled: 1,
            isRemoved: 1,
            expiresAt: 1,
            repostCount: 1,
            timeStamp: 1,
            originalPostId: 1,
            originalSender: 1,
            repostComment: 1,
            viewCount: 1,
            likes: 1,
            reactions: 1,
            comments: 1,
            _originalPost: 1,
            isRepost: 1,
            communityId: 1,
            upvotes: 1,
            downvotes: 1,
            score: 1,
            flair: 1,
            // These four were missing from this projection, which made the feed
            // a *different document* from the one every other surface returns.
            //
            // `linkPreview` is why a YouTube/TikTok link posted by a user showed
            // the play button and thumbnail on their profile but rendered as bare
            // inert text in the social feed: GET /api/posts/user/:username reads
            // with no projection and included it, while this one did not, so
            // PostCard's `post.linkPreview?.videoId` guard was always false here.
            linkPreview: 1,
            // Same story for polls — PollCard was fully built and reachable from
            // /post/:id, but the feed projection dropped the field, so a poll
            // never rendered in the main feed.
            poll: 1,
            // The comment badge fell back to `post.comments.length`, which is
            // capped at MAX_EMBEDDED_COMMENTS (200), so a post with 5,000
            // comments displayed "200" everywhere in the feed.
            commentCount: 1,
            editedAt: 1,
        })
            .sort({ timeStamp: -1 })
            .limit(fetchLimit)
            .lean();

        // Smart feed scoring
        const now = Date.now();
        const HOUR = 3600000;
        const followedSet = new Set(viewerFollowing);

        const scored = rawPosts.map((p) => {
            let s = 0;
            const age = now - new Date(p.timeStamp).getTime();
            const ageHours = age / HOUR;

            // Recency: newer = higher (decays over 48h)
            s += Math.max(0, 48 - ageHours) * 2;

            // Engagement: likes + comments + reposts + viewWeight
            const likeCount = (p.likes || []).length;
            // commentCount is authoritative; the embedded array is only a window
            const commentCount = displayCount(p);
            const repostCount = p.repostCount || 0;
            const viewWeight = Math.min((p.viewCount || 0) / 100, 10);
            s += likeCount * 3 + commentCount * 4 + repostCount * 5 + viewWeight;

            // Community score boost
            if (p.communityId) s += 2;

            // Follow boost: posts from people you follow
            if (followedSet.has(p.sender)) s += 15;

            // Viral boost: high engagement in short time
            if (ageHours < 6 && (likeCount + commentCount) > 10) {
                s += (likeCount + commentCount) * 2;
            }

            // Penalty for very old posts
            if (ageHours > 72) s -= 20;

            return { ...p, _rankScore: s };
        });

        // Sort by score, then paginate
        scored.sort((a, b) => b._rankScore - a._rankScore);
        const hasMore = rawPosts.length > limit;
        const posts = await enrichPosts(scored.slice(0, limit));

        // A blocked user's replies are hidden inside other people's threads too.
        filterComments(posts, hiddenUsers);

        return res.json({ posts, hasMore });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch posts" });
    }
});

// POST /
router.post("/", verifyToken, requireFeature("posting"), async (req, res) => {
    try {
        // `expiresIn` is a relative duration in milliseconds, which is what the
        // composer's auto-delete picker sends ("10m", "1h"). It was never
        // destructured here, so the value was silently dropped and `expiresAt`
        // was never set — the picker was a no-op and the PostCountdown in the
        // feed could never fire. `expiresAt` is still accepted for callers that
        // compute an absolute time.
        const { text, imageUrl, imageUrls, audioUrl, videoUrl, videoDuration, videoWidth, videoHeight, visibility, poll, theme, scheduledAt, communityId, flair, expiresIn, expiresAt } = req.body;
        const username = req.body.sender || req.session?.userId;

        const senderUser = await User.findById(req.userId).select("username avatarUrl suspended defaultTheme videoUploadAllowed").lean();
        const sender = senderUser?.username || username;
        if (!sender?.trim()) {
            return res.status(400).json({ error: "Sender is required" });
        }

        if (senderUser?.suspended) {
            return res.status(403).json({ error: "Your account is suspended" });
        }

        const { isAdmin, permissions } = await getUserPermissions(req.userId);
        if (!isAdmin && !permissions.includes("create_post")) {
            return res.status(403).json({ error: "You don't have permission to create posts" });
        }

        const sanitizedText = text?.trim() || "";
        if (sanitizedText.length > 1000) {
            return res.status(400).json({ error: "Text exceeds maximum length of 1000 characters" });
        }

        if (await checkNudity(sanitizedText)) {
            return res.status(400).json({ error: "Your post contains content that is not allowed" });
        }
        const finalImageUrls = Array.isArray(imageUrls) && imageUrls.length > 0
            ? imageUrls.filter(Boolean).slice(0, 10)
            : (imageUrl ? [imageUrl] : []);
        // Video is validated rather than trusted: only Cloudinary delivery URLs
        // are accepted, so a post cannot be used to hotlink or embed arbitrary
        // third-party media (or to smuggle in a non-video URL that the player
        // would still try to load).
        let finalVideoUrl = "";
        let finalVideoDuration = 0;
        let finalVideoWidth = 0;
        let finalVideoHeight = 0;

        // A recognised video link in the text. Computed before the video block
        // so the "post must have something" check below can accept a link as
        // content, and so the same value is used for the feed and /reels.
        const linkedVideos = extractVideoLinks(sanitizedText);
        const linkPreview = linkedVideos[0]
            ? {
                platform: linkedVideos[0].platform,
                platformLabel: linkedVideos[0].platformLabel,
                videoId: linkedVideos[0].videoId,
                url: linkedVideos[0].url,
                embedUrl: linkedVideos[0].embedUrl,
                thumbnail: linkedVideos[0].thumbnail,
            }
            : { platform: "", platformLabel: "", videoId: "", url: "", embedUrl: "", thumbnail: "" };

        if (videoUrl) {
            // Gate before validating the URL, so a user without the permission
            // gets the explanatory 403 rather than a confusing "must be
            // uploaded through Cloudinary" for a URL the client built from an
            // upload it was never allowed to make.
            //
            // Reuses the permissions already resolved above for `create_post`
            // rather than querying the user again; only the per-user grant needs
            // the extra field, which senderUser already has.
            if (!canUploadVideo({
                isAdmin,
                permissions,
                videoUploadAllowed: senderUser?.videoUploadAllowed,
            })) {
                return res.status(403).json({
                    error: "Direct video upload is not enabled for your account",
                    feature: "upload_video",
                    alternative: "link",
                });
            }
            const raw = String(videoUrl).trim();
            let parsed;
            try {
                parsed = new URL(raw);
            } catch {
                return res.status(400).json({ error: "Invalid video URL" });
            }
            const CLOUDINARY_HOSTS = new Set(["res.cloudinary.com", "upload.cloudinary.com"]);
            if (parsed.protocol !== "https:" || !CLOUDINARY_HOSTS.has(parsed.hostname)) {
                return res.status(400).json({ error: "Video must be uploaded through Cloudinary" });
            }
            finalVideoUrl = raw;
            finalVideoDuration = Math.max(0, Math.min(Number(videoDuration) || 0, MAX_VIDEO_SECONDS));
            finalVideoWidth = Math.max(0, Math.min(Number(videoWidth) || 0, 10000));
            finalVideoHeight = Math.max(0, Math.min(Number(videoHeight) || 0, 10000));
        }

        if (!sanitizedText && finalImageUrls.length === 0 && !audioUrl && !finalVideoUrl && !linkPreview.videoId) {
            return res.status(400).json({ error: "Post must have text, an image, video, or audio" });
        }

        const hashtags = extractHashtags(sanitizedText);
        const mentions = extractMentions(sanitizedText, sender);

        const isScheduled = !!scheduledAt && new Date(scheduledAt) > new Date();
        const hasPoll = !!(poll?.enabled && poll.options?.length >= 2);

        // `expiresIn` is a relative duration in milliseconds, which is what the
        // composer's auto-delete picker sends ("10m", "1h"). It was never
        // destructured here, so the value was silently dropped: post.expiresAt
        // was never set, and the PostCountdown in the feed could never fire. The
        // picker was a no-op.
        //
        // The same field means two different things depending on whether the post
        // has a poll, which is what the client intends (it sends `expiresIn` in
        // both branches):
        //   • with a poll    -> poll.expiresAt. Closes voting; the post survives.
        //   • without a poll -> post.expiresAt. Auto-deletes the post, which is
        //     what the TTL index on `expiresAt` is for.
        //
        // Both are bounded so a malformed or hostile client cannot ask for an
        // expiry in 1970 (deleting the post before it is ever readable) or so far
        // in the future it amounts to "never".
        const EXPIRY_MIN_MS = 60 * 1000;          // 1 minute
        const EXPIRY_MAX_MS = 30 * 24 * 3600 * 1000; // 30 days
        let postExpiresAt = null;
        if (expiresAt !== undefined && expiresAt !== null && !hasPoll) {
            // An explicit absolute time, for callers that compute one themselves.
            const abs = new Date(expiresAt);
            if (!Number.isNaN(abs.getTime())) {
                postExpiresAt = abs;
            }
        } else if (expiresIn !== undefined && expiresIn !== null && !hasPoll) {
            const ms = Number(expiresIn);
            if (Number.isFinite(ms) && ms > 0) {
                const clamped = Math.min(Math.max(ms, EXPIRY_MIN_MS), EXPIRY_MAX_MS);
                postExpiresAt = new Date(Date.now() + clamped);
            }
        }
        let pollExpiresAt = null;
        if (expiresIn !== undefined && expiresIn !== null && hasPoll) {
            const ms = Number(expiresIn);
            if (Number.isFinite(ms) && ms > 0) {
                const clamped = Math.min(Math.max(ms, EXPIRY_MIN_MS), EXPIRY_MAX_MS);
                pollExpiresAt = new Date(Date.now() + clamped);
            }
        }

        const post = await Post.create({
            text:      sanitizedText,
            imageUrl:  finalImageUrls[0] || "",
            imageUrls: finalImageUrls,
            audioUrl:  audioUrl || "",
            videoUrl:      finalVideoUrl,
            videoDuration: finalVideoDuration,
            videoWidth:    finalVideoWidth,
            videoHeight:   finalVideoHeight,
            linkPreview:   linkPreview,
            sender:   sender.trim(),
            color:    senderUser?.avatarColor || "#3b82f6",
            avatarUrl: senderUser?.avatarUrl || "",
            hashtags,
            mentions,
            visibility: visibility || "public",
            theme:     { type: theme || senderUser?.defaultTheme || "default", bg: "" },
            scheduledAt: isScheduled ? new Date(scheduledAt) : null,
            isScheduled,
            expiresAt: postExpiresAt,
            communityId: communityId || null,
            flair: flair || {},
            ...(hasPoll ? {
                poll: {
                    enabled: true,
                    options: poll.options.map((o) => ({ text: o.text.trim().slice(0, 100), votes: [] })),
                    expiresAt: pollExpiresAt,
                },
            } : {}),
        });

        if (mentions.length > 0) {
            // Both channels, and the author is skipped so tagging someone on
            // your own post does not notify you about your own post.
            notify({
                recipients: mentions,
                type: "mention",
                fromUser: sender,
                fromColor: senderUser?.avatarColor,
                postId: post._id.toString(),
                text: text?.trim() ?? "",
                postText: text?.trim()?.slice(0, 120) ?? "",
                actor: sender,
            });
        }

        if (!isScheduled) {
            updateStreak(req.userId);
            checkAchievements(req.userId, sender.trim());
            logServer("post_created", { username: sender, message: `Post created by ${sender}`, meta: { postId: post._id.toString(), hasImage: finalImageUrls.length > 0, hasAudio: !!audioUrl } });
        }

        return res.status(201).json(post);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to create post" });
    }
});

// GET /:id
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ error: "Invalid post ID" });
        }
        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });
        if (post.isRemoved) {
            const viewer = req.query.username ? await User.findOne({ username: req.query.username }).select("isAdmin").lean() : null;
            if (!viewer?.isAdmin) return res.status(404).json({ error: "Not found" });
        }
        const enriched = await enrichPost(post);
        return res.json(enriched);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch post" });
    }
});

// DELETE /:id
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ error: "Invalid post ID" });
        }
        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const username = req.body.username || req.body.sender || (await User.findById(req.userId).select("username").lean())?.username;
        const { isAdmin, permissions } = await getUserPermissions(req.userId);

        const isOwner = post.sender === username;
        const canDeleteAny = isAdmin || permissions.includes("delete_any_post");
        const canDeleteOwn = permissions.includes("delete_own_post");

        if (!isOwner && !canDeleteAny) {
            return res.status(403).json({ error: "Unauthorized" });
        }
        if (isOwner && !canDeleteOwn && !canDeleteAny) {
            return res.status(403).json({ error: "You don't have permission to delete posts" });
        }

        await Post.findByIdAndDelete(id);
        await Notification.deleteMany({ postId: id });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to delete post" });
    }
});

// PUT /:id ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â edit post
router.put("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ error: "Invalid post ID" });
        }

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const username = (await User.findById(req.userId).select("username").lean())?.username;
        if (!username || post.sender !== username) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const { text, imageUrl, audioUrl } = req.body;
        const sanitizedText = text?.trim() || "";

        if (!sanitizedText && !imageUrl && !audioUrl) {
            return res.status(400).json({ error: "Post must have text, an image, or audio" });
        }

        if (sanitizedText.length > 1000) {
            return res.status(400).json({ error: "Text exceeds maximum length of 1000 characters" });
        }

        if (sanitizedText) {
            post.text = sanitizedText;
            post.hashtags = extractHashtags(sanitizedText);
            post.mentions = extractMentions(sanitizedText, username);
        }
        if (imageUrl !== undefined) post.imageUrl = imageUrl;
        if (audioUrl !== undefined) post.audioUrl = audioUrl;
        post.editedAt = new Date();

        await post.save();
        const enriched = await enrichPost(post);
        return res.json(enriched);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to edit post" });
    }
});

// PATCH /:id  ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â unified action dispatcher (mirrors Next.js API route)
router.patch("/:id", optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ error: "Invalid post ID" });
        }

        const { username: bodyUsername, action, text, color, parentId, imageUrl, audioUrl, reactionType, commentId } = req.body;

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const username = bodyUsername || (req.userId ? (await User.findById(req.userId).select("username").lean())?.username : null);

        if (action === "view") {
            post.viewCount = (post.viewCount || 0) + 1;
            await post.save();
            return res.json({ viewCount: post.viewCount });
        }

        if (!username) {
            return res.status(400).json({ error: "Username required" });
        }

        if (action === "comment") {
            const hasText = text?.trim();
            const hasImage = imageUrl;
            const hasAudio = audioUrl;
            if (!hasText && !hasImage && !hasAudio) {
                return res.status(400).json({ error: "Comment must have text, an image, or audio" });
            }

            if (hasText && await checkNudity(text)) {
                return res.status(400).json({ error: "Your comment contains content that is not allowed" });
            }

            const commenter = await User.findOne({ username }).select("username avatarColor avatarUrl isVerified roles").populate("roles", "name badge color").lean();

            const comment = {
                commentId: uid(),
                text:      text?.trim() ?? "",
                imageUrl:  imageUrl || "",
                audioUrl:  audioUrl || "",
                sender:    username,
                color:     commenter?.avatarColor || color || "#3b82f6",
                avatarUrl: commenter?.avatarUrl || "",
                parentId:  parentId || null,
                likes:     [],
                replies:   0,
                mentions:  extractMentions(text || ""),
            };
            post.comments.push(comment);
            post.commentCount = (post.commentCount || 0) + 1;
            trimComments(post);

            if (parentId) {
                const parentComment = post.comments.find(c => c.commentId === parentId);
                if (parentComment) parentComment.replies = (parentComment.replies || 0) + 1;
            }

            await post.save();

            if (post.sender !== username) {
                // Both channels. This is the comment path the feed actually
                // uses, and it produced no OS push at all — so a reply to your
                // post was invisible unless you happened to open the app.
                notify({
                    recipients: post.sender,
                    type: parentId ? "reply" : "comment",
                    fromUser: username,
                    fromColor: commenter?.avatarColor || color,
                    fromAvatarUrl: commenter?.avatarUrl,
                    postId: id,
                    commentId: comment.commentId,
                    text: text?.trim() ?? "",
                    postText: post.text?.slice(0, 120) ?? "",
                    postImageUrl: post.imageUrl || "",
                    actor: username,
                });
            }

            const enriched = await enrichPost(post);
            return res.json(enriched);
        }

        if (action === "deleteComment") {
            removeComment(post, commentId);
            await post.save();
            const enriched = await enrichPost(post);
            return res.json(enriched);
        }

        if (action === "editComment") {
            if (!commentId || !text?.trim()) {
                return res.status(400).json({ error: "commentId and text required" });
            }
            const comment = post.comments.find(c => c.commentId === commentId);
            if (!comment) return res.status(404).json({ error: "Comment not found" });
            if (comment.sender !== username) return res.status(403).json({ error: "Unauthorized" });

            comment.text = text.trim();
            comment.mentions = extractMentions(text, username);
            comment.editedAt = new Date();
            await post.save();
            const enriched = await enrichPost(post);
            return res.json(enriched);
        }

        if (action === "react") {
            const validReactions = ["like", "love", "laugh", "fire", "sad", "angry"];
            if (!reactionType || !validReactions.includes(reactionType)) {
                return res.status(400).json({ error: "Invalid reaction type" });
            }

            if (!post.reactions) {
                post.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
            }

            validReactions.forEach(type => {
                if (!post.reactions[type]) post.reactions[type] = [];
                const idx = post.reactions[type].indexOf(username);
                if (idx !== -1) post.reactions[type].splice(idx, 1);
            });

            if (!post.reactions[reactionType]) post.reactions[reactionType] = [];
            const idx = post.reactions[reactionType].indexOf(username);

            if (idx === -1) {
                post.reactions[reactionType].push(username);
                if (reactionType === "like" && !post.likes.includes(username)) {
                    post.likes.push(username);
                }
                if (post.sender !== username) {
                    // Both channels, via the shared helper. This used to create
                    // only the in-app document, so a reaction never produced an
                    // OS notification and the author only found out by opening
                    // the app.
                    notify({
                        recipients: post.sender,
                        type: reactionType,
                        fromUser: username,
                        fromColor: color,
                        postId: id,
                        text: post.text?.slice(0, 80) ?? "",
                        postText: post.text?.slice(0, 120) ?? "",
                        postImageUrl: post.imageUrl || "",
                        actor: username,
                    });
                }
            } else {
                post.reactions[reactionType].splice(idx, 1);
                if (reactionType === "like") {
                    const legacyIdx = post.likes.indexOf(username);
                    if (legacyIdx !== -1) post.likes.splice(legacyIdx, 1);
                }
            }

            await post.save();
            const enriched = await enrichPost(post);
            return res.json(enriched);
        }

        // Legacy like (no action or action=like)
        if (action === "like" || !action) {
            if (!post.reactions) {
                post.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
            }
            if (!post.reactions.like) post.reactions.like = [];

            const idx = post.reactions.like.indexOf(username);
            const isLiking = idx === -1;

            if (isLiking) {
                post.reactions.like.push(username);
                if (!post.likes.includes(username)) post.likes.push(username);
                if (post.sender !== username) {
                    await Notification.create({
                        recipient: post.sender,
                        type:      "like",
                        fromUser:  username,
                        fromColor: color || "#3b82f6",
                        postId:    id,
                        text:      post.text?.slice(0, 80) ?? "",
                        postText:  post.text?.slice(0, 120) ?? "",
                        postImageUrl: post.imageUrl || "",
                    });
                }
            } else {
                post.reactions.like.splice(idx, 1);
                const legacyIdx = post.likes.indexOf(username);
                if (legacyIdx !== -1) post.likes.splice(legacyIdx, 1);
            }

            await post.save();
            const enriched = await enrichPost(post);
            return res.json(enriched);
        }

        if (action === "reactComment") {
            const validReactions = ["like", "love", "laugh", "fire", "sad", "angry"];
            if (!commentId || !reactionType || !validReactions.includes(reactionType)) {
                return res.status(400).json({ error: "Invalid comment reaction" });
            }
            const comment = post.comments.find(c => c.commentId === commentId);
            if (!comment) return res.status(404).json({ error: "Comment not found" });

            if (!comment.reactions) {
                comment.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
            }

            validReactions.forEach(type => {
                if (!comment.reactions[type]) comment.reactions[type] = [];
                const idx = comment.reactions[type].indexOf(username);
                if (idx !== -1) comment.reactions[type].splice(idx, 1);
            });

            if (!comment.reactions[reactionType]) comment.reactions[reactionType] = [];
            const idx = comment.reactions[reactionType].indexOf(username);
            if (idx === -1) comment.reactions[reactionType].push(username);

            await post.save();
            const enriched = await enrichPost(post);
            return res.json(enriched);
        }

        return res.status(400).json({ error: "Invalid action" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to update post" });
    }
});

// POST /:id/like
router.post("/:id/like", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(req.userId).select("username avatarColor").lean();
        const username = user?.username;
        if (!username) return res.status(400).json({ error: "Username not found" });

        const { isAdmin, permissions } = await getUserPermissions(req.userId);
        if (!isAdmin && !permissions.includes("react")) {
            return res.status(403).json({ error: "You don't have permission to react" });
        }

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        if (!post.reactions) {
            post.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
        }
        if (!post.reactions.like) post.reactions.like = [];

        const idx = post.reactions.like.indexOf(username);
        const isLiking = idx === -1;

        if (isLiking) {
            post.reactions.like.push(username);
            if (!post.likes.includes(username)) post.likes.push(username);

            if (post.sender !== username) {
                await Notification.create({
                    recipient: post.sender,
                    type:      "like",
                    fromUser:  username,
                    fromColor: user.avatarColor || "#3b82f6",
                    postId:    id,
                    text:      post.text?.slice(0, 80) ?? "",
                    postText:  post.text?.slice(0, 120) ?? "",
                    postImageUrl: post.imageUrl || "",
                });
            }
        } else {
            post.reactions.like.splice(idx, 1);
            const legacyIdx = post.likes.indexOf(username);
            if (legacyIdx !== -1) post.likes.splice(legacyIdx, 1);
        }

        await post.save();
        return res.json({ liked: isLiking, likeCount: post.reactions.like.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to toggle like" });
    }
});

// POST /:id/react
router.post("/:id/react", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { reaction } = req.body;
        const validReactions = ["like", "love", "laugh", "fire", "sad", "angry"];
        if (!reaction || !validReactions.includes(reaction)) {
            return res.status(400).json({ error: "Invalid reaction type" });
        }

        const user = await User.findById(req.userId).select("username").lean();
        const username = user?.username;
        if (!username) return res.status(400).json({ error: "Username not found" });

        const { isAdmin, permissions } = await getUserPermissions(req.userId);
        if (!isAdmin && !permissions.includes("react")) {
            return res.status(403).json({ error: "You don't have permission to react" });
        }

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        if (!post.reactions) {
            post.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
        }

        // Remove from all other reactions
        validReactions.forEach((type) => {
            if (!post.reactions[type]) post.reactions[type] = [];
            const i = post.reactions[type].indexOf(username);
            if (i !== -1) post.reactions[type].splice(i, 1);
        });

        // Toggle selected reaction
        if (!post.reactions[reaction]) post.reactions[reaction] = [];
        const idx = post.reactions[reaction].indexOf(username);
        let userReaction = null;

        if (idx === -1) {
            post.reactions[reaction].push(username);
            userReaction = reaction;
            if (reaction === "like" && !post.likes.includes(username)) {
                post.likes.push(username);
            }
            if (post.sender !== username) {
                await Notification.create({
                    recipient: post.sender,
                    type:      reaction,
                    fromUser:  username,
                    fromColor: user.avatarColor || "#3b82f6",
                    postId:    id,
                    text:      post.text?.slice(0, 80) ?? "",
                    postText:  post.text?.slice(0, 120) ?? "",
                    postImageUrl: post.imageUrl || "",
                });
            }
        } else {
            post.reactions[reaction].splice(idx, 1);
            if (reaction === "like") {
                const legacyIdx = post.likes.indexOf(username);
                if (legacyIdx !== -1) post.likes.splice(legacyIdx, 1);
            }
        }

        await post.save();
        return res.json({ reactions: post.reactions, userReaction });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to react" });
    }
});

// POST /:id/comment
router.post("/:id/comment", verifyToken, requireFeature("comments"), async (req, res) => {
    try {
        const { id } = req.params;
        const { text, imageUrl, audioUrl, parentId } = req.body;

        const { isAdmin, permissions } = await getUserPermissions(req.userId);
        if (!isAdmin && !permissions.includes("create_comment")) {
            return res.status(403).json({ error: "You don't have permission to comment" });
        }

        const hasText = text?.trim();
        const hasImage = imageUrl;
        const hasAudio = audioUrl;
        if (!hasText && !hasImage && !hasAudio) {
            return res.status(400).json({ error: "Comment must have text, an image, or audio" });
        }

        if (hasText && await checkNudity(text)) {
            return res.status(400).json({ error: "Your comment contains content that is not allowed" });
        }

        const user = await User.findById(req.userId).select("username avatarColor").lean();
        const username = user?.username;
        if (!username) return res.status(400).json({ error: "Username not found" });

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const comment = {
            commentId: uid(),
            text:      text?.trim() ?? "",
            imageUrl:  imageUrl || "",
            audioUrl:  audioUrl || "",
            sender:    username,
            color:     user.avatarColor || "#3b82f6",
            avatarUrl: user.avatarUrl || "",
            parentId:  parentId || null,
            likes:     [],
            replies:   0,
            mentions:  extractMentions(text || ""),
        };
        post.comments.push(comment);
        post.commentCount = (post.commentCount || 0) + 1;
        trimComments(post);

        if (parentId) {
            const parentComment = post.comments.find((c) => c.commentId === parentId);
            if (parentComment) parentComment.replies = (parentComment.replies || 0) + 1;
        }

        await post.save();

        if (post.sender !== username) {
            // Both channels. A comment on someone's post was the single most
            // expected notification in the product and it produced no OS push at
            // all — you only learned about replies by opening the app.
            notify({
                recipients: post.sender,
                type: parentId ? "reply" : "comment",
                fromUser: username,
                fromColor: user.avatarColor,
                fromAvatarUrl: user.avatarUrl,
                postId: id,
                commentId: comment.commentId,
                text: text?.trim() ?? "",
                postText: post.text?.slice(0, 120) ?? "",
                postImageUrl: post.imageUrl || "",
                actor: username,
            });
        }

        return res.json(comment);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to add comment" });
    }
});

// DELETE /:id/comment/:commentId
router.delete("/:id/comment/:commentId", verifyToken, async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const user = await User.findById(req.userId).select("username").lean();
        const username = user?.username;

        const { isAdmin, permissions } = await getUserPermissions(req.userId);

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const comment = post.comments.find((c) => c.commentId === commentId);
        if (!comment) return res.status(404).json({ error: "Comment not found" });

        const isOwner = comment.sender === username;
        const canDeleteAny = isAdmin || permissions.includes("delete_any_comment");
        const canDeleteOwn = permissions.includes("delete_own_comment");

        if (!isOwner && !canDeleteAny) {
            return res.status(403).json({ error: "Unauthorized" });
        }
        if (isOwner && !canDeleteOwn && !canDeleteAny) {
            return res.status(403).json({ error: "You don't have permission to delete comments" });
        }

        removeComment(post, commentId);

        await post.save();
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to delete comment" });
    }
});

// POST /:id/comment/:commentId/like
router.post("/:id/comment/:commentId/like", verifyToken, requireFeature("comments"), async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const user = await User.findById(req.userId).select("username").lean();
        const username = user?.username;

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const comment = post.comments.find((c) => c.commentId === commentId);
        if (!comment) return res.status(404).json({ error: "Comment not found" });

        if (!comment.likes) comment.likes = [];
        const idx = comment.likes.indexOf(username);
        if (idx === -1) comment.likes.push(username);
        else comment.likes.splice(idx, 1);

        await post.save();
        return res.json({ liked: idx === -1, likeCount: comment.likes.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:id/comment/:commentId/react
router.post("/:id/comment/:commentId/react", verifyToken, requireFeature("comments"), async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const { reaction } = req.body;
        const validReactions = ["like", "love", "laugh", "fire", "sad", "angry"];
        if (!reaction || !validReactions.includes(reaction)) {
            return res.status(400).json({ error: "Invalid reaction" });
        }

        const user = await User.findById(req.userId).select("username").lean();
        const username = user?.username;

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Not found" });

        const comment = post.comments.find((c) => c.commentId === commentId);
        if (!comment) return res.status(404).json({ error: "Comment not found" });

        if (!comment.reactions) {
            comment.reactions = { like: [], love: [], laugh: [], fire: [], sad: [], angry: [] };
        }

        validReactions.forEach((type) => {
            if (!comment.reactions[type]) comment.reactions[type] = [];
            const i = comment.reactions[type].indexOf(username);
            if (i !== -1) comment.reactions[type].splice(i, 1);
        });

        if (!comment.reactions[reaction]) comment.reactions[reaction] = [];
        const idx = comment.reactions[reaction].indexOf(username);
        if (idx === -1) comment.reactions[reaction].push(username);

        await post.save();
        return res.json({ reactions: comment.reactions });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:id/view
router.post("/:id/view", async (req, res) => {
    try {
        const { id } = req.params;
        const post = await Post.findByIdAndUpdate(id, { $inc: { viewCount: 1 } }, { returnDocument: 'after' });
        if (!post) return res.status(404).json({ error: "Not found" });
        return res.json({ viewCount: post.viewCount });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:id/bookmark
router.post("/:id/bookmark", verifyToken, async (req, res) => {
    try {
        const postId = req.params.id;
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const { isAdmin, permissions } = await getUserPermissions(req.userId);
        if (!isAdmin && !permissions.includes("bookmark")) {
            return res.status(403).json({ error: "You don't have permission to bookmark" });
        }

        const isBookmarked = user.bookmarks.includes(postId);
        if (isBookmarked) {
            user.bookmarks = user.bookmarks.filter((b) => b !== postId);
        } else {
            user.bookmarks.push(postId);
        }
        await user.save();
        return res.json({ bookmarked: !isBookmarked });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:id/repost
router.post("/:id/repost", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;

        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ error: "Invalid post ID" });
        }

        const { isAdmin, permissions } = await getUserPermissions(req.userId);
        if (!isAdmin && !permissions.includes("repost")) {
            return res.status(403).json({ error: "You don't have permission to repost" });
        }

        const userDoc = await User.findById(req.userId).select("username avatarColor avatarUrl");
        const username = userDoc?.username;
        if (!username) return res.status(400).json({ error: "Username required" });

        const originalPost = await Post.findById(id);
        if (!originalPost) return res.status(404).json({ error: "Original post not found" });

        const existingRepost = await Post.findOne({ sender: username, isRepost: true, originalPostId: id });
        if (existingRepost) return res.status(400).json({ error: "Already reposted" });

        const repostComment = comment?.trim() || "";
        const repost = await Post.create({
            text: "",
            sender: username,
            color: userDoc.avatarColor || "#3b82f6",
            avatarUrl: userDoc.avatarUrl || "",
            isRepost: true,
            originalPostId: id,
            originalSender: originalPost.sender,
            repostComment,
            hashtags: extractHashtags(repostComment),
            mentions: extractMentions(repostComment),
            visibility: "public",
        });

        originalPost.repostCount = (originalPost.repostCount || 0) + 1;
        await originalPost.save();

        if (originalPost.sender !== username) {
            await Notification.create({
                recipient: originalPost.sender,
                type: "repost",
                fromUser: username,
                fromColor: userDoc.avatarColor || "#3b82f6",
                fromAvatarUrl: userDoc.avatarUrl || "",
                postId: id,
                text: repostComment,
                postText: originalPost.text?.slice(0, 120) ?? "",
                postImageUrl: originalPost.imageUrl || "",
            });
        }

        return res.json({
            success: true,
            repost: { _id: repost._id, isRepost: true, originalPostId: id, repostComment },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to repost" });
    }
});

// POST /:id/poll/vote
router.post("/:id/poll/vote", async (req, res) => {
    try {
        const { id } = req.params;
        const { username, optionIndex } = req.body;

        if (optionIndex === undefined) {
            return res.status(400).json({ error: "optionIndex required" });
        }

        const post = await Post.findById(id);
        if (!post) return res.status(404).json({ error: "Post not found" });
        if (!post.poll?.enabled) return res.status(400).json({ error: "Post has no poll" });

        if (post.poll.expiresAt && new Date(post.poll.expiresAt) < new Date()) {
            return res.status(400).json({ error: "Poll has expired" });
        }

        if (optionIndex < 0 || optionIndex >= post.poll.options.length) {
            return res.status(400).json({ error: "Invalid option index" });
        }

        let alreadyVoted = false;
        post.poll.options.forEach((opt) => {
            const idx = opt.votes.indexOf(username || "anonymous");
            if (idx !== -1) {
                opt.votes.splice(idx, 1);
                alreadyVoted = true;
            }
        });

        post.poll.options[optionIndex].votes.push(username || "anonymous");
        await post.save();

        return res.json({ poll: post.poll, changedVote: alreadyVoted });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to vote" });
    }
});

// POST /views - batch view increment
router.post("/views", async (req, res) => {
    try {
        const { postIds } = req.body;
        if (!Array.isArray(postIds) || postIds.length === 0) {
            return res.status(400).json({ error: "postIds array required" });
        }
        const ids = postIds.slice(0, 50);
        const result = await Post.updateMany({ _id: { $in: ids } }, { $inc: { viewCount: 1 } });
        return res.json({ updated: result.modifiedCount });
    } catch (error) {
        console.error("Failed to track views:", error);
        return res.status(500).json({ error: "Failed to track views" });
    }
});

// GET /bookmarks - get bookmarked posts
router.get("/bookmarks", async (req, res) => {
    try {
        const idsParam = req.query.ids;
        if (!idsParam) return res.status(400).json({ error: "ids required" });

        const ids = idsParam.split(",").filter(Boolean).slice(0, 50);
        const posts = await Post.find({
            _id: { $in: ids },
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
            isRemoved: { $ne: true },
            // A queued post has no business in someone's saved list, and this
            // route is reachable by id, so the filter has to be explicit rather
            // than inherited from the feed query.
            isScheduled: { $ne: true },
        }).sort({ timeStamp: -1 }).lean();
        if (posts.length === 0) return res.json([]);

        const authorUsernames = [...new Set(posts.map((p) => p.sender))];
        const repostOriginalIds = posts.filter((p) => p.isRepost && p.originalPostId).map((p) => p.originalPostId);

        const [users, originalPosts] = await Promise.all([
            User.find({ username: { $in: authorUsernames } })
                .select("username avatarUrl isVerified isAdmin roles proUntil")
                .populate("roles", "name badge color")
                .lean(),
            repostOriginalIds.length > 0
                ? Post.find({ _id: { $in: repostOriginalIds } }).lean()
                : Promise.resolve([]),
        ]);

        const userMap = {};
        users.forEach((u) => {
            userMap[u.username] = {
                avatarUrl: u.avatarUrl || "", isVerified: u.isVerified || false,
                isAdmin: u.isAdmin || false,
                isPro: isProUserDoc(u),
                roles: (u.roles || []).map((r) => ({
                    id: r._id?.toString() ?? "", name: r.name ?? "", badge: r.badge ?? "", color: r.color ?? "",
                })),
            };
        });

        const origMap = {};
        originalPosts.forEach((p) => { origMap[p._id.toString()] = { ...p, _author: userMap[p.sender] || null }; });

        const enriched = posts
            .sort((a, b) => new Date(b.timeStamp) - new Date(a.timeStamp))
            .map((p) => ({
                ...p, _author: userMap[p.sender] || null,
                _originalPost: (p.isRepost && p.originalPostId) ? (origMap[p.originalPostId.toString()] || null) : null,
                comments: (p.comments || []).map((c) => ({ ...c, _author: c.sender === p.sender ? userMap[c.sender] : null })),
            }));

        return res.json(enriched);
    } catch (error) {
        console.error("Failed to fetch bookmarks:", error);
        return res.status(500).json({ error: "Failed to fetch bookmarks" });
    }
});

// GET /user/:username - user profile posts
router.get("/user/:username", async (req, res) => {
    try {
        const { username } = req.params;
        const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
        const before = req.query.before;
        const viewer = req.query.viewer;

        const userDoc = await User.findOne({ username }).populate("roles").lean();

        const isPrivate = userDoc?.isPrivate;
        const isSelf = viewer === username;
        const isFollower = userDoc?.followers?.includes(viewer);
        const isAdmin = req.query.admin === "true";

        // A blocked account looks like an empty, non-existent profile: no
        // posts, and no hint that the profile exists at all.
        if (viewer && !isSelf) {
            const hidden = await getHiddenUsers(viewer);
            if (hidden.includes(String(username).toLowerCase())) {
                return res.json({
                    posts: [],
                    totalLikes: 0,
                    postCount: 0,
                    profile: null,
                    hasMore: false,
                    nextCursor: null,
                    notFound: true,
                });
            }
        }

        if (isPrivate && !isSelf && !isFollower && !isAdmin) {
            return res.json({
                posts: [],
                totalLikes: 0,
                postCount: 0,
                profile: userDoc ? {
                    username: userDoc.username,
                    bio: userDoc.bio,
                    avatarColor: userDoc.avatarColor,
                    avatarUrl: userDoc.avatarUrl || "",
                    isVerified: userDoc.isVerified || false,
                    isAdmin: userDoc.isAdmin || false,
                    isPrivate: true,
                    roles: (userDoc.roles || []).map((r) => ({
                        id: r._id.toString(), name: r.name, badge: r.badge, color: r.color,
                    })),
                    followersCount: (userDoc.followers || []).length,
                    followingCount: (userDoc.following || []).length,
                } : null,
                hasMore: false,
                nextCursor: null,
                isPrivate: true,
            });
        }

        const query = {
            sender: username,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
            // Same reason as the feed: a scheduled post is unpublished until
            // publishScheduledPosts() clears the flag, so showing it here would
            // reveal a queued post to everyone who visits the profile.
            isScheduled: { $ne: true },
        };
        if (!isAdmin) {
            query.isRemoved = { $ne: true };
        }
        if (before) query.timeStamp = { $lt: new Date(before) };

        const [rawPosts, totalPosts] = await Promise.all([
            Post.find(query).sort({ timeStamp: -1 }).limit(limit + 1).lean(),
            Post.countDocuments({ sender: username, isScheduled: { $ne: true } }),
        ]);

        const hasMore = rawPosts.length > limit;
        const posts = hasMore ? rawPosts.slice(0, limit) : rawPosts;

        const repostIds = posts.filter((p) => p.isRepost && p.originalPostId).map((p) => p.originalPostId);
        let originalPostsMap = {};
        if (repostIds.length > 0) {
            const originalPosts = await Post.find({ _id: { $in: repostIds } }).lean();
            const origAuthors = [...new Set(originalPosts.map((p) => p.sender))];
            const origUsers = await User.find({ username: { $in: origAuthors } })
                .select("username avatarUrl isVerified isAdmin roles proUntil")
                .populate("roles", "name badge color").lean();
            const origUserMap = {};
            origUsers.forEach((u) => {
                origUserMap[u.username] = {
                    avatarUrl: u.avatarUrl || "", isVerified: u.isVerified || false,
                    isAdmin: u.isAdmin || false,
                    isPro: isProUserDoc(u),
                    roles: (u.roles || []).map((r) => ({
                        id: r._id?.toString() ?? "", name: r.name ?? "", badge: r.badge ?? "", color: r.color ?? "",
                    })),
                };
            });
            originalPosts.forEach((p) => {
                originalPostsMap[p._id.toString()] = { ...p, _author: origUserMap[p.sender] || null };
            });
        }

        const totalLikes = posts.reduce((sum, p) => sum + p.likes.length, 0);

        const profile = userDoc ? {
            username: userDoc.username, bio: userDoc.bio,
            avatarColor: userDoc.avatarColor, avatarUrl: userDoc.avatarUrl || "",
            isVerified: userDoc.isVerified || false, isAdmin: userDoc.isAdmin || false,
            isPrivate: userDoc.isPrivate || false,
            roles: (userDoc.roles || []).map((r) => ({
                id: r._id.toString(), name: r.name, badge: r.badge, color: r.color,
            })),
            followersCount: (userDoc.followers || []).length,
            followingCount: (userDoc.following || []).length,
        } : null;

        const authorData = profile ? {
            avatarUrl: profile.avatarUrl, isVerified: profile.isVerified,
            isAdmin: profile.isAdmin, roles: profile.roles,
        } : null;

        const enrichedPosts = posts.map((p) => ({
            ...p, _author: authorData,
            _originalPost: (p.isRepost && p.originalPostId)
                ? (originalPostsMap[p.originalPostId.toString()] || null) : null,
            comments: (p.comments || []).map((c) => ({
                ...c, _author: c.sender === username ? authorData : null,
            })),
        }));

        return res.json({
            posts: enrichedPosts, totalLikes, postCount: totalPosts, profile, hasMore,
            nextCursor: hasMore && enrichedPosts.length > 0 ? enrichedPosts[enrichedPosts.length - 1].timeStamp : null,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch profile" });
    }
});

// POST /:id/view ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â increment view count (rate-limited by client)
router.post("/:id/view", async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) return res.json({ ok: true });
        await Post.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });
        return res.json({ ok: true });
    } catch {
        return res.json({ ok: true });
    }
});

// GET /achievements/list ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â all possible achievements
router.get("/achievements/list", async (req, res) => {
    return res.json(ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, icon: a.icon, description: a.description })));
});

// GET /scheduled/mine ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â list my scheduled posts
router.get("/scheduled/mine", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username").lean();
        const posts = await Post.find({ sender: user?.username, isScheduled: true }).sort({ scheduledAt: 1 }).lean();
        return res.json(posts.map((p) => ({
            id: p._id.toString(), text: (p.text || "").slice(0, 200), scheduledAt: p.scheduledAt, timeStamp: p.timeStamp,
        })));
    } catch {
        return res.json([]);
    }
});

// DELETE /scheduled/:id ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â cancel a scheduled post
router.delete("/scheduled/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(req.userId).select("username").lean();
        const post = await Post.findOne({ _id: id, sender: user?.username, isScheduled: true });
        if (!post) return res.status(404).json({ error: "Not found" });
        await Post.findByIdAndDelete(id);
        return res.json({ ok: true });
    } catch {
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /user-stats ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â stats for the logged-in user
router.get("/user-stats", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("username postingStreak longestStreak achievements defaultTheme").lean();
        if (!user?.username) return res.json({});

        const postCount = await Post.countDocuments({ sender: user.username, isScheduled: false, isRemoved: { $ne: true } });
        const likesResult = await Post.aggregate([
            { $match: { sender: user.username, isRemoved: { $ne: true } } },
            { $project: { count: { $size: "$likes" } } },
            { $group: { _id: null, total: { $sum: "$count" } } },
        ]);
        const viewsResult = await Post.aggregate([
            { $match: { sender: user.username, isRemoved: { $ne: true } } },
            { $group: { _id: null, total: { $sum: "$viewCount" } } },
        ]);
        const commentResult = await Post.aggregate([
            { $match: { isRemoved: { $ne: true } } },
            { $unwind: "$comments" },
            { $match: { "comments.sender": user.username } },
            { $count: "total" },
        ]);

        return res.json({
            postCount,
            totalLikes: likesResult[0]?.total || 0,
            totalViews: viewsResult[0]?.total || 0,
            totalComments: commentResult[0]?.total || 0,
            postingStreak: user.postingStreak || 0,
            longestStreak: user.longestStreak || 0,
            achievements: user.achievements || [],
            defaultTheme: user.defaultTheme || "default",
        });
    } catch {
        return res.json({});
    }
});

// PATCH /default-theme ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â set user's default post theme
router.patch("/default-theme", verifyToken, async (req, res) => {
    try {
        const { theme } = req.body;
        const valid = ["default", "sunset", "ocean", "forest", "neon", "midnight", "rose", "gold"];
        if (!valid.includes(theme)) return res.status(400).json({ error: "Invalid theme" });
        await User.findByIdAndUpdate(req.userId, { defaultTheme: theme });
        return res.json({ ok: true, theme });
    } catch {
        return res.status(500).json({ error: "Failed" });
    }
});

// Publish scheduled posts (called by a setInterval in server.js or on-demand)
async function publishScheduledPosts() {
    try {
        const now = new Date();
        const posts = await Post.find({ isScheduled: true, scheduledAt: { $lte: now } }).limit(50);
        for (const post of posts) {
            post.isScheduled = false;
            post.timeStamp = now;
            await post.save();
            const senderUser = await User.findOne({ username: post.sender }).select("_id").lean();
            if (senderUser) {
                updateStreak(senderUser._id.toString());
                checkAchievements(senderUser._id.toString(), post.sender);
            }
        }
        return posts.length;
    } catch (e) {
        console.error("[publishScheduledPosts] Error:", e.message);
        return 0;
    }
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Voting ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

router.post("/:id/vote", verifyToken, async (req, res) => {
    try {
        const { direction } = req.body; // "up", "down", or "none"
        const user = await User.findById(req.userId).select("username").lean();
        if (!user?.username) return res.status(400).json({ error: "Username required" });

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ error: "Post not found" });

        const wasUpvoted = post.upvotes.includes(user.username);
        const wasDownvoted = post.downvotes.includes(user.username);

        // Remove existing votes
        post.upvotes = post.upvotes.filter((u) => u !== user.username);
        post.downvotes = post.downvotes.filter((u) => u !== user.username);

        // Apply new vote
        if (direction === "up" && !wasUpvoted) {
            post.upvotes.push(user.username);
        } else if (direction === "down" && !wasDownvoted) {
            post.downvotes.push(user.username);
        }
        // direction === "none" or clicking same vote = remove vote (already removed above)

        post.score = post.upvotes.length - post.downvotes.length;
        await post.save();

        return res.json({
            score: post.score,
            upvotes: post.upvotes.length,
            downvotes: post.downvotes.length,
            userVote: direction === "up" && post.upvotes.includes(user.username)
                ? "up"
                : direction === "down" && post.downvotes.includes(user.username)
                    ? "down"
                    : "none",
        });
    } catch (err) {
        console.error("Post VOTE error:", err);
        return res.status(500).json({ error: "Failed to vote" });
    }
});

module.exports = router;
module.exports.publishScheduledPosts = publishScheduledPosts;
