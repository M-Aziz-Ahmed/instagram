const mongoose = require("mongoose");

const mediaBookmarkSchema = new mongoose.Schema({
    username:   { type: String, required: true },
    mediaType:  { type: String, enum: ["anime", "manga"], required: true },
    mediaId:    { type: String, required: true },
    title:      { type: String, default: "" },
    coverUrl:   { type: String, default: "" },
    status:     { type: String, default: "" },
    totalChapters: { type: Number, default: null },
    lastReadChapter: { type: String, default: null },
    lastReadChapterNum: { type: Number, default: null },
    readChapters: { type: [String], default: [] },
    readEpisode: { type: Number, default: null },
    lastWatchedEpisode: { type: Number, default: null },
    newReleaseAvailable: { type: Boolean, default: false },
    newReleaseCount: { type: Number, default: 0 },
    lastChecked: { type: Date, default: Date.now },
    createdAt:  { type: Date, default: Date.now },
    updatedAt:  { type: Date, default: Date.now },
});

mediaBookmarkSchema.index({ username: 1, mediaType: 1, mediaId: 1 }, { unique: true });
mediaBookmarkSchema.index({ username: 1, mediaType: 1 });
mediaBookmarkSchema.index({ username: 1, newReleaseAvailable: 1 });

module.exports = mongoose.models.MediaBookmark || mongoose.model("MediaBookmark", mediaBookmarkSchema);
