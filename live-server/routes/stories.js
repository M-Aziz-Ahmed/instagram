const express = require("express");
const Story = require("../models/story");
const Message = require("../models/messages");
const Notification = require("../models/notification");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// GET /
router.get("/", async (req, res) => {
    try {
        const { username } = req.query;
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        let query = { createdAt: { $gt: cutoff } };

        if (username) {
            const user = await User.findOne({ username }).select("following").lean();
            const visibleUsernames = [username, ...((user?.following) || [])];
            query.sender = { $in: visibleUsernames };
        }

        const stories = await Story.find(query)
            .sort({ createdAt: -1 }).limit(100).lean();

        const grouped = {};
        stories.forEach((s) => {
            if (!grouped[s.sender]) grouped[s.sender] = [];
            grouped[s.sender].push(s);
        });

        const result = Object.entries(grouped)
            .map(([sender, items]) => ({
                sender,
                color: items[0].color,
                avatarUrl: items[0].avatarUrl,
                stories: items,
                seen: username ? items.every((s) => s.views?.includes(username)) : false,
                latestAt: items[0].createdAt,
            }))
            .sort((a, b) => {
                if (a.seen !== b.seen) return a.seen ? 1 : -1;
                return new Date(b.latestAt) - new Date(a.latestAt);
            });

        return res.json(result);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch stories" });
    }
});

// POST /
router.post("/", verifyToken, async (req, res) => {
    try {
        const { text, imageUrl: providedUrl, bgColor } = req.body;
        const senderDoc = await User.findById(req.userId).select("username avatarColor avatarUrl").lean();
        const sender = senderDoc?.username;
        if (!sender) return res.status(400).json({ error: "Sender required" });
        if (!text?.trim() && !providedUrl) {
            return res.status(400).json({ error: "Story must have text or image" });
        }

        const story = await Story.create({
            sender,
            color: senderDoc?.avatarColor || "#3b82f6",
            avatarUrl: senderDoc?.avatarUrl || "",
            imageUrl: providedUrl || "",
            text: text?.trim() ?? "",
            bgColor: bgColor || "#1a1a2e",
        });

        return res.status(201).json(story);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to create story" });
    }
});

// DELETE /:id
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const username = (await User.findById(req.userId).select("username").lean())?.username;

        const story = await Story.findById(id);
        if (!story) return res.status(404).json({ error: "Not found" });
        if (story.sender !== username) return res.status(403).json({ error: "Unauthorized" });

        await Story.findByIdAndDelete(id);
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to delete story" });
    }
});

// POST /:id/view
router.post("/:id/view", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const username = (await User.findById(req.userId).select("username").lean())?.username;

        const story = await Story.findById(id);
        if (!story) return res.status(404).json({ error: "Not found" });

        if (!story.views.includes(username)) {
            story.views.push(username);
            await story.save();
        }
        return res.json(story);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:id/reply
router.post("/:id/reply", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;
        const username = (await User.findById(req.userId).select("username").lean())?.username;

        const story = await Story.findById(id);
        if (!story) return res.status(404).json({ error: "Not found" });

        story.replies.push({ fromUser: username, text: text || "" });
        await story.save();

        if (story.sender !== username) {
            await Notification.create({
                recipient: story.sender,
                type: "message",
                fromUser: username,
                fromColor: story.color,
                postId: story._id.toString(),
                text: text?.slice(0, 80) || "Replied to your story",
            });

            await Message.create({
                text: text || "Replied to your story",
                sender: username,
                recipient: story.sender,
                color: story.color,
            });
        }

        return res.json(story);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to update story" });
    }
});

module.exports = router;
