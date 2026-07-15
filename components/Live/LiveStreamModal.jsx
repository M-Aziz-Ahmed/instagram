"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
};

const POLL_INTERVAL = 1500;

function LiveStreamModal({ streamId: initialStreamId, hostUsername, onClose }) {
    const { user } = useUser();
    const [streamId, setStreamId]       = useState(initialStreamId || null);
    const [viewers, setViewers]         = useState(0);
    const [isHost, setIsHost]           = useState(false);
    const [sharing, setSharing]         = useState(false);
    const [muted, setMuted]             = useState(false);
    const [cameraOff, setCameraOff]     = useState(false);
    const [error, setError]             = useState("");
    const [started, setStarted]         = useState(false);

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const screenStreamRef = useRef(null);
    const pcRef = useRef(null);
    const pollRef = useRef(null);
    const sinceRef = useRef(null);

    const isHostUser = user?.username === hostUsername;

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
                audio: true,
            });
            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            return stream;
        } catch (err) {
            setError("Camera/microphone access denied");
            console.error(err);
            return null;
        }
    }, []);

    const stopAll = useCallback(() => {
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        pcRef.current?.close();
        if (pollRef.current) clearInterval(pollRef.current);
    }, []);

    const createPeer = useCallback((remoteUsername) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        const stream = localStreamRef.current;
        if (stream) {
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        }

        pc.ontrack = (e) => {
            if (remoteVideoRef.current && e.streams[0]) {
                remoteVideoRef.current.srcObject = e.streams[0];
            }
        };

        pc.onicecandidate = async (e) => {
            if (e.candidate && streamId) {
                await fetch(`/api/live/${streamId}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: user.username,
                        action: "signal",
                        to: remoteUsername,
                        type: "ice-candidate",
                        data: e.candidate.toJSON(),
                    }),
                });
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
                pc.close();
            }
        };

        return pc;
    }, [streamId, user?.username]);

    const handleSignal = useCallback(async (signal) => {
        if (!signal?.type || !signal?.data) return;
        const pc = pcRef.current;

        if (signal.type === "offer" && !isHostUser) {
            const newPc = createPeer(signal.from);
            await newPc.setRemoteDescription(new RTCSessionDescription(signal.data));
            const answer = await newPc.createAnswer();
            await newPc.setLocalDescription(answer);

            await fetch(`/api/live/${streamId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    action: "signal",
                    to: signal.from,
                    type: "answer",
                    data: answer,
                }),
            });
        } else if (signal.type === "answer" && isHostUser && pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
        } else if (signal.type === "ice-candidate" && pc) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(signal.data));
            } catch { /* ignore */ }
        }
    }, [isHostUser, createPeer, streamId, user?.username]);

    const pollSignals = useCallback(async () => {
        if (!streamId || !user?.username) return;
        try {
            const res = await fetch(`/api/live/${streamId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    action: "poll",
                    since: sinceRef.current || new Date(0).toISOString(),
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setViewers(data.viewers);
                sinceRef.current = new Date().toISOString();
                for (const signal of data.signals) {
                    await handleSignal(signal);
                }
            }
        } catch { /* silent */ }
    }, [streamId, user?.username, handleSignal]);

    const goLive = useCallback(async () => {
        const stream = await startCamera();
        if (!stream) return;

        try {
            const res = await fetch("/api/live", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, title: "Live Stream" }),
            });
            const data = await res.json();
            setStreamId(data.streamId);
            setIsHost(true);
            setStarted(true);
            sinceRef.current = new Date().toISOString();
        } catch (err) {
            setError("Failed to start stream");
            stream.getTracks().forEach((t) => t.stop());
        }
    }, [startCamera, user?.username]);

    const joinStream = useCallback(async (sid) => {
        const stream = await startCamera();
        if (!stream) return;

        setStreamId(sid);
        setIsHost(false);
        setStarted(true);
        sinceRef.current = new Date().toISOString();

        await fetch(`/api/live/${sid}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user.username, action: "join" }),
        });
    }, [startCamera, user?.username]);

    const toggleScreenShare = useCallback(async () => {
        if (sharing) {
            screenStreamRef.current?.getTracks().forEach((t) => t.stop());
            screenStreamRef.current = null;
            setSharing(false);

            const pc = pcRef.current;
            if (pc && localStreamRef.current) {
                const videoTrack = localStreamRef.current.getVideoTracks()[0];
                const sender = pc.getSenders().find((s) => s.track?.kind === "video");
                if (sender && videoTrack) {
                    sender.replaceTrack(videoTrack);
                }
            }
            if (localVideoRef.current && localStreamRef.current) {
                localVideoRef.current.srcObject = localStreamRef.current;
            }
            return;
        }

        try {
            const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            screenStreamRef.current = screen;
            setSharing(true);

            const screenTrack = screen.getVideoTracks()[0];
            screenTrack.onended = () => {
                setSharing(false);
                screenStreamRef.current = null;
                const pc = pcRef.current;
                if (pc && localStreamRef.current) {
                    const videoTrack = localStreamRef.current.getVideoTracks()[0];
                    const sender = pc.getSenders().find((s) => s.track?.kind === "video");
                    if (sender && videoTrack) sender.replaceTrack(videoTrack);
                }
                if (localVideoRef.current && localStreamRef.current) {
                    localVideoRef.current.srcObject = localStreamRef.current;
                }
            };

            const pc = pcRef.current;
            if (pc) {
                const sender = pc.getSenders().find((s) => s.track?.kind === "video");
                if (sender) sender.replaceTrack(screenTrack);
            }
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = screen;
            }
        } catch { /* user cancelled */ }
    }, [sharing]);

    const toggleMute = useCallback(() => {
        const stream = localStreamRef.current;
        if (!stream) return;
        stream.getAudioTracks().forEach((t) => { t.enabled = muted; });
        setMuted((m) => !m);
    }, [muted]);

    const toggleCamera = useCallback(() => {
        const stream = localStreamRef.current;
        if (!stream) return;
        stream.getVideoTracks().forEach((t) => { t.enabled = cameraOff; });
        setCameraOff((c) => !c);
    }, [cameraOff]);

    const endStream = useCallback(async () => {
        if (isHost && streamId) {
            await fetch(`/api/live/${streamId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            });
        } else if (streamId) {
            await fetch(`/api/live/${streamId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, action: "leave" }),
            });
        }
        stopAll();
        onClose?.();
    }, [isHost, streamId, user?.username, stopAll, onClose]);

    // Host: create offer for joining viewers
    const sendOffer = useCallback(async (viewerUsername) => {
        if (!streamId) return;
        const pc = createPeer(viewerUsername);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await fetch(`/api/live/${streamId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: user.username,
                action: "signal",
                to: viewerUsername,
                type: "offer",
                data: offer,
            }),
        });
    }, [streamId, createPeer, user?.username]);

    // Start polling
    useEffect(() => {
        if (!started || !streamId) return;
        pollRef.current = setInterval(pollSignals, POLL_INTERVAL);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [started, streamId, pollSignals]);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopAll();
    }, [stopAll]);

    if (error) {
        return (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
                    <p className="text-red-500 text-sm mb-4">{error}</p>
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-full text-sm font-medium">Close</button>
                </div>
            </div>
        );
    }

    if (!started) {
        return (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
                <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                    <div className="p-6 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-500">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Go Live</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Share your screen or camera with others in real time</p>
                        <button
                            onClick={() => isHostUser ? goLive() : joinStream(streamId)}
                            className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors"
                        >
                            Start Live Stream
                        </button>
                    </div>
                    <div className="px-6 pb-4">
                        <button onClick={onClose} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 safe-top">
                <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white text-sm font-semibold">LIVE</span>
                    <span className="text-white/60 text-xs">{viewers} watching</span>
                </div>
                <button onClick={endStream} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-full transition-colors">
                    End
                </button>
            </div>

            {/* Video area */}
            <div className="flex-1 relative overflow-hidden">
                {isHostUser ? (
                    <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                    />
                )}

                {isHostUser && (
                    <div className="absolute bottom-4 right-4 w-28 h-40 rounded-xl overflow-hidden border-2 border-white/30 shadow-lg">
                        <video
                            ref={localVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                        />
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 py-4 safe-bottom bg-black/50">
                <button
                    onClick={toggleMute}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                        muted ? "bg-white text-black" : "bg-white/20 text-white hover:bg-white/30"
                    }`}
                >
                    {muted ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                        </svg>
                    )}
                </button>

                <button
                    onClick={toggleCamera}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                        cameraOff ? "bg-white text-black" : "bg-white/20 text-white hover:bg-white/30"
                    }`}
                >
                    {cameraOff ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                        </svg>
                    )}
                </button>

                {isHostUser && (
                    <button
                        onClick={toggleScreenShare}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                            sharing ? "bg-blue-500 text-white" : "bg-white/20 text-white hover:bg-white/30"
                        }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 7.41A2.25 2.25 0 0 1 2.25 5.495V5.25" />
                        </svg>
                    </button>
                )}

                <button
                    onClick={endStream}
                    className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

export default function LiveButton({ username }) {
    const [open, setOpen]             = useState(false);
    const [activeStreams, setActiveStreams] = useState([]);
    const [joining, setJoining]       = useState(null);
    const { user } = useUser();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/live");
                if (res.ok && !cancelled) {
                    const data = await res.json();
                    setActiveStreams(data.streams || []);
                }
            } catch { /* silent */ }
        })();
        return () => { cancelled = true; };
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

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold rounded-full hover:from-purple-600 hover:to-pink-600 transition-all"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
                </svg>
                Go Live
            </button>

            {activeStreams.length > 0 && (
                <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
                    {activeStreams.filter((s) => s.host !== user?.username).map((s) => (
                        <button
                            key={s._id}
                            onClick={() => setJoining(s._id)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-full shadow-lg animate-pulse"
                        >
                            <span className="w-2 h-2 rounded-full bg-white" />
                            {s.host} is live
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}
