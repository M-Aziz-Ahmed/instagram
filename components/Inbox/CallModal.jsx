"use client";

import { useEffect, useRef } from "react";
import { useCall } from "@/context/CallContext";

function VideoGrid({ remoteStreams, localStream, videoOn, callType }) {
    const peers = Object.entries(remoteStreams);
    const count = peers.length + (localStream ? 1 : 0);

    return (
        <div className={`grid gap-2 w-full h-full ${count <= 1 ? "grid-cols-1" : count <= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
            {localStream && (
                <div className="relative rounded-xl overflow-hidden bg-gray-900 flex items-center justify-center">
                    <video
                        ref={el => { if (el) el.srcObject = localStream; }}
                        autoPlay playsInline muted
                        className="w-full h-full object-cover"
                        style={{ transform: "scaleX(-1)" }}
                    />
                    {!videoOn && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                            <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-white text-xl font-bold">
                                You
                            </div>
                        </div>
                    )}
                    <span className="absolute bottom-2 left-2 text-xs text-white bg-black/50 px-2 py-0.5 rounded-full">You</span>
                </div>
            )}
            {peers.map(([username, stream]) => (
                <RemoteVideo key={username} username={username} stream={stream} />
            ))}
        </div>
    );
}

function RemoteVideo({ username, stream }) {
    const ref = useRef(null);
    useEffect(() => {
        if (ref.current && stream) {
            ref.current.srcObject = stream;
        }
    }, [stream]);

    const hasVideo = stream?.getVideoTracks().length > 0 && stream.getVideoTracks().some(t => t.enabled);

    return (
        <div className="relative rounded-xl overflow-hidden bg-gray-900 flex items-center justify-center">
            {hasVideo ? (
                <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
                <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-white text-xl font-bold">
                    {username[0]?.toUpperCase()}
                </div>
            )}
            <span className="absolute bottom-2 left-2 text-xs text-white bg-black/50 px-2 py-0.5 rounded-full">{username}</span>
        </div>
    );
}

export default function CallModal() {
    const {
        callState, localStream, remoteStreams, isMuted, isDeafened, videoOn,
        acceptCall, rejectCall, endCall, toggleMute, toggleDeafen, toggleVideo,
    } = useCall();

    if (!callState) return null;

    const { status, caller, callType, callId, type, recipients } = callState;
    const isIncoming = status === "ringing" && caller !== null;
    const isAudioOnly = callType === "audio";
    const peerNames = type === "1:1" ? recipients.join(", ") : recipients.join(", ");
    const displayName = caller || "Unknown";

    if (status === "ended") return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-lg h-[85vh] max-h-[700px] bg-gray-950 rounded-3xl flex flex-col overflow-hidden shadow-2xl">

                {/* Call Info */}
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center relative">
                    {(status === "ringing" || status === "connecting") && (
                        <>
                            <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center text-white text-2xl font-bold mb-4 ring-4 ring-blue-500/30 animate-pulse">
                                {displayName[0]?.toUpperCase()}
                            </div>
                            <h3 className="text-white text-lg font-bold">{isIncoming ? displayName : peerNames}</h3>
                            <p className="text-gray-400 text-sm mt-1">
                                {status === "ringing"
                                    ? (isIncoming ? `Incoming ${callType} call...` : "Ringing...")
                                    : "Connecting..."}
                            </p>
                        </>
                    )}

                    {status === "active" && (
                        <div className="w-full h-full">
                            {isAudioOnly ? (
                                <div className="flex flex-col items-center justify-center h-full">
                                    <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center text-white text-2xl font-bold mb-4">
                                        {type === "1:1" ? (recipients[0]?.[0]?.toUpperCase() || "?") : `${Object.keys(remoteStreams).length + 1}`}
                                    </div>
                                    <p className="text-white font-medium">{type === "1:1" ? recipients[0] : `${Object.keys(remoteStreams).length + 1} participants`}</p>
                                </div>
                            ) : (
                                <VideoGrid
                                    remoteStreams={remoteStreams}
                                    localStream={localStream}
                                    videoOn={videoOn}
                                    callType={callType}
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4 p-6 bg-gray-900/80">
                    {isIncoming && status === "ringing" ? (
                        <>
                            <button
                                onClick={rejectCall}
                                className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors"
                                aria-label="Decline"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                            <button
                                onClick={() => acceptCall(callId)}
                                className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white transition-colors"
                                aria-label="Accept"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                                </svg>
                            </button>
                        </>
                    ) : status === "active" || status === "connecting" ? (
                        <>
                            {isAudioOnly && (
                                <>
                                    <button onClick={toggleVideo}
                                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${videoOn ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                                        aria-label="Toggle video">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                                        </svg>
                                    </button>
                                </>
                            )}
                            {!isAudioOnly && (
                                <button onClick={toggleVideo}
                                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${videoOn ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                                    aria-label="Toggle video">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill={videoOn ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                                    </svg>
                                </button>
                            )}
                            <button onClick={toggleMute}
                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isMuted ? "bg-red-500 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                                aria-label="Toggle mute">
                                {isMuted ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                                    </svg>
                                )}
                            </button>
                            <button onClick={toggleDeafen}
                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isDeafened ? "bg-red-500 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                                aria-label="Toggle deafen">
                                {isDeafened ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                    </svg>
                                )}
                            </button>
                            <button onClick={endCall}
                                className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors"
                                aria-label="End call">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 3.75 18 6m0 0 2.25 2.25M18 6l2.25-2.25M18 6l-2.25 2.25m1.5 13.5c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 0 1 4.5 2.25H6.75A2.25 2.25 0 0 1 9 4.5v2.25c0 .28.224.5.5.5H12a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5H9.75" />
                                </svg>
                            </button>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
