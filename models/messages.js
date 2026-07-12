import mongoose from "mongoose";

const messagesSchema = new mongoose.Schema({
    text: { type: String, required: true },
    timeStamp: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false }
});

const Message = mongoose.models.Message || mongoose.model("Message", messagesSchema);

export default Message;