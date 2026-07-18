"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useToast } from "@/context/ToastContext";
import { useCall } from "@/context/CallContext";
import RichText from "@/components/Feed/RichText";
import UserBadges from "@/components/shared/UserBadges";
import AudioPlayer from "@/components/shared/AudioPlayer";
import ImageLightbox from "@/components/shared/ImageLightbox";
import EmojiPicker from "@/components/shared/EmojiPicker";
import VoiceRecorder from "@/components/shared/VoiceRecorder";
import { timeAgo } from "@/utils/timeAgo";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

const REACTIONS = [
    { type: "like", emoji: "👍" },
    { type: "love", emoji: "❤️" },
    { type: "laugh", emoji: "😂" },
    { type: "fire", emoji: "🔥" },
    { type: "sad", emoji: "😢" },
    { type: "angry", emoji: "😠" },
];

function GroupMessageBubble({ msg, user, onReact, onDelete, onReply, onHashtag }) {
    const [showReactions, setShowReactions] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [lightbox, setLightbox] = useState(false);
    const isOwn = msg.sender === user?.username;
    const author = msg._author || null;

    const totalReactions = useMemo(() => {
        if (!msg.reactions) return 0;
        return Object.values(msg.reactions).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
    }, [msg.reactions]);

    const myReaction = useMemo(() => {
        if (!user || !msg.reactions) return null;
        for (const [type, voters] of Object.entries(msg.reactions)) {
            if (Array.isArray(voters) && voters.includes(user.username)) return type;
        }
        return null;
    }, [user, msg.reactions]);

    return (
        <div className={`flex gap-2 px-4 py-1 group ${isOwn ? "flex-row-reverse" : ""}`}>
            {!isOwn && (
                <div
                    className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold select-none overflow-hidden"
                    style={{ backgroundColor: msg.color || "#3b82f6" }}
                >
                    {author?.avatarUrl ? (
                        <img src={author.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                        msg.sender?.[0]?.toUpperCase()
                    )}
                </div>
            )}
            <div className={`max-w-[75%] min-w-0 ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                {!isOwn && (
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{msg.sender}</span>
                        <UserBadges isVerified={author?.isVerified} isAdmin={author?.isAdmin} roles={author?.roles || []} size="sm" />
                    </div>
                )}
                {msg.replyTo?.messageId && (
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 mb-1 max-w-full truncate">
                        Replying to {msg.replyTo.sender}: {msg.replyTo.text}
                    </div>
                )}
                <div
                    className={`rounded-2xl px-3 py-2 inline-block max-w-full ${
                        isOwn
                            ? "bg-blue-500 text-white rounded-br-md"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md"
                    }`}
                >
                    {msg.text && (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            <RichText text={msg.text} onHashtag={onHashtag} />
                        </p>
                    )}
                    {msg.audioUrl && !msg.text && !msg.imageUrl && (
                        <div className="max-w-[250px]">
                            <AudioPlayer src={msg.audioUrl} />
                        </div>
                    )}
                </div>
                {msg.imageUrl && (
                    <div className="mt-1 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 max-w-[80vw] sm:max-w-xs cursor-pointer" onClick={() => setLightbox(true)}>
                        <img src={msg.imageUrl} alt="" className="w-full h-auto block" loading="lazy" />
                    </div>
                )}
                <div className={`flex items-center gap-2 mt-0.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                    <span className="text-gray-300 dark:text-gray-600 text-[10px]">{timeAgo(msg.timeStamp)}</span>
                    <div className="relative">
                        <button onClick={() => setShowReactions(!showReactions)} className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
                            {myReaction ? REACTIONS.find(r => r.type === myReaction)?.emoji || "😊" : "😊"}
                        </button>
                        {showReactions && (
                            <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-900 rounded-full shadow-xl border border-gray-200 dark:border-gray-700 px-1.5 py-1 flex gap-0.5 z-10">
                                {REACTIONS.map(r => (
                                    <button key={r.type} onClick={() => { onReact(msg._id, r.type); setShowReactions(false); }}
                                        className={`text-base p-1 hover:scale-125 transition-transform rounded-full ${myReaction === r.type ? "bg-blue-100 dark:bg-blue-900/30" : ""}`}>
                                        {r.emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {totalReactions > 0 && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{totalReactions}</span>
                    )}
                    <button onClick={() => onReply(msg)} className="text-[11px] text-gray-400 hover:text-blue-500 font-medium">Reply</button>
                    {isOwn && (
                        <button onClick={() => onDelete(msg._id)} className="text-[11px] text-gray-400 hover:text-red-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
                    )}
                </div>
            </div>
            {lightbox && msg.imageUrl && (
                <ImageLightbox src={msg.imageUrl} alt="" onClose={() => setLightbox(false)} />
            )}
        </div>
    );
}

export default function GroupChatBox({ groupId, user, onBack, group }) {
    const { showToast } = useToast();
    const { startGroupCall } = useCall();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [sending, setSending] = useState(false);
    const [text, setText] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [audioUrl, setAudioUrl] = useState("");
    const [replyTo, setReplyTo] = useState(null);
    const [showEmoji, setShowEmoji] = useState(false);
    const [scrollAtBottom, setScrollAtBottom] = useState(true);
    const fileRef = useRef(null);
    const listRef = useRef(null);
    const pollingRef = useRef(null);

    const fetchMessages = useCallback(async (before = null) => {
        try {
            const params = new URLSearchParams({ limit: "20" });
            if (before) params.set("before", before);
            const res = await fetch(`/api/groups/${groupId}/messages?${params}`);
            if (!res.ok) return;
            const data = await res.json();
            setMessages(prev => {
                if (before) {
                    const existing = new Set(prev.map(m => m._id));
                    const newMsgs = data.messages.filter(m => !existing.has(m._id));
                    return [...newMsgs, ...prev];
                }
                return data.messages;
            });
            setHasMore(data.hasMore);
        } catch {}
        setLoading(false);
    }, [groupId]);

    useEffect(() => {
        fetchMessages(); // eslint-disable-line react-hooks/set-state-in-effect
        return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }, [fetchMessages]);

    useEffect(() => {
        pollingRef.current = setInterval(() => fetchMessages(), 8000);
        return () => clearInterval(pollingRef.current);
    }, [fetchMessages]);

    useEffect(() => {
        if (!user || !groupId) return;
        fetch(`/api/groups/${groupId}/messages`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "read", readBy: user.username }),
        }).catch(() => {});
    }, [groupId, user?.username, messages.length]);

    const handleSend = async () => {
        const trimmed = text.trim();
        if ((!trimmed && !imageUrl && !audioUrl) || sending) return;
        setSending(true);
        try {
            const res = await fetch(`/api/groups/${groupId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sender: user.username,
                    text: trimmed,
                    imageUrl,
                    audioUrl,
                    color: user.color,
                    replyTo: replyTo ? { sender: replyTo.sender, text: replyTo.text, messageId: replyTo._id } : { sender: null, text: "", messageId: null },
                }),
            });
            if (res.ok) {
                const msg = await res.json();
                setMessages(prev => [...prev, msg]);
                setText(""); setImageUrl(""); setAudioUrl(""); setReplyTo(null);
                setScrollAtBottom(true);
            }
        } catch {
            showToast("Failed to send", "error");
        } finally { setSending(false); }
    };

    const handleReact = async (messageId, reactionType) => {
        try {
            const res = await fetch(`/api/groups/${groupId}/messages`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, action: "react", messageId, reactionType }),
            });
            if (res.ok) {
                const updated = await res.json();
                setMessages(prev => prev.map(m => m._id === messageId ? { ...m, reactions: updated.reactions } : m));
            }
        } catch {}
    };

    const handleDelete = async (messageId) => {
        if (!confirm("Delete this message?")) return;
        try {
            const res = await fetch(`/api/groups/${groupId}/messages`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, action: "delete", messageId }),
            });
            if (res.ok) {
                setMessages(prev => prev.filter(m => m._id !== messageId));
                showToast("Message deleted", "success");
            }
        } catch {}
    };

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file || file.size > 10 * 1024 * 1024) return;
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("upload_preset", UPLOAD_PRESET);
            fd.append("folder", "anon-feed");
            const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: fd });
            const data = await res.json();
            if (data.secure_url) setImageUrl(data.secure_url);
        } catch { showToast("Upload failed", "error"); }
    };

    const handleScroll = () => {
        const el = listRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        setScrollAtBottom(atBottom);
        if (el.scrollTop < 120 && hasMore && messages.length > 0) {
            fetchMessages(messages[0].timeStamp);
        }
    };

    const scrollToBottom = () => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    };

    useEffect(() => {
        if (scrollAtBottom) scrollToBottom();
    }, [messages, scrollAtBottom]);

    const members = group?.members || [];
    const memberNames = members.map(m => m.username).filter(n => n !== user?.username);

    const handleGroupCall = () => {
        if (memberNames.length === 0) {
            showToast("No other members to call", "error");
            return;
        }
        startGroupCall(memberNames, "audio");
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
                <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors" aria-label="Back">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-gray-600 dark:text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h2 className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{group?.name || "Group"}</h2>
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">{members.length} members</p>
                </div>
                <button onClick={handleGroupCall} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-blue-500" aria-label="Group call">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                </button>
            </div>

            {/* Messages */}
            <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-2 space-y-1">
                {loading && messages.length === 0 && (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                )}
                {messages.map(msg => (
                    <GroupMessageBubble
                        key={msg._id}
                        msg={msg}
                        user={user}
                        onReact={handleReact}
                        onDelete={handleDelete}
                        onReply={setReplyTo}
                        onHashtag={(tag) => window.location.href = `/?tag=${tag}`}
                    />
                ))}
            </div>

            {!scrollAtBottom && (
                <button onClick={scrollToBottom} className="absolute bottom-24 right-4 bg-gray-800 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg z-10 hover:bg-gray-700 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                </button>
            )}

            {/* Input */}
            <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-3">
                {replyTo && (
                    <div className="flex items-center justify-between mb-2 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs">
                        <span className="text-gray-500 dark:text-gray-400 truncate">
                            Replying to <span className="font-medium text-gray-700 dark:text-gray-300">{replyTo.sender}</span>
                        </span>
                        <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2">&#x2715;</button>
                    </div>
                )}
                {imageUrl && (
                    <div className="relative inline-block mb-2">
                        <img src={imageUrl} alt="" className="h-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                        <button onClick={() => setImageUrl("")} className="absolute -top-1.5 -right-1.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">&#x2715;</button>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                    <button onClick={() => fileRef.current?.click()} className="text-gray-400 hover:text-blue-500 transition-colors p-2" aria-label="Send image">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                        </svg>
                    </button>
                    <div className="flex-1 flex items-center bg-gray-100 dark:bg-gray-800 rounded-full px-4 py-2">
                        <input
                            type="text" value={text} onChange={e => setText(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            placeholder="Message..." maxLength={1000}
                            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                        />
                        <div className="relative ml-2">
                            <button onClick={() => setShowEmoji(!showEmoji)} className="text-gray-400 hover:text-yellow-500 transition-colors" aria-label="Emoji">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                                    <circle cx="12" cy="12" r="10" />
                                    <path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2" />
                                    <line x1="9" y1="9" x2="9.01" y2="9" strokeLinecap="round" />
                                    <line x1="15" y1="9" x2="15.01" y2="9" strokeLinecap="round" />
                                </svg>
                            </button>
                            {showEmoji && (
                                <div className="absolute bottom-full right-0 mb-2 z-30">
                                    <EmojiPicker onEmojiSelect={e => setText(prev => prev + e)} onClose={() => setShowEmoji(false)} />
                                </div>
                            )}
                        </div>
                    </div>
                    {(text.trim() || imageUrl || audioUrl) ? (
                        <button onClick={handleSend} disabled={sending}
                            className="bg-blue-500 hover:bg-blue-600 text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors disabled:opacity-50">
                            {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
                                    <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
                                </svg>
                            )}
                        </button>
                    ) : (
                        <VoiceRecorder onRecorded={(url) => setAudioUrl(url)} maxDuration={60} />
                    )}
                </div>
            </div>
        </div>
    );
}
