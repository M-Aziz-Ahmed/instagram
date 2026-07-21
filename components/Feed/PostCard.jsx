"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";
import RichText from "./RichText";
import UserBadges from "@/components/shared/UserBadges";
import BookmarkButton from "@/components/shared/BookmarkButton";
import ShareButton from "@/components/shared/ShareButton";
import FollowButton from "@/components/shared/FollowButton";
import ImageLightbox from "@/components/shared/ImageLightbox";
import ReactionPicker, { ReactionCounts } from "./ReactionPicker";
import RepostButton from "./RepostButton";
import VoiceRecorder from "@/components/shared/VoiceRecorder";
import AudioPlayer from "@/components/shared/AudioPlayer";
import EmojiPicker from "@/components/shared/EmojiPicker";
import GifPicker from "@/components/shared/GifPicker";
import PollCard from "./PollCard";
import Link from "next/link";
import { LoginModal } from "@/components/shared/GuestPrompt";
import { timeAgo } from "@/utils/timeAgo";

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

function ImageCarousel({ images, onImageClick, showHeart }) {
    const [idx, setIdx] = useState(0);
    const touchX = useRef(null);

    const go = (dir) => setIdx((i) => Math.max(0, Math.min(images.length - 1, i + dir)));
    const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
    const onTouchEnd = (e) => {
        if (touchX.current == null) return;
        const diff = touchX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) go(diff > 0 ? 1 : -1);
        touchX.current = null;
    };

    return (
        <div className="mt-3 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 relative select-none">
            <div
                className="relative cursor-pointer"
                onClick={() => onImageClick?.(images[idx])}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
            >
                <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${idx * 100}%)` }}>
                    {images.map((src, i) => (
                        <img key={i} src={src} alt="" className="w-full shrink-0 h-auto block" loading="lazy" />
                    ))}
                </div>
                {showHeart && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-20 h-20 text-white drop-shadow-lg animate-heart-burst">
                            <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                        </svg>
                    </div>
                )}
            </div>
            {images.length > 1 && (
                <>
                    {idx > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); go(-1); }} className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs transition-colors z-10">
                            ‹
                        </button>
                    )}
                    {idx < images.length - 1 && (
                        <button onClick={(e) => { e.stopPropagation(); go(1); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs transition-colors z-10">
                            ›
                        </button>
                    )}
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                        {images.map((_, i) => (
                            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === idx ? "bg-white" : "bg-white/40"}`} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function HeartIcon({ filled }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill={filled ? "currentColor" : "none"}
            viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
    );
}

function CommentIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
            strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
        </svg>
    );
}

function PostAvatar({ sender, color, avatarUrl, author, size = "md" }) {
    const dims = size === "sm" ? "w-6 h-6 text-[10px]" : "w-10 h-10 text-sm";
    const img = author?.avatarUrl || avatarUrl;
    return (
        <Link href={`/profile/${encodeURIComponent(sender)}`} className="shrink-0 mt-0.5">
            <div
                className={`${dims} rounded-full flex items-center justify-center text-white font-bold select-none hover:opacity-80 transition-opacity overflow-hidden`}
                style={{ backgroundColor: color }}
            >
                {img ? (
                    <img src={img} alt="" className="w-full h-full object-cover" />
                ) : (
                    sender?.[0]?.toUpperCase() ?? "?"
                )}
            </div>
        </Link>
    );
}

