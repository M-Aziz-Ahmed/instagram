const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
    commentId: { type: String, required: true },
    text:      { type: String, default: "" },
    imageUrl:  { type: String, default: "" },
    audioUrl:  { type: String, default: "" },
    sender:    { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    avatarUrl: { type: String, default: "" },
    parentId:  { type: String, default: null },
    replies:   { type: Number, default: 0 },
    likes:     { type: [String], default: [] },
    mentions:  { type: [String], default: [] },
    reactions: {
        like:  { type: [String], default: [] },
        love:  { type: [String], default: [] },
        laugh: { type: [String], default: [] },
        fire:  { type: [String], default: [] },
        sad:   { type: [String], default: [] },
        angry: { type: [String], default: [] },
    },
    editedAt: { type: Date, default: null },
    timeStamp: { type: Date, default: Date.now },
});

const pollOptionSchema = new mongoose.Schema({
    text:  { type: String, required: true },
    votes: { type: [String], default: [] },
}, { _id: false });

const postSchema = new mongoose.Schema({
    text:      { type: String, default: "" },
    imageUrl:  { type: String, default: "" },
    imageUrls: { type: [String], default: [] },
    audioUrl:  { type: String, default: "" },
    // Video posts. A post with a videoUrl is what the /reels feed selects, so
    // there is no separate "isReel" flag to keep in sync. Dimensions are stored
    // so the player can reserve space before the video loads and the layout does
    // not jump.
    videoUrl:      { type: String, default: "" },
    videoDuration: { type: Number, default: 0 },
    videoWidth:    { type: Number, default: 0 },
    videoHeight:   { type: Number, default: 0 },
    // A video hosted elsewhere (YouTube, Facebook, Instagram, TikTok, Reddit)
    // that the author linked to. This is the path available to people without
    // the upload_video permission, and it is also what /reels treats as video
    // content, so a linked clip still surfaces as a reel.
    //
    // Stored as a structured record rather than re-parsed from the text on
    // every read: the platform decides the embed URL and the id, and both are
    // fiddly enough that deriving them at render time would be a per-request
    // cost and a second place for the parsing rules to drift.
    linkPreview:   {
        platform:     { type: String, default: "" },
        platformLabel:{ type: String, default: "" },
        videoId:      { type: String, default: "" },
        url:          { type: String, default: "" },
        embedUrl:     { type: String, default: "" },
        thumbnail:    { type: String, default: "" },
    },
    sender:    { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    avatarUrl: { type: String, default: "" },
    likes:     { type: [String], default: [] },
    // `comments` is a bounded window of the most recent comments, NOT the full
    // history — see MAX_EMBEDDED_COMMENTS in lib/postComments.js. Keeping every
    // comment embedded meant a popular post grew toward the 16MB BSON document
    // limit and dragged the whole comment thread through every feed read.
    // `commentCount` is the authoritative total for display and ranking.
    comments:  { type: [commentSchema], default: [] },
    commentCount: { type: Number, default: 0, index: true },
    hashtags:  { type: [String], default: [] },
    mentions:  { type: [String], default: [] },
    editedAt:  { type: Date, default: null },
    viewCount: { type: Number, default: 0 },
    reactions: {
        like:  { type: [String], default: [] },
        love:  { type: [String], default: [] },
        laugh: { type: [String], default: [] },
        fire:  { type: [String], default: [] },
        sad:   { type: [String], default: [] },
        angry: { type: [String], default: [] },
    },
    isRepost:       { type: Boolean, default: false },
    originalPostId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
    originalSender: { type: String, default: null },
    repostComment:  { type: String, default: "" },
    repostCount:    { type: Number, default: 0 },
    poll: {
        enabled:   { type: Boolean, default: false },
        options:   [pollOptionSchema],
        expiresAt: { type: Date, default: null },
    },
    isRemoved:     { type: Boolean, default: false },
    removedBy:     { type: String, default: null },
    removedReason: { type: String, default: "" },
    removedAt:     { type: Date, default: null },
    // Set by the GDPR anonymise endpoint when the original author was erased.
    // It has to be declared: the schema is strict, so the assignment was being
    // dropped on save and the flag read as "marked" while nothing was stored.
    isAnonymised:  { type: Boolean, default: false },
    expiresAt:     { type: Date, default: null },
    visibility:    { type: String, enum: ["public", "closeFriends"], default: "public" },
    theme: {
        type: { type: String, enum: ["default", "sunset", "ocean", "forest", "neon", "midnight", "rose", "gold"], default: "default" },
        bg:  { type: String, default: "" },
    },
    scheduledAt:  { type: Date, default: null },
    isScheduled:  { type: Boolean, default: false },
    communityId:  { type: mongoose.Schema.Types.ObjectId, ref: "Community", default: null },
    flair: {
        id:   { type: String, default: null },
        name: { type: String, default: null },
        color:{ type: String, default: null },
        emoji:{ type: String, default: null },
    },
    upvotes:   { type: [String], default: [] },
    downvotes: { type: [String], default: [] },
    score:     { type: Number, default: 0 },
    timeStamp: { type: Date, default: Date.now },
});

postSchema.index({ sender: 1, timeStamp: -1 });
postSchema.index({ sender: 1, isRemoved: 1, timeStamp: -1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ timeStamp: -1 });
// Correct: "auto-delete this post at expiresAt" is exactly what a TTL index on
// the post's own expiry means.
postSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// NOT indexed, deliberately. This used to be a TTL index on poll.expiresAt, which
// is a data-loss bug: a TTL index deletes the whole document it is on, so when
// a poll's expiry passed MongoDB deleted the post *and every comment on it*.
// Closing a poll is a UI concern — PollCard reads poll.expiresAt, shows the
// countdown, renders "Ended" and stops accepting votes — and it must never cost
// anyone their post. See routes/posts.js for where poll.expiresAt is now set.
postSchema.index({ likes: 1 });
postSchema.index({ originalPostId: 1 });
postSchema.index({ sender: 1, expiresAt: 1, isRemoved: 1, timeStamp: -1 });
postSchema.index({ "comments.sender": 1, "comments.likes": 1 });
postSchema.index({ timeStamp: -1, isRemoved: 1, expiresAt: 1 });
postSchema.index({ communityId: 1, timeStamp: -1 });
postSchema.index({ communityId: 1, score: -1 });
postSchema.index({ communityId: 1, flair: 1, timeStamp: -1 });
// Partial indexes backing the /reels feed: only video content is indexed, so it
// stays small no matter how much text/image content the site accumulates.
// Two are needed rather than one combined index, because a partialFilter can
// only reference fields the query actually filters on, and the reels query
// tests `videoUrl` for uploads and `linkPreview.videoId` for linked clips.
postSchema.index({ timeStamp: -1 }, { partialFilterExpression: { videoUrl: { $type: "string", $ne: "" } } });
postSchema.index({ timeStamp: -1 }, { partialFilterExpression: { "linkPreview.videoId": { $type: "string", $ne: "" } } });

module.exports = mongoose.models.Post || mongoose.model("Post", postSchema);
