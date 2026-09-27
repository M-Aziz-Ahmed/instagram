const express = require("express");
const mongoose = require("mongoose");
const { verifyToken } = require("../middleware/auth");
const User = require("../models/user");

const router = express.Router();

// HTTP surface for the call feature, existing only so the *service worker* can
// act on a call notification.
//
// Why this exists: answering a call needs two very different capabilities. A
// decline is a pure server-side signal and must work with the app closed, which
// a service worker can do with a plain authenticated fetch. An accept cannot —
// it needs getUserMedia and the socket.io signalling channel, neither of which
// exists in a worker. So the notification's Decline action POSTs here, while
// Accept focuses the app and lets the page do its normal job. See
// public/sw.js `notificationaction`.
//
// Authentication is the `af_session` cookie, which the browser sends
// automatically on a same-origin fetch, so the worker needs no token of its own.

const RINGING = "ringing";

// Resolved lazily. `call:initiate` in server.js wraps its persist in a try/catch
// because this model has historically been absent on some deployments, so a
// missing model must degrade to "no pending call", never crash the route.
function callSessionModel() {
    try {
        return mongoose.models.CallSession || mongoose.model("CallSession");
    } catch {
        return null;
    }
}

// The JWT payload is only { userId } (see routes/auth.js), so the username is
// always a lookup rather than a claim. Cached per-request by the caller.
async function usernameFor(req) {
    if (req._callUsername !== undefined) return req._callUsername;
    const user = await User.findById(req.userId).select("username").lean();
    req._callUsername = user?.username || null;
    return req._callUsername;
}

function isParticipant(session, username) {
    return session.caller === username || (session.recipients || []).includes(username);
}

// GET /:callId
// The ringing state for one call, so a page opened from a notification can
// rebuild what the socket would have told it. Without this the callee lands on
// /inbox with no ringing UI, because socket.io does not replay `call:incoming`
// to a client that was disconnected when it was emitted.
router.get("/:callId", verifyToken, async (req, res) => {
    const Model = callSessionModel();
    if (!Model) return res.status(503).json({ error: "Call history unavailable" });

    const username = await usernameFor(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const callId = String(req.params.callId || "").trim();
    if (!callId) return res.status(400).json({ error: "callId is required" });

    try {
        const session = await Model.findOne({ callId }).lean();
        if (!session) return res.status(404).json({ error: "Call not found" });
        if (!isParticipant(session, username)) {
            return res.status(403).json({ error: "Not a participant in this call" });
        }
        return res.json({
            callId: session.callId,
            type: session.type,
            groupId: session.groupId || null,
            caller: session.caller,
            recipients: session.recipients || [],
            callType: session.callType,
            status: session.status,
            isCaller: session.caller === username,
            // Only a still-ringing call is actionable. This is what lets the
            // client decline to re-ring a call that timed out or was cancelled
            // while the notification sat in the tray.
            actionable: session.status === RINGING,
        });
    } catch (err) {
        console.error("[CALLS] GET error:", err);
        return res.status(500).json({ error: "Failed to load call" });
    }
});

// POST /:callId/decline
// Answers "no" to a ringing call from the notification, with the app closed.
// Marks the session declined and tells the caller's socket, which is what makes
// the caller see "declined" instead of ringing forever.
router.post("/:callId/decline", verifyToken, async (req, res) => {
    const Model = callSessionModel();
    if (!Model) return res.status(503).json({ error: "Call history unavailable" });

    const username = await usernameFor(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const callId = String(req.params.callId || "").trim();
    if (!callId) return res.status(400).json({ error: "callId is required" });

    try {
        const session = await Model.findOne({ callId }).lean();
        if (!session) return res.status(404).json({ error: "Call not found" });
        if (!isParticipant(session, username)) {
            return res.status(403).json({ error: "Not a participant in this call" });
        }
        // Idempotent by design: a double-tap on the notification action, or a
        // decline racing the 30s ring timeout, must not emit twice.
        if (session.status !== RINGING) {
            return res.json({ ok: true, callId, status: session.status, alreadyResolved: true });
        }

        await Model.updateOne({ callId }, { status: "declined", endedAt: new Date() });

        const io = req.app.locals.io;
        if (io) {
            const payload = { callId, username };
            // The caller joined `call:<id>` at initiate, and every recipient that
            // accepted joined it too, so one room emit reaches both sides.
            io.to(`call:${callId}`).emit("call:rejected", payload);
            // Belt and braces for a recipient whose socket is connected but was
            // never in the room (it only joins on call:accept).
            io.to(session.caller).emit("call:rejected", payload);
        }

        return res.json({ ok: true, callId, status: "declined" });
    } catch (err) {
        console.error("[CALLS] decline error:", err);
        return res.status(500).json({ error: "Failed to decline call" });
    }
});

module.exports = router;
