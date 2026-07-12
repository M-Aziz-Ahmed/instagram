import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
    username:    { type: String, default: "", trim: true },
    bio:         { type: String, default: "" },
    avatarColor: { type: String, default: "#3b82f6" },
    avatarUrl:   { type: String, default: "" },      // Cloudinary profile pic
    isVerified:  { type: Boolean, default: false },  // blue tick — admin only
    isAdmin:     { type: Boolean, default: false },
    roles:       [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }],
    createdAt:   { type: Date, default: Date.now },
});

userSchema.index({ username: 1 }, { sparse: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
