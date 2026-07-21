const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();
const MediaBookmark = require("../models/mediaBookmark");

function optionalAuth(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.af_session;
    if (!token) return next();
    try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
        req.userId = decoded.userId;
    } catch {}
    next();
}

function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.af_session;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
        req.userId = decoded.userId;
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
    next();
}

const User = require("../models/user");

async function getUsername(req) {
    if (!req.userId) return null;
    const user = await User.findById(req.userId).select("username").lean();
    return user?.username;
}

// GET /api/media-bookmarks — list user's bookmarks, optionally filter by type
router.get("/", requireAuth, async (req, res) => {
    try {
        const username = await getUsername(req);
        if (!username) return res.status(401).json({ error: "Unauthorized" });
        const { mediaType } = req.query;
        const filter = { username };
        if (mediaType) filter.mediaType = mediaType;
        const bookmarks = await MediaBookmark.find(filter).sort({ updatedAt: -1 }).lean();
        return res.json(bookmarks);
    } catch (err) {
        console.error("List bookmarks error:", err.message);
        return res.status(500).json({ error: "Failed to list bookmarks" });
    }
});

// GET /api/media-bookmarks/check — check which media IDs are bookmarked by user
router.get("/check", requireAuth, async (req, res) => {
    try {
        const username = await getUsername(req);
        if (!username) return res.json({ bookmarked: {} });
        const { ids, mediaType } = req.query;
        if (!ids) return res.json({ bookmarked: {} });
        const idList = ids.split(",").filter(Boolean);
        const filter = { username, mediaId: { $in: idList } };
        if (mediaType) filter.mediaType = mediaType;
        const bookmarks = await MediaBookmark.find(filter).select("mediaId mediaType").lean();
        const map = {};
        bookmarks.forEach(b => { map[b.mediaId] = true; });
        return res.json({ bookmarked: map });
    } catch (err) {
        console.error("Check bookmarks error:", err.message);
        return res.status(500).json({ error: "Failed to check bookmarks" });
    }
});

// POST /api/media-bookmarks — add a bookmark
router.post("/", requireAuth, async (req, res) => {
    try {
        const username = await getUsername(req);
        if (!username) return res.status(401).json({ error: "Unauthorized" });
        const { mediaType, mediaId, title, coverUrl, status, totalChapters } = req.body;
        if (!mediaType || !mediaId) return res.status(400).json({ error: "mediaType and mediaId required" });

        const existing = await MediaBookmark.findOne({ username, mediaType, mediaId });
        if (existing) return res.json(existing);

        const bookmark = await MediaBookmark.create({
            username, mediaType, mediaId,
            title: title || "",
            coverUrl: coverUrl || "",
            status: status || "",
            totalChapters: totalChapters || null,
        });
        return res.status(201).json(bookmark);
    } catch (err) {
        console.error("Add bookmark error:", err.message);
        return res.status(500).json({ error: "Failed to add bookmark" });
    }
});

// DELETE /api/media-bookmarks/:mediaType/:mediaId — remove a bookmark
router.delete("/:mediaType/:mediaId", requireAuth, async (req, res) => {
    try {
        const username = await getUsername(req);
        if (!username) return res.status(401).json({ error: "Unauthorized" });
        const { mediaType, mediaId } = req.params;
        await MediaBookmark.deleteOne({ username, mediaType, mediaId });
        return res.json({ ok: true });
    } catch (err) {
        console.error("Remove bookmark error:", err.message);
        return res.status(500).json({ error: "Failed to remove bookmark" });
    }
});

// PATCH /api/media-bookmarks/:mediaType/:mediaId/history — update read/watch history
router.patch("/:mediaType/:mediaId/history", requireAuth, async (req, res) => {
    try {
        const username = await getUsername(req);
        if (!username) return res.status(401).json({ error: "Unauthorized" });
        const { mediaType, mediaId } = req.params;
        const { chapterId, chapterNum, chapterTitle, episodeNum, title, coverUrl } = req.body;

        const update = { updatedAt: new Date() };
        if (title) update.title = title;
        if (coverUrl) update.coverUrl = coverUrl;

        if (mediaType === "manga") {
            if (chapterId) {
                update.$addToSet = { readChapters: chapterId };
                update.lastReadChapterId = chapterId;
            }
            if (chapterNum != null) {
                update.lastReadChapter = chapterTitle || `Chapter ${chapterNum}`;
                update.lastReadChapterNum = typeof chapterNum === "number" ? chapterNum : parseFloat(chapterNum) || 0;
            }
        } else if (mediaType === "anime") {
            if (episodeNum != null) {
                update.lastWatchedEpisode = episodeNum;
                update.readEpisode = episodeNum;
            }
        }

        const bookmark = await MediaBookmark.findOneAndUpdate(
            { username, mediaType, mediaId },
            update,
            { new: true, upsert: false }
        );
        if (!bookmark) return res.status(404).json({ error: "Bookmark not found" });
        return res.json(bookmark);
    } catch (err) {
        console.error("Update history error:", err.message);
        return res.status(500).json({ error: "Failed to update history" });
    }
});

