import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
    commentId: { type: String, required: true },
    text:      { type: String, default: "" },
    imageUrl:  { type: String, default: "" },
    sender:    { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    avatarUrl: { type: String, default: "" },
    parentId:  { type: String, default: null },
    timeStamp: { type: Date, default: Date.now },
});

const postSchema = new mongoose.Schema({
    text:      { type: String, default: "" },
    imageUrl:  { type: String, default: "" },
    sender:    { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    avatarUrl: { type: String, default: "" },
    likes:     { type: [String], default: [] },
    comments:  { type: [commentSchema], default: [] },
    hashtags:  { type: [String], default: [] },
    mentions:  { type: [String], default: [] },
    viewCount: { type: Number, default: 0 },
    reactions:  { type: Map, of: [{ type: String }], default: {} },
    visibility: { type: String, enum: ["public", "closeFriends"], default: "public" },
    timeStamp: { type: Date, default: Date.now },
});

postSchema.index({ sender: 1, timeStamp: -1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ timeStamp: -1 });

const Post = mongoose.models.Post || mongoose.model("Post", postSchema);
export default Post;
