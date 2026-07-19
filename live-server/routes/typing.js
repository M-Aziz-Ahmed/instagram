const express = require("express");
const Typing = require("../models/typing");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// POST /
router.post("/", verifyToken, async (req, res) => {
    try {
        const { typingTo } = req.body;
        const username = (await User.findById(req.userId).select("username").lean())?.username;

        if (typingTo) {
            await Typing.findOneAndUpdate(
                { username },
                { typingTo, updatedAt: new Date() },
                { upsert: true, new: true, maxTimeMS: 5000 }
            );
        } else {
            await Typing.deleteOne({ username }).maxTimeMS(5000);
        }
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /
router.get("/", async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ error: "username required" });

        const typing = await Typing.findOne({ typingTo: username }).lean().maxTimeMS(5000);
        return res.json({ isTyping: !!typing, typingUser: typing?.username || "" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

module.exports = router;
