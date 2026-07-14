import mongoose from "mongoose";

const typingSchema = new mongoose.Schema({
    username:  { type: String, required: true, unique: true },
    typingTo:  { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now, expires: 15 },
});

const Typing = mongoose.models.Typing || mongoose.model("Typing", typingSchema);
export default Typing;
