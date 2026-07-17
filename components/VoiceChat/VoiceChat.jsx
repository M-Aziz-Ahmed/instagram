"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useUser } from "@/context/UserContext";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL || "";

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    ],
};

function SpeakingIndicator({ speaking }) {
    return (
        <div className="flex items-center gap-[2px] h-3">
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    className={`w-[3px] rounded-full transition-all duration-100 ${
                        speaking ? "bg-green-400 animate-pulse" : "bg-gray-400 dark:bg-gray-600"
                    }`}
                    style={{
                        height: speaking ? `${8 + Math.random() * 6}px` : "3px",
                        animationDelay: `${i * 100}ms`,
                    }}
                />
            ))}
        </div>
    );
}

function Participant({ participant, isLocal, onToggleMute }) {
    const avatarBg = participant.color || "#3b82f6";
    return (
        <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors ${
            participant.speaking
                ? "bg-green-500/10 ring-1 ring-green-500/30"
                : "hover:bg-white/5"
        }`}>
            <div className="relative shrink-0">
                <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: avatarBg }}
                >
                    {participant.avatarUrl ? (
                        <img src={participant.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                        participant.username?.[0]?.toUpperCase()
                    )}
                </div>
                {participant.muted && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-2.5 h-2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                        </svg>
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                    {participant.username}
                    {isLocal && <span className="text-gray-400 dark:text-gray-500 ml-1">(you)</span>}
                </p>
            </div>
            <SpeakingIndicator speaking={participant.speaking && !participant.muted} />
        </div>
    );
}

function ChannelCard({ channel, isActive, onJoin, participantCount }) {
    return (
        <button
            onClick={onJoin}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                isActive
                    ? "bg-green-500/10 ring-1 ring-green-500/30"
                    : "hover:bg-white/5"
            }`}
        >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isActive ? "bg-green-500/20 text-green-400" : "bg-white/10 text-gray-400"
            }`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{channel.name}</p>
                {participantCount > 0 && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{participantCount} participant{participantCount !== 1 ? "s" : ""}</p>
                )}
            </div>
            {isActive && (
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            )}
        </button>
    );
}

export default function VoiceChat({ socket, isOpen, onClose }) {
    const { user } = useUser();
    const [channels, setChannels] = useState([]);
    const [activeChannel, setActiveChannel] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [muted, setMuted] = useState(false);
    const [deafened, setDeafened] = useState(false);
    const [expanded, setExpanded] = useState(true);

    const localStreamRef  = useRef(null);
    const peerStreamsRef  = useRef(new Map());
    const pcsRef         = useRef(new Map());
    const audioElementsRef = useRef(new Map());
    const speakingTimerRef = useRef(null);
    const analyserRef    = useRef(null);
    const audioCtxRef    = useRef(null);
    const animFrameRef   = useRef(null);

    // Store stable references
    const socketRef = useRef(socket);
    const userRef = useRef(user);
    useEffect(() => { socketRef.current = socket; }, [socket]);
    useEffect(() => { userRef.current = user; }, [user]);

    // Cleanup on unmount or close
    const cleanup = useCallback(() => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        pcsRef.current.forEach((pc) => { try { pc.close(); } catch {} });
        pcsRef.current.clear();
        peerStreamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
        peerStreamsRef.current.clear();
        audioElementsRef.current.forEach((el) => { el.srcObject = null; });
        audioElementsRef.current.clear();
        analyserRef.current = null;
        if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} }
        audioCtxRef.current = null;
        setActiveChannel(null);
        setParticipants([]);
        setMuted(false);
        setDeafened(false);
    }, []);

    useEffect(() => () => cleanup(), [cleanup]);

    // Socket event listeners
    useEffect(() => {
        if (!socket || !isOpen) return;

        const handleChannels = (chans) => setChannels(chans);
        const handleJoined = (state) => {
            setActiveChannel(state.id);
            setParticipants(state.participants);
        };
        const handleChannelUpdate = (state) => {
            setParticipants(state.participants);
        };
        const handleUserLeft = ({ username }) => {
            // Close peer connection for this user
            const pc = pcsRef.current.get(username);
            if (pc) { try { pc.close(); } catch {} }
            pcsRef.current.delete(username);
            const ps = peerStreamsRef.current.get(username);
            if (ps) ps.getTracks().forEach((t) => t.stop());
            peerStreamsRef.current.delete(username);
            const el = audioElementsRef.current.get(username);
            if (el) { el.srcObject = null; }
            audioElementsRef.current.delete(username);
        };
        const handleUserSpeaking = ({ username, speaking }) => {
            setParticipants((prev) =>
                prev.map((p) => p.username === username ? { ...p, speaking } : p)
            );
        };
        const handleVoiceSignal = async ({ from, type, data }) => {
            const s = socketRef.current;
            const u = userRef.current;
            if (!s || !u) return;

            if (type === "offer") {
                let pc = pcsRef.current.get(from);
                if (!pc || pc.signalingState === "closed") {
                    pc = new RTCPeerConnection(ICE_SERVERS);
                    pcsRef.current.set(from, pc);

                    const localStream = localStreamRef.current;
                    if (localStream) {
                        localStream.getTracks().forEach((track) => {
                            pc.addTrack(track, localStream);
                        });
                    }

                    pc.ontrack = (e) => {
                        if (e.streams?.[0]) {
                            peerStreamsRef.current.set(from, e.streams[0]);
                            attachRemoteAudio(from, e.streams[0]);
                        }
                    };
                    pc.onicecandidate = (e) => {
                        if (e.candidate) {
                            s.emit("voice:signal", { to: pcsRef.current.get(from)?._remoteSocketId || "", from: u.username, type: "ice-candidate", data: e.candidate.toJSON() });
                        }
                    };
                }

                if (pc.signalingState === "stable") {
                    await pc.setRemoteDescription(new RTCSessionDescription(data));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    // Store the remote socket id for ICE candidates
                    pc._remoteSocketId = from;
                    s.emit("voice:signal", { to: from, from: u.username, type: "answer", data: { type: answer.type, sdp: answer.sdp } });
                }
            } else if (type === "answer") {
                const pc = pcsRef.current.get(from);
                if (pc && pc.signalingState === "have-local-offer") {
                    await pc.setRemoteDescription(new RTCSessionDescription(data));
                }
            } else if (type === "ice-candidate") {
                const pc = pcsRef.current.get(from);
                if (pc && pc.signalingState !== "closed") {
                    try { await pc.addIceCandidate(new RTCIceCandidate(data)); } catch {}
                }
            }
        };

        socket.on("voice:channels", handleChannels);
        socket.on("voice:joined", handleJoined);
        socket.on("voice:channel-update", handleChannelUpdate);
        socket.on("voice:user-left", handleUserLeft);
        socket.on("voice:user-speaking", handleUserSpeaking);
        socket.on("voice:signal", handleVoiceSignal);
        socket.emit("voice:get-channels");

        return () => {
            socket.off("voice:channels", handleChannels);
            socket.off("voice:joined", handleJoined);
            socket.off("voice:channel-update", handleChannelUpdate);
            socket.off("voice:user-left", handleUserLeft);
            socket.off("voice:user-speaking", handleUserSpeaking);
            socket.off("voice:signal", handleVoiceSignal);
        };
    }, [socket, isOpen]);

    const attachRemoteAudio = useCallback((username, stream) => {
        let el = audioElementsRef.current.get(username);
        if (!el) {
            el = document.createElement("audio");
            el.autoplay = true;
            el.playsInline = true;
            el.id = `voice-audio-${username}`;
            document.body.appendChild(el);
            audioElementsRef.current.set(username, el);
        }
        el.srcObject = stream;
    }, []);

    // Speaking detection via AudioContext
    const startSpeakingDetection = useCallback((stream) => {
        try {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtxRef.current.createMediaStreamSource(stream);
            analyserRef.current = audioCtxRef.current.createAnalyser();
            analyserRef.current.fftSize = 512;
            source.connect(analyserRef.current);

            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            let speaking = false;

            const detect = () => {
                if (!analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                const isSpeaking = avg > 20;

                if (isSpeaking !== speaking) {
                    speaking = isSpeaking;
                    const s = socketRef.current;
                    if (s && activeChannel) {
                        s.emit("voice:speaking", { channelId: activeChannel, speaking });
                    }
                }
                animFrameRef.current = requestAnimationFrame(detect);
            };
            detect();
        } catch {}
    }, [activeChannel]);

    // Create peer connections to all existing participants
    const createPeerConnections = useCallback(async (channelParticipants) => {
        const s = socketRef.current;
        const u = userRef.current;
        if (!s || !u) return;

        const localStream = localStreamRef.current;
        if (!localStream) return;

        for (const p of channelParticipants) {
            if (p.username === u.username) continue;
            if (pcsRef.current.has(p.username)) continue;

            const pc = new RTCPeerConnection(ICE_SERVERS);
            pcsRef.current.set(p.username, pc);

            localStream.getTracks().forEach((track) => {
                pc.addTrack(track, localStream);
            });

            pc.ontrack = (e) => {
                if (e.streams?.[0]) {
                    peerStreamsRef.current.set(p.username, e.streams[0]);
                    attachRemoteAudio(p.username, e.streams[0]);
                }
            };

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    s.emit("voice:signal", {
                        to: p.socketId || p.username,
                        from: u.username,
                        type: "ice-candidate",
                        data: e.candidate.toJSON(),
                    });
                }
            };

            pc.onconnectionstatechange = () => {
                if (pc.connectionState === "failed" || pc.connectionState === "closed") {
                    pcsRef.current.delete(p.username);
                }
            };

            // Create offer
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                s.emit("voice:signal", {
                    to: p.socketId || p.username,
                    from: u.username,
                    type: "offer",
                    data: { type: offer.type, sdp: offer.sdp },
                });
            } catch {}
        }
    }, [attachRemoteAudio]);

    const joinChannel = useCallback(async (channelId) => {
        const s = socketRef.current;
        const u = userRef.current;
        if (!s || !u) return;

        cleanup();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;

            if (!deafened) {
                startSpeakingDetection(stream);
            }
        } catch {
            return;
        }

        s.emit("voice:join", {
            channelId,
            username: u.username,
            avatarUrl: u.avatarUrl,
            color: u.color,
        });

        // We'll create peer connections once we receive the channel-update with participants
    }, [cleanup, deafened, startSpeakingDetection]);

    // When participants change, create new peer connections
    useEffect(() => {
        if (!activeChannel || !participants.length) return;
        const u = userRef.current;
        if (!u) return;
        const others = participants.filter((p) => p.username !== u.username);
        if (others.length > 0 && localStreamRef.current) {
            createPeerConnections(others);
        }
    }, [participants, activeChannel, createPeerConnections]);

    const leaveChannel = useCallback(() => {
        const s = socketRef.current;
        if (s && activeChannel) {
            s.emit("voice:leave", { channelId: activeChannel });
        }
        cleanup();
    }, [activeChannel, cleanup]);

    const toggleMute = useCallback(() => {
        const newMuted = !muted;
        setMuted(newMuted);
        localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !newMuted; });
        if (newMuted && speakingTimerRef.current) {
            clearTimeout(speakingTimerRef.current);
        }
        const s = socketRef.current;
        if (s && activeChannel) {
            s.emit("voice:toggle-mute", { channelId: activeChannel, muted: newMuted });
            if (newMuted) s.emit("voice:speaking", { channelId: activeChannel, speaking: false });
        }
    }, [muted, activeChannel]);

    const toggleDeafen = useCallback(() => {
        const newDeafened = !deafened;
        setDeafened(newDeafened);
        if (newDeafened) {
            setMuted(true);
            localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false });
            audioElementsRef.current.forEach((el) => { el.muted = true; });
        } else {
            audioElementsRef.current.forEach((el) => { el.muted = false; });
        }
        const s = socketRef.current;
        if (s && activeChannel) {
            s.emit("voice:toggle-deafen", { channelId: activeChannel, deafened: newDeafened });
            if (newDeafened) s.emit("voice:speaking", { channelId: activeChannel, speaking: false });
        }
    }, [deafened, activeChannel]);

    if (!isOpen) return null;

    return (
        <div className="flex flex-col h-full bg-gray-950 text-white">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-green-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                    </svg>
                    <span className="text-sm font-semibold">Voice Channels</span>
                </div>
                <button onClick={onClose} className="text-white/40 hover:text-white p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Channel list */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1 mb-1">Channels</p>
                {channels.map((ch) => (
                    <ChannelCard
                        key={ch.id}
                        channel={ch}
                        isActive={activeChannel === ch.id}
                        onJoin={() => joinChannel(ch.id)}
                        participantCount={ch.participantCount}
                    />
                ))}
            </div>

            {/* Active channel participants */}
            {activeChannel && participants.length > 0 && (
                <div className="border-t border-white/10 px-3 py-2 max-h-[40%] overflow-y-auto">
                    <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1 mb-1">
                        In Voice - {channels.find((c) => c.id === activeChannel)?.name}
                    </p>
                    <div className="space-y-0.5">
                        {participants.map((p) => (
                            <Participant
                                key={p.username}
                                participant={p}
                                isLocal={p.username === user?.username}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Controls */}
            {activeChannel && (
                <div className="shrink-0 border-t border-white/10 px-4 py-3 safe-bottom">
                    <div className="flex items-center justify-center gap-2">
                        <button
                            onClick={toggleMute}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                                muted ? "bg-red-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                            }`}
                            title={muted ? "Unmute" : "Mute"}
                        >
                            {muted ? (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                                </svg>
                            )}
                        </button>
                        <button
                            onClick={toggleDeafen}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                                deafened ? "bg-red-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                            }`}
                            title={deafened ? "Undeafen" : "Deafen"}
                        >
                            {deafened ? (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                </svg>
                            )}
                        </button>
                        <button
                            onClick={leaveChannel}
                            className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                            title="Disconnect"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
