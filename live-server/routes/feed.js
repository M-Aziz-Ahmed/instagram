const express = require("express");
const Post = require("../models/post");
const User = require("../models/user");

const router = express.Router();

// Get default match for feed queries
function getDefaultMatch(before) {
    const match = { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }], isRemoved: { $ne: true } };
    if (before) match.timeStamp = { $lt: new Date(before) };
    return match;
}

function matchesMutedWords(post, mutedSet) {
    if (mutedSet.size === 0) return false;
    const text = (post.text || "").toLowerCase();
    for (const w of mutedSet) {
        if (text.includes(w)) return true;
    }
    if (post.hashtags) {
        for (const h of post.hashtags) {
            if (mutedSet.has(h.toLowerCase())) return true;
        }
    }
    return false;
}

function isVisibleTo(post, username, closeFriendsSet) {
    if (post.visibility !== "closeFriends") return true;
    if (post.sender === username) return true;
    if (closeFriendsSet.has(post.sender)) return true;
    return false;
}

// Get posts from followed users
async function fetchFollowed(username, limit) {
    const following = await User.findOne({ username })
        .select("following")
        .lean();
    
    if (!following?.following?.length) return [];
    
    return Post.aggregate([
        { $match: { 
            sender: { $in: following.following },
            isRemoved: { $ne: true }
        }},
        { $sort: { timeStamp: -1 } },
        { $limit: limit }
    ]).allowDiskUse(true);
}

// Get posts from users user liked
async function fetchLiked(username, limit) {
    return Post.aggregate([
        { $match: {
            $and: [
                { $or: [
                    { likes: username }, 
                    { "reactions.like": username }, 
                    { "reactions.love": username }, 
                    { "reactions.fire": username }, 
                    { "reactions.sad": username }
                ] },
                { sender: { $ne: username } },
                { isRemoved: { $ne: true } }
            ],
            timeStamp: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }, // posts from last year
            isRemoved: { $ne: true }
        }},
        { $sort: { timeStamp: -1 } },
        { $limit: limit }
    ]).allowDiskUse(true);
}

// Get posts based on user interests (hashtags they've engaged with)
async function getUserInterestTags(viewer) {
    const userPosts = await Post.find({
        sender: { $in: viewer.following },
        timeStamp: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // last 30 days
    })
        .select("hashtags")
        .lean();
    
    const tagCounts = {};
    userPosts.forEach(post => {
        (post.hashtags || []).forEach(hashtag => {
            const tag = hashtag.toLowerCase();
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
    });
    
    return Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag]) => tag);
}

// Get trending content from similar users
async function getTrendingContent(username, limit) {
    const viewer = await User.findOne({ username })
        .select("following")
        .lean();
    
    if (!viewer) return [];
    
    const similarUserIds = viewer.following;
    
    return Post.aggregate([
        { $match: { 
            isRemoved: { $ne: true },
            $or: [
                { sender: { $in: similarUserIds } },
                { likes: { $in: similarUserIds } },
                { hashtags: { $in: similarUserIds } }
            ] 
        }},
        { $sort: { timeStamp: -1 } },
        { $limit: limit }
    ]).allowDiskUse(true);
}

// Get recommended content using collaborative filtering
async function getRecommendedPosts(limit) {
    const viewer = await User.findOne({ username })
        .select("following mutedWords closeFriends")
        .lean();
    
    if (!viewer) return [];
    
    // Get user's watch history (recently viewed posts)
    const recentViewed = await Post.find({
        sender: { $in: viewer.following },
        timeStamp: { $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // last 7 days
    })
        .sort({ timeStamp: -1 })
        .limit(20)
        .lean();
    
    // Get user's interests (popular hashtags they've engaged with)
    const interestTags = await getUserInterestTags(viewer);
    
    // Get recommended content using collaborative filtering approach
    const recommendedMatch = {
        $and: [
            { isRemoved: { $ne: true } },
            ...(interestTags.length > 0 ? { hashtags: { $in: interestTags } } : {}),
            { $or: [
                { sender: { $nin: [viewer.username] } },
                { "reactions.like": { $in: [viewer.username] } },
                { "reactions.love": { $in: [viewer.username] } },
                { "reactions.fire": { $in: [viewer.username] } },
                { "reactions.sad": { $in: [viewer.username] } }
            ]},
            { timeStamp: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } // not too recent
        ]
    };
    
    return fetchBatch(recommendedMatch, limit);
}

async function fetchBatch(matchStage, limit) {
    const pipeline = [];
    if (Object.keys(matchStage).length > 0) pipeline.push({ $match: matchStage });
    pipeline.push({ $sort: { timeStamp: -1 } });
    pipeline.push({ $limit: limit });
    return Post.aggregate(pipeline).allowDiskUse(true);
}

module.exports = router;