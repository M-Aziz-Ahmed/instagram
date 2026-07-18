"use client";

import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { useUser } from "./UserContext";

const CallContext = createContext(null);

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    ],
};

export function CallProvider({ children, socket }) {
    const { user } = useUser();
    const [callState, setCallState] = useState(null);
    // callState: { callId, type: "1:1"|"group", callType: "audio"|"video", caller, recipients, status: "ringing"|"connecting"|"active"|"ended" }
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState({}); // { username: MediaStream }
    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [videoOn, setVideoOn] = useState(false);

    const peerConnections = useRef({}); // { username: RTCPeerConnection }
    const localStreamRef = useRef(null);
    const callStateRef = useRef(null);
    const ringTimeout = useRef(null);

    // Keep ref in sync
    useEffect(() => { callStateRef.current = callState; }, [callState]);

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
            if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
                setRemoteStreams(prev => {
                    const n = { ...prev };
                    delete n[peerUsername];
                    return n;
                });
            }
        };

        return pc;
    }, [socket]);

    const startCall = useCallback(async (recipient, callType = "audio", groupId = null) => {
        if (!user || !socket) return;
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
        setCallState(cs);

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
    }, [user, socket, getLocalStream, createPeerConnection]);

    const startGroupCall = useCallback(async (recipients, callType = "audio") => {
        if (!user || !socket || !recipients.length) return;
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
        setCallState(cs);

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
    }, [user, socket, getLocalStream, createPeerConnection]);

    const acceptCall = useCallback(async (callId) => {
        if (!user || !socket) return;
        const cs = callStateRef.current;
        if (!cs) return;
        const video = cs.callType === "video";
        const stream = await getLocalStream(true, video);
        if (!stream) return;

        setCallState(prev => prev ? { ...prev, status: "connecting" } : null);

        socket.emit("call:accept", { callId, username: user.username });

        // For group calls, the caller's offer will come via signal events
        // For 1:1, the offer should already be queued
    }, [user, socket, getLocalStream]);

    const cleanup = useCallback(() => {
        Object.values(peerConnections.current).forEach(pc => {
            try { pc.close(); } catch {}
        });
        peerConnections.current = {};
        stopLocalStream();
        setRemoteStreams({});
        setCallState(null);
        setIsMuted(false);
        setIsDeafened(false);
        setVideoOn(false);
        if (ringTimeout.current) clearTimeout(ringTimeout.current);
    }, [stopLocalStream]);

    const rejectCall = useCallback(() => {
        const cs = callStateRef.current;
        if (cs && socket) {
            socket.emit("call:reject", { callId: cs.callId });
        }
        cleanup();
    }, [socket, cleanup]);

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

    const toggleVideo = useCallback(async () => {
        setVideoOn(prev => {
            const next = !prev;
            if (localStreamRef.current) {
                const videoTrack = localStreamRef.current.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.enabled = next;
                } else if (next) {
                    // Need to add video track
                    navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
                        const videoTrack = stream.getVideoTracks()[0];
                        if (videoTrack) {
                            localStreamRef.current.addTrack(videoTrack);
                            Object.values(peerConnections.current).forEach(pc => {
                                pc.addTrack(videoTrack, localStreamRef.current);
                            });
                        }
                    });
                }
            }
            if (socket && callStateRef.current) {
                socket.emit("call:video-toggle", { callId: callStateRef.current.callId, videoOn: next });
            }
            return next;
        });
    }, [socket]);

    // Socket event listeners
    useEffect(() => {
        if (!socket) return;

        const handleIncoming = (data) => {
            if (callStateRef.current) return; // Already in a call
            setCallState({
                callId: data.callId,
                type: data.groupId ? "group" : "1:1",
                callType: data.callType,
                caller: data.caller,
                recipients: data.recipients || [],
                status: "ringing",
            });
            // Auto-reject after 30 seconds
            ringTimeout.current = setTimeout(() => {
                if (callStateRef.current?.status === "ringing") {
                    rejectCall();
                }
            }, 30000);
        };

        const handleSignal = async (data) => {
            const { callId, from, signal } = data;
            const cs = callStateRef.current;

            if (signal.type === "offer") {
                // We're receiving an offer (we're the callee)
                const stream = localStreamRef.current || await getLocalStream(true, callStateRef.current?.callType === "video");
                if (!stream) return;

                const pc = createPeerConnection(from, stream, false);
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                socket.emit("call:signal", {
                    callId,
                    to: from,
                    signal: { type: "answer", sdp: pc.localDescription },
                });

                setCallState(prev => prev ? { ...prev, status: "connecting" } : null);
            } else if (signal.type === "answer") {
                // We received an answer to our offer
                const pc = peerConnections.current[from];
                if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                    setCallState(prev => prev ? { ...prev, status: "connecting" } : null);
                }
            } else if (signal.type === "candidate") {
                const pc = peerConnections.current[from];
                if (pc && signal.candidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                }
            }
        };

        const handleAccepted = (data) => {
            // Someone accepted the call
            setCallState(prev => {
                if (prev && prev.caller === user?.username && prev.status === "ringing") {
                    return { ...prev, status: "connecting" };
                }
                return prev;
            });
        };

        const handleRejected = (data) => {
            // Someone rejected
            setCallState(prev => {
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
        socket.on("call:rejected", handleRejected);
        socket.on("call:ended", handleEnded);
        socket.on("call:peer-left", handlePeerLeft);
        socket.on("call:mute", handleMute);
        socket.on("call:video-toggle", handleVideoToggle);

        return () => {
            socket.off("call:incoming", handleIncoming);
            socket.off("call:signal", handleSignal);
            socket.off("call:accepted", handleAccepted);
            socket.off("call:rejected", handleRejected);
            socket.off("call:ended", handleEnded);
            socket.off("call:peer-left", handlePeerLeft);
            socket.off("call:mute", handleMute);
            socket.off("call:video-toggle", handleVideoToggle);
        };
    }, [socket, user?.username, getLocalStream, createPeerConnection, cleanup, rejectCall]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    const value = {
        callState, localStream, remoteStreams, isMuted, isDeafened, videoOn,
        startCall, startGroupCall, acceptCall, rejectCall, endCall,
        toggleMute, toggleDeafen, toggleVideo, cleanup,
    };

    return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
    const ctx = useContext(CallContext);
    if (!ctx) throw new Error("useCall must be used within CallProvider");
    return ctx;
}
