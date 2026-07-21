"use client";

import { useRef, useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";
import MentionInput from "@/components/shared/MentionInput";
import VoiceRecorder from "@/components/shared/VoiceRecorder";
import EmojiPicker from "@/components/shared/EmojiPicker";
import GifPicker from "@/components/shared/GifPicker";

const CLOUD_NAME     = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET  = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export default function Compose({ onPosted }) {
    const { user } = useUser();
    const { showToast } = useToast();
    const [text, setText]                 = useState("");
    const [preview, setPreview]           = useState(null);
    const [imageFile, setImageFile]       = useState(null);
    const [audioUrl, setAudioUrl]         = useState("");
    const [posting, setPosting]           = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError]               = useState("");
    const [visibility, setVisibility]     = useState("public");
    const [showEmoji, setShowEmoji]       = useState(false);
    const [showGif, setShowGif]           = useState(false);
    const [showPoll, setShowPoll]         = useState(false);
    const [pollOptions, setPollOptions]   = useState(["", ""]);
    const [pollExpiry, setPollExpiry]     = useState(null);
    const fileRef                         = useRef(null);

    useEffect(() => {
        const handler = () => {
            document.getElementById("compose")?.scrollIntoView({ behavior: "smooth" });
            const textarea = document.getElementById("compose")?.querySelector("textarea");
            if (textarea) {
                textarea.focus();
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            }
        };
        window.addEventListener("open-compose", handler);
        return () => window.removeEventListener("open-compose", handler);
    }, []);

    const handleFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
            setError("Image must be under 20 MB.");
            return;
        }
        setImageFile(file);
        setPreview(URL.createObjectURL(file));
        setError("");
    };

    const removeImage = () => {
        setPreview(null);
        setImageFile(null);
        setUploadProgress(0);
        setShowGif(false);
        if (fileRef.current) fileRef.current.value = "";
    };

    const uploadToCloudinary = (file) =>
        new Promise((resolve, reject) => {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("upload_preset", UPLOAD_PRESET);
            fd.append("folder", "anon-feed");

            const xhr = new XMLHttpRequest();
            xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    setUploadProgress(Math.round((e.loaded / e.total) * 100));
                }
            };
            xhr.onload  = () => xhr.status === 200
                ? resolve(JSON.parse(xhr.responseText).secure_url)
                : reject(new Error("Cloudinary upload failed"));
            xhr.onerror = () => reject(new Error("Network error during upload"));
            xhr.send(fd);
        });

    const handlePost = async () => {
        // Validate input
        const trimmedText = text.trim();
        if ((!trimmedText && !imageFile && !preview && !audioUrl) || posting || !user) return;
        
        // Check text length limit
        if (trimmedText.length > 500) {
            setError("Post text cannot exceed 500 characters");
            return;
        }
        
        setPosting(true);
        setError("");
        setUploadProgress(0);
        try {
            let imageUrl = "";
            if (imageFile) {
                try {
                    imageUrl = await uploadToCloudinary(imageFile);
                } catch (uploadErr) {
                    setError("Failed to upload image. Please try again.");
                    return;
                }
            } else if (preview) {
                imageUrl = preview;
            }
            const res = await fetch("/api/posts", {
                method:  "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({
                    text:     trimmedText,
                    imageUrl,
                    audioUrl: audioUrl || "",
                    sender:   user.username,
                    color:    user.color,
                    visibility,
                    ...(pollOptions.filter(o => o.trim()).length >= 2 && showPoll ? {
                        poll: {
                            enabled: true,
                            options: pollOptions.filter(o => o.trim()).map(t => ({ text: t })),
                        },
                        expiresIn: pollExpiry,
                    } : {}),
                    ...(pollExpiry && !showPoll ? { expiresIn: pollExpiry } : {}),
                }),
            });
            if (!res.ok) {
                const d = await res.json();
                setError(d.error ?? "Failed to post.");
                return;
            }
            setText("");
            removeImage();
            setAudioUrl("");
            setShowPoll(false);
            setPollOptions(["", ""]);
            setPollExpiry(null);
            showToast("Post published", "success");
            if (onPosted) onPosted();
        } catch (err) {
            console.error(err);
            setError(err.message || "Something went wrong. Try again.");
        } finally {
            setPosting(false);
            setUploadProgress(0);
        }
    };

    const hasValidPoll = showPoll && pollOptions.filter(o => o.trim()).length >= 2;
    const canPost = ((text.trim().length > 0 || !!imageFile || !!preview || !!audioUrl) || hasValidPoll) && !posting;

    return (
        <div id="compose" className="border-b border-gray-200 dark:border-gray-800 p-4">
            <div className="flex gap-3">
                <div
                    className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm select-none mt-0.5"
                    style={{ backgroundColor: user?.color ?? "#94a3b8" }}
                >
                    {user?.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                        user?.username?.[0]?.toUpperCase() ?? "?"
                    )}
                </div>

                <div className="flex-1 flex flex-col gap-3">
                    <MentionInput
                        value={text}
                        onChange={setText}
                        onSubmit={handlePost}
                        placeholder="What's happening? Use @ to mention someone"
                        maxLength={500}
                        submitting={posting}
                    />

                    {preview && (
                        <div className="relative w-full rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
                            <img src={preview} alt="Preview" className="w-full max-h-80 object-contain bg-gray-50 dark:bg-gray-800" />
                            {posting && uploadProgress > 0 && uploadProgress < 100 && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-200"
                                        style={{ width: `${uploadProgress}%` }}
                                    />
                                </div>
                            )}
                            {!posting && (
                                <button
                                    onClick={removeImage}
                                    aria-label="Remove image"
                                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center hover:bg-black/80 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                        strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    )}

                    {audioUrl && !preview && (
                        <div className="relative inline-flex">
                            <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-blue-500">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                </svg>
                                <span className="text-xs text-gray-500 dark:text-gray-400">Voice message</span>
                            </div>
                            {!posting && (
                                <button
                                    onClick={() => setAudioUrl("")}
                                    aria-label="Remove audio"
                                    className="absolute -top-2 -right-2 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-black/80 transition-colors text-xs"
                                >
                                    &#x2715;
                                </button>
                            )}
                        </div>
                    )}

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    {showPoll && (
                        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 space-y-2">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Poll Options</span>
                                <button onClick={() => { setShowPoll(false); setPollOptions(["", ""]); }}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs">
                                    &#x2715;
                                </button>
                            </div>
                            {pollOptions.map((opt, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 shrink-0" />
                                    <input
                                        type="text"
                                        value={opt}
                                        onChange={(e) => {
                                            const next = [...pollOptions];
                                            next[idx] = e.target.value.slice(0, 100);
                                            setPollOptions(next);
                                        }}
                                        placeholder={`Option ${idx + 1}`}
                                        className="flex-1 bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-400 dark:focus:border-blue-500"
                                    />
                                    {idx >= 2 && (
                                        <button onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                                            className="text-gray-400 hover:text-red-500 text-xs p-1" aria-label="Remove option">
                                            &#x2715;
                                        </button>
                                    )}
                                </div>
                            ))}
                            {pollOptions.length < 5 && (
                                <button
                                    onClick={() => pollOptions[pollOptions.length - 1].trim() && setPollOptions([...pollOptions, ""])}
                                    disabled={!pollOptions[pollOptions.length - 1].trim()}
                                    className="text-xs font-medium text-blue-500 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    + Add option
                                </button>
                            )}
                        </div>
                    )}

                    {(showPoll || pollExpiry) && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">Auto-delete:</span>
                            {[null, 60000, 180000, 600000, 1800000, 3600000].map((ms) => {
                                const label = ms === null ? "Never" : ms < 3600000 ? `${ms / 60000}m` : `${ms / 3600000}h`;
                                return (
                                    <button
                                        key={label}
                                        onClick={() => setPollExpiry(ms)}
                                        className={`text-[11px] font-medium px-2 py-1 rounded-full transition-colors ${
                                            pollExpiry === ms
                                                ? "bg-blue-500 text-white"
                                                : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex items-center justify-between p-1 border-t border-gray-100 dark:border-gray-800 overflow-hidden">
                        <div className="flex items-center gap-1 relative overflow-x-auto flex-shrink min-w-0">
                            <button
                                onClick={() => { setShowEmoji(!showEmoji); setShowGif(false); }}
                                aria-label="Add emoji"
                                disabled={!user || posting}
                                className={`p-2 rounded-full transition-colors disabled:opacity-40 ${showEmoji ? "text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20" : "text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                                    <circle cx="12" cy="12" r="10" />
                                    <path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2" />
                                    <line x1="9" y1="9" x2="9.01" y2="9" strokeLinecap="round" />
                                    <line x1="15" y1="9" x2="15.01" y2="9" strokeLinecap="round" />
                                </svg>
                            </button>
                            <button
                                onClick={() => { setShowGif(!showGif); setShowEmoji(false); }}
                                aria-label="Add GIF"
                                disabled={!user || posting}
                                className={`px-2 py-1 rounded-full transition-colors disabled:opacity-40 text-xs font-bold ${showGif ? "text-purple-500 bg-purple-50 dark:bg-purple-900/20" : "text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20"}`}
                            >
                                GIF
                            </button>
                            <button
                                onClick={() => { setShowPoll(!showPoll); setShowEmoji(false); setShowGif(false); }}
                                aria-label="Add poll"
                                disabled={!user || posting}
                                className={`p-2 rounded-full transition-colors disabled:opacity-40 ${showPoll ? "text-orange-500 bg-orange-50 dark:bg-orange-900/20" : "text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20"}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                                </svg>
                            </button>
                            <button
                                onClick={() => fileRef.current?.click()}
                                aria-label="Add image"
                                disabled={!user || posting}
                                className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors disabled:opacity-40"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                    strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round"
                                        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                                </svg>
                            </button>
                            <VoiceRecorder
                                onRecorded={(url) => setAudioUrl(url)}
                                maxDuration={60}
                            />
                            <button
                                onClick={() => setVisibility(visibility === "public" ? "closeFriends" : "public")}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                    visibility === "closeFriends"
                                        ? "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800"
                                        : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                }`}
                                title={visibility === "closeFriends" ? "Close Friends only" : "Public"}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                                </svg>
                                {visibility === "closeFriends" ? "Close" : "Public"}
                            </button>
                            {showEmoji && (
                                <div className="absolute bottom-full left-0 mb-2 z-30">
                                    <EmojiPicker
                                        onEmojiSelect={(emoji) => setText(prev => prev + emoji)}
                                        onClose={() => setShowEmoji(false)}
                                    />
                                </div>
                            )}
                            {showGif && (
                                <div className="absolute bottom-full left-0 mb-2 z-30 max-h-[50dvh]">
                                    <GifPicker
                                        onSelect={(url) => { setPreview(url); setShowGif(false); }}
                                        onClose={() => setShowGif(false)}
                                    />
                                </div>
                            )}
                        </div>

                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

                        <button
                            onClick={handlePost}
                            disabled={!canPost}
                            className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-bold px-5 py-1.5 rounded-full hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-0 sm:min-w-16 shrink-0 flex items-center justify-center"
                        >
                            {posting ? (
                                <span className="flex items-center gap-1.5">
                                    <div className="w-3.5 h-3.5 border-2 border-white dark:border-gray-900 border-t-transparent rounded-full animate-spin" />
                                    {uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}%` : "\u2026"}
                                </span>
                            ) : "Post"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
