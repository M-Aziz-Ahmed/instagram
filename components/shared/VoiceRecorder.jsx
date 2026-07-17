"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];

function getSupportedMime() {
    for (const mime of MIME_TYPES) {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return "";
}

function uploadAudioToCloudinary(blob) {
    return new Promise((resolve, reject) => {
        const fd = new FormData();
        fd.append("file", blob, `voice-${Date.now()}.webm`);
        fd.append("upload_preset", UPLOAD_PRESET);
        fd.append("folder", "anon-feed");
        fd.append("resource_type", "video");
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`);
        xhr.onload = () => {
            if (xhr.status === 200) {
                resolve(JSON.parse(xhr.responseText).secure_url);
            } else {
                reject(new Error("Upload failed"));
            }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(fd);
    });
}

export default function VoiceRecorder({ onRecorded, maxDuration = 60, onCancel }) {
    const [recording, setRecording]       = useState(false);
    const [elapsed, setElapsed]           = useState(0);
    const [uploading, setUploading]       = useState(false);
    const [error, setError]               = useState("");
    const mediaRecorderRef                = useRef(null);
    const chunksRef                       = useRef([]);
    const timerRef                        = useRef(null);
    const streamRef                       = useRef(null);

    const cleanup = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
    }, []);

    useEffect(() => () => cleanup(), [cleanup]);

    const startRecording = async () => {
        setError("");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const mime = getSupportedMime();
            const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = async () => {
                cleanup();
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
                chunksRef.current = [];
                if (blob.size < 1000) {
                    setError("Recording too short");
                    return;
                }
                setUploading(true);
                try {
                    const url = await uploadAudioToCloudinary(blob);
                    onRecorded?.(url);
                } catch {
                    setError("Failed to upload recording");
                }
                setUploading(false);
            };

            recorder.start(250);
            setRecording(true);
            setElapsed(0);

            timerRef.current = setInterval(() => {
                setElapsed((prev) => {
                    if (prev + 1 >= maxDuration) {
                        stopRecording();
                        return prev;
                    }
                    return prev + 1;
                });
            }, 1000);
        } catch {
            setError("Microphone access denied");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
        }
        setRecording(false);
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            chunksRef.current = [];
            mediaRecorderRef.current.stop();
        }
        cleanup();
        setRecording(false);
        setElapsed(0);
        onCancel?.();
    };

    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    if (uploading) {
        return (
            <div className="flex items-center gap-2 px-3 py-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-500 dark:text-gray-400">Uploading voice message...</span>
            </div>
        );
    }

    if (recording) {
        return (
            <div className="flex items-center gap-2 px-2">
                <button
                    onClick={cancelRecording}
                    className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    aria-label="Cancel recording"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                </button>
                <div className="flex items-center gap-2 flex-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm font-mono text-red-500 dark:text-red-400 font-medium">{formatTime(elapsed)}</span>
                    <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-red-500 transition-all duration-1000"
                            style={{ width: `${(elapsed / maxDuration) * 100}%` }}
                        />
                    </div>
                </div>
                <button
                    onClick={stopRecording}
                    className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors"
                    aria-label="Stop recording"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1">
            {error && (
                <span className="text-[10px] text-red-500 mr-1">{error}</span>
            )}
            <button
                onClick={startRecording}
                disabled={!onRecorded}
                className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40"
                title="Record voice message"
                aria-label="Record voice message"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
            </button>
        </div>
    );
}
