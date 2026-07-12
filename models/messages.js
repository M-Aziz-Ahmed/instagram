import mongoose from "mongoose";

const messagesSchema = new mongoose.Schema({
    text:      { type: String, required: true },
    sender:    { type: String, required: true },   // username
    color:     { type: String, default: "#3b82f6" }, // avatar bg color
    timeStamp: { type: Date, default: Date.now },
    isRead:    { type: Boolean, default: false },
});

const Message = mongoose.models.Message || mongoose.model("Message", messagesSchema);

export default Message;