function CommentComposer({ user, onSubmit, onCancel, placeholder, submitting }) {
    const [text, setText]       = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [audioUrl, setAudioUrl] = useState("");
    const [uploading, setUploading] = useState(false);
    const [showEmoji, setShowEmoji] = useState(false);
    const [showGif, setShowGif]     = useState(false);
    const fileRef = useRef(null);

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
            setImageUrl(url);
        } catch { /* silent */ }
        setUploading(false);
    };

    const handleSubmit = () => {
        if ((!text.trim() && !imageUrl && !audioUrl) || submitting) return;
        onSubmit({ text: text.trim(), imageUrl, audioUrl });
        setText("");
        setImageUrl("");
        setAudioUrl("");
    };

    return (
        <div className="flex gap-2 items-start mt-2">
            <div
                className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold select-none overflow-hidden"
                style={{ backgroundColor: user.color }}
            >
                {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                    user.username?.[0]?.toUpperCase()
                )}
            </div>
            <div className="flex-1">
                {audioUrl && !imageUrl && !text && (
                    <div className="relative inline-flex mb-1.5">
                        <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 text-blue-500">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                            </svg>
                            <span className="text-xs text-gray-500 dark:text-gray-400">Voice comment</span>
                        </div>
                        <button onClick={() => setAudioUrl("")}
                            className="absolute -top-1.5 -right-1.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] hover:bg-black/80">
                            &#x2715;
                        </button>
                    </div>
                )}
                <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-2xl px-3 py-2 focus-within:border-gray-400 dark:focus-within:border-gray-500 transition-colors bg-gray-50 dark:bg-gray-800">
                    <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                        placeholder={placeholder || "Write a reply\u2026"}
                        maxLength={300}
                        className="flex-1 bg-transparent text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                    />
                    <div className="flex items-center gap-1 ml-2 relative">
                        <button type="button" onClick={() => { setShowEmoji(!showEmoji); setShowGif(false); }}
                            className={`p-0.5 rounded transition-colors ${showEmoji ? "text-yellow-500" : "text-gray-400 hover:text-yellow-500"}`}
                            title="Add emoji">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
                                <circle cx="12" cy="12" r="10" />
                                <path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2" />
                                <line x1="9" y1="9" x2="9.01" y2="9" strokeLinecap="round" />
                                <line x1="15" y1="9" x2="15.01" y2="9" strokeLinecap="round" />
                            </svg>
                        </button>
                        <button type="button" onClick={() => { setShowGif(!showGif); setShowEmoji(false); }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${showGif ? "text-purple-500" : "text-gray-400 hover:text-purple-500"}`}
                            title="Add GIF">
                            GIF
                        </button>
                        <button type="button" onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="text-gray-400 hover:text-blue-500 transition-colors p-0.5"
                            title="Add image">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round"
                                    d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                            </svg>
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                        <VoiceRecorder onRecorded={(url) => setAudioUrl(url)} maxDuration={60} />
                        {showEmoji && (
                            <div className="absolute bottom-full right-0 mb-2 z-30">
                                <EmojiPicker
                                    onEmojiSelect={(emoji) => setText(prev => prev + emoji)}
                                    onClose={() => setShowEmoji(false)}
                                />
                            </div>
                        )}
                        {showGif && (
                            <div className="absolute bottom-full right-0 mb-2 z-30 max-h-[50dvh]">
                                <GifPicker
                                    onSelect={(url) => { setImageUrl(url); setShowGif(false); }}
                                    onClose={() => setShowGif(false)}
                                />
                            </div>
                        )}
                        {(text.trim() || imageUrl || audioUrl) && (
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || uploading}
                                className="text-xs font-bold text-blue-500 hover:text-blue-600 disabled:opacity-50"
                            >
                                {submitting ? "\u2026" : "Post"}
                            </button>
                        )}
                    </div>
                </div>

                {imageUrl && (
                    <div className="relative mt-1.5 inline-block">
                        <img src={imageUrl} alt="" className="h-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                        <button onClick={() => setImageUrl("")}
                            className="absolute -top-1.5 -right-1.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] hover:bg-black/80">
                            &#x2715;
                        </button>
                    </div>
                )}

                {onCancel && (
                    <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-1">
                        Cancel
                    </button>
                )}
            </div>
        </div>
    );
}

const COMMENT_REACTIONS = [
    { type: "like", emoji: "👍" },
    { type: "love", emoji: "❤️" },
    { type: "laugh", emoji: "😂" },
    { type: "fire", emoji: "🔥" },
    { type: "sad", emoji: "😢" },
    { type: "angry", emoji: "😠" },
];

function CommentReactionButton({ comment, user, postId, onReact }) {
    const [show, setShow] = useState(false);
    const myReaction = COMMENT_REACTIONS.find(r =>
        comment.reactions?.[r.type]?.includes(user.username)
    );

    const handleReact = (type) => {
        onReact(postId, comment.commentId, type);
        setShow(false);
    };

    return (
        <div className="relative">
            <button
                onClick={() => setShow(!show)}
                onBlur={() => setTimeout(() => setShow(false), 200)}
                className={`inline-flex items-center text-[11px] font-medium transition-colors px-1.5 py-1 rounded min-h-[28px] ${
                    myReaction
                        ? "text-blue-500"
                        : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                }`}
            >
                {myReaction ? myReaction.emoji : "😊"}
            </button>
            {show && (
                <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-900 rounded-full shadow-xl border border-gray-200 dark:border-gray-700 px-1.5 py-1 flex gap-0.5 z-10">
                    {COMMENT_REACTIONS.map((r) => (
                        <button
                            key={r.type}
                            onClick={() => handleReact(r.type)}
                            className={`text-base p-1 hover:scale-125 transition-transform rounded-full ${
                                myReaction?.type === r.type ? "bg-blue-100 dark:bg-blue-900/30" : "hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                        >
                            {r.emoji}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function CommentReactionCounts({ reactions }) {
    const counts = COMMENT_REACTIONS
        .map(r => ({ ...r, count: reactions[r.type]?.length || 0 }))
        .filter(r => r.count > 0);
    if (counts.length === 0) return null;
    return (
        <div className="flex gap-1 flex-wrap mt-0.5 px-1">
            {counts.map(r => (
                <span key={r.type} className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full px-1.5 py-0.5">
                    <span className="text-xs">{r.emoji}</span>
                    <span>{r.count}</span>
                </span>
            ))}
        </div>
    );
}

function ThreadComment({ comment, allComments, depth, onReply, onHashtag, user, postId, onDelete, onReactComment, onEditComment }) {
    const replies = useMemo(
        () => allComments.filter((c) => c.parentId === comment.commentId),
        [allComments, comment.commentId]
    );

    const [commentLightbox, setCommentLightbox] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState(comment.text || "");
    const author = comment._author || null;
    const avatarUrl = author?.avatarUrl || comment.avatarUrl;

    return (
        <div className={depth > 0 ? "ml-6 border-l-2 border-gray-100 dark:border-gray-700 pl-3" : ""}>
            <div className="flex gap-2 items-start py-1.5">
                <PostAvatar sender={comment.sender} color={comment.color} avatarUrl={avatarUrl} author={author} size="sm" />
                <div className="flex-1 min-w-0">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl px-3 py-1.5 inline-block max-w-full">
                        <span className="font-semibold text-xs text-gray-900 dark:text-gray-100 mr-1 inline-flex items-center gap-1">
                            <Link href={`/profile/${encodeURIComponent(comment.sender)}`} className="hover:underline">
                                {comment.sender}
                            </Link>
                            <UserBadges isVerified={author?.isVerified} isAdmin={author?.isAdmin} roles={author?.roles || []} size="sm" />
                        </span>
                        {editing ? (
                            <div className="inline-flex items-center gap-1">
                                <input
                                    type="text"
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && editText.trim()) {
                                            onEditComment(comment.commentId, editText.trim());
                                            setEditing(false);
                                        }
                                        if (e.key === "Escape") setEditing(false);
                                    }}
                                    className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400"
                                    maxLength={300}
                                    autoFocus
                                />
                                <button onClick={() => { if (editText.trim()) { onEditComment(comment.commentId, editText.trim()); setEditing(false); } }}
                                    className="text-[10px] text-blue-500 font-bold">Save</button>
                                <button onClick={() => setEditing(false)} className="text-[10px] text-gray-400">Cancel</button>
                            </div>
                        ) : (
                            <>
                                {comment.text && (
                                    <RichText text={comment.text} onHashtag={onHashtag} className="text-xs text-gray-700 dark:text-gray-300" />
                                )}
                                {comment.editedAt && (
                                    <span className="text-[10px] text-gray-300 dark:text-gray-600 italic ml-1">(edited)</span>
                                )}
                            </>
                        )}
                    </div>
                    {comment.audioUrl && !comment.text && !comment.imageUrl && (
                        <div className="mt-1 max-w-[250px]">
                            <AudioPlayer src={comment.audioUrl} />
                        </div>
                    )}
                    {comment.imageUrl && (
                        <div className="mt-1 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 max-w-[80vw] sm:max-w-xs cursor-pointer" onClick={() => setCommentLightbox(true)}>
                            <img src={comment.imageUrl} alt="Comment image" className="w-full h-auto block" loading="lazy" />
                        </div>
                    )}
                    {commentLightbox && comment.imageUrl && (
                        <ImageLightbox src={comment.imageUrl} alt="Comment image" onClose={() => setCommentLightbox(false)} />
                    )}
                    <div className="flex items-center gap-2 mt-0.5 px-1">
                        <span className="text-gray-300 dark:text-gray-600 text-[11px]">{timeAgo(comment.timeStamp)}</span>
                        {user && (
                            <CommentReactionButton comment={comment} user={user} postId={postId} onReact={onReactComment} />
                        )}
                        {user && (
                            <button
                                onClick={() => onReply(comment.commentId, comment.sender)}
                                className="text-[11px] text-gray-400 hover:text-blue-500 font-medium transition-colors px-2 py-1.5 min-h-[36px]"
                            >
                                Reply
                            </button>
                        )}
                        {user?.username === comment.sender && (
                            <>
                            <button
                                onClick={() => { setEditing(true); setEditText(comment.text || ""); }}
                                className="text-[11px] text-gray-400 hover:text-blue-500 font-medium transition-colors px-2 py-1.5 min-h-[36px]"
                            >
                                Edit
                            </button>
                            <button
                                onClick={() => onDelete(comment.commentId)}
                                className="text-[11px] text-gray-400 hover:text-red-500 font-medium transition-colors px-2 py-1.5 min-h-[36px]"
                            >
                                Delete
                            </button>
                            </>
                        )}
                    </div>
                    {comment.reactions && (
                        <CommentReactionCounts reactions={comment.reactions} />
                    )}
                </div>
            </div>

            {replies.map((reply) => (
                <ThreadComment
                    key={reply.commentId}
                    comment={reply}
                    allComments={allComments}
                    depth={depth + 1}
                    onReply={onReply}
                    onHashtag={onHashtag}
                    user={user}
                    postId={postId}
                    onDelete={onDelete}
                    onReactComment={onReactComment}
                    onEditComment={onEditComment}
                />
            ))}
        </div>
    );
}

