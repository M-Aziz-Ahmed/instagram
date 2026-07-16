"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useUser } from "@/context/UserContext";

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
    ],
};

const POLL_MS = 1000;

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

function LiveStreamModal({ streamId: initialStreamId, hostUsername, onClose }) {
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

    const localVideoRef   = useRef(null);
    const remoteVideoRef  = useRef(null);
    const modalRootRef    = useRef(null);
    const remoteStreamRef = useRef(null);
    const localStreamRef  = useRef(null);
    const screenStreamRef = useRef(null);
    const audioCtxRef     = useRef(null);
    const gainNodeRef     = useRef(null);
    const pcsRef          = useRef({});
    const viewerPcRef     = useRef(null);
    const pollRef         = useRef(null);
    const chatScrollRef   = useRef(null);
    const mountedRef      = useRef(true);
    const playAttemptedRef = useRef(false);

    const lastSignalRef = useRef(null);
    const lastChatRef   = useRef(null);

    const stateRef = useRef({});
    stateRef.current = { streamId, isHost, user, hostUsername };

    useEffect(() => () => { mountedRef.current = false; }, []);

    const apiPost = useCallback(async (body) => {
        const s = stateRef.current;
        if (!s.streamId) return null;
        try {
            const res = await fetch(`/api/live/${s.streamId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: s.user?.username, ...body }),
            });
            if (res.ok) return await res.json();
        } catch {}
        return null;
    }, []);

    const sendSignal = useCallback((to, type, data) => {
        return apiPost({ action: "signal", to, type, data });
    }, [apiPost]);

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
                        pc.ontrack = (e) => {
                            console.log("[Live VIEWER] ontrack kind:", e.track?.kind, "readyState:", e.track?.readyState, "streams:", e.streams?.length);
                            if (e.streams?.[0]) {
                                e.streams[0].getTracks().forEach((t) => {
                                    if (!remoteStreamRef.current.getTracks().find((x) => x.id === t.id)) {
                                        remoteStreamRef.current.addTrack(t);
                                    }
                                });
                            } else if (e.track) {
                                const existing = remoteStreamRef.current.getTracks().find((t) => t.kind === e.track.kind);
                                if (existing) remoteStreamRef.current.removeTrack(existing);
                                remoteStreamRef.current.addTrack(e.track);
                            }
                            if (remoteVideoRef.current) {
                                if (remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
                                    remoteVideoRef.current.srcObject = remoteStreamRef.current;
                                    remoteVideoRef.current.load();
                                }
                                if (!playAttemptedRef.current) {
                                    playAttemptedRef.current = true;
                                    remoteVideoRef.current.play().catch(() => {
                                        const retry = () => {
                                            if (!remoteVideoRef.current || !remoteStreamRef.current) return;
                                            remoteVideoRef.current.play().then(() => {
                                                console.log("[Live VIEWER] autoplay retry succeeded");
                                            }).catch(() => {});
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

                        pc.onconnectionstatechange = () => {
                            console.log("[Live VIEWER] state:", pc.connectionState, "ice:", pc.iceConnectionState);
                        };
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
                    console.log("[Live VIEWER] video-change received, refreshing stream");
                    playAttemptedRef.current = false;
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
                        console.log("[Live HOST] Adding", tracks.length, "tracks:", tracks.map(t => t.kind + "/" + t.readyState));
                        tracks.forEach((track) => {
                            const sender = pc.addTrack(track, stream);
                            if (track.kind === "video") setMaxBitrate(sender);
                        });
                    } else {
                        console.warn("[Live HOST] NO localStream when handling request-offer from", viewer);
                    }

                    if (!pc.getSenders().some((s) => s.track?.kind === "video")) {
                        const existingScreen = screenStreamRef.current?.getVideoTracks()?.[0];
                        if (existingScreen && existingScreen.readyState === "live") {
                            const sender = pc.addTrack(existingScreen, screenStreamRef.current);
                            videoSenderRef.current[viewer] = sender;
                            setMaxBitrate(sender);
                            console.log("[Live HOST] Added active screen share track for", viewer);
                        } else {
                            const t = pc.addTransceiver("video", { direction: "sendonly" });
                            videoSenderRef.current[viewer] = t.sender;
                            setMaxBitrate(t.sender);
                            console.log("[Live HOST] Added empty video transceiver for", viewer);
                        }
                    }

                    pc.onicecandidate = (e) => {
                        if (e.candidate) sendSignal(viewer, "ice-candidate", e.candidate.toJSON());
                    };

                    pc.onconnectionstatechange = () => {
                        console.log("[Live HOST] state for", viewer, ":", pc.connectionState);
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

    const doPoll = useCallback(async () => {
        const s = stateRef.current;
        if (!s.streamId || !s.user) return;
        try {
            const body = {
                action: "poll",
            };
            if (lastSignalRef.current) body.since = lastSignalRef.current;

            const data = await apiPost(body);
            if (!data) return;

            setViewers(data.viewers);

            if (data.signals?.length) {
                const last = data.signals[data.signals.length - 1];
                lastSignalRef.current = last.createdAt;

                for (const signal of data.signals) {
                    await processSignal(signal);
                }
            }
        } catch (err) {
            console.error("[Live] poll error:", err);
        }
    }, [apiPost]);

    const doPollChat = useCallback(async () => {
        const s = stateRef.current;
        if (!s.streamId) return;
        try {
            const since = lastChatRef.current || new Date(0).toISOString();
            const res = await fetch(`/api/live/${s.streamId}?action=chat&since=${encodeURIComponent(since)}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.messages?.length) {
                const last = data.messages[data.messages.length - 1];
                lastChatRef.current = last.createdAt;

                setChatMessages((prev) => {
                    const seen = new Set(prev.map((m) => `${m.username}-${m.createdAt}`));
                    const fresh = data.messages.filter((m) => !seen.has(`${m.username}-${m.createdAt}`));
                    return fresh.length ? [...prev, ...fresh] : prev;
                });
            }
        } catch {}
    }, []);

    const sendChat = async () => {
        if (!chatInput.trim() || !streamId) return;
        const text = chatInput.trim();
        const replyData = replyingTo
            ? { username: replyingTo.username, text: replyingTo.text }
            : null;
        setChatInput("");
        setReplyingTo(null);
        const data = await apiPost({
            action: "chat",
            text,
            color: user.color || user.avatarColor || "#3b82f6",
            avatarUrl: user.avatarUrl || "",
            replyTo: replyData,
        });
        if (data?.message) {
            setChatMessages((prev) => [...prev, data.message]);
            lastChatRef.current = data.message.createdAt;
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
        playAttemptedRef.current = false;
        setSharing(false);
        setCameraOff(true);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }, []);

    const goLive = async (withCamera) => {
        setLoading(true);
        setError("");
        try {
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: withCamera ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" } : false,
                    audio: true,
                });
            } catch {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: withCamera ? true : false,
                    audio: true,
                });
            }
            localStreamRef.current = stream;
            if (withCamera) setCameraOff(false);
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        } catch {
            setError("Camera/microphone access denied. Please allow permissions and try again.");
            setLoading(false);
            return;
        }

        try {
            const res = await fetch("/api/live", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user?.username, title: "Live Stream" }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setStreamId(data.streamId);
            setIsHost(true);
            setStarted(true);
            lastSignalRef.current = null;
            lastChatRef.current = null;
        } catch (e) {
            setError(e.message || "Failed to start stream");
            localStreamRef.current?.getTracks().forEach((t) => t.stop());
        }
        setLoading(false);
    };

    const joinStream = async (sid) => {
        setStreamId(sid);
        setIsHost(false);
        setStarted(true);
        lastSignalRef.current = null;
        lastChatRef.current = null;

        await apiPost({ action: "join" });

        setTimeout(() => {
            sendSignal(hostUsername, "request-offer", { ts: Date.now() });
        }, 500);
    };

    const videoSenderRef = useRef({});

    const findVideoSender = (pc, viewer) => {
        if (viewer && videoSenderRef.current[viewer]) return videoSenderRef.current[viewer];
        return pc.getSenders().find((s) => s.track?.kind === "video") ||
            pc.getTransceivers().find((t) => t.receiver.track?.kind === "video")?.sender ||
            pc.getTransceivers().find((t) => t.sender)?.sender;
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
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 }, facingMode: "user" }, audio: false });
            const vt = stream.getVideoTracks()[0];
            if (localStreamRef.current) {
                localStreamRef.current.addTrack(vt);
            } else {
                localStreamRef.current = stream;
            }
            setCameraOff(false);
            if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
            Object.entries(pcsRef.current).forEach(([viewer, pc]) => {
                const sender = findVideoSender(pc, viewer);
                if (sender) sender.replaceTrack(vt);
            });
        } catch {}
    };

    const toggleMute = () => {
        localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
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
            Object.keys(pcsRef.current).forEach((viewer) => {
                sendSignal(viewer, "video-change", { active: false });
            });
            Object.entries(pcsRef.current).forEach(([viewer, pc]) => {
                const sender = findVideoSender(pc, viewer);
                if (sender) sender.replaceTrack(vt || null);
                const audioSender = pc.getSenders().find((s) => s.track?.kind === "audio" && s !== pc.getSenders()[0]);
                if (audioSender) audioSender.replaceTrack(null);
            });
            if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
            return;
        }
        try {
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
                if (sender) sender.replaceTrack(st);
                if (sat) {
                    const audioSender = pc.getSenders().find((s) => s.track?.kind === "audio" && s !== pc.getSenders()[0]);
                    if (audioSender) audioSender.replaceTrack(sat);
                    else pc.addTrack(sat, screen);
                }
            });
            st.onended = () => {
                if (screenStreamRef.current === screen) {
                    setSharing(false);
                    screenStreamRef.current = null;
                }
                const vt = localStreamRef.current?.getVideoTracks()[0];
                Object.entries(pcsRef.current).forEach(([viewer, pc]) => {
                    const sender = findVideoSender(pc, viewer);
                    if (sender) sender.replaceTrack(vt || null);
                });
                if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
            };
            if (localVideoRef.current) localVideoRef.current.srcObject = screen;
        } catch {}
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
        if (isHost && streamId) {
            await fetch(`/api/live/${streamId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            }).catch(() => {});
        } else if (streamId) {
            await apiPost({ action: "leave" }).catch(() => {});
        }
        stopAll();
        onClose?.();
    };

    useEffect(() => {
        if (!started || !streamId) return;
        pollRef.current = setInterval(() => { doPoll(); doPollChat(); }, POLL_MS);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [started, streamId, doPoll, doPollChat]);

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
        if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }, [chatMessages]);

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
            <style>{`
                :fullscreen, ::-webkit-full-screen { width: 100vw !important; height: 100vh !important; }
                :fullscreen .fs-hide, ::-webkit-full-screen .fs-hide { display: none !important; }
                :fullscreen .fs-video, ::-webkit-full-screen .fs-video { width: 100vw !important; height: 100vh !important; object-fit: contain !important; }
                :fullscreen .fs-chat-overlay, ::-webkit-full-screen .fs-chat-overlay {
                    display: flex !important; position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important;
                    top: auto !important; height: 45vh !important; z-index: 9999 !important; border-radius: 1rem 1rem 0 0 !important;
                    background: rgba(0,0,0,0.85) !important; backdrop-filter: blur(12px) !important; border-top: 1px solid rgba(255,255,255,0.1) !important;
                }
                :fullscreen .fs-exit-btn, ::-webkit-full-screen .fs-exit-btn { display: flex !important; }
            `}</style>

            {settingsOpen && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 w-72 bg-gray-900/95 backdrop-blur-md border border-white/10 rounded-2xl p-4 z-50 shadow-2xl">
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

                    {!isHost && (
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

            {!isFullscreen && (
                <div className="flex items-center justify-between px-4 py-2.5 safe-top bg-black shrink-0 z-10">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                        <span className="text-white text-sm font-bold">LIVE</span>
                        <span className="text-white/50 text-xs">{viewers} watching</span>
                    </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setSettingsOpen((v) => !v)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                    </button>
                    <button onClick={toggleFullscreen} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                        </button>
                        <button onClick={() => setChatOpen((v) => !v)} className="sm:hidden w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                            </svg>
                        </button>
                        <button onClick={endStream} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-full">
                            {isHost ? "End" : "Leave"}
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 flex min-h-0">
                <div className="flex-1 relative bg-black min-h-0 flex items-center justify-center">
                    {isHost ? (
                        hostHasVideo ? (
                            <video ref={localVideoRef} autoPlay muted playsInline className={`w-full h-full ${isFullscreen ? "fs-video object-contain" : "object-cover"}`} />
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center text-white text-4xl font-bold">
                                    {hostUsername?.[0]?.toUpperCase()}
                                </div>
                                <p className="text-white/40 text-sm">Audio only</p>
                            </div>
                        )
                    ) : (
                        <div className="w-full h-full relative">
                            <video ref={remoteVideoRef} autoPlay muted playsInline preload="auto" className={`w-full h-full ${isFullscreen ? "fs-video object-contain" : "object-cover"}`} />
                        </div>
                    )}

                    <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 fs-hide">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            {hostUsername?.[0]?.toUpperCase()}
                        </div>
                        <span className="text-white text-xs font-medium">{hostUsername}</span>
                    </div>

                    <button onClick={toggleFullscreen} className="fs-exit-btn hidden absolute bottom-20 left-1/2 -translate-x-1/2 items-center gap-2 px-4 py-2.5 bg-black/60 backdrop-blur-sm rounded-full text-white text-xs font-medium z-50">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" /></svg>
                        Exit fullscreen
                    </button>

                    {isHost && hostHasVideo && !isFullscreen && (
                        <div className="absolute bottom-24 sm:bottom-4 right-3 w-20 h-28 sm:w-28 sm:h-36 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg bg-black z-30">
                            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                        </div>
                    )}

                    <button onClick={() => setChatOpen((v) => !v)} className="sm:hidden absolute bottom-20 right-3 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white z-30 fs-hide">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                        </svg>
                    </button>
                </div>

                <div className={`${chatOpen ? (isFullscreen ? "fs-chat-overlay" : "absolute inset-0 z-20") : "hidden"} sm:relative sm:block sm:z-auto sm:w-72 lg:w-80 bg-gray-950 sm:border-l border-white/10 flex flex-col shrink-0`}>
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
                                    <button
                                        onClick={() => setReplyingTo(msg)}
                                        className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                                        title="Reply">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => translateMessage(i, msg.text)}
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

            {isHost && !isFullscreen && (
                <div className="fixed bottom-0 left-0 right-0 flex items-center justify-center gap-3 px-4 pt-3 bg-gradient-to-t from-black via-black/80 to-transparent z-[60] safe-bottom" style={{ willChange: "transform" }}>
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
                    <button onClick={toggleScreenShare} className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${sharing ? "bg-blue-500 text-white" : "bg-white/15 text-white"}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 7.41A2.25 2.25 0 0 1 2.25 5.495V5.25" />
                        </svg>
                    </button>
                </div>
            )}

            {isHost && isFullscreen && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 bg-black/60 backdrop-blur-sm rounded-full z-50">
                    <button onClick={toggleMute} className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${muted ? "bg-white text-black" : "bg-white/20 text-white"}`}>
                        {muted
                            ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" /></svg>
                            : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>
                        }
                    </button>
                    <button onClick={toggleScreenShare} className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${sharing ? "bg-blue-500 text-white" : "bg-white/20 text-white"}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 7.41A2.25 2.25 0 0 1 2.25 5.495V5.25" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}

export default function LiveButton({ username }) {
    const [open, setOpen]                   = useState(false);
    const [activeStreams, setActiveStreams]  = useState([]);
    const [joining, setJoining]             = useState(null);
    const { user } = useUser();

    useEffect(() => {
        let cancelled = false;
        const poll = async () => {
            try {
                const res = await fetch("/api/live");
                if (res.ok && !cancelled) {
                    const data = await res.json();
                    setActiveStreams(data.streams || []);
                }
            } catch {}
        };
        poll();
        const id = setInterval(poll, 5000);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    if (joining || open) {
        return (
            <LiveStreamModal
                streamId={joining}
                hostUsername={joining ? activeStreams.find((s) => s._id === joining)?.host : username}
                onClose={() => { setOpen(false); setJoining(null); }}
            />
        );
    }

    const canGoLive = user?.isAdmin || user?.liveStreamAllowed;

    if (activeStreams.filter((s) => s.host !== user?.username).length > 0 && !open && !joining) {
        return (
            <div className="flex items-center gap-2 flex-wrap">
                {canGoLive && (
                    <button onClick={() => setOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold rounded-full hover:from-purple-600 hover:to-pink-600 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
                        </svg>
                        Go Live
                    </button>
                )}
                {activeStreams.filter((s) => s.host !== user?.username).map((s) => (
                    <button key={s._id} onClick={() => setJoining(s._id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-semibold rounded-full hover:from-red-600 hover:to-pink-600 transition-all">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        {s.host} is live
                    </button>
                ))}
            </div>
        );
    }

    return (
        <>
            {canGoLive && (
                <button onClick={() => setOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold rounded-full hover:from-purple-600 hover:to-pink-600 transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
                    </svg>
                    Go Live
                </button>
            )}
        </>
    );
}
