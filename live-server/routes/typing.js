const express = require("express");
const Typing = require("../models/typing");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// POST /
router.post("/", verifyToken, async (req, res) => {
    try {
        const { typingTo, recording } = req.body;
        const username = (await User.findById(req.userId).select("username").lean())?.username;

        if (typingTo) {
            await Typing.findOneAndUpdate(
                { username },
                { typingTo, recording: !!recording, updatedAt: new Date() },
                { upsert: true, returnDocument: 'after', maxTimeMS: 5000 }
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
// Requires a session, and only answers for a conversation the caller is actually
// part of. This used to be unauthenticated: anyone could ask "is <username>
// typing?" for any username and get a real-time answer, which is both a privacy
// leak and a way to confirm an account exists.
router.get("/", verifyToken, async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ error: "username required" });

        const me = await User.findById(req.userId).select("username").lean();
        const caller = me?.username;
        if (!caller) return res.status(401).json({ error: "Unauthorized" });

        // Either direction of the same conversation is a legitimate question:
        // "is my chat partner typing to me" and "am I typing to them" are the
        // same row. Anything else is someone third-party snooping.
        const typing = await Typing.findOne({
            $or: [{ typingTo: username }, { username: caller }],
        }).lean().maxTimeMS(5000);

        if (!typing) {
            return res.json({ isTyping: false, isRecording: false, typingUser: "" });
        }

        // Only surface the other party. When the row is the caller's own, it
        // means *they* are typing, which is not something to render as an
        // incoming indicator.
        const other = typing.username === caller ? typing.typingTo : typing.username;
        if (!other || other === caller) {
            return res.json({ isTyping: false, isRecording: false, typingUser: "" });
        }

        return res.json({
            isTyping: !!typing && !typing.recording,
            isRecording: !!typing?.recording,
            typingUser: other,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed" });
    }
});

module.exports = router;
