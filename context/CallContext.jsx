"use client";

import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { useUser } from "./UserContext";
import { ICE_SERVERS, turnRelayMissing, logIceFailure as logIceFailureImpl } from "@/utils/iceServers";
import { startIncomingRing, startOutgoingRing, stopRing, unlockCallAudio } from "@/utils/callSound";
import { showBackgroundNotification } from "@/utils/systemNotification";
import { hasActivePushSubscription } from "@/utils/notifications";

const CallContext = createContext(null);

export function CallProvider({ children, socket }) {
    const { user } = useUser();
    const [callState, setCallState] = useState(null);
    // callState: { callId, type: "1:1"|"group", callType: "audio"|"video", caller, recipients, status: "ringing"|"connecting"|"active"|"ended" }
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState({}); // { username: MediaStream }
    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [videoOn, setVideoOn] = useState(false);
    const videoOnRef = useRef(false);
    const [isLoudspeaker, setIsLoudspeaker] = useState(false);

    const peerConnections = useRef({}); // { username: RTCPeerConnection }
    const localStreamRef = useRef(null);
    const callStateRef = useRef(null);
    const ringTimeout = useRef(null);
    // Buffered incoming offer until the callee accepts the call
    const pendingOfferRef = useRef(null); // { callId, from, sdp }
    // Buffered ICE candidates for a peer connection that doesn't exist yet, or
    // exists but has no remote description to attach them to.
    const candidateBufferRef = useRef({}); // { from: [candidate] }
    // Grace timers for "disconnected", and in-flight ICE-restart guards, keyed
    // by peer so one flaky peer cannot tear the whole call down.
    const disconnectTimersRef = useRef({});
    const restartTimersRef = useRef({});
    // Connections whose `negotiationneeded` arrived too early and is waiting for
    // the signalling stack to go quiet, so the event is not lost.
    const negotiationPendingRef = useRef(new Set());
    // Why the call failed, when it did. Without this the only symptom of a dead
    // relay is an indefinite "Connecting…".
    const [connectionError, setConnectionError] = useState(null);
    // callIds already rebuilt from the server, so a re-render or a second route
    // into the same call cannot re-arm the ring tone over the top of the user
    // having already declined it.
    const hydratedCallRef = useRef(null);

    // Keep ref in sync.
    //
    // `setCallState` alone is not enough, and relying on the effect alone was a
    // real bug: `call:incoming` and the caller's `call:signal` offer are emitted
    // back-to-back, so they can arrive in the same batch on one socket. The
    // handler for `call:incoming` calls setCallState, and React has not re-rendered
    // yet when the handler for the offer runs in the same task — so the offer saw
    // a null callState, judged it "another/unknown call", and dropped it. The
    // callee's screen rang, they pressed Accept, and there was no offer to answer:
    // the call hung on "Connecting…" with no error anywhere.
    //
    // So `applyCallState` writes the ref in the same synchronous turn as the
    // state update, and every write goes through it. The effect is kept only as
    // a backstop.
    const applyCallState = useCallback((next) => {
        const value = typeof next === "function" ? next(callStateRef.current) : next;
        callStateRef.current = value;
        setCallState(value);
        return value;
    }, []);

    useEffect(() => { callStateRef.current = callState; }, [callState]);
    useEffect(() => { videoOnRef.current = videoOn; }, [videoOn]);

    // Ring tone lifecycle: ring while "ringing" (incoming for callee, ringback
    // for caller), stop as soon as the state leaves it.
    useEffect(() => {
        if (!callState || callState.status !== "ringing") {
            stopRing();
            return;
        }
        unlockCallAudio();
        if (callState.caller === user?.username) {
            startOutgoingRing();
        } else {
            startIncomingRing();
        }
    }, [callState, user?.username]);

    const getLocalStream = useCallback(async (audio = true, video = false) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
            localStreamRef.current = stream;
            setLocalStream(stream);
            return stream;
        } catch (e) {
            console.error("Failed to get local stream:", e);
            return null;
        }
    }, []);

    const stopLocalStream = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        setLocalStream(null);
    }, []);

    const cleanup = useCallback(() => {
        Object.values(peerConnections.current).forEach(pc => {
            try { pc.close(); } catch {}
        });
        peerConnections.current = {};
        Object.values(disconnectTimersRef.current).forEach(clearTimeout);
        disconnectTimersRef.current = {};
        restartTimersRef.current = {};
        negotiationPendingRef.current.clear();
        stopLocalStream();
        setRemoteStreams({});
        applyCallState(null);
        setIsMuted(false);
        setIsDeafened(false);
        setVideoOn(false);
        setIsLoudspeaker(false);
        setConnectionError(null);
        if (ringTimeout.current) clearTimeout(ringTimeout.current);
        pendingOfferRef.current = null;
        candidateBufferRef.current = {};
    }, [stopLocalStream, applyCallState]);

    // ── ICE plumbing ─────────────────────────────────────────────────────────
    //
    // `addIceCandidate` rejects unless a remote description is already set, and
    // candidates routinely arrive first: the peer's `setLocalDescription` starts
    // gathering before its answer has finished travelling. The old code added
    // them straight away whenever a PC happened to exist and swallowed the
    // rejection with `.catch(() => {})`, so every early candidate was discarded
    // permanently — and the answer branch, the one place a late candidate was
    // likely to land on a caller, never drained the buffer at all.
    //
    // On a normal network the surviving srflx/host candidates are enough to
    // connect, so this stayed invisible. Behind a restrictive NAT the relay
    // candidate is the ONLY route, so losing exactly those is what made the call
    // hang for some users and work for everyone else.
    const flushIceBuffer = useCallback(async (peerUsername) => {
        const buffered = candidateBufferRef.current[peerUsername];
        const pc = peerConnections.current[peerUsername];
        if (!buffered || !buffered.length) return;
        candidateBufferRef.current[peerUsername] = [];
        if (!pc || pc.signalingState === "closed") return;
        for (const cand of buffered) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch {}
        }
    }, []);

    const logIceFailure = useCallback((label, pc, err) => {
        logIceFailureImpl(label, pc, err);
        // Surface the real cause instead of leaving the user on "Connecting…".
        setConnectionError(
            turnRelayMissing()
                ? "Could not connect. No TURN relay is configured, so calls cannot connect from networks that block direct peer-to-peer traffic."
                : "Could not connect. Both peers may be behind a network that blocks direct connections, or the TURN relay is unreachable."
        );
    }, []);

    const offerIceRestart = useCallback(async (pc, peerUsername) => {
        const cs = callStateRef.current;
        if (!cs || !socket) return;
        try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            if (pc.localDescription) {
                socket.emit("call:signal", {
                    callId: cs.callId,
                    to: peerUsername,
                    signal: { type: "offer", sdp: pc.localDescription },
                });
            }
        } catch (e) {
            logIceFailure(`ice-restart ${peerUsername}`, pc, e);
        }
    }, [socket, logIceFailure]);

    const attemptIceRestart = useCallback((pc, peerUsername) => {
        if (restartTimersRef.current[peerUsername] || pc.signalingState === "closed") return;
        restartTimersRef.current[peerUsername] = true;
        offerIceRestart(pc, peerUsername).finally(() => {
            delete restartTimersRef.current[peerUsername];
        });
    }, [offerIceRestart]);

    const scheduleDisconnectRecovery = useCallback((pc, peerUsername) => {
        if (disconnectTimersRef.current[peerUsername]) return;
        disconnectTimersRef.current[peerUsername] = setTimeout(() => {
            delete disconnectTimersRef.current[peerUsername];
            // Still down after the grace period: escalate to a real ICE restart
            // rather than deleting the peer, which left the UI with no way back.
            if (pc.connectionState === "disconnected") {
                attemptIceRestart(pc, peerUsername);
            }
        }, 5000);
    }, [attemptIceRestart]);

    const createPeerConnection = useCallback((peerUsername, stream, isInitiator) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnections.current[peerUsername] = pc;

        // Add local tracks
        if (stream) {
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
        }

        // Handle remote stream
        pc.ontrack = (event) => {
            const [remoteStream] = event.streams;
            if (remoteStream) {
                setRemoteStreams(prev => ({ ...prev, [peerUsername]: remoteStream }));
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate && socket) {
                const cs = callStateRef.current;
                if (cs) {
                    socket.emit("call:signal", {
                        callId: cs.callId,
                        to: peerUsername,
                        signal: { type: "candidate", candidate: event.candidate },
                    });
                }
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") {
                // Transition the UI out of "Connecting..." as soon as media can flow.
                applyCallState(prev => prev ? { ...prev, status: "active" } : prev);
                setConnectionError(null);
                flushIceBuffer(peerUsername);
            } else if (pc.connectionState === "failed") {
                // Genuinely unrecoverable as-is: try one ICE restart, which
                // re-gathers candidates. This is the path that rescues a call
                // whose network changed mid-call (switching Wi-Fi <-> cellular),
                // and it is also the only recovery the call path had at all —
                // VoiceChat has the same ladder, but calls never did.
                attemptIceRestart(pc, peerUsername);
            } else if (pc.connectionState === "disconnected") {
                // "disconnected" is usually a transient blip and recovers on its
                // own within seconds. Deleting the remote stream here destroyed
                // the peer UI and left nothing to restore it, so a one-packet
                // network hiccup ended the call visually for both sides. Start
                // a grace timer instead, and only give up if it never returns.
                scheduleDisconnectRecovery(pc, peerUsername);
            }
        };

        // Renegotiation handler for adding/removing tracks (video toggle, screen share)
        pc.onnegotiationneeded = async () => {
            // An event that arrives while we are not `stable` is DROPPED, and
            // unlike `negotiationneeded` it does not re-fire on its own. Two
            // peers toggling video at the same moment both hit this, each kept
            // their own added track, and the connection ended up with mismatched
            // m-lines: video negotiated on one side only. Deferring until the
            // stack is stable keeps the event instead of losing it.
            if (pc.signalingState !== "stable") {
                if (negotiationPendingRef.current.has(pc)) return;
                negotiationPendingRef.current.add(pc);
                const wait = async () => {
                    for (let i = 0; i < 100 && pc.signalingState !== "stable"; i++) {
                        await new Promise((r) => setTimeout(r, 50));
                    }
                    negotiationPendingRef.current.delete(pc);
                    if (pc.signalingState === "stable") pc.onnegotiationneeded?.();
                };
                wait();
                return;
            }
            const cs = callStateRef.current;
            if (!cs || !socket) return;
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                if (pc.localDescription) {
                    socket.emit("call:signal", {
                        callId: cs.callId,
                        to: peerUsername,
                        signal: { type: "offer", sdp: pc.localDescription },
                    });
                }
            } catch (e) {
                logIceFailure(`renegotiate ${peerUsername}`, pc, e);
            }
        };

        return pc;
    }, [socket, applyCallState, flushIceBuffer, attemptIceRestart, scheduleDisconnectRecovery, logIceFailure]);

    const startCall = useCallback(async (recipient, callType = "audio", groupId = null) => {
        if (!user || !socket) return;
        unlockCallAudio();
        const callId = `call_${user.username}_${Date.now()}`;
        const video = callType === "video";
        const stream = await getLocalStream(true, video);
        if (!stream) return;

        const cs = {
            callId,
            type: groupId ? "group" : "1:1",
            callType,
            caller: user.username,
            recipients: [recipient],
            status: "ringing",
        };
        applyCallState(cs);

        // Give up ringing if the callee never answers (e.g. offline).
        ringTimeout.current = setTimeout(() => {
            const cur = callStateRef.current;
            if (cur && cur.caller === user.username && cur.status === "ringing") {
                cleanup();
            }
        }, 45000);

        // Create peer connection and initiate offer
        const pc = createPeerConnection(recipient, stream, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("call:initiate", {
            callId,
            caller: user.username,
            recipients: [recipient],
            callType,
            groupId,
        });

        // Send the initial offer via signal
        socket.emit("call:signal", {
            callId,
            to: recipient,
            signal: { type: "offer", sdp: pc.localDescription },
        });
    }, [user, socket, getLocalStream, createPeerConnection, cleanup, applyCallState]);

    const startGroupCall = useCallback(async (recipients, callType = "audio") => {
        if (!user || !socket || !recipients.length) return;
        unlockCallAudio();
        const callId = `groupcall_${user.username}_${Date.now()}`;
        const video = callType === "video";
        const stream = await getLocalStream(true, video);
        if (!stream) return;

        const cs = {
            callId,
            type: "group",
            callType,
            caller: user.username,
            recipients,
            status: "ringing",
        };
        applyCallState(cs);

        // Manage ringing timeout for the whole group call
        ringTimeout.current = setTimeout(() => {
            const cur = callStateRef.current;
            if (cur && cur.caller === user.username && cur.status === "ringing") {
                cleanup();
            }
        }, 45000);

        // Notify all recipients
        socket.emit("call:initiate", {
            callId,
            caller: user.username,
            recipients,
            callType,
            groupId: null,
        });

        // Create offers to each recipient
        for (const recipient of recipients) {
            const pc = createPeerConnection(recipient, stream, true);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("call:signal", {
                callId,
                to: recipient,
                signal: { type: "offer", sdp: pc.localDescription },
            });
        }
    }, [user, socket, getLocalStream, createPeerConnection, cleanup, applyCallState]);

    const acceptCall = useCallback(async (callId) => {
        if (!user || !socket) return;
        unlockCallAudio();
        const cs = callStateRef.current;
        if (!cs || cs.callId !== callId) return;
        const video = cs.callType === "video";
        const stream = await getLocalStream(true, video);
        if (!stream) return;

        applyCallState(prev => prev ? { ...prev, status: "connecting" } : null);

        socket.emit("call:accept", { callId, username: user.username });

        // The caller's offer (and its ICE candidates) may have arrived while we
        // were still ringing. Establish the peer connection only now that the
        // user actually accepted.
        const pending = pendingOfferRef.current;
        if (!pending || pending.callId !== callId) {
            // Accepted with no offer in hand. This happens when the callee was
            // offline when the caller sent it: socket.io relays to a room the
            // callee has not joined yet and does not replay the offer when they
            // connect, so there is nothing to answer. Previously the UI just sat
            // on "Connecting…" — and the 45s ring timeout cannot rescue it
            // because it only fires while status is "ringing". So ask the caller
            // to send a fresh one, which it can do since it is still holding its
            // peer connection.
            socket.emit("call:offer-missed", { callId, username: user.username });
            return;
        }

        pendingOfferRef.current = null;
        {
            const { from, sdp } = pending;
            const local = localStreamRef.current || stream;
            let pc = peerConnections.current[from];
            if (pc && (pc.signalingState === "closed" || pc.connectionState === "failed")) {
                try { pc.close(); } catch {}
                pc = null;
            }
            if (!pc) pc = createPeerConnection(from, local, false);

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit("call:signal", {
                    callId,
                    to: from,
                    signal: { type: "answer", sdp: pc.localDescription },
                });

                await flushIceBuffer(from);
            } catch (e) {
                logIceFailure(`accept ${from}`, pc, e);
            }
        }
    }, [user, socket, getLocalStream, createPeerConnection, applyCallState, flushIceBuffer, logIceFailure]);

    const rejectCall = useCallback(() => {
        const cs = callStateRef.current;
        if (cs && socket) {
            socket.emit("call:reject", { callId: cs.callId });
        }
        cleanup();
    }, [socket, cleanup]);

    // Enter the ringing state for an incoming call, from either delivery path.
    //
    // The page-side OS notification is only raised when the service worker is
    // not already handling it. When a push subscription exists the worker
    // raises the notification itself — with accept/decline actions, which
    // `new Notification()` cannot express at all — so doing it here too would
    // put two notifications on screen for one call. The `call_<callId>` tag is
    // shared deliberately: a tag makes the platform replace rather than stack,
    // so even if both fire the user sees one.
    const beginRinging = useCallback((call, { notify = true } = {}) => {
        if (callStateRef.current) return; // Already in a call
        applyCallState({
            callId: call.callId,
            type: call.type || (call.groupId ? "group" : "1:1"),
            callType: call.callType,
            caller: call.caller,
            recipients: call.recipients || [],
            status: "ringing",
        });
        if (notify) {
            hasActivePushSubscription().then((swHandlesIt) => {
                if (swHandlesIt) return;
                showBackgroundNotification(`Incoming ${call.callType === "video" ? "video" : "audio"} call`, {
                    body: `${call.caller} is calling you`,
                    url: `/inbox?call=${encodeURIComponent(call.callId)}`,
                    tag: `call_${call.callId}`,
                });
            });
        }
        // Auto-reject after 30 seconds
        if (ringTimeout.current) clearTimeout(ringTimeout.current);
        ringTimeout.current = setTimeout(() => {
            if (callStateRef.current?.status === "ringing") {
                rejectCall();
            }
        }, 30000);
    }, [rejectCall, applyCallState]);

    // Rebuild ringing state for a call the user opened from its notification.
    //
    // `call:incoming` is a live socket event and socket.io does not replay it to
    // a client that was disconnected when it was emitted. So for an offline
    // callee the push was the only delivery, and clicking it landed on a page
    // that had never heard of the call: no ringing UI, and both acceptCall and
    // rejectCall return early because they require callStateRef to already hold
    // the callId. The call was unanswerable. The push now carries ?call=<id>
    // and the state is read back from the server, which is the one place that
    // remembers it.
    const hydrateCallFromUrl = useCallback(async () => {
        if (!user?.username) return;
        if (callStateRef.current) return; // already in a call

        let callId = "";
        try {
            callId = new URLSearchParams(window.location.search).get("call") || "";
        } catch {
            return;
        }
        if (!callId) return;
        if (hydratedCallRef.current === callId) return;
        hydratedCallRef.current = callId;

        try {
            const res = await fetch(`/api/calls/${encodeURIComponent(callId)}`, { cache: "no-store" });
            if (!res.ok) return;
            const call = await res.json();
            // `actionable` is false once the call was cancelled, ended or timed
            // out while the notification sat in the tray. Re-ringing a dead call
            // is worse than showing nothing.
            if (!call?.actionable || call.isCaller) return;
            beginRinging(call, { notify: false });
        } catch {
            // Leave the marker set: retrying a call we cannot read would spin.
        }
    }, [user?.username, beginRinging]);

    // Runs on mount (covers the service worker opening a fresh window straight
    // at /inbox?call=...) and again on every client-side route the service
    // worker asks for, which is the path taken when a window was already open.
    useEffect(() => {
        hydrateCallFromUrl();
        const onNavigate = () => { hydrateCallFromUrl(); };
        window.addEventListener("sw:navigate", onNavigate);
        return () => window.removeEventListener("sw:navigate", onNavigate);
    }, [hydrateCallFromUrl]);

    const endCall = useCallback(() => {
        const cs = callStateRef.current;
        if (cs && socket) {
            socket.emit("call:end", { callId: cs.callId });
        }
        cleanup();
    }, [socket, cleanup]);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => {
            const next = !prev;
            if (localStreamRef.current) {
                localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
            }
            if (socket && callStateRef.current) {
                socket.emit("call:mute", { callId: callStateRef.current.callId, muted: next, deafened: isDeafened });
            }
            return next;
        });
    }, [socket, isDeafened]);

    const toggleDeafen = useCallback(() => {
        setIsDeafened(prev => {
            const next = !prev;
            if (localStreamRef.current) {
                localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
            }
            if (next) setIsMuted(true);
            else setIsMuted(false);
            if (socket && callStateRef.current) {
                socket.emit("call:mute", { callId: callStateRef.current.callId, muted: next, deafened: next });
            }
            return next;
        });
    }, [socket]);

    const toggleLoudspeaker = useCallback(() => {
        setIsLoudspeaker(prev => !prev);
    }, []);

    const toggleVideo = useCallback(async () => {
        const next = !videoOnRef.current;
        videoOnRef.current = next;
        setVideoOn(next);

        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = next;
            } else if (next) {
                // Need to add video track
                try {
                    const cam = await navigator.mediaDevices.getUserMedia({ video: true });
                    const track = cam.getVideoTracks()[0];
                    if (track) {
                        localStreamRef.current.addTrack(track);
                        Object.values(peerConnections.current).forEach(pc => {
                            pc.addTrack(track, localStreamRef.current);
                        });
                    }
                } catch {}
            }
        }

        if (socket && callStateRef.current) {
            socket.emit("call:video-toggle", { callId: callStateRef.current.callId, videoOn: next });
        }
    }, [socket]);

    // Socket event listeners
    useEffect(() => {
        if (!socket) return;

        const handleIncoming = (data) => {
            beginRinging({
                callId: data.callId,
                type: data.groupId ? "group" : "1:1",
                callType: data.callType,
                caller: data.caller,
                recipients: data.recipients || [],
            });
        };

        const handleSignal = async (data) => {
            const { callId, from, signal } = data;
            const cs = callStateRef.current;

            if (signal.type === "offer") {
                const isCurrent = cs && cs.callId === callId;
                if (!isCurrent) return; // offer for another/unknown call — ignore
                const accepted = cs.status === "connecting" || cs.status === "active";

                if (!accepted && cs.caller !== user?.username) {
                    // We're the callee and haven't accepted yet — hold the offer
                    // until Accept is pressed (acceptCall picks it up).
                    pendingOfferRef.current = { callId, from, sdp: signal.sdp };
                    return;
                }

                // We're already accepted (or the caller handling a renegotiation).
                const stream = localStreamRef.current || await getLocalStream(true, cs.callType === "video");
                if (!stream) return;

                let pc = peerConnections.current[from];
                // Reuse an established PC for renegotiation. Only a closed or
                // genuinely failed connection is replaced — "disconnected" is
                // often transient, and this used to close the PC and tear down
                // a call over a momentary blip.
                if (pc && (pc.signalingState === "closed" || pc.connectionState === "failed")) {
                    try { pc.close(); } catch {}
                    pc = null;
                }

                if (!pc) {
                    pc = createPeerConnection(from, stream, false);
                }

                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    socket.emit("call:signal", {
                        callId,
                        to: from,
                        signal: { type: "answer", sdp: pc.localDescription },
                    });

                    await flushIceBuffer(from);
                } catch (e) {
                    logIceFailure(`answer ${from}`, pc, e);
                }

                // Only transition into "connecting" during initial call setup;
                // a renegotiation (video toggle) must not regress an active call.
                applyCallState(prev => prev && prev.status === "ringing" ? { ...prev, status: "connecting" } : prev);
            } else if (signal.type === "answer") {
                // We received an answer to our offer.
                const pc = peerConnections.current[from];
                if (pc && pc.signalingState === "have-local-offer") {
                    try {
                        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                    } catch (e) {
                        logIceFailure(`set answer ${from}`, pc, e);
                        return;
                    }
                    // The caller is the side most likely to hold a buffered
                    // candidate by this point, and this branch had no drain at
                    // all — so a candidate that arrived before the answer was
                    // added into a connection with no remote description,
                    // rejected, and was silently dropped for good.
                    await flushIceBuffer(from);
                    applyCallState(prev => prev && prev.status === "ringing" ? { ...prev, status: "connecting" } : prev);
                }
            } else if (signal.type === "candidate") {
                if (!signal.candidate || !from) return;
                const pc = peerConnections.current[from];
                // Only add directly when there is a remote description to add it
                // to. Otherwise buffer it — the old code added it anyway and
                // threw the candidate away when the add failed.
                if (pc && pc.remoteDescription && pc.signalingState !== "closed") {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                    } catch {
                        // A malformed or stale candidate is not fatal; the rest
                        // of the pair set can still connect.
                    }
                } else {
                    if (!candidateBufferRef.current[from]) candidateBufferRef.current[from] = [];
                    candidateBufferRef.current[from].push(signal.candidate);
                }
            }
        };

        // The callee accepted but never received our offer (they were offline when it
        // was sent). Re-offer from the peer connection we already hold, which is
        // exactly the state the first offer was created from.
        const handleOfferMissed = async (data) => {
            const cs = callStateRef.current;
            if (!cs || cs.callId !== data.callId) return;
            const peer = data.username;
            const pc = peerConnections.current[peer];
            if (!pc || pc.signalingState === "closed") return;
            try {
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                socket.emit("call:signal", {
                    callId: cs.callId,
                    to: peer,
                    signal: { type: "offer", sdp: pc.localDescription },
                });
            } catch (e) {
                logIceFailure(`re-offer ${peer}`, pc, e);
            }
        };

        const handleAccepted = (data) => {
            applyCallState(prev => {
                if (prev && prev.caller === user?.username && prev.status === "ringing") {
                    return { ...prev, status: "connecting" };
                }
                return prev;
            });
        };

        const handleRejected = (data) => {
            // Someone rejected
            applyCallState(prev => {
                if (prev && data.callId === prev.callId) {
                    // If all recipients rejected, end the call
                    if (prev.recipients.length === 1) {
                        setTimeout(cleanup, 500);
                        return null;
                    }
                    return { ...prev, recipients: prev.recipients.filter(r => r !== data.username) };
                }
                return prev;
            });
        };

        const handleEnded = (data) => {
            cleanup();
        };

        const handleCancelled = (data) => {
            // Caller hung up while we were still ringing — stop ringing cleanly.
            const cs = callStateRef.current;
            if (cs && cs.callId === data.callId && cs.status === "ringing") {
                cleanup();
            }
        };

        const handlePeerLeft = (data) => {
            setRemoteStreams(prev => {
                const n = { ...prev };
                delete n[data.username];
                return n;
            });
            // If 1:1 call, end it
            const cs = callStateRef.current;
            if (cs && cs.type === "1:1") {
                setTimeout(cleanup, 500);
            }
        };

        const handleMute = (data) => {
            // Could track per-peer mute state
        };

        const handleVideoToggle = (data) => {
            // Could track per-peer video state
        };

        socket.on("call:incoming", handleIncoming);
        socket.on("call:signal", handleSignal);
        socket.on("call:accepted", handleAccepted);
        socket.on("call:offer-missed", handleOfferMissed);
        socket.on("call:rejected", handleRejected);
        socket.on("call:ended", handleEnded);
        socket.on("call:cancelled", handleCancelled);
        socket.on("call:peer-left", handlePeerLeft);
        socket.on("call:mute", handleMute);
        socket.on("call:video-toggle", handleVideoToggle);

        return () => {
            socket.off("call:incoming", handleIncoming);
            socket.off("call:signal", handleSignal);
            socket.off("call:accepted", handleAccepted);
            socket.off("call:offer-missed", handleOfferMissed);
            socket.off("call:rejected", handleRejected);
            socket.off("call:ended", handleEnded);
            socket.off("call:cancelled", handleCancelled);
            socket.off("call:peer-left", handlePeerLeft);
            socket.off("call:mute", handleMute);
            socket.off("call:video-toggle", handleVideoToggle);
        };
    }, [socket, user?.username, getLocalStream, createPeerConnection, cleanup, rejectCall, beginRinging, applyCallState, flushIceBuffer, logIceFailure, offerIceRestart]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopRing();
            cleanup();
        };
    }, [cleanup]);

    const value = {
        callState, localStream, remoteStreams, isMuted, isDeafened, videoOn, isLoudspeaker,
        connectionError,
        startCall, startGroupCall, acceptCall, rejectCall, endCall,
        toggleMute, toggleDeafen, toggleVideo, toggleLoudspeaker, cleanup,
    };

    return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
    const ctx = useContext(CallContext);
    if (!ctx) throw new Error("useCall must be used within CallProvider");
    return ctx;
}