function PostCountdown({ expiresAt }) {
    const [remaining, setRemaining] = useState(() => Date.parse(expiresAt) - Date.now());
    useEffect(() => {
        if (remaining <= 0) return;
        const id = setInterval(() => setRemaining(Date.parse(expiresAt) - Date.now()), 1000);
        return () => clearInterval(id);
    }, [expiresAt]);
    if (remaining <= 0) return <span className="text-red-500 text-[11px] font-medium">Expired</span>;
    const totalSec = Math.floor(remaining / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return (
        <span className="inline-flex items-center gap-1 text-[11px] text-orange-500 font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            {h > 0 ? `${h}h ` : ""}{m}m {String(s).padStart(2, "0")}s
        </span>
    );
}

export default function PostCard({ post: initialPost, onDelete, onHashtag, serverTranslation, trackView }) {
    const { user } = useUser();
    const { showToast } = useToast();
    const [post, setPost]                     = useState(initialPost);
    const [liking, setLiking]                 = useState(false);
    const [deleting, setDeleting]             = useState(false);
    const [showComments, setShowComments]     = useState(false);
    const [commentText, setCommentText]       = useState("");
    const [submitting, setSubmitting]         = useState(false);
    const [replyTo, setReplyTo]               = useState(null);
    const [replyToName, setReplyToName]       = useState("");
    const [viewCount, setViewCount]           = useState(initialPost.viewCount || 0);
    const [showHeart, setShowHeart]           = useState(false);
    const [lightboxSrc, setLightboxSrc]       = useState(null);
    const [showReactions, setShowReactions]   = useState(false);
    const [reacting, setReacting]             = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [loginAction, setLoginAction]       = useState("interact");
    const [translations, setTranslations]   = useState({});
    const [translatingIdx, setTranslatingIdx] = useState(null);
    const [editingPost, setEditingPost]       = useState(false);
    const [editText, setEditText]             = useState("");
    const [savingEdit, setSavingEdit]         = useState(false);
    const autoTranslatedRef = useRef(false);
    const origTranslatedRef = useRef(false);
    const commentTranslatedRef = useRef(false);
    const hasTrackedView = useRef(false);
    const lastTapRef = useRef(0);
    const singleTapTimer = useRef(null);
    const imageRef = useRef(null);
    const touchStartRef = useRef(null);
    const scrollDetectedRef = useRef(false);

    const liked = useMemo(() => 
        user ? post.likes.includes(user.username) : false,
        [user, post.likes]
    );
    const isOwn = user?.username === post.sender;
    const author = post._author || null;
    const isRepostOrig = post.isRepost && post._originalPost;
    const origKey = isRepostOrig ? `${post._id}_orig` : null;
    const commentKey = post.isRepost && post.repostComment ? `${post._id}_cmt` : null;

    useEffect(() => {
        if (hasTrackedView.current) return;
        const timer = setTimeout(() => {
            hasTrackedView.current = true;
            if (trackView) {
                trackView(post._id);
            } else {
                fetch(`/api/posts/${post._id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "view" }),
                }).then((res) => {
                    if (res.ok) return res.json();
                }).then((data) => {
                    if (data?.viewCount !== undefined) setViewCount(data.viewCount);
                }).catch(() => {});
            }
        }, 2000);
        return () => {
            clearTimeout(timer);
            // Ensure single tap timer is also cleared
            if (singleTapTimer.current) {
                clearTimeout(singleTapTimer.current);
            }
        };
    }, [post._id, trackView]);

    const topLevelComments = useMemo(
        () => (post.comments || []).filter((c) => !c.parentId),
        [post.comments]
    );

    const translatePost = async (postId, text) => {
        if (translations[postId]) {
            setTranslations((prev) => { const n = { ...prev }; delete n[postId]; return n; });
            return;
        }
        setTranslatingIdx(postId);
        try {
            const res = await fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, target: user?.language || "en" }),
            });
            const data = await res.json();
            if (data.translatedText) {
                setTranslations((prev) => ({ ...prev, [postId]: data.translatedText }));
            }
        } catch {}
        setTranslatingIdx(null);
    };

    useEffect(() => {
        if (serverTranslation) {
            setTranslations((prev) => ({ ...prev, [post._id]: serverTranslation }));
            return;
        }
        if (!user?.autoTranslate) return;
        const target = user?.language || "en";

        const tryTranslate = (id, text, sender, ref) => {
            if (!text || user.username === sender) return;
            if (ref.current || translations[id]) return;
            ref.current = true;
            fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, target }),
            }).then((r) => r.json()).then((data) => {
                if (data.translatedText && data.translatedText !== text) {
                    setTranslations((prev) => ({ ...prev, [id]: data.translatedText }));
                }
            }).catch(() => {});
        };

        tryTranslate(post._id, post.text, post.sender, autoTranslatedRef);
        if (origKey) tryTranslate(origKey, post._originalPost.text, post._originalPost.sender, origTranslatedRef);
        if (commentKey) tryTranslate(commentKey, post.repostComment, post.sender, commentTranslatedRef);
    }, [post._id, post.text, post.sender, post._originalPost, post.repostComment, origKey, commentKey, user?.autoTranslate, user?.language, serverTranslation]);

    const handleLike = async () => {
        if (!user) { setLoginAction("like"); setShowLoginModal(true); return; }
        if (liking) return;
        
        // Optimistic update for better UX
        const wasLiked = liked;
        setPost(prev => ({
            ...prev,
            likes: wasLiked 
                ? prev.likes.filter(u => u !== user.username)
                : [...prev.likes, user.username]
        }));
        
        setLiking(true);
        try {
            const res = await fetch(`/api/posts/${post._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            });
            if (res.ok) {
                setPost(await res.json());
            } else {
                // Rollback optimistic update on error
                setPost(prev => ({
                    ...prev,
                    likes: wasLiked 
                        ? [...prev.likes, user.username]
                        : prev.likes.filter(u => u !== user.username)
                }));
                showToast("Failed to like post", "error");
            }
        } catch (err) {
            // Rollback on network error
            setPost(prev => ({
                ...prev,
                likes: wasLiked 
                    ? [...prev.likes, user.username]
                    : prev.likes.filter(u => u !== user.username)
            }));
            showToast("Network error", "error");
        } finally {
            setLiking(false);
        }
    };

    const handleReaction = async (reactionType) => {
        if (!user) { setLoginAction("react"); setShowLoginModal(true); return; }
        if (reacting) return;
        setReacting(true);
        try {
            const res = await fetch(`/api/posts/${post._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    username: user.username, 
                    action: "react", 
                    reactionType,
                    color: user.color 
                }),
            });
            if (res.ok) {
                setPost(await res.json());
            } else {
                showToast("Failed to react to post", "error");
            }
        } catch {
            showToast("Network error", "error");
        } finally {
            setReacting(false);
        }
    };

    const getUserReaction = () => {
        if (!user || !post.reactions) return null;
        const reactions = ["like", "love", "laugh", "fire", "sad", "angry"];
        for (const type of reactions) {
            if (post.reactions[type]?.includes(user.username)) {
                return type;
            }
        }
        return null;
    };

    const currentReaction = getUserReaction();

    const handleTouchStart = (e) => {
        const t = e.touches[0];
        touchStartRef.current = { x: t.clientX, y: t.clientY };
        scrollDetectedRef.current = false;
    };

    const handleTouchEnd = (e) => {
        if (!touchStartRef.current) return;
        const t = e.changedTouches?.[0];
        if (t) {
            const dx = Math.abs(t.clientX - touchStartRef.current.x);
            const dy = Math.abs(t.clientY - touchStartRef.current.y);
            if (dx > 10 || dy > 10) {
                scrollDetectedRef.current = true;
            }
        }
        touchStartRef.current = null;
    };

    // Double-tap to like, single tap to open lightbox (fires via onClick only)
    const handleImageTap = () => {
        if (scrollDetectedRef.current) {
            scrollDetectedRef.current = false;
            return;
        }
        const mainImage = (post.imageUrls?.length > 0 ? post.imageUrls[0] : post.imageUrl) || post.imageUrl;
        if (!user) {
            setLightboxSrc(mainImage);
            return;
        }
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
            // Double tap detected
            clearTimeout(singleTapTimer.current);
            if (!liked) handleLike();
            setShowHeart(true);
            setTimeout(() => setShowHeart(false), 900);
        } else {
            // Single tap — wait to see if double tap follows
            singleTapTimer.current = setTimeout(() => {
                setLightboxSrc(mainImage);
            }, 300);
        }
        lastTapRef.current = now;
    };

    const handleComment = async ({ text, imageUrl, audioUrl }) => {
        if ((!text && !imageUrl && !audioUrl) || submitting || !user) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/posts/${post._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action:   "comment",
                    username: user.username,
                    color:    user.color,
                    text:     text || "",
                    imageUrl: imageUrl || "",
                    audioUrl: audioUrl || "",
                    parentId: replyTo || null,
                }),
            });
            if (res.ok) {
                setPost(await res.json());
                setCommentText("");
                setReplyTo(null);
                setReplyToName("");
                setShowComments(true);
                showToast(replyTo ? "Reply posted" : "Comment posted", "success");
            } else {
                showToast("Failed to post comment", "error");
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteComment = async (commentId) => {
        if (!confirm("Delete this comment?")) return;
        try {
            const res = await fetch(`/api/posts/${post._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "deleteComment",
                    username: user.username,
                    commentId,
                }),
            });
            if (res.ok) {
                setPost(await res.json());
                showToast("Comment deleted", "success");
            } else {
                showToast("Failed to delete comment", "error");
            }
        } catch {
            showToast("Failed to delete comment", "error");
        }
    };

    const handleReply = (commentId, senderName) => {
        setReplyTo(commentId);
        setReplyToName(senderName);
    };

    const handleReactComment = async (postId, commentId, reactionType) => {
        if (!user) return;
        try {
            const res = await fetch(`/api/posts/${post._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "reactComment",
                    username: user.username,
                    commentId,
                    reactionType,
                }),
            });
            if (res.ok) {
                setPost(await res.json());
            }
        } catch {
            showToast("Failed to react", "error");
        }
    };

    const handleEditComment = async (commentId, text) => {
        if (!user) return;
        try {
            const res = await fetch(`/api/posts/${post._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "editComment",
                    username: user.username,
                    commentId,
                    text,
                }),
            });
            if (res.ok) {
                setPost(await res.json());
                showToast("Comment edited", "success");
            } else {
                showToast("Failed to edit comment", "error");
            }
        } catch {
            showToast("Failed to edit comment", "error");
        }
    };

    const handleDelete = async () => {
        if (!user || deleting) return;
        if (!confirm("Delete this post?")) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/posts/${post._id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            });
            if (res.ok) {
                showToast("Post deleted", "success");
                onDelete?.(initialPost._id);
            } else {
                showToast("Failed to delete post", "error");
            }
        } catch {
            showToast("Failed to delete post", "error");
        } finally {
            setDeleting(false);
        }
    };

    const startEditPost = () => {
        setEditText(post.text || "");
        setEditingPost(true);
    };

    const saveEditPost = async () => {
        if (!editText.trim() || savingEdit) return;
        setSavingEdit(true);
        try {
            const res = await fetch(`/api/posts/${post._id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: editText.trim(), imageUrl: post.imageUrl, audioUrl: post.audioUrl }),
            });
            if (res.ok) {
                setPost(await res.json());
                setEditingPost(false);
                showToast("Post edited", "success");
            } else {
                showToast("Failed to edit post", "error");
            }
        } catch {
            showToast("Failed to edit post", "error");
        } finally {
            setSavingEdit(false);
        }
    };

    return (
        <>
        <article className="border-b border-gray-200 dark:border-gray-800 px-4 py-4">
            <div className="flex gap-3">
                <PostAvatar sender={post.sender} color={post.color} avatarUrl={post.avatarUrl} author={author} />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                            <Link
                                href={`/profile/${encodeURIComponent(post.sender)}`}
                                className="font-bold text-sm text-gray-900 dark:text-gray-100 hover:underline"
                            >
                                {post.sender}
                            </Link>
                            <UserBadges isVerified={author?.isVerified} isAdmin={author?.isAdmin} roles={author?.roles || []} size="sm" />
                        </span>
                        <span className="text-gray-400 dark:text-gray-500 text-xs">&middot;</span>
                        <span className="text-gray-400 dark:text-gray-500 text-xs">{timeAgo(post.timeStamp)}</span>
                        {post.editedAt && (
                            <span className="text-gray-300 dark:text-gray-600 text-[11px] italic">(edited)</span>
                        )}
                        {post.expiresAt && (
                            <PostCountdown expiresAt={post.expiresAt} />
                        )}
                        {post.visibility === "closeFriends" && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] text-green-500 font-medium" title="Close Friends only">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                                </svg>
                            </span>
                        )}
                        <div className="ml-auto flex items-center gap-1">
                            {!isOwn && user && !author?.followers?.includes?.(user.username) && (
                                <FollowButton username={post.sender} size="xs" />
                            )}
                            {isOwn && (
                                <>
                                <button
                                    onClick={startEditPost}
                                    aria-label="Edit post"
                                    className="text-gray-300 dark:text-gray-600 hover:text-blue-500 transition-colors p-2.5 -mr-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                        strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round"
                                            d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                    </svg>
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    aria-label="Delete post"
                                    className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors p-2.5 -mr-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                        strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round"
                                            d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                    </svg>
                                </button>
                                </>
                            )}
                        </div>
                    </div>

                    {post.isRepost && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
                            </svg>
                            <span>Reposted</span>
                        </div>
                    )}

                    {post.isRepost && post.repostComment && (
                        <div className="mt-1.5">
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                                <RichText text={post.repostComment} onHashtag={onHashtag} />
                            </p>
                            {commentKey && translations[commentKey] && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 italic mt-1 leading-relaxed whitespace-pre-wrap">
                                    {translations[commentKey]}
                                </p>
                            )}
                            {commentKey && (
                                <button
                                    onClick={() => translatePost(commentKey, post.repostComment)}
                                    disabled={translatingIdx === commentKey}
                                    className="text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors mt-0.5 flex items-center gap-1"
                                    title={translations[commentKey] ? "Hide translation" : "Translate"}
                                >
                                    {translatingIdx === commentKey ? (
                                        <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" />
                                        </svg>
                                    )}
                                </button>
                            )}
                        </div>
                    )}

                    {post.isRepost && post._originalPost ? (
                        <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                            <div className="px-3 py-2">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <PostAvatar sender={post._originalPost.sender} color={post._originalPost.color} avatarUrl={post._originalPost.avatarUrl} author={post._originalPost._author} size="sm" />
                                    <span className="font-semibold text-xs text-gray-900 dark:text-gray-100">
                                        {post._originalPost.sender}
                                    </span>
                                    <UserBadges isVerified={post._originalPost._author?.isVerified} isAdmin={post._originalPost._author?.isAdmin} roles={post._originalPost._author?.roles || []} size="sm" />
                                    <span className="text-gray-400 dark:text-gray-500 text-[11px]">{timeAgo(post._originalPost.timeStamp)}</span>
                                </div>
                                {post._originalPost.text && (
                                    <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">
                                        <RichText text={post._originalPost.text} onHashtag={onHashtag} />
                                    </p>
                                )}
                                {origKey && translations[origKey] && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400 italic mt-1 leading-relaxed whitespace-pre-wrap">
                                        {translations[origKey]}
                                    </p>
                                )}
                                {origKey && post._originalPost.text && (
                                    <button
                                        onClick={() => translatePost(origKey, post._originalPost.text)}
                                        disabled={translatingIdx === origKey}
                                        className="text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors mt-0.5 flex items-center gap-1"
                                        title={translations[origKey] ? "Hide translation" : "Translate"}
                                    >
                                        {translatingIdx === origKey ? (
                                            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" />
                                            </svg>
                                        )}
                                    </button>
                                )}
                                {(post._originalPost.imageUrl || post._originalPost.imageUrls?.length > 0) && (() => {
                                    const imgs = post._originalPost.imageUrls?.length > 0 ? post._originalPost.imageUrls : [post._originalPost.imageUrl];
                                    return imgs.length === 1 ? (
                                        <div className="mt-2 rounded-lg overflow-hidden">
                                            <img src={imgs[0]} alt="" className="w-full h-auto block" loading="lazy" />
                                        </div>
                                    ) : (
                                        <ImageCarousel images={imgs} onImageClick={(src) => setLightboxSrc(src)} />
                                    );
                                })()}
                                {post._originalPost.audioUrl && !post._originalPost.text && !(post._originalPost.imageUrl || post._originalPost.imageUrls?.length) && (
                                    <div className="mt-2 max-w-xs">
                                        <AudioPlayer src={post._originalPost.audioUrl} />
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (post.text ? (
                        <div className="mt-1">
                            {editingPost ? (
                                <div>
                                    <textarea
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        maxLength={1000}
                                        rows={3}
                                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 dark:focus:border-blue-500 resize-none"
                                        autoFocus
                                    />
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <button
                                            onClick={saveEditPost}
                                            disabled={savingEdit || !editText.trim()}
                                            className="text-xs font-bold text-blue-500 hover:text-blue-600 disabled:opacity-50"
                                        >
                                            {savingEdit ? "Saving\u2026" : "Save"}
                                        </button>
                                        <button
                                            onClick={() => setEditingPost(false)}
                                            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">
                                        <RichText text={post.text} onHashtag={onHashtag} />
                                    </p>
                                    {translations[post._id] && (
                                        <p className="text-sm text-gray-500 dark:text-gray-400 italic mt-1 leading-relaxed whitespace-pre-wrap">
                                            {translations[post._id]}
                                        </p>
                                    )}
                                    <button
                                        onClick={() => translatePost(post._id, post.text)}
                                        disabled={translatingIdx === post._id}
                                        className="text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors mt-0.5 flex items-center gap-1"
                                        title={translations[post._id] ? "Hide translation" : "Translate"}
                                    >
                                        {translatingIdx === post._id ? (
                                            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" />
                                            </svg>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    ) : null)}

                    {post.audioUrl && !post.text && !post.imageUrl && !(post.imageUrls?.length) && (
                        <div className="mt-2 max-w-xs">
                            <AudioPlayer src={post.audioUrl} />
                        </div>
                    )}

                    {(post.imageUrl || post.imageUrls?.length > 0) && (() => {
                        const allImages = post.imageUrls?.length > 0 ? post.imageUrls : [post.imageUrl];
                        return allImages.length === 1 ? (
                            <div
                                ref={imageRef}
                                className="mt-3 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 relative cursor-pointer select-none"
                                onClick={handleImageTap}
                                onTouchStart={handleTouchStart}
                                onTouchEnd={handleTouchEnd}
                            >
                                <img
                                    src={allImages[0]}
                                    alt="Post image"
                                    className="w-full h-auto block"
                                    loading="lazy"
                                />
                                {showHeart && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-20 h-20 text-white drop-shadow-lg animate-heart-burst">
                                            <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <ImageCarousel images={allImages} onImageClick={(src) => setLightboxSrc(src)} showHeart={showHeart} />
                        );
                    })()}

                    {post.poll?.enabled && (
                        <PollCard
                            post={post}
                            onPollUpdate={(newPoll) => setPost(prev => ({ ...prev, poll: newPoll }))}
                        />
                    )}

                    <div className="flex items-center gap-1 sm:gap-3 mt-3 relative">
                        <ReactionPicker 
                            onReact={handleReaction}
                            currentReaction={currentReaction}
                        />

                        <button
                            onClick={() => {
                                if (!user) { setLoginAction("comment"); setShowLoginModal(true); return; }
                                setShowComments((v) => !v);
                            }}
                            aria-label="Comments"
                            className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors min-h-[44px] px-2 py-1 rounded-lg animate-press"
                        >
                            <CommentIcon />
                            {(post.comments?.length || 0) > 0 && <span>{post.comments.length}</span>}
                        </button>

                        {user ? (
                            <RepostButton postId={post._id} onReposted={() => showToast("Reposted to your feed!", "success")} />
                        ) : (
                            <button
                                onClick={() => { setLoginAction("repost"); setShowLoginModal(true); }}
                                className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-green-500 transition-colors min-h-[44px] px-2 py-1 rounded-lg"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
                                </svg>
                            </button>
                        )}

                        <ShareButton
                            postId={post._id}
                            text={post.text}
                            imageUrl={post.imageUrl}
                        />

                        {viewCount > 0 && (
                            <span className="flex items-center gap-1 text-sm text-gray-400 dark:text-gray-500 ml-1">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                </svg>
                                <span>{viewCount}</span>
                            </span>
                        )}

                        <div className="ml-auto">
                            {user ? (
                                <BookmarkButton postId={post._id} />
                            ) : (
                                <button
                                    onClick={() => { setLoginAction("save posts"); setShowLoginModal(true); }}
                                    className="text-gray-400 dark:text-gray-500 hover:text-yellow-500 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>

                    {post.reactions && (
                        <ReactionCounts 
                            reactions={post.reactions}
                            onReactionClick={(reaction) => {
                                // Could show who reacted in a modal
                                console.log('Reaction clicked:', reaction);
                            }}
                        />
                    )}

                    {showComments && (
                        <div className="mt-3 flex flex-col gap-2">
                            {topLevelComments.length > 0 && (
                                <div className="flex flex-col">
                                    {topLevelComments.map((c) => (
                                        <ThreadComment
                                            key={c.commentId}
                                            comment={c}
                                            allComments={post.comments || []}
                                            depth={0}
                                            onReply={handleReply}
                                            onHashtag={onHashtag}
                                            user={user}
                                            postId={post._id}
                                            onDelete={handleDeleteComment}
                                            onReactComment={handleReactComment}
                                            onEditComment={handleEditComment}
                                        />
                                    ))}
                                </div>
                            )}

                            {user && (
                                <div>
                                    {replyToName && (
                                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1 ml-8">
                                            Replying to <span className="font-medium text-gray-500 dark:text-gray-400">@{replyToName}</span>
                                            <button onClick={() => { setReplyTo(null); setReplyToName(""); }}
                                                className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">&#x2715;</button>
                                        </p>
                                    )}
                                    <CommentComposer
                                        user={user}
                                        onSubmit={handleComment}
                                        onCancel={replyTo ? () => { setReplyTo(null); setReplyToName(""); } : undefined}
                                        placeholder={replyTo ? `Reply to @${replyToName}\u2026` : "Add a comment\u2026"}
                                        submitting={submitting}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </article>

        {lightboxSrc && (
            <ImageLightbox src={lightboxSrc} alt="Post image" onClose={() => setLightboxSrc(null)} />
        )}
        {showLoginModal && (
            <LoginModal onClose={() => setShowLoginModal(false)} action={loginAction} />
        )}
        </>
    );
}
