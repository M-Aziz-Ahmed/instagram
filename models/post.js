import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
    text:      { type: String, required: true },
    sender:    { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    timeStamp: { type: Date, default: Date.now },
});

const postSchema = new mongoose.Schema({
    text:      { type: String, default: "" },
    imageUrl:  { type: String, default: "" },
    sender:    { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    likes:     { type: [String], default: [] },
    comments:  { type: [commentSchema], default: [] },
    timeStamp: { type: Date, default: Date.now },
});

const Post = mongoose.models.Post || mongoose.model("Post", postSchema);
export default Post;
