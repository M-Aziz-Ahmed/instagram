"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { io } from "socket.io-client";

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
    ],
};

const MAX_BITRATE = 8000;

async function setMaxBitrate(sender, bitrate = MAX_BITRATE) {
    if (!sender) return;
    try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = bitrate * 1000;
        params.encodings[0].maxFramerate = 60;
        params.encodings[0].networkPriority = "high";
        params.encodings[0].priority = "high";
        await sender.setParameters(params);
    } catch {}
}

function mungeSdp(sdp) {
    return sdp
        .replace(/a=fmtp:\d+ .*/g, (m) => {
            if (m.includes("vp8") || m.includes("vp9") || m.includes("h264")) {
                return m + ";x-google-max-bitrate=8000;x-google-min-bitrate=3000";
            }
            return m;
        })
        .replace(/a=mid:video\r?\n/, "a=mid:video\r\nb=AS:8000\r\n");
}

const QUALITY_PRESETS = {
    auto:   { bitrate: 8000, width: 1920, height: 1080, fps: 60 },
    "1080": { bitrate: 8000, width: 1920, height: 1080, fps: 60 },
    "720":  { bitrate: 4000, width: 1280, height: 720,  fps: 30 },
    "480":  { bitrate: 2000, width: 854,  height: 480,  fps: 30 },
};

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL || "";

