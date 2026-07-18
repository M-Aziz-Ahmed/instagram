import mongoose from "mongoose";

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
    timeStamp: { type: Date, default: Date.now },
});

const pollOptionSchema = new mongoose.Schema({
    text:      { type: String, required: true },
    votes:     { type: [String], default: [] }, // anonymous usernames (or "anonymous:ip" for anon voting)
}, { _id: false });

const postSchema = new mongoose.Schema({
    text:      { type: String, default: "" },
    imageUrl:  { type: String, default: "" },
    audioUrl:  { type: String, default: "" },
    sender:    { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    avatarUrl: { type: String, default: "" },
    likes:     { type: [String], default: [] },
    comments:  { type: [commentSchema], default: [] },
    hashtags:  { type: [String], default: [] },
    mentions:  { type: [String], default: [] },
    viewCount: { type: Number, default: 0 },
    
    // Enhanced reactions: { type: count }
    reactions: { 
        like:  { type: [String], default: [] },
        love:  { type: [String], default: [] },
        laugh: { type: [String], default: [] },
        fire:  { type: [String], default: [] },
        sad:   { type: [String], default: [] },
        angry: { type: [String], default: [] },
    },
    
    // Repost functionality
    isRepost:       { type: Boolean, default: false },
    originalPostId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
    originalSender: { type: String, default: null },
    repostComment:  { type: String, default: "" },
    repostCount:    { type: Number, default: 0 },
    
    // Anonymous poll
    poll: {
        enabled:   { type: Boolean, default: false },
        options:   [pollOptionSchema],
        expiresAt: { type: Date, default: null },
    },

    // Auto-delete timer
    expiresAt: { type: Date, default: null },
    
    visibility: { type: String, enum: ["public", "closeFriends"], default: "public" },
    timeStamp: { type: Date, default: Date.now },
});

postSchema.index({ sender: 1, timeStamp: -1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ timeStamp: -1 });
postSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
postSchema.index({ "poll.expiresAt": 1 }, { expireAfterSeconds: 0 });

const Post = mongoose.models.Post || mongoose.model("Post", postSchema);
export default Post;
