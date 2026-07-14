import mongoose from "mongoose";

const messagesSchema = new mongoose.Schema({
    text:      { type: String, default: "" },
    imageUrl:  { type: String, default: "" },
    sender:    { type: String, required: true },   // username
    recipient: { type: String, required: true },   // username
    color:     { type: String, default: "#3b82f6" }, // avatar bg color
    timeStamp: { type: Date, default: Date.now },
    isRead:    { type: Boolean, default: false },
    delivered: { type: Boolean, default: false },
});

messagesSchema.index({ sender: 1, recipient: 1, timeStamp: -1 });
messagesSchema.index({ recipient: 1, isRead: 1 });
messagesSchema.index({ sender: 1, timeStamp: -1 });
messagesSchema.index({ recipient: 1, timeStamp: -1 });

const Message = mongoose.models.Message || mongoose.model("Message", messagesSchema);

export default Message;