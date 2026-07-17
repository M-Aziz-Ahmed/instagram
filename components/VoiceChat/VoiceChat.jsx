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

function Participant({ participant, isLocal, onAdminAction }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const avatarBg = participant.color || "#3b82f6";

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [menuOpen]);

    return (
        <div className={`relative flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors ${
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
                {participant.isAdmin && (
                    <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-yellow-500 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-2.5 h-2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
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

            {/* Admin context menu trigger */}
            {!isLocal && onAdminAction && (
                <div className="relative">
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
                        </svg>
                    </button>
                    {menuOpen && (
                        <div ref={menuRef} className="absolute right-0 top-full mt-1 w-44 bg-gray-900 border border-white/10 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                            <button onClick={() => { onAdminAction("mute", participant.username); setMenuOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-white/10 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" />
                                </svg>
                                {participant.muted ? "Unmute" : "Mute"}
                            </button>
                            <button onClick={() => { onAdminAction("kick", participant.username); setMenuOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-orange-300 hover:bg-white/10 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                                </svg>
                                Kick
                            </button>
                            <button onClick={() => { onAdminAction("timeout", participant.username); setMenuOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-yellow-300 hover:bg-white/10 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                </svg>
                                Timeout (5 min)
                            </button>
                            <div className="border-t border-white/10 my-1" />
                            <button onClick={() => { onAdminAction("ban", participant.username); setMenuOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-white/10 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                                Ban
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ChannelCard({ channel, isActive, onJoin, onDelete, participantCount, isAdmin }) {
    return (
        <div className={`flex items-center gap-1 rounded-xl transition-all ${
            isActive
                ? "bg-green-500/10 ring-1 ring-green-500/30"
                : "hover:bg-white/5"
        }`}>
            <button
                onClick={onJoin}
                className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left"
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
            {isAdmin && onDelete && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(channel); }}
                    className="p-2 text-gray-500 hover:text-red-400 transition-colors shrink-0"
                    title="Delete channel"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                </button>
            )}
        </div>
    );
}

export default function VoiceChat({ socket, isOpen, onClose }) {
    const { user } = useUser();
    const isAdmin = user?.isAdmin;
    const [channels, setChannels] = useState([]);
    const [activeChannel, setActiveChannel] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [muted, setMuted] = useState(false);
    const [deafened, setDeafened] = useState(false);
    const [showCreateChannel, setShowCreateChannel] = useState(false);
    const [newChannelName, setNewChannelName] = useState("");
    const [notification, setNotification] = useState(null);

    const localStreamRef  = useRef(null);
    const peerStreamsRef  = useRef(new Map());
    const pcsRef         = useRef(new Map());
    const audioElementsRef = useRef(new Map());
    const speakingTimerRef = useRef(null);
    const analyserRef    = useRef(null);
    const audioCtxRef    = useRef(null);
    const animFrameRef   = useRef(null);

    const socketRef = useRef(socket);
    const userRef = useRef(user);
    useEffect(() => { socketRef.current = socket; }, [socket]);
    useEffect(() => { userRef.current = user; }, [user]);

    const showNotif = useCallback((msg) => {
        setNotification(msg);
        setTimeout(() => setNotification(null), 3000);
    }, []);

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
                            s.emit("voice:signal", { to: pcsRef.current.get(from)?._remoteSocketId || "", from: s.id, type: "ice-candidate", data: e.candidate.toJSON() });
                        }
                    };
                }

                if (pc.signalingState === "stable") {
                    await pc.setRemoteDescription(new RTCSessionDescription(data));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    pc._remoteSocketId = from;
                    s.emit("voice:signal", { to: from, from: s.id, type: "answer", data: { type: answer.type, sdp: answer.sdp } });
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

        const handleKicked = ({ reason }) => {
            showNotif(`You were ${reason?.toLowerCase() || "removed"}`);
            cleanup();
        };
        const handleAdminMuted = ({ muted: isMuted }) => {
            setMuted(isMuted);
            localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !isMuted; });
            showNotif(isMuted ? "You have been muted by an admin" : "You have been unmuted by an admin");
        };

        socket.on("voice:channels", handleChannels);
        socket.on("voice:joined", handleJoined);
        socket.on("voice:channel-update", handleChannelUpdate);
        socket.on("voice:user-left", handleUserLeft);
        socket.on("voice:user-speaking", handleUserSpeaking);
        socket.on("voice:signal", handleVoiceSignal);
        socket.on("voice:kicked", handleKicked);
        socket.on("voice:admin-muted", handleAdminMuted);
        socket.emit("voice:get-channels");

        return () => {
            socket.off("voice:channels", handleChannels);
            socket.off("voice:joined", handleJoined);
            socket.off("voice:channel-update", handleChannelUpdate);
            socket.off("voice:user-left", handleUserLeft);
            socket.off("voice:user-speaking", handleUserSpeaking);
            socket.off("voice:signal", handleVoiceSignal);
            socket.off("voice:kicked", handleKicked);
            socket.off("voice:admin-muted", handleAdminMuted);
        };
    }, [socket, isOpen, cleanup, showNotif]);

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
                        from: s.id,
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

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                s.emit("voice:signal", {
                    to: p.socketId || p.username,
                    from: s.id,
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
            color: u.avatarColor || u.color || "#3b82f6",
        });
    }, [cleanup, deafened, startSpeakingDetection]);

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

    // Admin actions
    const handleAdminAction = useCallback((action, targetUsername) => {
        const s = socketRef.current;
        if (!s || !activeChannel) return;
        if (action === "mute") {
            const target = participants.find((p) => p.username === targetUsername);
            s.emit("voice:admin-mute", { channelId: activeChannel, targetUsername, muted: !target?.muted });
        } else if (action === "kick") {
            s.emit("voice:admin-kick", { channelId: activeChannel, targetUsername });
        } else if (action === "timeout") {
            s.emit("voice:admin-timeout", { channelId: activeChannel, targetUsername, duration: 300 });
        } else if (action === "ban") {
            s.emit("voice:admin-ban", { targetUsername });
        }
    }, [activeChannel, participants]);

    const handleCreateChannel = useCallback(() => {
        const s = socketRef.current;
        if (!s || !newChannelName.trim()) return;
        s.emit("voice:create-channel", { name: newChannelName.trim() });
        setNewChannelName("");
        setShowCreateChannel(false);
    }, [newChannelName]);

    const handleDeleteChannel = useCallback((channel) => {
        const s = socketRef.current;
        if (!s) return;
        if (!confirm(`Delete channel "${channel.name}"?`)) return;
        s.emit("voice:delete-channel", { channelId: channel.id });
    }, []);

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
                <div className="flex items-center gap-1">
                    {isAdmin && (
                        <button
                            onClick={() => setShowCreateChannel(!showCreateChannel)}
                            className="text-white/40 hover:text-green-400 p-1 transition-colors"
                            title="Create channel"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                        </button>
                    )}
                    <button onClick={onClose} className="text-white/40 hover:text-white p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Notification */}
            {notification && (
                <div className="mx-3 mt-2 px-3 py-2 bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-xs text-yellow-300 shrink-0">
                    {notification}
                </div>
            )}

            {/* Create channel form (admin) */}
            {showCreateChannel && (
                <div className="px-3 py-2 border-b border-white/10 shrink-0">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newChannelName}
                            onChange={(e) => setNewChannelName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                            placeholder="Channel name..."
                            className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-green-500/50"
                            autoFocus
                        />
                        <button
                            onClick={handleCreateChannel}
                            disabled={!newChannelName.trim()}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                            Create
                        </button>
                    </div>
                </div>
            )}

            {/* Channel list */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1 mb-1">Channels</p>
                {channels.map((ch) => (
                    <ChannelCard
                        key={ch.id}
                        channel={ch}
                        isActive={activeChannel === ch.id}
                        onJoin={() => joinChannel(ch.id)}
                        onDelete={isAdmin ? handleDeleteChannel : null}
                        participantCount={ch.participantCount}
                        isAdmin={isAdmin}
                    />
                ))}
                {channels.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-4">No channels yet</p>
                )}
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
                                onAdminAction={isAdmin && p.username !== user?.username ? handleAdminAction : null}
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
