"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
};

const POLL_MS = 1200;

function LiveStreamModal({ streamId: initialStreamId, hostUsername, onClose }) {
    const { user } = useUser();
    const [streamId, setStreamId]     = useState(initialStreamId || null);
    const [viewers, setViewers]       = useState(0);
    const [isHost, setIsHost]         = useState(false);
    const [sharing, setSharing]       = useState(false);
    const [muted, setMuted]           = useState(false);
    const [cameraOff, setCameraOff]   = useState(true);
    const [error, setError]           = useState("");
    const [started, setStarted]       = useState(false);

    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput]       = useState("");
    const [chatOpen, setChatOpen]         = useState(false);
    const chatScrollRef = useRef(null);
    const chatSinceRef  = useRef(null);

    const localVideoRef   = useRef(null);
    const remoteVideoRef  = useRef(null);
    const localStreamRef  = useRef(null);
    const screenStreamRef = useRef(null);
    const pcsRef          = useRef({});       // host: { viewerUsername => RTCPeerConnection }
    const viewerPcRef     = useRef(null);     // viewer: single RTCPeerConnection to host
    const pollRef         = useRef(null);
    const sinceRef        = useRef(null);

    const isHostUser = user?.username === hostUsername;

    /* ── cleanup ── */
    const stopAll = useCallback(() => {
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        Object.values(pcsRef.current).forEach((pc) => pc.close());
        pcsRef.current = {};
        viewerPcRef.current?.close();
        viewerPcRef.current = null;
        if (pollRef.current) clearInterval(pollRef.current);
    }, []);

    /* ── host: create a peer for a specific viewer ── */
    const createHostPeer = useCallback((viewerUsername) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcsRef.current[viewerUsername] = pc;

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
        }

        pc.onicecandidate = (e) => {
            if (e.candidate && streamId) {
                fetch(`/api/live/${streamId}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: user.username,
                        action: "signal",
                        to: viewerUsername,
                        type: "ice-candidate",
                        data: e.candidate.toJSON(),
                    }),
                }).catch(() => {});
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
                pc.close();
                delete pcsRef.current[viewerUsername];
            }
        };

        return pc;
    }, [streamId, user?.username]);

    /* ── host: send offer to a viewer who requested it ── */
    const hostSendOffer = useCallback(async (viewerUsername) => {
        if (!streamId) return;
        const pc = createHostPeer(viewerUsername);
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
        }).catch(() => {});
    }, [streamId, createHostPeer, user?.username]);

    /* ── viewer: create a peer to the host ── */
    const createViewerPeer = useCallback(() => {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        viewerPcRef.current = pc;

        pc.ontrack = (e) => {
            if (remoteVideoRef.current && e.streams[0]) {
                remoteVideoRef.current.srcObject = e.streams[0];
            }
        };

        pc.onicecandidate = (e) => {
            if (e.candidate && streamId) {
                fetch(`/api/live/${streamId}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: user.username,
                        action: "signal",
                        to: hostUsername,
                        type: "ice-candidate",
                        data: e.candidate.toJSON(),
                    }),
                }).catch(() => {});
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
                pc.close();
                viewerPcRef.current = null;
            }
        };

        return pc;
    }, [streamId, user?.username, hostUsername]);

    /* ── handle incoming signal ── */
    const handleSignal = useCallback(async (signal) => {
        if (!signal?.type || !signal?.data) return;

        if (!isHostUser) {
            /* Viewer receives an offer from host */
            if (signal.type === "offer") {
                const pc = viewerPcRef.current || createViewerPeer();
                await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

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
                }).catch(() => {});
            } else if (signal.type === "ice-candidate" && viewerPcRef.current) {
                try { await viewerPcRef.current.addIceCandidate(new RTCIceCandidate(signal.data)); } catch {}
            }
        } else {
            /* Host receives a request-offer from a viewer */
            if (signal.type === "request-offer") {
                await hostSendOffer(signal.from);
            } else if (signal.type === "answer") {
                const pc = pcsRef.current[signal.from];
                if (pc) {
                    try { await pc.setRemoteDescription(new RTCSessionDescription(signal.data)); } catch {}
                }
            } else if (signal.type === "ice-candidate") {
                const pc = pcsRef.current[signal.from];
                if (pc) {
                    try { await pc.addIceCandidate(new RTCIceCandidate(signal.data)); } catch {}
                }
            }
        }
    }, [isHostUser, streamId, user?.username, hostUsername, createViewerPeer, hostSendOffer]);

    /* ── polling ── */
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
        } catch {}
    }, [streamId, user?.username, handleSignal]);

    const pollChat = useCallback(async () => {
        if (!streamId) return;
        try {
            const since = chatSinceRef.current || new Date(0).toISOString();
            const res = await fetch(`/api/live/${streamId}?action=chat&since=${encodeURIComponent(since)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.messages?.length) {
                    setChatMessages((prev) => {
                        const ids = new Set(prev.map((m) => `${m.username}-${m.createdAt}`));
                        const fresh = data.messages.filter((m) => !ids.has(`${m.username}-${m.createdAt}`));
                        return fresh.length ? [...prev, ...fresh] : prev;
                    });
                    chatSinceRef.current = new Date().toISOString();
                }
            }
        } catch {}
    }, [streamId]);

    /* ── chat ── */
    const sendChat = useCallback(async () => {
        if (!chatInput.trim() || !streamId) return;
        const text = chatInput.trim();
        setChatInput("");
        try {
            const res = await fetch(`/api/live/${streamId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    action: "chat",
                    text,
                    color: user.color || user.avatarColor || "#3b82f6",
                    avatarUrl: user.avatarUrl || "",
                }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.message) {
                    setChatMessages((prev) => [...prev, data.message]);
                    chatSinceRef.current = new Date().toISOString();
                }
            }
        } catch {}
    }, [chatInput, streamId, user]);

    /* ── start / join ── */
    const goLive = useCallback(async (withCamera) => {
        if (withCamera) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
                    audio: true,
                });
                localStreamRef.current = stream;
                setCameraOff(false);
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            } catch {
                setError("Camera/microphone access denied");
                return;
            }
        }

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
            chatSinceRef.current = new Date().toISOString();
        } catch {
            setError("Failed to start stream");
            localStreamRef.current?.getTracks().forEach((t) => t.stop());
        }
    }, [user]);

    const joinStream = useCallback(async (sid) => {
        setStreamId(sid);
        setIsHost(false);
        setStarted(true);
        sinceRef.current = new Date().toISOString();
        chatSinceRef.current = new Date().toISOString();

        await fetch(`/api/live/${sid}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user.username, action: "join" }),
        }).catch(() => {});

        /* Request an offer from the host */
        setTimeout(async () => {
            await fetch(`/api/live/${sid}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    action: "signal",
                    to: hostUsername,
                    type: "request-offer",
                    data: {},
                }),
            }).catch(() => {});
        }, 500);
    }, [user, hostUsername]);

    /* ── toggles ── */
    const toggleCamera = useCallback(async () => {
        if (!isHostUser) return;

        if (!cameraOff) {
            localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
            if (localStreamRef.current) {
                const remaining = localStreamRef.current.getTracks().filter((t) => t.kind !== "video");
                localStreamRef.current = remaining.length ? new MediaStream(remaining) : null;
            }
            setCameraOff(true);
            Object.values(pcsRef.current).forEach((pc) => {
                const sender = pc.getSenders().find((s) => s.track?.kind === "video");
                if (sender) sender.replaceTrack(null);
            });
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            const vt = stream.getVideoTracks()[0];
            if (localStreamRef.current) {
                localStreamRef.current.addTrack(vt);
            } else {
                localStreamRef.current = stream;
            }
            setCameraOff(false);
            if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
            Object.values(pcsRef.current).forEach((pc) => {
                const sender = pc.getSenders().find((s) => s.track?.kind === "video");
                if (sender) sender.replaceTrack(vt);
            });
        } catch {}
    }, [cameraOff, isHostUser]);

    const toggleMute = useCallback(() => {
        localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = muted; });
        setMuted((m) => !m);
    }, [muted]);

    const toggleScreenShare = useCallback(async () => {
        if (!isHostUser) return;

        if (sharing) {
            screenStreamRef.current?.getTracks().forEach((t) => t.stop());
            screenStreamRef.current = null;
            setSharing(false);
            const vt = localStreamRef.current?.getVideoTracks()[0];
            Object.values(pcsRef.current).forEach((pc) => {
                const sender = pc.getSenders().find((s) => s.track?.kind === "video");
                if (sender) sender.replaceTrack(vt || null);
            });
            if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
            return;
        }

        try {
            const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            screenStreamRef.current = screen;
            setSharing(true);
            const st = screen.getVideoTracks()[0];
            st.onended = () => {
                setSharing(false);
                screenStreamRef.current = null;
                const vt = localStreamRef.current?.getVideoTracks()[0];
                Object.values(pcsRef.current).forEach((pc) => {
                    const sender = pc.getSenders().find((s) => s.track?.kind === "video");
                    if (sender) sender.replaceTrack(vt || null);
                });
                if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
            };
            Object.values(pcsRef.current).forEach((pc) => {
                const sender = pc.getSenders().find((s) => s.track?.kind === "video");
                if (sender) sender.replaceTrack(st);
            });
            if (localVideoRef.current) localVideoRef.current.srcObject = screen;
        } catch {}
    }, [sharing, isHostUser]);

    const endStream = useCallback(async () => {
        if (isHost && streamId) {
            await fetch(`/api/live/${streamId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            }).catch(() => {});
        } else if (streamId) {
            await fetch(`/api/live/${streamId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, action: "leave" }),
            }).catch(() => {});
        }
        stopAll();
        onClose?.();
    }, [isHost, streamId, user?.username, stopAll, onClose]);

    /* ── start polling ── */
    useEffect(() => {
        if (!started || !streamId) return;
        pollRef.current = setInterval(() => { pollSignals(); pollChat(); }, POLL_MS);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [started, streamId, pollSignals, pollChat]);

    useEffect(() => () => stopAll(), [stopAll]);

    useEffect(() => {
        if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }, [chatMessages]);

    /* ── UI ── */
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
                            {isHostUser ? "Go Live" : `Join ${hostUsername}'s live`}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                            {isHostUser ? "Start chatting with your audience" : "Watch and chat — no camera needed"}
                        </p>
                        {isHostUser ? (
                            <div className="flex flex-col gap-2">
                                <button onClick={() => goLive(true)} className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors">
                                    Start with Camera
                                </button>
                                <button onClick={() => goLive(false)} className="w-full py-3 bg-gray-800 dark:bg-gray-700 hover:bg-gray-900 dark:hover:bg-gray-600 text-white font-semibold rounded-xl transition-colors">
                                    Start Audio & Chat Only
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

    const hostHasVideo = isHostUser && !cameraOff;

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ height: "100dvh" }}>
            {/* ── Top bar ── */}
            <div className="flex items-center justify-between px-4 py-2.5 safe-top bg-black shrink-0 z-10">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="text-white text-sm font-bold">LIVE</span>
                    <span className="text-white/50 text-xs">{viewers} watching</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
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

            {/* ── Main: video + chat side by side ── */}
            <div className="flex-1 flex min-h-0">
                {/* Video area */}
                <div className="flex-1 relative bg-black min-h-0 flex items-center justify-center">
                    {isHostUser ? (
                        hostHasVideo ? (
                            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center text-white text-4xl font-bold">
                                    {hostUsername?.[0]?.toUpperCase()}
                                </div>
                                <p className="text-white/40 text-sm">Camera off — audio & chat only</p>
                            </div>
                        )
                    ) : (
                        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    )}

                    {/* Host badge */}
                    <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            {hostUsername?.[0]?.toUpperCase()}
                        </div>
                        <span className="text-white text-xs font-medium">{hostUsername}</span>
                    </div>

                    {/* Host self-view pip */}
                    {isHostUser && hostHasVideo && (
                        <div className="absolute bottom-16 sm:bottom-4 right-3 w-20 h-28 sm:w-28 sm:h-36 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg bg-black">
                            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                        </div>
                    )}
                </div>

                {/* Chat panel — desktop: side, mobile: overlay */}
                <div className={`
                    ${chatOpen ? "absolute inset-0 z-20" : "hidden"} sm:relative sm:block sm:z-auto
                    sm:w-72 lg:w-80 bg-gray-950 sm:border-l border-white/10 flex flex-col shrink-0
                `}>
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
                            <div key={i} className="flex gap-2">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5" style={{ backgroundColor: msg.color || "#3b82f6" }}>
                                    {msg.avatarUrl ? <img src={msg.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" /> : msg.username?.[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <span className="text-[11px] font-bold mr-1.5" style={{ color: msg.color || "#60a5fa" }}>{msg.username}</span>
                                    <span className="text-white/90 text-xs break-words">{msg.text}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} className="flex gap-2 px-3 py-2.5 border-t border-white/10 shrink-0">
                        <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Send a message..."
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

            {/* ── Bottom controls ── */}
            {isHostUser && (
                <div className="flex items-center justify-center gap-3 px-4 py-3 safe-bottom bg-black shrink-0 z-10">
                    <button onClick={toggleMute} className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${muted ? "bg-white text-black" : "bg-white/15 text-white"}`}>
                        {muted
                            ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" /></svg>
                            : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>
                        }
                    </button>
                    <button onClick={toggleCamera} className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${cameraOff ? "bg-white/15 text-white" : "bg-white text-black"}`}>
                        {cameraOff
                            ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 3 21 21" /></svg>
                            : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                        }
                    </button>
                    <button onClick={toggleScreenShare} className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${sharing ? "bg-blue-500 text-white" : "bg-white/15 text-white"}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 7.41A2.25 2.25 0 0 1 2.25 5.495V5.25" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}

export default function LiveButton({ username }) {
    const [open, setOpen]                 = useState(false);
    const [activeStreams, setActiveStreams] = useState([]);
    const [joining, setJoining]           = useState(null);
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

    return (
        <>
            <button onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold rounded-full hover:from-purple-600 hover:to-pink-600 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
                </svg>
                Go Live
            </button>

            {activeStreams.length > 0 && (
                <div className="fixed bottom-20 sm:bottom-4 right-4 z-40 flex flex-col gap-2">
                    {activeStreams.filter((s) => s.host !== user?.username).map((s) => (
                        <button key={s._id} onClick={() => setJoining(s._id)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-full shadow-lg animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-white" />
                            {s.host} is live
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}