export default function LiveStreamModal({ streamId: initialStreamId, hostUsername, onClose, autoStart }) {
    const { user } = useUser();

    const [streamId, setStreamId]           = useState(initialStreamId || null);
    const [isHost, setIsHost]               = useState(() => !initialStreamId && user?.username === hostUsername);
    const [started, setStarted]             = useState(false);
    const [loading, setLoading]             = useState(false);
    const [error, setError]                 = useState("");
    const [viewers, setViewers]             = useState(0);
    const [cameraOff, setCameraOff]         = useState(false);
    const [muted, setMuted]                 = useState(false);
    const [sharing, setSharing]             = useState(false);
    const [chatMessages, setChatMessages]   = useState([]);
    const [chatInput, setChatInput]         = useState("");
    const [chatOpen, setChatOpen]           = useState(false);
    const [replyingTo, setReplyingTo]       = useState(null);
    const [translations, setTranslations]   = useState({});
    const [translatingIdx, setTranslatingIdx] = useState(null);
    const [isFullscreen, setIsFullscreen]   = useState(false);
    const [settingsOpen, setSettingsOpen]    = useState(false);
    const [quality, setQuality]              = useState("auto");
    const [micVolume, setMicVolume]          = useState(100);
    const [facingMode, setFacingMode]         = useState("user");
    const [viewerMuted, setViewerMuted]      = useState(true);

    const localVideoRef   = useRef(null);
    const pipVideoRef     = useRef(null);
    const remoteVideoRef  = useRef(null);
    const modalRootRef    = useRef(null);
    const remoteStreamRef = useRef(null);
    const localStreamRef  = useRef(null);
    const screenStreamRef = useRef(null);
    const audioCtxRef     = useRef(null);
    const gainNodeRef     = useRef(null);
    const pcsRef          = useRef({});
    const viewerPcRef     = useRef(null);
    const chatScrollRef   = useRef(null);
    const mountedRef      = useRef(true);
    const playAttemptedRef = useRef(false);
    const remoteTracksRef = useRef(new Map());
    const socketRef       = useRef(null);
    const videoSenderRef  = useRef({});

    const stateRef = useRef({});
    stateRef.current = { streamId, isHost, user, hostUsername };

    useEffect(() => () => { mountedRef.current = false; }, []);

    const setLocalVideo = (srcObject) => {
        if (localVideoRef.current) localVideoRef.current.srcObject = srcObject;
        if (pipVideoRef.current) pipVideoRef.current.srcObject = srcObject;
    };

    const findVideoSender = (pc, viewer) => {
        if (viewer && videoSenderRef.current[viewer]) return videoSenderRef.current[viewer];
        return pc.getSenders().find((s) => s.track?.kind === "video") ||
            pc.getTransceivers().find((t) => t.receiver.track?.kind === "video")?.sender ||
            pc.getTransceivers().find((t) => t.sender)?.sender;
    };

    const sendSignal = useCallback((to, type, data) => {
        const s = stateRef.current;
        const sock = socketRef.current;
        if (!sock || !s.streamId) return;
        sock.emit("signal", { streamId: s.streamId, from: s.user?.username, to, type, data });
    }, []);

    const processSignal = async (signal) => {
        if (!signal?.type || !signal.data) return;
        const s = stateRef.current;

        try {
            if (!s.isHost) {
                if (signal.type === "offer") {
                    let pc = viewerPcRef.current;
                    if (!pc || pc.signalingState === "closed") {
                        pc = new RTCPeerConnection(ICE_SERVERS);
                        viewerPcRef.current = pc;

                        remoteStreamRef.current = new MediaStream();
                        remoteTracksRef.current = new Map();
                        pc.ontrack = (e) => {
                            const track = e.track;
                            if (!track) return;

                            let isReplacement = false;
                            const prevTrackId = remoteTracksRef.current.get(track.kind);
                            if (prevTrackId && prevTrackId !== track.id) {
                                isReplacement = true;
                            }
                            remoteTracksRef.current.set(track.kind, track.id);

                            if (e.streams?.[0]) {
                                e.streams[0].getTracks().forEach((t) => {
                                    const existing = remoteStreamRef.current.getTracks().find((x) => x.kind === t.kind);
                                    if (existing) {
                                        if (existing.id !== t.id) {
                                            remoteStreamRef.current.removeTrack(existing);
                                            remoteStreamRef.current.addTrack(t);
                                        }
                                    } else {
                                        remoteStreamRef.current.addTrack(t);
                                    }
                                });
                            } else {
                                const existing = remoteStreamRef.current.getTracks().find((t) => t.kind === track.kind);
                                if (existing) {
                                    if (existing.id !== track.id) {
                                        remoteStreamRef.current.removeTrack(existing);
                                        remoteStreamRef.current.addTrack(track);
                                    }
                                } else {
                                    remoteStreamRef.current.addTrack(track);
                                }
                            }

                            if (remoteVideoRef.current) {
                                if (remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
                                    remoteVideoRef.current.srcObject = remoteStreamRef.current;
                                }
                                if (isReplacement) {
                                    remoteVideoRef.current.load();
                                }
                                if (!playAttemptedRef.current || isReplacement) {
                                    playAttemptedRef.current = true;
                                    remoteVideoRef.current.play().catch(() => {
                                        const retry = () => {
                                            if (!remoteVideoRef.current || !remoteStreamRef.current) return;
                                            remoteVideoRef.current.play().catch(() => {});
                                        };
                                        setTimeout(retry, 1000);
                                        setTimeout(retry, 3000);
                                    });
                                }
                            }
                        };

                        pc.onicecandidate = (e) => {
                            if (e.candidate) sendSignal(s.hostUsername, "ice-candidate", e.candidate.toJSON());
                        };

                        pc.onconnectionstatechange = () => {};
                    }

                    if (pc.signalingState === "stable") {
                        await pc.setRemoteDescription(new RTCSessionDescription({ type: signal.data.type, sdp: signal.data.sdp }));
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        sendSignal(signal.from, "answer", { type: answer.type, sdp: answer.sdp });
                    }
                } else if (signal.type === "ice-candidate" && viewerPcRef.current) {
                    try {
                        await viewerPcRef.current.addIceCandidate(new RTCIceCandidate(signal.data));
                    } catch {}
                } else if (signal.type === "video-change") {
                    playAttemptedRef.current = false;
                    remoteTracksRef.current.clear();
                    if (remoteVideoRef.current && remoteStreamRef.current) {
                        remoteVideoRef.current.load();
                        setTimeout(() => {
                            if (remoteVideoRef.current) {
                                playAttemptedRef.current = true;
                                remoteVideoRef.current.play().catch(() => {});
                            }
                        }, 500);
                    }
                }
            } else {
                if (signal.type === "request-offer") {
                    const viewer = signal.from;
                    if (pcsRef.current[viewer]) {
                        try { pcsRef.current[viewer].close(); } catch {}
                        delete pcsRef.current[viewer];
                        delete videoSenderRef.current[viewer];
                    }

                    const pc = new RTCPeerConnection(ICE_SERVERS);
                    pcsRef.current[viewer] = pc;

                    const stream = localStreamRef.current;
                    if (stream) {
                        const tracks = stream.getTracks();
                        tracks.forEach((track) => {
                            const sender = pc.addTrack(track, stream);
                            if (track.kind === "video") setMaxBitrate(sender);
                        });
                    }

                    if (!pc.getSenders().some((s) => s.track?.kind === "video")) {
                        const existingScreen = screenStreamRef.current?.getVideoTracks()?.[0];
                        if (existingScreen && existingScreen.readyState === "live") {
                            const sender = pc.addTrack(existingScreen, screenStreamRef.current);
                            videoSenderRef.current[viewer] = sender;
                            setMaxBitrate(sender);
                        } else {
                            const t = pc.addTransceiver("video", { direction: "sendonly" });
                            videoSenderRef.current[viewer] = t.sender;
                            setMaxBitrate(t.sender);
                        }
                    }

                    pc.onicecandidate = (e) => {
                        if (e.candidate) sendSignal(viewer, "ice-candidate", e.candidate.toJSON());
                    };

                    pc.onconnectionstatechange = () => {
                        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
                            try { pc.close(); } catch {}
                            delete pcsRef.current[viewer];
                            delete videoSenderRef.current[viewer];
                        }
                    };

                    const offer = await pc.createOffer();
                    offer.sdp = mungeSdp(offer.sdp);
                    await pc.setLocalDescription(offer);
                    sendSignal(viewer, "offer", { type: offer.type, sdp: offer.sdp });

                } else if (signal.type === "answer") {
                    const pc = pcsRef.current[signal.from];
                    if (pc && pc.signalingState === "have-local-offer") {
                        await pc.setRemoteDescription(new RTCSessionDescription({ type: signal.data.type, sdp: signal.data.sdp }));
                    }
                } else if (signal.type === "ice-candidate") {
                    const pc = pcsRef.current[signal.from];
                    if (pc && pc.signalingState !== "closed") {
                        try { await pc.addIceCandidate(new RTCIceCandidate(signal.data)); } catch {}
                    }
                }
            }
        } catch (err) {
            console.error("[Live] signal error:", err);
        }
    };

    const connectSocket = useCallback((sid, username) => {
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        if (!LIVE_SERVER || !sid || !username) return null;

        const socket = io(LIVE_SERVER, {
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
        });

        socket.on("connect", () => {
            socket.emit("join-stream", { streamId: sid, username });
        });

        socket.on("signal", async (signal) => {
            if (mountedRef.current) {
                await processSignal(signal);
            }
        });

        socket.on("chat-message", (msg) => {
            if (!mountedRef.current) return;
            setChatMessages((prev) => {
                const key = `${msg.username}-${msg.createdAt}`;
                const seen = new Set(prev.map((m) => `${m.username}-${m.createdAt}`));
                if (seen.has(key)) return prev;
                return [...prev, msg];
            });
        });

        socket.on("viewer-count", ({ count }) => {
            if (mountedRef.current) setViewers(count);
        });

        socket.on("host-ended", () => {
            if (mountedRef.current) {
                stopAll();
                onClose?.();
            }
        });

        socket.on("error", ({ message }) => {
            if (mountedRef.current) setError(message || "Connection error");
        });

        socketRef.current = socket;
        return socket;
    }, [onClose]);

    const stopAll = useCallback(() => {
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        Object.values(pcsRef.current).forEach((pc) => { try { pc.close(); } catch {} });
        pcsRef.current = {};
        videoSenderRef.current = {};
        viewerPcRef.current?.close();
        viewerPcRef.current = null;
        remoteStreamRef.current = null;
        remoteTracksRef.current = new Map();
        playAttemptedRef.current = false;
        setSharing(false);
        setCameraOff(true);
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
    }, []);

    const goLive = async (withCamera) => {
        setLoading(true);
        setError("");
        try {
            let stream;
            if (withCamera) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode },
                        audio: true,
                    });
                } catch {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                }
            } else {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                } catch {
                    stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: false });
                }
            }
            localStreamRef.current = stream;
            if (withCamera) setCameraOff(false);
            setLocalVideo(stream);
        } catch {
            setError("Camera/microphone access denied. Please allow permissions and try again.");
            setLoading(false);
            return;
        }

        if (!LIVE_SERVER) {
            setError("Live server not configured. Set NEXT_PUBLIC_LIVE_SERVER_URL.");
            setLoading(false);
            localStreamRef.current?.getTracks().forEach((t) => t.stop());
            return;
        }

        try {
            const res = await fetch(`${LIVE_SERVER}/api/streams`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user?.username, title: "Live Stream" }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to start stream");

            const sid = data.streamId;
            setStreamId(sid);
            setIsHost(true);
            setStarted(true);
            stateRef.current.streamId = sid;
            stateRef.current.isHost = true;

            connectSocket(sid, user.username);
        } catch (e) {
            setError(e.message || "Failed to start stream");
            localStreamRef.current?.getTracks().forEach((t) => t.stop());
        }
        setLoading(false);
    };

    const joinStream = async (sid) => {
        stateRef.current.streamId = sid;
        stateRef.current.isHost = false;
        setStreamId(sid);
        setIsHost(false);
        setStarted(true);

        connectSocket(sid, user.username);

        setTimeout(() => {
            const sock = socketRef.current;
            if (sock) {
                sock.emit("signal", {
                    streamId: sid,
                    from: user.username,
                    to: hostUsername,
                    type: "request-offer",
                    data: { ts: Date.now() },
                });
            }
        }, 500);
    };

    const sendChat = async () => {
        if (!chatInput.trim() || !streamId) return;
        const text = chatInput.trim();
        const replyData = replyingTo
            ? { username: replyingTo.username, text: replyingTo.text }
            : null;
        setChatInput("");
        setReplyingTo(null);
        const sock = socketRef.current;
        if (sock) {
            sock.emit("chat-message", {
                streamId,
                username: user.username,
                color: user.color || user.avatarColor || "#3b82f6",
                avatarUrl: user.avatarUrl || "",
                text,
                replyTo: replyData,
            });
        }
    };

    const translateMessage = async (idx, text) => {
        if (translations[idx]) {
            setTranslations((prev) => { const n = { ...prev }; delete n[idx]; return n; });
            return;
        }
        setTranslatingIdx(idx);
        try {
            const res = await fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, target: "en" }),
            });
            const data = await res.json();
            if (data.translatedText) {
                setTranslations((prev) => ({ ...prev, [idx]: data.translatedText }));
            }
        } catch {}
        setTranslatingIdx(null);
    };

    const toggleCamera = async () => {
        if (!isHost) return;
        if (!cameraOff) {
            localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
            if (localStreamRef.current) {
                const remaining = localStreamRef.current.getTracks().filter((t) => t.kind !== "video");
                localStreamRef.current = remaining.length ? new MediaStream(remaining) : null;
            }
            setCameraOff(true);
            Object.entries(pcsRef.current).forEach(([viewer, pc]) => {
                const sender = findVideoSender(pc, viewer);
                if (sender) sender.replaceTrack(null);
            });
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 }, facingMode }, audio: false });
            const vt = stream.getVideoTracks()[0];
            if (localStreamRef.current) {
                localStreamRef.current.addTrack(vt);
            } else {
                localStreamRef.current = stream;
            }
            setCameraOff(false);
            setLocalVideo(localStreamRef.current);
            Object.entries(pcsRef.current).forEach(([viewer, pc]) => {
                const sender = findVideoSender(pc, viewer);
                if (sender) sender.replaceTrack(vt);
            });
        } catch {}
    };

    const switchCamera = async () => {
        if (!isHost || cameraOff) return;
        const newFacing = facingMode === "user" ? "environment" : "user";
        try {
            localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 }, facingMode: newFacing },
                audio: false,
            });
            const vt = stream.getVideoTracks()[0];
            if (localStreamRef.current) {
                const oldVt = localStreamRef.current.getVideoTracks()[0];
                if (oldVt) localStreamRef.current.removeTrack(oldVt);
                localStreamRef.current.addTrack(vt);
            } else {
                localStreamRef.current = stream;
            }
            setFacingMode(newFacing);
            setLocalVideo(localStreamRef.current);
            Object.entries(pcsRef.current).forEach(([viewer, pc]) => {
                const sender = findVideoSender(pc, viewer);
                if (sender) sender.replaceTrack(vt);
            });
        } catch {}
    };

    const toggleMute = () => {
        localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = muted; });
        setMuted((m) => !m);
    };

    const toggleFullscreen = async () => {
        const el = modalRootRef.current;
        if (!el) return;
        try {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                if (el.requestFullscreen) await el.requestFullscreen();
                else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            } else {
                if (document.exitFullscreen) await document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            }
        } catch {}
    };

    const toggleScreenShare = async () => {
        if (!isHost) return;
        if (sharing) {
            screenStreamRef.current?.getTracks().forEach((t) => t.stop());
            screenStreamRef.current = null;
            setSharing(false);
            const vt = localStreamRef.current?.getVideoTracks()[0];
            const at = localStreamRef.current?.getAudioTracks()[0];
            Object.keys(pcsRef.current).forEach((viewer) => {
                sendSignal(viewer, "video-change", { active: false });
            });
            Object.entries(pcsRef.current).forEach(([viewer, pc]) => {
                const sender = findVideoSender(pc, viewer);
                if (sender) sender.replaceTrack(vt || null);
                const audioSender = pc.getSenders().find((s) => s.track?.kind === "audio");
                if (audioSender) audioSender.replaceTrack(at || null);
            });
            if (localStreamRef.current) setLocalVideo(localStreamRef.current);
            return;
        }
        try {
            if (!navigator.mediaDevices?.getDisplayMedia) {
                setError("Screen sharing is not supported on this browser. Try Chrome, Edge, or Safari 16+ on iOS.");
                return;
            }
            let screen;
            try {
                screen = await navigator.mediaDevices.getDisplayMedia({ video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 60 } }, audio: true });
            } catch {
                screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
            }
            screenStreamRef.current = screen;
            setSharing(true);
            const st = screen.getVideoTracks()[0];
            const sat = screen.getAudioTracks()[0];
            Object.keys(pcsRef.current).forEach((viewer) => {
                sendSignal(viewer, "video-change", { active: true });
            });
            Object.entries(pcsRef.current).forEach(([viewer, pc]) => {
                const sender = findVideoSender(pc, viewer);
                if (sender) {
                    sender.replaceTrack(st).catch(() => {});
                }
                const audioSender = pc.getSenders().find((s) => s.track?.kind === "audio");
                if (sat) {
                    if (audioSender) audioSender.replaceTrack(sat).catch(() => {});
                    else pc.addTrack(sat, screen);
                }
            });
            st.onended = () => {
                if (screenStreamRef.current === screen) {
                    setSharing(false);
                    screenStreamRef.current = null;
                }
                const vt = localStreamRef.current?.getVideoTracks()[0];
                const at = localStreamRef.current?.getAudioTracks()[0];
                Object.entries(pcsRef.current).forEach(([viewer, pc]) => {
                    const sender = findVideoSender(pc, viewer);
                    if (sender) sender.replaceTrack(vt || null);
                    const audioSender = pc.getSenders().find((s) => s.track?.kind === "audio");
                    if (audioSender) audioSender.replaceTrack(at || null);
                });
                if (localStreamRef.current) setLocalVideo(localStreamRef.current);
            };
            setLocalVideo(screen);
        } catch (e) {
            if (e.name !== "AbortError" && e.name !== "NotAllowedError") {
                setError("Screen share failed: " + (e.message || "Unknown error"));
            }
        }
    };

    const applyMicVolume = (vol) => {
        setMicVolume(vol);
        const track = localStreamRef.current?.getAudioTracks()[0];
        if (!track) return;
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            const src = audioCtxRef.current.createMediaStreamSource(new MediaStream([track]));
            gainNodeRef.current = audioCtxRef.current.createGain();
            src.connect(gainNodeRef.current);
            gainNodeRef.current.connect(audioCtxRef.current.destination);
        }
        if (gainNodeRef.current) gainNodeRef.current.gain.value = vol / 100;
    };

    const applyQuality = async (preset) => {
        setQuality(preset);
        const q = QUALITY_PRESETS[preset];
        Object.values(pcsRef.current).forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === "video");
            if (sender) setMaxBitrate(sender, q.bitrate);
        });
    };

    const endStream = async () => {
        const sock = socketRef.current;
        const s = stateRef.current;
        if (s.isHost && s.streamId && LIVE_SERVER) {
            await fetch(`${LIVE_SERVER}/api/streams/${s.streamId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: s.user?.username }),
            }).catch(() => {});
        } else if (s.streamId && sock) {
            sock.emit("leave-stream", { streamId: s.streamId, username: s.user?.username });
        }
        stopAll();
        onClose?.();
    };

    useEffect(() => () => stopAll(), [stopAll]);

    useEffect(() => {
        const handler = () => setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
        document.addEventListener("fullscreenchange", handler);
        document.addEventListener("webkitfullscreenchange", handler);
        return () => {
            document.removeEventListener("fullscreenchange", handler);
            document.removeEventListener("webkitfullscreenchange", handler);
        };
    }, []);

    useEffect(() => {
        if (autoStart && !started && !loading) {
            goLive(false);
        }
    }, []);

    useEffect(() => {
        if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }, [chatMessages]);

    useEffect(() => {
        if (started && localStreamRef.current) {
            setLocalVideo(localStreamRef.current);
        }
    }, [started]);

    if (error) {
        return (
            <div className="fixed inset-0 z-50 bg-black flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full text-center">
                    <p className="text-red-500 text-sm mb-4">{error}</p>
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-full text-sm font-medium">Close</button>
                </div>
            </div>
        );
    }

    if (!started) {
        if (autoStart) {
            return (
                <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <p className="text-white/60 text-sm">Going live...</p>
                    </div>
                </div>
            );
        }
        return (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
                <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                    <div className="p-6 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-500">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
                            {isHost ? "Go Live" : `Join ${hostUsername}'s live`}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                            {isHost ? "Start chatting with your audience" : "Watch and chat — no camera needed"}
                        </p>
                        {isHost ? (
                            <div className="flex flex-col gap-2">
                                <button onClick={() => goLive(true)} disabled={loading} className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                    {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                                    {loading ? "Starting\u2026" : "Start with Camera"}
                                </button>
                                <button onClick={() => goLive(false)} disabled={loading} className="w-full py-3 bg-gray-800 dark:bg-gray-700 hover:bg-gray-900 dark:hover:text-gray-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                    {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                                    {loading ? "Starting\u2026" : "Start Audio Only"}
                                </button>
                            </div>
                        ) : (
                            <button onClick={() => joinStream(streamId)} className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors">
                                Join Live
                            </button>
                        )}
                    </div>
                    <div className="px-6 pb-4">
                        <button onClick={onClose} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
                    </div>
                </div>
            </div>
        );
    }

    const hostHasVideo = isHost && !cameraOff;

    return (
        <div ref={modalRootRef} className="fixed inset-0 z-50 bg-black flex flex-col" style={{ height: "100dvh" }}>
            {settingsOpen && (
                <div className="absolute top-14 left-1/2 -translate-x-1/2 w-72 bg-gray-900/95 backdrop-blur-md border border-white/10 rounded-2xl p-4 z-50 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-white text-sm font-semibold">Settings</span>
                        <button onClick={() => setSettingsOpen(false)} className="text-white/40 hover:text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    {isHost && (
                        <div className="mb-4">
                            <label className="text-white/60 text-xs font-medium uppercase tracking-wider mb-2 block">Video Quality</label>
                            <div className="grid grid-cols-4 gap-1.5">
                                {Object.keys(QUALITY_PRESETS).map((p) => (
                                    <button key={p} onClick={() => applyQuality(p)}
                                        className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${quality === p ? "bg-blue-500 text-white" : "bg-white/10 text-white/60 hover:bg-white/15"}`}>
                                        {p === "auto" ? "Auto" : p + "p"}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {isHost && (
                        <div>
                            <label className="text-white/60 text-xs font-medium uppercase tracking-wider mb-2 flex items-center justify-between">
                                <span>Microphone</span>
                                <span className="text-white/40">{micVolume}%</span>
                            </label>
                            <input type="range" min="0" max="100" value={micVolume} onChange={(e) => applyMicVolume(Number(e.target.value))}
                                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500" />
                        </div>
                    )}
            {!isHost && !isFullscreen && (
                        <div>
                            <label className="text-white/60 text-xs font-medium uppercase tracking-wider mb-2 flex items-center justify-between">
                                <span>Speaker Volume</span>
                            </label>
                            <input type="range" min="0" max="100" defaultValue="100"
                                onChange={(e) => { if (remoteVideoRef.current) remoteVideoRef.current.volume = Number(e.target.value) / 100; }}
                                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500" />
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center justify-between px-4 py-2 safe-top bg-black shrink-0 z-10">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="text-white text-sm font-bold">LIVE</span>
                    <span className="text-white/50 text-xs">{viewers} watching</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setSettingsOpen((v) => !v)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                    </button>
                    <button onClick={toggleFullscreen} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                    </button>
                </div>
            </div>

            <div className="flex-1 flex min-h-0">
                <div className="flex-1 relative bg-black min-h-0 flex items-center justify-center">
                    {isHost ? (
                        hostHasVideo ? (
                            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center text-white text-4xl font-bold">
                                    {hostUsername?.[0]?.toUpperCase()}
                                </div>
                                <p className="text-white/40 text-sm">Audio only</p>
                            </div>
                        )
                    ) : (
                        <div className="relative w-full h-full">
                            <video ref={remoteVideoRef} autoPlay playsInline preload="auto" muted={viewerMuted} className="w-full h-full object-cover" />
                            {viewerMuted && (
                                <button
                                    onClick={() => setViewerMuted(false)}
                                    className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3 bg-white/15 backdrop-blur-sm rounded-full text-white text-xs font-medium hover:bg-white/25 transition-colors z-10"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                    </svg>
                                    Tap to unmute
                                </button>
                            )}
                            {!viewerMuted && (
                                <button
                                    onClick={() => setViewerMuted(true)}
                                    className="absolute bottom-6 left-1/2 -translate-x-1/2 w-10 h-10 flex items-center justify-center bg-white/15 backdrop-blur-sm rounded-full text-white hover:bg-white/25 transition-colors z-10"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    )}

                    <div className={`absolute top-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 ${isFullscreen ? "hidden" : ""}`}>
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            {hostUsername?.[0]?.toUpperCase()}
                        </div>
                        <span className="text-white text-xs font-medium">{hostUsername}</span>
                    </div>

                    {isHost && hostHasVideo && !isFullscreen && (
                        <div className="absolute bottom-4 right-3 w-20 h-28 sm:w-28 sm:h-36 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg bg-black z-30">
                            <video ref={pipVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                        </div>
                    )}

                    <button onClick={toggleFullscreen} className={`${isFullscreen ? "flex" : "hidden"} absolute bottom-4 left-1/2 -translate-x-1/2 items-center gap-2 px-4 py-2.5 bg-black/60 backdrop-blur-sm rounded-full text-white text-xs font-medium z-50`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" /></svg>
                        Exit fullscreen
                    </button>

                    {!chatOpen && (
                        <button onClick={() => setChatOpen(true)} className="sm:hidden absolute bottom-4 right-3 w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white z-30">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className={`${chatOpen ? (isFullscreen ? "absolute bottom-14 left-2 right-2 z-20 h-[50%] max-h-[50vh] rounded-2xl border border-white/10 shadow-2xl" : "absolute bottom-0 left-0 right-0 z-20 h-[45%]") : "hidden"} sm:relative sm:block sm:z-auto sm:w-72 lg:w-80 bg-gray-950 sm:border-l border-white/10 flex flex-col shrink-0 rounded-t-2xl sm:rounded-none border-t border-white/10 sm:border-t-0`}>
                    <div className="sm:hidden flex items-center justify-center pt-2 pb-1 shrink-0">
                        <button onClick={() => setChatOpen(false)} className="w-10 h-1 rounded-full bg-white/30" />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 shrink-0">
                        <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">Live Chat</span>
                        <button onClick={() => setChatOpen(false)} className="sm:hidden text-white/40 hover:text-white p-1">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2.5 min-h-0">
                        {chatMessages.length === 0 && (
                            <p className="text-white/30 text-xs text-center py-8">No messages yet</p>
                        )}
                        {chatMessages.map((msg, i) => (
                            <div key={i} className="flex gap-2 group">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5" style={{ backgroundColor: msg.color || "#3b82f6" }}>
                                    {msg.avatarUrl ? <img src={msg.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" /> : msg.username?.[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="text-[11px] font-bold mr-1.5" style={{ color: msg.color || "#60a5fa" }}>{msg.username}</span>
                                    {msg.replyTo && (
                                        <div className="mb-0.5 pl-2 border-l-2 border-white/20 text-[10px] text-white/40 truncate">
                                            <span className="font-semibold text-white/50">@{msg.replyTo.username}</span>{" "}
                                            {msg.replyTo.text}
                                        </div>
                                    )}
                                    <span className="text-white/90 text-xs break-words">{msg.text}</span>
                                    {translations[i] && (
                                        <div className="mt-0.5 text-[11px] text-blue-300/80 italic break-words">
                                            {translations[i]}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-start gap-1 shrink-0 mt-0.5">
                                    <button onClick={() => setReplyingTo(msg)}
                                        className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors" title="Reply">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                                        </svg>
                                    </button>
                                    <button onClick={() => translateMessage(i, msg.text)}
                                        className={`p-1.5 rounded-full transition-colors ${translations[i] ? "bg-blue-500/20 text-blue-300" : "hover:bg-white/10 text-white/50 hover:text-white"}`}
                                        title={translations[i] ? "Hide translation" : "Translate"}>
                                        {translatingIdx === i ? (
                                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {replyingTo && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-t border-white/10 shrink-0">
                            <div className="flex-1 min-w-0 border-l-2 border-blue-500 pl-2">
                                <p className="text-[10px] text-blue-400 font-medium">Replying to @{replyingTo.username}</p>
                                <p className="text-[10px] text-white/40 truncate">{replyingTo.text}</p>
                            </div>
                            <button onClick={() => setReplyingTo(null)} className="text-white/40 hover:text-white p-1 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    )}

                    <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} className="flex gap-2 px-3 py-2.5 border-t border-white/10 shrink-0">
                        <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                            placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : "Send a message..."}
                            className="flex-1 bg-white/10 text-white text-sm rounded-full px-4 py-2.5 outline-none placeholder-white/30 focus:bg-white/15 transition-colors min-w-0" />
                        <button type="submit" disabled={!chatInput.trim()}
                            className="w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 disabled:opacity-30 text-white flex items-center justify-center shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                            </svg>
                        </button>
                    </form>
                </div>
            </div>

            {isHost && (
                <div className="shrink-0 bg-black border-t border-white/10 safe-bottom z-20">
                    {!isFullscreen ? (
                        <div className="flex items-center justify-between px-4 py-3">
                            <button onClick={endStream} className="px-4 py-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold rounded-full transition-colors flex items-center gap-1.5 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
                                </svg>
                                End
                            </button>

                            <div className="flex items-center gap-3">
                                <button onClick={toggleMute} className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${muted ? "bg-white text-black" : "bg-white/15 text-white"}`}>
                                    {muted
                                        ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" /></svg>
                                        : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>
                                    }
                                </button>
                                <button onClick={toggleCamera} className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${cameraOff ? "bg-white/15 text-white" : "bg-white text-black"}`}>
                                    {cameraOff
                                        ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" /></svg>
                                        : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" /></svg>
                                    }
                                </button>
                                {!cameraOff && (
                                    <button onClick={switchCamera} className="w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
                                    </button>
                                )}
                                <button onClick={toggleScreenShare} className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${sharing ? "bg-blue-500 text-white" : "bg-white/15 text-white"}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 7.41A2.25 2.25 0 0 1 2.25 5.495V5.25" />
                                    </svg>
                                </button>
                            </div>

                            <button onClick={() => setChatOpen((v) => !v)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                                </svg>
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center gap-2 px-3 py-2">
                            <button onClick={endStream} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-full transition-colors">
                                End
                            </button>
                            <button onClick={toggleMute} className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${muted ? "bg-white text-black" : "bg-white/20 text-white"}`}>
                                {muted
                                    ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" /></svg>
                                    : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>
                                }
                            </button>
                            {!cameraOff && (
                                <button onClick={switchCamera} className="w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
                                </button>
                            )}
                                <button onClick={toggleScreenShare} className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${sharing ? "bg-blue-500 text-white" : "bg-white/20 text-white"}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 7.41A2.25 2.25 0 0 1 2.25 5.495V5.25" />
                                    </svg>
                                </button>
                        </div>
                    )}
                </div>
            )}

            {!isHost && (
                <div className="shrink-0 bg-black border-t border-white/10 safe-bottom z-20">
                    <div className="flex items-center justify-between px-4 py-3">
                        <button onClick={endStream} className="px-4 py-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold rounded-full transition-colors flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
                            </svg>
                            Leave
                        </button>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setSettingsOpen((v) => !v)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                            </button>
                            <button onClick={() => setChatOpen((v) => !v)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
