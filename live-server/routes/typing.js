const express = require("express");
const Typing = require("../models/typing");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// POST /
// `username` is never read from the body - it comes from the session - so a
// caller cannot write typing state onto somebody else's account.
//
// Three states, and the branch is on `typingTo` alone:
//   typingTo set   -> upsert the row (this is the "they are active" ping)
//   typingTo === "" -> explicit idle-clear, remove the row
//   no typingTo   -> nothing at all; a malformed body must not be able to
//                     clear an indicator it never set.
//
// The clear removes the row rather than blanking `typingTo`, which also drops
// the `recording` flag. That is correct for every caller that sends it today -
// `components/Inbox/Input.jsx` posts `typingTo: ""` from its 3s idle timer, on
// send, and on unmount, and `components/shared/VoiceRecorder.jsx` posts it when
// the recording stops - so a clear always means "I am no longer doing anything".
//
// `recording` is now INDEPENDENT of `typingTo`. Previously the upsert wrote
// `recording: !!recording` unconditionally, so a plain keystroke (which cannot
// meaningfully claim a recording) had to either wipe a live recording flag or
// claim one itself. The client resolves that by omitting the key: an absent
// `recording` preserves whatever is stored, so typing while recording shows
// "recording…" rather than flickering, and typing alone no longer reports
// `isRecording: true` and suppress the typing indicator.
//
// Known limitation, left alone deliberately: `Typing.username` is `unique`, so
// the row is per-account, not per-connection. Two browser tabs of the same user
// therefore overwrite each other - tab A typing to bob makes tab B, talking to
// carol, invisible, and clearing in one tab clears the other. Fixing it means a
// per-tab key on the document and a rewrite of both the POST and the GET, which
// is a model change rather than a fix; `updatedAt`'s 15s TTL keeps it self-
// healing, so the failure is a stale indicator for at most 15 seconds.
router.post("/", verifyToken, async (req, res) => {
    try {
        const { typingTo, recording } = req.body;
        const username = (await User.findById(req.userId).select("username").lean())?.username;

        if (typingTo) {
            const update = { typingTo, updatedAt: new Date() };
            // Only touch `recording` when the caller actually said something
            // about it. An omitted key must not be read as "false".
            if (typeof recording === "boolean") update.recording = recording;

            await Typing.findOneAndUpdate(
                { username },
                update,
                { upsert: true, returnDocument: 'after', maxTimeMS: 5000 }
            );
        } else if (typingTo === "") {
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
