const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();
const MediaBookmark = require("../models/mediaBookmark");

const ANILIST_URL = "https://graphql.anilist.co";

async function findAnilistId(mediaType, title, fallbackId) {
    if (!title) return fallbackId;
    try {
        const query = `
            query ($search: String, $type: MediaType) {
                Page(perPage: 5) {
                    media(search: $search, type: $type) {
                        id
                        title { romaji english native }
                    }
                }
            }
        `;
        const res = await fetch(ANILIST_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": "AnonTweet/1.0" },
            body: JSON.stringify({
                query,
                variables: { search: title, type: mediaType === "anime" ? "ANIME" : "MANGA" }
            }),
            timeout: 8000,
        });
        const data = await res.json();
        const results = data.data?.Page?.media || [];
        if (results.length === 0) return fallbackId;

        const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, "");
        let match = results.find(m => {
            const t = (m.title.romaji || m.title.english || m.title.native || "").toLowerCase().replace(/[^a-z0-9]/g, "");
            return t === normalized;
        });
        if (!match) match = results.find(m => {
            const t = (m.title.romaji || m.title.english || m.title.native || "").toLowerCase();
            return t.includes(title.toLowerCase()) || title.toLowerCase().includes(t);
        });
        if (!match) match = results[0];
        return match.id.toString();
    } catch {
        return fallbackId;
    }
}

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

// GET /api/media-bookmarks/export — export user bookmarks as JSON
router.get("/export", requireAuth, async (req, res) => {
    try {
        const username = await getUsername(req);
        if (!username) return res.status(401).json({ error: "Unauthorized" });
        const bookmarks = await MediaBookmark.find({ username }).lean();
        const data = {
            username,
            exportedAt: new Date().toISOString(),
            bookmarks,
        };
        res.json(data);
    } catch (err) {
        console.error("Export bookmarks error:", err.message);
        res.status(500).json({ error: "Failed to export bookmarks" });
    }
});

// POST /api/media-bookmarks/import — import bookmarks from external source
router.post("/import", optionalAuth, async (req, res) => {
    try {
        const sourceUsername = req.body.username || (req.userId ? await getUsername(req) : null);
        if (!sourceUsername) return res.status(401).json({ error: "Source user required" });
        const { bookmarks, source } = req.body;
        if (!Array.isArray(bookmarks)) return res.status(400).json({ error: "Invalid bookmark data" });

        let imported = 0;
        const results = [];

        for (const b of bookmarks) {
            const {
                username,
                mediaType,
                mediaId,
                title,
                coverUrl,
                status,
                totalChapters,
                readChapters,
                lastReadChapter,
                lastReadChapterId,
                lastReadChapterNum,
                lastWatchedEpisode,
                readEpisode,
                newReleaseAvailable,
                newReleaseCount,
                lastChecked,
                createdAt,
                updatedAt,
                _id,
                externalIds,
            } = b;

            if (!mediaType || (!mediaId && !title)) continue;

            // Cross-site ID mapping: try to find AniList ID by title
            let mappedId = mediaId;
            if (title && (source || !/^\d+$/.test(mediaId))) {
                mappedId = await findAnilistId(mediaType, title, mediaId);
            }

            // Check for existing bookmark (use mapped ID)
            const existing = await MediaBookmark.findOne({ username: sourceUsername, mediaType, mediaId: mappedId });
            if (existing) {
                results.push({ mediaId: mappedId, title, status: "skipped", reason: "already exists" });
                continue;
            }

            await MediaBookmark.create({
                username: sourceUsername,
                mediaType,
                mediaId: mappedId,
                title: title || "",
                coverUrl: coverUrl || "",
                status: status || "",
                totalChapters: totalChapters || null,
                lastReadChapter: lastReadChapter || null,
                lastReadChapterId: lastReadChapterId || null,
                lastReadChapterNum: lastReadChapterNum || null,
                readChapters: readChapters || [],
                lastWatchedEpisode: lastWatchedEpisode || null,
                readEpisode: readEpisode || null,
                newReleaseAvailable: newReleaseAvailable || false,
                newReleaseCount: newReleaseCount || 0,
                lastChecked: lastChecked ? new Date(lastChecked) : new Date(),
                createdAt: createdAt ? new Date(createdAt) : new Date(),
                updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
            });
            imported++;
            results.push({ mediaId: mappedId, title, status: "imported", sourceId: mediaId });
        }

        const updated = await MediaBookmark.find({ username: sourceUsername }).sort({ updatedAt: -1 }).lean();
        res.json({ imported, results, bookmarks: updated });
    } catch (err) {
        console.error("Import bookmarks error:", err.message);
        res.status(500).json({ error: "Failed to import bookmarks" });
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

// Cross-site ID mapping: find AniList ID by title using AniList search
async function findAnilistId(mediaType, title, fallbackId) {
    try {
        const query = mediaType === "anime"
            ? `query ($search: String) { Media(search: $search, type: ANIME) { id title { romaji english native } } }`
            : `query ($search: String) { Media(search: $search, type: MANGA) { id title { romaji english native } } }`;
        const res = await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": "AnonTweet/1.0" },
            body: JSON.stringify({ query, variables: { search: title } }),
            timeout: 8000,
        });
        if (!res.ok) return fallbackId;
        const data = await res.json();
        const media = data.data?.Media;
        if (media?.id) return String(media.id);
    } catch {}
    return fallbackId;
}

module.exports = router;
