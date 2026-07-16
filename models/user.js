import mongoose from "mongoose";
import "./role";

const userSchema = new mongoose.Schema({
    email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
    username:    { type: String, default: "", trim: true },
    bio:         { type: String, default: "" },
    avatarColor: { type: String, default: "#3b82f6" },
    avatarUrl:   { type: String, default: "" },
    isVerified:  { type: Boolean, default: false },
    isAdmin:     { type: Boolean, default: false },
    liveStreamAllowed: { type: Boolean, default: false },
    roles:       [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }],
    followers:   [{ type: String, default: [] }],
    following:   [{ type: String, default: [] }],
    bookmarks:   [{ type: String, default: [] }],
    closeFriends: [{ type: String, default: [] }],
    mutedWords:   [{ type: String, default: [] }],
    language:     { type: String, default: "en" },
    autoTranslate: { type: Boolean, default: false },
    lastActive:   { type: Date, default: Date.now },
    isOnline:     { type: Boolean, default: false },
    createdAt:   { type: Date, default: Date.now },
});

userSchema.index({ username: 1 }, { sparse: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
