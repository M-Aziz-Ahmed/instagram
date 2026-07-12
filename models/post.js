import mongoose from "mongoose";

const postSchema = new mongoose.Schema({
    text:      { type: String, default: "" },
    imageUrl:  { type: String, default: "" },   // Cloudinary URL
    sender:    { type: String, required: true },
    color:     { type: String, default: "#3b82f6" },
    likes:     { type: [String], default: [] },  // array of usernames who liked
    timeStamp: { type: Date, default: Date.now },
});

const Post = mongoose.models.Post || mongoose.model("Post", postSchema);
export default Post;
