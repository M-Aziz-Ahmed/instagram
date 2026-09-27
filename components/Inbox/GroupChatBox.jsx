"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/context/ToastContext";
import { useCall } from "@/context/CallContext";
import RichText from "@/components/Feed/RichText";
import UserBadges from "@/components/shared/UserBadges";
import AudioPlayer from "@/components/shared/AudioPlayer";
import ImageLightbox from "@/components/shared/ImageLightbox";
import EmojiPicker from "@/components/shared/EmojiPicker";
import LinkPreviewCard from "@/components/shared/LinkPreviewCard";
import VoiceRecorder from "@/components/shared/VoiceRecorder";
import GroupSettings from "./GroupSettings";
import { timeAgo } from "@/utils/timeAgo";
import { translateItem } from "@/utils/translateApi";
import { languageName } from "@/utils/languages";

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

function GroupMessageBubble({ msg, user, onReact, onDelete, onReply, onHashtag, onTranslate, onStar, onEdit, translations, translatingId, translateTargetName, editing, editText, setEditText, onSaveEdit, onCancelEdit }) {
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
                        <UserBadges isPro={author?.isPro} isVerified={author?.isVerified} isAdmin={author?.isAdmin} roles={author?.roles || []} size="sm" />
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
                    {msg.deleted ? (
                        // Groups used to hard-delete the row, so a removed message
                        // simply vanished. Soft delete keeps a tombstone, matching
                        // DMs and telling everyone it was removed rather than lost.
                        <p className={`text-sm italic ${isOwn ? "text-white/60" : "text-gray-400 dark:text-gray-500"}`}>
                            This message was deleted
                        </p>
                    ) : (
                        <>
                            {msg.text && (
                                editing ? (
                                    // Group messages had no edit path at all. Enter
                                    // saves, Escape cancels, matching the DM.
                                    <div className="flex flex-col gap-1 min-w-[200px]">
                                        <input
                                            type="text"
                                            value={editText}
                                            autoFocus
                                            maxLength={1000}
                                            onChange={(e) => setEditText(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") { e.preventDefault(); onSaveEdit(); }
                                                if (e.key === "Escape") onCancelEdit();
                                            }}
                                            className="text-base sm:text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 outline-none focus:border-blue-400 text-gray-900 dark:text-gray-100"
                                        />
                                        <div className="flex gap-2 text-[11px] font-semibold">
                                            <button onClick={onSaveEdit} className="text-blue-500 hover:underline">Save</button>
                                            <button onClick={onCancelEdit} className="text-gray-400 hover:underline">Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                        <RichText text={msg.text} onHashtag={onHashtag} />
                                    </p>
                                )
                            )}
                            {translations?.[msg._id] && (
                                <p className={`mt-1 text-xs italic break-words ${isOwn ? "text-white/70" : "text-gray-500 dark:text-gray-400"}`}>
                                    {translations[msg._id]}
                                </p>
                            )}
                        </>
                    )}
                    {!msg.deleted && msg.audioUrl && !msg.text && !msg.imageUrl && (
                        <div className="max-w-[250px]">
                            <AudioPlayer src={msg.audioUrl} isMine={isOwn} />
                        </div>
                    )}
                    {!msg.deleted && msg.linkPreview && (
                        <div className={`mt-1.5 ${msg.text ? "border-t pt-1.5" : ""} ${isOwn ? "border-white/20" : "border-gray-200 dark:border-gray-700"}`}>
                            <LinkPreviewCard preview={msg.linkPreview} small />
                        </div>
                    )}
                </div>
                {!msg.deleted && msg.imageUrl && (
                    <div className="mt-1 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 max-w-[80vw] sm:max-w-xs cursor-pointer" onClick={() => setLightbox(true)}>
                        {/* `h-auto` keeps the intrinsic ratio, but a tall portrait
                            * (a screenshot) then renders at full height and swamps
                            * the thread. Clamp the height and letterbox instead. */}
                        <img src={msg.imageUrl} alt="" className="w-full max-h-[420px] object-contain block" loading="lazy" />
                    </div>
                )}
                <div className={`flex items-center gap-2 mt-0.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                    <span className="text-gray-300 dark:text-gray-600 text-[10px]">{timeAgo(msg.timeStamp)}</span>
                    <div className="relative">
                        <button onClick={() => setShowReactions(!showReactions)} className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full" aria-label="React to message">
                            {myReaction ? REACTIONS.find(r => r.type === myReaction)?.emoji || "😊" : "😊"}
                        </button>
                        {showReactions && (
                            <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-900 rounded-full shadow-xl border border-gray-200 dark:border-gray-700 px-1.5 py-1 flex gap-0.5 z-10">
                                {REACTIONS.map(r => (
                                    <button key={r.type} onClick={() => { onReact(msg._id, r.type); setShowReactions(false); }}
                                        aria-label={`React ${r.type}`}
                                        className={`text-base p-1 min-h-[40px] min-w-[40px] flex items-center justify-center hover:scale-125 transition-transform rounded-full ${myReaction === r.type ? "bg-blue-100 dark:bg-blue-900/30" : ""}`}>
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
                    {/* Translate and star, matching the DM affordance. Group chat
                        had neither, which made a multilingual group unusable. */}
                    {msg.text && (
                        <button
                            onClick={() => onTranslate(msg._id, msg.text)}
                            className={`text-[11px] transition-colors ${
                                translations[msg._id]
                                    ? "text-blue-500"
                                    : "text-gray-400 hover:text-blue-500"
                            }`}
                            title={translations[msg._id] ? "Hide translation" : `Translate to ${translateTargetName}`}
                        >
                            {translatingId === msg._id ? "…" : translations[msg._id] ? "Hide" : "Translate"}
                        </button>
                    )}
                    <button
                        onClick={() => onStar(msg)}
                        className={`p-1 text-[11px] transition-colors ${
                            msg.starredBy?.includes(user?.username)
                                ? "text-yellow-500"
                                : "text-gray-400 hover:text-yellow-500"
                        }`}
                        aria-label={msg.starredBy?.includes(user?.username) ? "Unstar message" : "Star message"}
                        title={msg.starredBy?.includes(user?.username) ? "Unstar" : "Star"}
                    >
                        ★
                    </button>
                    {msg.editedAt && (
                        <span className="text-[10px] text-gray-300 dark:text-gray-600 italic">(edited)</span>
                    )}
                    {isOwn && (
                        <>
                            {/* These were `opacity-0 group-hover:opacity-100`, which
                                hides them WITHOUT removing them from hit-testing.
                                There is no hover on touch, so on a phone they were
                                permanently invisible yet still tappable — a stray tap
                                near a message row silently deleted it. Gate the
                                reveal on a real hover-capable pointer so a touch
                                device always shows them. */}
                            <button
                                onClick={() => onEdit(msg)}
                                className="text-[11px] text-gray-400 hover:text-blue-500 font-medium px-1.5 min-h-[32px] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity"
                            >
                                Edit
                            </button>
                            <button
                                onClick={() => onDelete(msg._id)}
                                className="text-[11px] text-gray-400 hover:text-red-500 font-medium px-1.5 min-h-[32px] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity"
                            >
                                Delete
                            </button>
                        </>
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
    const router = useRouter();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [sending, setSending] = useState(false);
    const [text, setText] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [audioUrl, setAudioUrl] = useState("");
    const [replyTo, setReplyTo] = useState(null);
    const [showEmoji, setShowEmoji] = useState(false);
    const [linkPreview, setLinkPreview] = useState(null);
    const linkUrlRef = useRef(null);
    const [scrollAtBottom, setScrollAtBottom] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    // Comment-parity features for group chat, which had none of these.
    const [translations, setTranslations] = useState({});
    const [translatingId, setTranslatingId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editText, setEditText] = useState("");
    const translateTarget = user?.language || "en";
    const translateTargetName = languageName(translateTarget);

    const handleTranslate = useCallback(async (id, text) => {
        setTranslations(prev => {
            if (prev[id]) {
                const next = { ...prev };
                delete next[id];
                return next;
            }
            return prev;
        });
        if (translations[id]) return;
        setTranslatingId(id);
        const translated = await translateItem(text, translateTarget);
        setTranslatingId(null);
        if (translated) setTranslations(prev => ({ ...prev, [id]: translated }));
    }, [translations, translateTarget]);

    const handleStar = useCallback(async (msg) => {
        const wasStarred = !!msg.starredBy?.includes(user?.username);
        const me = user?.username;
        setMessages(prev => prev.map(m => (
            m._id === msg._id
                ? {
                    ...m,
                    starredBy: wasStarred
                        ? m.starredBy.filter(u => u !== me)
                        : [...(m.starredBy || []), me],
                }
                : m
        )));
        try {
            const res = await fetch(`/api/groups/${groupId}/messages`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "star", messageId: msg._id }),
            });
            if (!res.ok) throw new Error("star failed");
        } catch {
            setMessages(prev => prev.map(m => (
                m._id === msg._id
                    ? {
                        ...m,
                        starredBy: wasStarred
                            ? [...new Set([...(m.starredBy || []), me])]
                            : m.starredBy.filter(u => u !== me),
                    }
                    : m
            )));
            showToast("Could not update star", "error");
        }
    }, [user?.username, groupId, showToast]);

    const beginEdit = useCallback((msg) => {
        setEditingId(msg._id);
        setEditText(msg.text || "");
    }, []);

    const saveEdit = useCallback(async (id) => {
        const next = editText.trim();
        if (!next) return;
        const original = messages.find(m => m._id === id)?.text;
        setEditingId(null);
        if (next === original) return;
        setMessages(prev => prev.map(m => (m._id === id ? { ...m, text: next, editedAt: new Date() } : m)));
        try {
            const res = await fetch(`/api/groups/${groupId}/messages`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "edit", messageId: id, text: next }),
            });
            if (!res.ok) throw new Error("edit failed");
        } catch {
            setMessages(prev => prev.map(m => (m._id === id ? { ...m, text: original, editedAt: null } : m)));
            showToast("Could not edit that message", "error");
        }
    }, [editText, messages, groupId, showToast]);
    const [showSettings, setShowSettings] = useState(false);
    const fileRef = useRef(null);
    const listRef = useRef(null);
    const pollingRef = useRef(null);
    const loadingMoreRef = useRef(false);

    const fetchMessages = useCallback(async (before = null) => {
        // One page load at a time. Every scroll event in the top band used to
        // fire its own request, so scrolling up through history could queue
        // dozens of overlapping fetches, each of which then prepended a page and
        // moved the list further.
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        if (before) setLoadingMore(true);
        try {
            const params = new URLSearchParams({ limit: "20" });
            if (before) params.set("before", before);
            const res = await fetch(`/api/groups/${groupId}/messages?${params}`);
            if (!res.ok) {
                // Used to `return` before setLoading(false), so any 403/500 left
                // the group chat spinning forever.
                setError("Could not load messages");
                return;
            }
            const data = await res.json();
            setMessages(prev => {
                const existing = new Set(prev.map(m => m._id));
                // Merge in every case.
                //
                // The non-paginated branch used to `return data.messages`,
                // replacing the list with the newest page. So: scroll up to read
                // history, wait at most 8 seconds for the poll, and everything
                // except the newest 20 messages disappeared. The DM view merges
                // correctly; this now matches.
                const fresh = (data.messages || []).filter(m => !existing.has(m._id));
                return fresh.length ? [...fresh, ...prev] : prev;
            });
            if (before) setHasMore(data.hasMore);
        } catch {
            setError("Network error");
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
            setLoading(false);
        }
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
            // No `readBy` in the body: the server now derives the actor from the
            // session and ignores a client-supplied one, which is what let an
            // unauthenticated caller mark any group read.
            body: JSON.stringify({ action: "read" }),
        }).catch(() => {});
    }, [groupId, user?.username, messages.length]);

    // Debounced link preview fetch while typing
    useEffect(() => {
        const m = (text || "").match(/https?:\/\/[^\s<>"'\u2026]+/i);
        const url = m ? m[0].replace(/[),.;:!?]+$/, "") : null;
        const t = setTimeout(() => {
            if (!url) {
                setLinkPreview(null);
                linkUrlRef.current = null;
                return;
            }
            if (linkUrlRef.current === url) return;
            linkUrlRef.current = url;
            (async () => {
                try {
                    const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
                    if (!res.ok) return;
                    const data = await res.json();
                    if (data?.preview && linkUrlRef.current === url) {
                        setLinkPreview(data.preview);
                    }
                } catch {}
            })();
        }, 600);
        return () => clearTimeout(t);
    }, [text]);

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
                    linkPreview,
                }),
            });
            if (res.ok) {
                const msg = await res.json();
                setMessages(prev => [...prev, msg]);
                setText(""); setImageUrl(""); setAudioUrl(""); setReplyTo(null);
                setLinkPreview(null); linkUrlRef.current = null;
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
                body: JSON.stringify({ action: "react", messageId, reactionType }),
            });
            if (res.ok) {
                const updated = await res.json();
                setMessages(prev => prev.map(m => m._id === messageId ? { ...m, reactions: updated.reactions } : m));
            } else {
                // Was `catch {}` with no else, so a rejected reaction (not a
                // member, message gone) did nothing visible at all.
                const d = await res.json().catch(() => ({}));
                showToast(d.error || "Could not react", "error");
            }
        } catch {
            showToast("Network error", "error");
        }
    };

    const handleDelete = async (messageId) => {
        if (!confirm("Delete this message?")) return;
        try {
            const res = await fetch(`/api/groups/${groupId}/messages`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "delete", messageId }),
            });
            if (res.ok) {
                // Soft delete server-side, so the row stays as a tombstone rather
                // than vanishing. Matches the DM bubble.
                setMessages(prev => prev.map(m => (
                    m._id === messageId
                        ? { ...m, deleted: true, text: "", imageUrl: "", audioUrl: "" }
                        : m
                )));
                showToast("Message deleted", "success");
            } else {
                const d = await res.json().catch(() => ({}));
                showToast(d.error || "Could not delete that message", "error");
            }
        } catch {
            showToast("Network error", "error");
        }
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
        // `relative` matters: the scroll-to-bottom button below is absolutely
        // positioned, and without a positioned ancestor here it anchored to
        // whatever further ancestor happened to be relative — so it floated
        // somewhere unrelated to the chat pane.
        //
        // `safe-top` / `safe-bottom` live here, on the column, for the same
        // reason as in ChatBox: they are unlayered rules in globals.css and so
        // would DELETE a same-side `py-*` on the header or composer wherever the
        // inset is 0 (i.e. on every desktop). On the column they just displace
        // the whole pane out from under the status bar and the home indicator.
        <div className="flex flex-col h-full relative safe-top safe-bottom">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
                <button onClick={onBack} className="p-2.5 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors" aria-label="Back">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-gray-600 dark:text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        {group?.avatarUrl && (
                            <img src={group.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        )}
                        <h2 className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{group?.name || "Group"}</h2>
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">{members.length} members</p>
                </div>
                <button onClick={() => setShowSettings(true)} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500" aria-label="Group settings">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                </button>
                <button
                    onClick={handleGroupCall}
                    className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-blue-500"
                    // This drew a video-camera glyph and labelled itself "Group
                    // call", but handleGroupCall starts an *audio* call and groups
                    // have no video option. Both the icon and the label promised
                    // something that does not exist.
                    aria-label="Start group audio call"
                    title="Start group audio call"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
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
                {/* A failed load used to leave the spinner running forever with
                    no way to tell that anything had gone wrong. */}
                {error && messages.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
                        <p className="text-sm text-red-500">{error}</p>
                        <button
                            onClick={() => { setError(""); fetchMessages(); }}
                            className="text-xs font-medium text-blue-500 hover:underline"
                        >
                            Try again
                        </button>
                    </div>
                )}
                {loadingMore && (
                    <div className="flex items-center justify-center py-3">
                        <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
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
                        onHashtag={(tag) => router.push(`/?tag=${encodeURIComponent(tag)}`)}
                        onTranslate={handleTranslate}
                        onStar={handleStar}
                        onEdit={beginEdit}
                        translations={translations}
                        translatingId={translatingId}
                        translateTargetName={translateTargetName}
                        editing={editingId === msg._id}
                        editText={editText}
                        setEditText={setEditText}
                        onSaveEdit={() => saveEdit(msg._id)}
                        onCancelEdit={() => setEditingId(null)}
                    />
                ))}
            </div>

            {!scrollAtBottom && (
                /* `bottom-24` is a flat 96px, but the fixed bottom nav measures
                 * `h-16` + `safe-bottom` (64px + up to 34px). With a 32px inset
                 * or more the 32px button slid under the nav and half of it was
                 * unclickable. */
                <button
                    onClick={scrollToBottom}
                    aria-label="Scroll to bottom"
                    className="absolute bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-3 bg-gray-800 text-white rounded-full w-11 h-11 flex items-center justify-center shadow-lg z-10 hover:bg-gray-700 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                </button>
            )}

            {/* Input */}
            <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-3 shrink-0">
                {replyTo && (
                    <div className="flex items-center justify-between mb-2 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs">
                        <span className="text-gray-500 dark:text-gray-400 truncate">
                            Replying to <span className="font-medium text-gray-700 dark:text-gray-300">{replyTo.sender}</span>
                        </span>
                        <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ml-1 p-1 min-h-[32px] min-w-[32px] flex items-center justify-center rounded-full">&#x2715;</button>
                    </div>
                )}
                {imageUrl && (
                    <div className="relative inline-block mb-2">
                        <img src={imageUrl} alt="" className="h-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                        <button onClick={() => setImageUrl("")} aria-label="Remove image" className="absolute -top-2 -right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center text-[10px]">&#x2715;</button>
                    </div>
                )}
                {linkPreview && (
                    <div className="relative mb-2 max-w-xs sm:max-w-sm">
                        <LinkPreviewCard preview={linkPreview} small />
                        <button onClick={() => { setLinkPreview(null); linkUrlRef.current = null; }} aria-label="Remove link preview" className="absolute -top-2 -right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center text-[10px]">&#x2715;</button>
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
                            className="flex-1 min-w-0 bg-transparent text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
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
                                                        className="bg-blue-500 hover:bg-blue-600 text-white rounded-full w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors disabled:opacity-50"
>
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

            {showSettings && (
                <GroupSettings
                    group={group}
                    user={user}
                    onClose={() => setShowSettings(false)}
                    onGroupUpdated={(updated) => {
                        // Refresh group data by re-fetching
                        fetch(`/api/groups/${groupId}`).then(r => r.json()).then(data => {
                            if (data._id) {
                                // Trigger parent to update group
                                window.dispatchEvent(new CustomEvent("groupUpdated", { detail: data }));
                            }
                        }).catch(() => {});
                    }}
                    onLeave={onBack}
                />
            )}
        </div>
    );
}