// PATCH /api/media-bookmarks/:mediaType/:mediaId/dismiss — dismiss new release notification
router.patch("/:mediaType/:mediaId/dismiss", requireAuth, async (req, res) => {
    try {
        const username = await getUsername(req);
        if (!username) return res.status(401).json({ error: "Unauthorized" });
        const { mediaType, mediaId } = req.params;
        const bookmark = await MediaBookmark.findOneAndUpdate(
            { username, mediaType, mediaId },
            { newReleaseAvailable: false, newReleaseCount: 0 },
            { new: true }
        );
        if (!bookmark) return res.status(404).json({ error: "Bookmark not found" });
        return res.json(bookmark);
    } catch (err) {
        console.error("Dismiss release error:", err.message);
        return res.status(500).json({ error: "Failed to dismiss" });
    }
});

// POST /api/media-bookmarks/check-releases — background endpoint to check new releases
router.post("/check-releases", requireAuth, async (req, res) => {
    try {
        const username = await getUsername(req);
        if (!username) return res.status(401).json({ error: "Unauthorized" });

        const bookmarks = await MediaBookmark.find({ username });
        let updated = 0;

        for (const bm of bookmarks) {
            try {
                if (bm.mediaType === "manga") {
                    const chaptersRes = await fetch(
                        `https://api.mangadex.org/manga/${bm.mediaId}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=5&offset=0`,
                        { timeout: 10000, headers: { "User-Agent": "AnonTweet/1.0" } }
                    );
                    if (!chaptersRes.ok) continue;
                    const chaptersData = await chaptersRes.json();
                    const chapters = chaptersData.data || [];
                    const latestNum = chapters.length > 0
                        ? parseFloat(chapters[0].attributes?.chapter || "0")
                        : 0;
                    if (latestNum > (bm.lastReadChapterNum || 0) && bm.lastReadChapterNum != null) {
                        const unread = chapters.filter(c => {
                            const num = parseFloat(c.attributes?.chapter || "0");
                            return num > (bm.lastReadChapterNum || 0) && !bm.readChapters.includes(c.id);
                        });
                        if (unread.length > 0) {
                            await MediaBookmark.updateOne(
                                { _id: bm._id },
                                { newReleaseAvailable: true, newReleaseCount: unread.length, lastChecked: new Date() }
                            );
                            updated++;
                        }
                    }
                } else if (bm.mediaType === "anime") {
                    const infoRes = await fetch(
                        `https://graphql.anilist.co`,
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "User-Agent": "AnonTweet/1.0" },
                            body: JSON.stringify({
                                query: `query ($id: Int) { Media(id: $id, type: ANIME) { episodes } }`,
                                variables: { id: parseInt(bm.mediaId) }
                            }),
                            timeout: 10000,
                        }
                    );
                    if (!infoRes.ok) continue;
                    const infoData = await infoRes.json();
                    const totalEps = infoData.data?.Media?.episodes;
                    if (totalEps && totalEps > (bm.lastWatchedEpisode || 0) && bm.lastWatchedEpisode != null) {
                        const diff = totalEps - (bm.lastWatchedEpisode || 0);
                        await MediaBookmark.updateOne(
                            { _id: bm._id },
                            { newReleaseAvailable: true, newReleaseCount: diff, lastChecked: new Date() }
                        );
                        updated++;
                    }
                }
            } catch {}
        }

        const updatedBookmarks = await MediaBookmark.find({ username }).sort({ updatedAt: -1 }).lean();
        return res.json({ updated, bookmarks: updatedBookmarks });
    } catch (err) {
        console.error("Check releases error:", err.message);
        return res.status(500).json({ error: "Failed to check releases" });
    }
});

module.exports = router;
