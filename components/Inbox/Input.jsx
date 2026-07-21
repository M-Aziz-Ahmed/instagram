"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import VoiceRecorder from "@/components/shared/VoiceRecorder";
import EmojiPicker from "@/components/shared/EmojiPicker";
import GifPicker from "@/components/shared/GifPicker";

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export default function Input({ onMessageSent, recipient, replyingTo, setReplyingTo }) {
    const { user } = useUser();
    const [text, setText]           = useState("");
    const [sending, setSending]     = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [audioUrl, setAudioUrl]   = useState("");
    const [showEmoji, setShowEmoji] = useState(false);
    const [showGif, setShowGif]     = useState(false);
    const [mentionQuery, setMentionQuery]     = useState(null);
    const [mentionResults, setMentionResults] = useState([]);
    const [mentionHighlight, setMentionHighlight] = useState(0);
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionMode, setMentionMode] = useState(null); // "user" or "hashtag"
    const [hashtagResults, setHashtagResults] = useState([]);
    const fileRef                   = useRef(null);
    const inputRef                  = useRef(null);
    const typingTimeoutRef          = useRef(null);

    useEffect(() => {
        if (!user || !recipient) return;
        const clearTyping = () => {
            fetch("/api/typing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: 'include',
                body: JSON.stringify({ username: user.username, typingTo: "" }),
            }).catch(() => {});
        };
        return () => {
            clearTyping();
        };
    }, [user, recipient]);

    const handleTextChange = (val) => {
        setText(val);
        if (!user || !recipient) return;

        // Clear any pending timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        // Send typing status with debouncing
        const typingTo = val.trim() ? recipient : "";
        fetch("/api/typing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: 'include',
            body: JSON.stringify({ username: user.username, typingTo }),
        }).catch(() => {});

        // Auto-clear typing status after 3 seconds of no typing
        if (val.trim()) {
            typingTimeoutRef.current = setTimeout(() => {
                fetch("/api/typing", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: 'include',
                    body: JSON.stringify({ username: user.username, typingTo: "" }),
                }).catch(() => {});
            }, 3000);
        }

        // Detect @mention or #hashtag at cursor
        const pos = inputRef.current?.selectionStart || val.length;
        const before = val.slice(0, pos);
        const hashtagMatch = before.match(/#([a-zA-Z0-9_]*)$/);
        const userMatch = before.match(/@([a-zA-Z0-9_]*)$/);
        if (hashtagMatch && (!userMatch || hashtagMatch.index > userMatch.index)) {
            setMentionQuery(hashtagMatch[1]);
            setMentionMode("hashtag");
            setShowMentionDropdown(true);
        } else if (userMatch) {
            setMentionQuery(userMatch[1]);
            setMentionMode("user");
            setShowMentionDropdown(true);
        } else {
            setShowMentionDropdown(false);
            setMentionQuery(null);
            setMentionMode(null);
        }
    };

    useEffect(() => {
        if (mentionQuery === null) return;
        const t = setTimeout(async () => {
            try {
                if (mentionMode === "hashtag") {
                    const url = mentionQuery ? `/api/search?q=${encodeURIComponent(mentionQuery)}` : `/api/hashtags/trending?limit=8`;
                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        setHashtagResults(data.hashtags || data || []);
                    }
                } else {
                    const res = await fetch(`/api/search?q=${encodeURIComponent(mentionQuery)}`);
                    if (res.ok) {
                        const data = await res.json();
                        setMentionResults(data.users || []);
                    }
                }
            } catch { /* silent */ }
        }, 200);
        return () => clearTimeout(t);
    }, [mentionQuery, mentionMode]);

    useEffect(() => { setMentionHighlight(0); }, [mentionResults, hashtagResults, mentionMode]);

    const uploadToCloudinary = (file) =>
        new Promise((resolve, reject) => {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("upload_preset", UPLOAD_PRESET);
            fd.append("folder", "anon-feed");
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
            xhr.onload = () => xhr.status === 200
                ? resolve(JSON.parse(xhr.responseText).secure_url)
                : reject(new Error("Upload failed"));
            xhr.onerror = () => reject(new Error("Network error"));
            xhr.send(fd);
        });

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file || file.size > 10 * 1024 * 1024) return;
        setUploading(true);
        try {
            const url = await uploadToCloudinary(file);
            setImagePreview(url);
        } catch { /* silent */ }
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
    };

    const removeImage = () => {
        setImagePreview(null);
    };

    const canSend = (text.trim() || imagePreview || audioUrl) && !sending && !uploading && user && recipient;

    const handleSend = async () => {
        if (!canSend) return;

        const snapshotText = text.trim();
        const snapshotImage = imagePreview;
        const snapshotAudio = audioUrl;
        const snapshotReply = replyingTo
            ? { sender: replyingTo.sender, text: replyingTo.text }
            : null;
        setText("");
        setImagePreview(null);
        setAudioUrl("");
        setReplyingTo(null);
        setSending(true);

        if (user && recipient) {
            fetch("/api/typing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: 'include',
                body: JSON.stringify({ username: user.username, typingTo: "" }),
            }).catch(() => {});
        }

        // Clear any pending typing timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        const tempId = `temp_${Date.now()}_${Math.random()}`;

        if (onMessageSent) {
            onMessageSent({
                _tempId: tempId,
                text: snapshotText,
                imageUrl: snapshotImage || "",
                audioUrl: snapshotAudio || "",
                sender: user.username,
                recipient,
                color: user.color,
                replyTo: snapshotReply,
                timeStamp: new Date().toISOString(),
                isRead: false,
                delivered: false,
                _sending: true,
            });
        }

        try {
            const res = await fetch("/api/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: snapshotText,
                    imageUrl: snapshotImage || "",
                    audioUrl: snapshotAudio || "",
                    sender: user.username,
                    recipient,
                    color: user.color,
                    replyTo: snapshotReply,
                }),
            });
            if (!res.ok) throw new Error("Send failed");
            const msg = await res.json();
            if (onMessageSent) onMessageSent({ ...msg, _sending: false });
        } catch (err) {
            console.error("Failed to send:", err);
            setText(snapshotText);
            setImagePreview(snapshotImage);
            setAudioUrl(snapshotAudio);
            if (snapshotReply) setReplyingTo({ sender: snapshotReply.sender, text: snapshotReply.text });
            if (onMessageSent) onMessageSent({ _tempId: tempId, _remove: true });
        } finally {
            setSending(false);
        }
    };

    const insertMention = (username) => {
        const pos = inputRef.current?.selectionStart ?? text.length;
        const before = text.slice(0, pos);
        const after = text.slice(pos);
        const atIdx = before.lastIndexOf("@");
        const newText = before.slice(0, atIdx) + `@${username} ` + after;
        setText(newText);
        setShowMentionDropdown(false);
        setMentionQuery(null);
        setMentionMode(null);
        handleTextChange(newText);
        setTimeout(() => {
            const newPos = atIdx + username.length + 2;
            inputRef.current?.setSelectionRange(newPos, newPos);
            inputRef.current?.focus();
        }, 0);
    };

    const insertHashtag = (tag) => {
        const pos = inputRef.current?.selectionStart ?? text.length;
        const before = text.slice(0, pos);
        const after = text.slice(pos);
        const hashIdx = before.lastIndexOf("#");
        const cleanTag = tag.replace(/^#/, "");
        const newText = before.slice(0, hashIdx) + `#${cleanTag} ` + after;
        setText(newText);
        setShowMentionDropdown(false);
        setMentionQuery(null);
        setMentionMode(null);
        handleTextChange(newText);
        setTimeout(() => {
            const newPos = hashIdx + cleanTag.length + 2;
            inputRef.current?.setSelectionRange(newPos, newPos);
            inputRef.current?.focus();
        }, 0);
    };

    const handleKeyDown = (e) => {
        const items = mentionMode === "hashtag" ? hashtagResults : mentionResults;
        if (showMentionDropdown && items.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionHighlight((h) => (h + 1) % items.length);
                return;
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionHighlight((h) => (h - 1 + items.length) % items.length);
                return;
            } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                if (mentionMode === "hashtag") {
                    insertHashtag(items[mentionHighlight]?.tag || items[mentionHighlight]);
                } else {
                    insertMention(items[mentionHighlight].username);
                }
                return;
            } else if (e.key === "Escape") {
                setShowMentionDropdown(false);
                return;
            }
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col gap-2">
            {/* Image preview */}
            {imagePreview && (
                <div className="relative inline-flex self-start">
                    <img src={imagePreview} alt="" className="h-24 rounded-xl object-cover border border-gray-200 dark:border-gray-700" />
                    <button
                        onClick={removeImage}
                        className="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-700 transition-colors shadow"
                        aria-label="Remove image"
                    >
                        &#x2715;
                    </button>
                    {uploading && (
                        <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}
                </div>
            )}

            {/* Audio preview */}
            {audioUrl && !imagePreview && (
                <div className="relative inline-flex self-start">
                    <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-blue-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                        </svg>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Voice message</span>
                    </div>
                    <button
                        onClick={() => setAudioUrl("")}
                        className="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-700 transition-colors shadow"
                        aria-label="Remove audio"
                    >
                        &#x2715;
                    </button>
                </div>
            )}

            {/* Reply preview */}
            {replyingTo && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl border-l-3 border-blue-500">
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-blue-500 dark:text-blue-400 font-semibold">Replying to {replyingTo.sender}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{replyingTo.text}</p>
                    </div>
                    <button onClick={() => setReplyingTo(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-1.5 sm:gap-2">
                {/* Attach button - hidden on very small screens */}
                <button
                    onClick={() => fileRef.current?.click()}
                    disabled={!user || !recipient}
                    aria-label="Attach image"
                    className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

                {/* Emoji button */}
                <div className="relative">
                    <button
                        onClick={() => { setShowEmoji(!showEmoji); setShowGif(false); }}
                        disabled={!user || !recipient}
                        aria-label="Add emoji"
                        className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${showEmoji ? "text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20" : "text-gray-500 dark:text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                            <circle cx="12" cy="12" r="10" />
                            <path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2" />
                            <line x1="9" y1="9" x2="9.01" y2="9" strokeLinecap="round" />
                            <line x1="15" y1="9" x2="15.01" y2="9" strokeLinecap="round" />
                        </svg>
                    </button>
                    {showEmoji && (
                        <div className="absolute bottom-full left-0 mb-2 z-30">
                            <EmojiPicker
                                onEmojiSelect={(emoji) => setText(prev => prev + emoji)}
                                onClose={() => setShowEmoji(false)}
                            />
                        </div>
                    )}
                </div>

                {/* GIF button */}
                <div className="relative">
                    <button
                        onClick={() => { setShowGif(!showGif); setShowEmoji(false); }}
                        disabled={!user || !recipient}
                        aria-label="Add GIF"
                        className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${showGif ? "text-purple-500 bg-purple-50 dark:bg-purple-900/20" : "text-gray-500 dark:text-gray-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20"}`}
                    >
                        <span className="text-[11px] font-bold">GIF</span>
                    </button>
                    {showGif && (
                        <div className="absolute bottom-full left-0 mb-2 z-30 max-h-[50dvh]">
                            <GifPicker
                                onSelect={(url) => {
                                    setImagePreview(url);
                                    setShowGif(false);
                                }}
                                onClose={() => setShowGif(false)}
                            />
                        </div>
                    )}
                </div>

                {/* Text input */}
                <div className="flex-1 flex items-center bg-gray-100 dark:bg-gray-800 rounded-2xl px-3 sm:px-4 py-2 min-h-[40px] sm:min-h-[44px] focus-within:ring-1 focus-within:ring-gray-300 dark:focus-within:ring-gray-600 transition-shadow relative">
                    <input
                        ref={inputRef}
                        type="text"
                        value={text}
                        onChange={(e) => handleTextChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={recipient ? "Message\u2026" : "Select a conversation\u2026"}
                        disabled={!user || !recipient}
                        className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none disabled:cursor-not-allowed"
                    />
                    {showMentionDropdown && mentionMode === "user" && mentionResults.length > 0 && (
                        <div className="absolute bottom-full mb-2 left-0 right-0 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto z-40">
                            {mentionResults.map((u, i) => (
                                <button
                                    key={u._id || u.username}
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); insertMention(u.username); }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${i === mentionHighlight ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                                >
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: u.avatarColor }}>
                                        {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" /> : u.username?.[0]?.toUpperCase()}
                                    </div>
                                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{u.username}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {showMentionDropdown && mentionMode === "hashtag" && hashtagResults.length > 0 && (
                        <div className="absolute bottom-full mb-2 left-0 right-0 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto z-40">
                            {hashtagResults.map((tag, i) => {
                                const tagName = typeof tag === "string" ? tag : tag?.tag || "";
                                const tagCount = typeof tag === "object" ? tag?.count : null;
                                return (
                                    <button
                                        key={tagName}
                                        type="button"
                                        onMouseDown={(e) => { e.preventDefault(); insertHashtag(tagName); }}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${i === mentionHighlight ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                                    >
                                        <span className="text-blue-500 font-medium text-xs">#</span>
                                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{tagName}</span>
                                        {tagCount != null && <span className="ml-auto text-[10px] text-gray-400">{tagCount.toLocaleString()}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Send / Mic button */}
                {canSend ? (
                    <button
                        onClick={handleSend}
                        disabled={sending || uploading}
                        aria-label="Send"
                        className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-500 hover:bg-blue-600 dark:hover:bg-blue-400 flex items-center justify-center text-white transition-colors disabled:opacity-50"
                    >
                        {sending ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                            </svg>
                        )}
                    </button>
                ) : (
                    <VoiceRecorder
                        onRecorded={(url) => setAudioUrl(url)}
                        maxDuration={60}
                        recipient={recipient}
                        username={user?.username}
                    />
                )}
            </div>
        </div>
    );
}
