"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";
import MentionInput from "@/components/shared/MentionInput";
import VoiceRecorder from "@/components/shared/VoiceRecorder";
import EmojiPicker from "@/components/shared/EmojiPicker";
import GifPicker from "@/components/shared/GifPicker";
import { useDraftSync } from "@/utils/useDraftSync";
import SchedulePicker, { formatScheduleLabel } from "./SchedulePicker";
import useMediaTarget from "./useMediaTarget";
import StorageHint from "./StorageHint";

export default function Compose({ onPosted }) {
    const { user } = useUser();
// Where this account's uploads go, and what it has spent. Resolved from
// /api/media-vault/status so an account that connected its own storage uploads
// there; falls back to the site cloud while that call is in flight, which keeps
// the composer working rather than blocking it on a settings lookup.
const media = useMediaTarget({ enabled: !!user?.username });
// Whether this account may upload video directly. Sent by /api/auth/me as
// `canUploadVideo`, resolved server-side by the same helper that gates
// POST /api/posts, so the two can't disagree. Defaults to false: someone who
// cannot upload should be offered the link route rather than a button that
// fails at submit time.
const canUploadVideo = user?.canUploadVideo === true;
    const { showToast } = useToast();
    const [text, setText]                 = useState("");
    const [imageFiles, setImageFiles]     = useState([]);
    const [previews, setPreviews]         = useState([]);
    const [audioUrl, setAudioUrl]         = useState("");
    const [video, setVideo]               = useState(null); // { file, preview, duration, width, height }
    const [videoError, setVideoError]     = useState("");
    const [posting, setPosting]           = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError]               = useState("");
    const [visibility, setVisibility]     = useState("public");
    const [showEmoji, setShowEmoji]       = useState(false);
    const [showGif, setShowGif]           = useState(false);
    const [showPoll, setShowPoll]         = useState(false);
    const [pollOptions, setPollOptions]   = useState(["", ""]);
    const [pollExpiry, setPollExpiry]     = useState(null);
    // ISO string, or null for "publish now". Sent as `scheduledAt`, which the
    // server turns into isScheduled + scheduledAt.
    const [scheduledAt, setScheduledAt]   = useState(null);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [draft, setDraft]               = useState(null);
    const fileRef                         = useRef(null);
    const videoRef                        = useRef(null);

    useEffect(() => {
        const handler = () => {
            const compose = document.getElementById("compose");
            const textarea = compose?.querySelector("textarea");
            // Focus first, and with preventScroll. The old order was
            // scrollIntoView({ behavior: "smooth" }) and then focus() on the
            // next line, which starts the keyboard while a ~300ms animation is
            // still running; the keyboard shrinks the visual viewport, and the
            // animation finishes against the offset it was computed from
            // before that happened — so the caret ends up off-screen. Focusing
            // with preventScroll also leaves the scroll position entirely to the
            // frame below, where it can be done against the final layout.
            if (textarea) {
                textarea.focus({ preventScroll: true });
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            }
            // Next frame: the soft keyboard has been requested and the
            // visual viewport is its final size, so this scroll lands on the
            // composer's real position. `scroll-mt` on #compose keeps its top
            // out from under the sticky h-12 header.
            requestAnimationFrame(() => {
                compose?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        };
        window.addEventListener("open-compose", handler);
        return () => window.removeEventListener("open-compose", handler);
    }, []);

    // ── Drafts ────────────────────────────────────────────────────────────
    // A draft exists on the server; `draft` is only the banner offering to put
    // it back, so restoring stays an explicit choice rather than silently
    // overwriting whatever the author is currently typing.
    const draftValue = {
        text,
        visibility,
        expiresIn: pollExpiry,
        pollEnabled: showPoll,
        pollOptions,
        hadAttachments: imageFiles.length > 0 || previews.length > 0 || !!audioUrl || !!video,
    };

    const handleRestored = useCallback((saved) => {
        setDraft(saved);
    }, []);

    const { clearDraft } = useDraftSync({
        enabled: !!user,
        value: draftValue,
        onRestored: handleRestored,
    });

    const restoreDraft = () => {
        if (!draft) return;
        setText(draft.text || "");
        setVisibility(draft.visibility || "public");
        setPollExpiry(draft.expiresIn ?? null);
        if (draft.pollEnabled && (draft.pollOptions || []).length >= 2) {
            setShowPoll(true);
            setPollOptions(draft.pollOptions);
        }
        setDraft(null);
        showToast(draft.hadAttachments ? "Draft restored — re-attach any media" : "Draft restored");
    };

    const discardDraft = async () => {
        setDraft(null);
        setText("");
        setShowPoll(false);
        setPollOptions(["", ""]);
        setPollExpiry(null);
        clearImages();
        setAudioUrl("");
        await clearDraft();
    };

    const handleFile = (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const valid = files.filter(f => f.size <= 20 * 1024 * 1024).slice(0, 10 - imageFiles.length);
        if (valid.length < files.length) setError("Some images exceeded 20 MB and were skipped.");
        setImageFiles(prev => [...prev, ...valid]);
        setPreviews(prev => [...prev, ...valid.map(f => URL.createObjectURL(f))]);
        setError("");
    };

    const removeImage = (idx) => {
        URL.revokeObjectURL(previews[idx]);
        setImageFiles(prev => prev.filter((_, i) => i !== idx));
        setPreviews(prev => prev.filter((_, i) => i !== idx));
        setShowGif(false);
        if (imageFiles.length <= 1 && fileRef.current) fileRef.current.value = "";
    };

    const clearImages = () => {
        previews.forEach(u => URL.revokeObjectURL(u));
        setImageFiles([]);
        setPreviews([]);
        setUploadProgress(0);
        setShowGif(false);
        if (fileRef.current) fileRef.current.value = "";
    };

    // ── Video ──────────────────────────────────────────────────────────────
    // One video per post, and video replaces images rather than joining them:
    // a mixed carousel of photos and video is not something the feed or the
    // Reels player renders, so it is rejected here instead of being stored and
    // then displayed wrong.
    const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
    const MAX_VIDEO_SECONDS_LOCAL = 180;

    const clearVideo = () => {
        if (video?.preview) URL.revokeObjectURL(video.preview);
        setVideo(null);
        setVideoError("");
        if (videoRef.current) videoRef.current.value = "";
    };

    const handleVideo = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("video/")) {
            setVideoError("That file is not a video.");
            return;
        }
        if (file.size > MAX_VIDEO_BYTES) {
            setVideoError("Videos must be 100 MB or smaller.");
            return;
        }

        // Duration and dimensions are read from the file itself rather than
        // trusted from the upload response, so the stored metadata always
        // matches the bytes that were actually selected.
        const probe = document.createElement("video");
        const preview = URL.createObjectURL(file);
        probe.preload = "metadata";
        probe.onloadedmetadata = () => {
            const duration = Math.round(probe.duration || 0);
            if (duration > MAX_VIDEO_SECONDS_LOCAL) {
                URL.revokeObjectURL(preview);
                setVideoError("Videos must be 3 minutes or shorter.");
                if (videoRef.current) videoRef.current.value = "";
                return;
            }
            // Videos are exclusive with images and voice notes.
            clearImages();
            setAudioUrl("");
            setVideo({
                file,
                preview,
                duration,
                width: probe.videoWidth || 0,
                height: probe.videoHeight || 0,
            });
            setVideoError("");
        };
        probe.onerror = () => {
            URL.revokeObjectURL(preview);
            setVideoError("That video could not be read.");
            if (videoRef.current) videoRef.current.value = "";
        };
        probe.src = preview;
    };

    const uploadVideoToCloudinary = (file) =>
        new Promise((resolve, reject) => {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("upload_preset", media.uploadPreset);
            fd.append("folder", "anon-reels");

            const xhr = new XMLHttpRequest();
            xhr.open("POST", `https://api.cloudinary.com/v1_1/${media.cloudName}/video/upload`);
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    setUploadProgress(Math.round((e.loaded / e.total) * 100));
                }
            };
            // The whole result is read, not just the URL: `bytes` comes from
            // Cloudinary, so the running total is never a number the browser
            // invented.
            xhr.onload  = () => {
                if (xhr.status !== 200) return reject(new Error("Upload failed"));
                try {
                    const result = JSON.parse(xhr.responseText);
                    media.noteUsage(result.bytes || file.size);
                    resolve(result.secure_url);
                } catch {
                    reject(new Error("Upload response could not be read"));
                }
            };
            xhr.onerror = () => reject(new Error("Network error during upload"));
            xhr.send(fd);
        });

    const uploadToCloudinary = (file) =>
        new Promise((resolve, reject) => {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("upload_preset", media.uploadPreset);
            fd.append("folder", "anon-feed");

            const xhr = new XMLHttpRequest();
            xhr.open("POST", `https://api.cloudinary.com/v1_1/${media.cloudName}/image/upload`);
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    setUploadProgress(Math.round((e.loaded / e.total) * 100));
                }
            };
            xhr.onload  = () => {
                if (xhr.status !== 200) return reject(new Error("Upload failed"));
                try {
                    const result = JSON.parse(xhr.responseText);
                    media.noteUsage(result.bytes || file.size);
                    resolve(result.secure_url);
                } catch {
                    reject(new Error("Upload response could not be read"));
                }
            };
            xhr.onerror = () => reject(new Error("Network error during upload"));
            xhr.send(fd);
        });

    const handlePost = async () => {
        const trimmedText = text.trim();
        const hasGif = previews.some(u => u.includes("media.giphy.com"));
        const hasImages = imageFiles.length > 0 || previews.some(u => !u.includes("media.giphy.com"));
        if ((!trimmedText && !hasImages && !hasGif && !audioUrl && !video) || posting || !user) return;
        
        if (trimmedText.length > 500) {
            setError("Post text cannot exceed 500 characters");
            return;
        }
        
        setPosting(true);
        setError("");
        setUploadProgress(0);
        try {
            const uploadedUrls = [];
            for (const file of imageFiles) {
                try {
                    const url = await uploadToCloudinary(file);
                    uploadedUrls.push(url);
                } catch (uploadErr) {
                    setError("Failed to upload an image. Please try again.");
                    return;
                }
            }
            const gifUrls = previews.filter(u => u.includes("media.giphy.com") && !uploadedUrls.includes(u));
            const allImageUrls = [...uploadedUrls, ...gifUrls];

            let uploadedVideoUrl = "";
            if (video) {
                try {
                    uploadedVideoUrl = await uploadVideoToCloudinary(video.file);
                } catch (uploadErr) {
                    setError("Failed to upload the video. Please try again.");
                    return;
                }
            }

            const res = await fetch("/api/posts", {
                method:  "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({
                    text:     trimmedText,
                    imageUrl: allImageUrls[0] || "",
                    imageUrls: allImageUrls,
                    audioUrl: audioUrl || "",
                    ...(uploadedVideoUrl ? {
                        videoUrl: uploadedVideoUrl,
                        videoDuration: video.duration || 0,
                        videoWidth: video.width || 0,
                        videoHeight: video.height || 0,
                    } : {}),
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
                    // Omitted entirely when unset so the server's own
                    // `scheduledAt > now` check decides, rather than sending an
                    // empty string it would have to reject.
                    ...(scheduledAt ? { scheduledAt } : {}),
                }),
            });
            if (!res.ok) {
                const d = await res.json();
                setError(d.error ?? "Failed to post.");
                return;
            }
            setText("");
            clearImages();
            setAudioUrl("");
            clearVideo();
            setShowPoll(false);
            setPollOptions(["", ""]);
            setPollExpiry(null);
            setScheduledAt(null);
            setScheduleOpen(false);
            setDraft(null);
            // The post is live, so the saved copy is now stale.
            clearDraft();
            showToast(scheduledAt ? "Post scheduled" : "Post published", "success");
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
    const hasGif = previews.some(u => u.includes("media.giphy.com"));
    const hasMedia = imageFiles.length > 0 || previews.some(u => !u.includes("media.giphy.com"));
    const canPost = ((text.trim().length > 0 || hasMedia || hasGif || !!audioUrl || !!video) || hasValidPoll) && !posting;

    return (
        // scroll-mt matches the sticky header it has to clear: h-12 (48px) plus
        // the safe-area inset the header's own padding-top adds, since
        // scrollIntoView aligns the element's scroll-margin edge to the top of
        // the viewport and would otherwise park the first line of the composer
        // underneath the header. sm: the header grows to h-14.
        <div id="compose" className="border-b border-gray-200 dark:border-gray-800 p-4 scroll-mt-[calc(3rem+env(safe-area-inset-top))] sm:scroll-mt-[calc(3.5rem+env(safe-area-inset-top))]">
            {/* `min-w-0` on both levels. This is a flex item with `flex-1`, and
                without `min-w-0` its automatic minimum size is its min-content
                width — so any child with intrinsic width (a media preview, the
                storage meter) could push the column wider than the viewport. The
                overflow did not show as a scrollbar: `html, body` carry
                `overflow-x: hidden` (globals.css), so it was clipped instead. */}
            <div className="flex gap-3 min-w-0">
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

                <div className="flex-1 min-w-0 flex flex-col gap-3">
                    {videoError && (
                        <p className="text-xs text-red-500 dark:text-red-400">{videoError}</p>
                    )}

                    {video && (
                        <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black">
                            <video
                                src={video.preview}
                                controls
                                muted
                                playsInline
                                className="w-full max-h-[min(45dvh,320px)] object-contain"
                            />
                            {!posting && (
                                <button
                                    onClick={clearVideo}
                                    aria-label="Remove video"
                                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                            <p className="absolute bottom-2 left-2 text-[10px] text-white/80 bg-black/50 rounded px-1.5 py-0.5">
                                {video.width}x{video.height} · {video.duration}s
                            </p>
                        </div>
                    )}

                    {draft && (
                        <div className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                            </svg>
                            <p className="text-xs text-amber-800 dark:text-amber-300 flex-1 min-w-0">
                                {draft.hadAttachments
                                    ? "You have an unfinished post. Media has to be re-attached."
                                    : "You have an unfinished post."}
                            </p>
                            <button
                                onClick={restoreDraft}
                                className="text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline shrink-0"
                            >
                                Restore
                            </button>
                            <button
                                onClick={discardDraft}
                                className="text-xs text-amber-700/70 dark:text-amber-300/70 hover:text-amber-700 dark:hover:text-amber-300 shrink-0"
                            >
                                Discard
                            </button>
                        </div>
                    )}

                    <MentionInput
                        value={text}
                        onChange={setText}
                        onSubmit={handlePost}
                        placeholder="What's happening? Use @ to mention someone"
                        maxLength={500}
                        submitting={posting}
                    />

                    {/* The preview block.

                       Two things were broken here and both showed up the moment
                       a file was attached.

                       `max-h` + `overflow-y-auto` on the scroller — ten previews
                       in a 2-col grid at `max-h-48` is five rows, ~965px, plus
                       the add-cell. The composer grew taller than the viewport,
                       so on a phone the Post button ended up below the fold and
                       under the fixed BottomNav with no way to scroll to it.
                       Capping the block keeps the whole composer on screen; the
                       thumbnails scroll inside it instead.

                       `relative` on the WRAPPER, not the scroller — the progress
                       bar is `absolute bottom-0 left-0 right-0`. With no
                       positioned ancestor it resolved against the viewport and
                       drew a full-screen-wide bar pinned to the bottom of the
                       phone. Anchoring it to the wrapper also keeps it pinned to
                       the composer's bottom edge while the thumbnails scroll,
                       which is the point of a progress bar. */}
                    {previews.length > 0 && (
                        <div className="relative">
                            <div className={`rounded-2xl border border-gray-200 dark:border-gray-700 max-h-[min(50dvh,24rem)] overflow-y-auto overscroll-contain ${previews.length > 1 ? "grid grid-cols-2 gap-1" : ""}`}>
                                {previews.map((src, idx) => (
                                    <div key={idx} className="relative">
                                        <img src={src} alt={`Preview ${idx + 1}`} className={`w-full object-contain bg-gray-50 dark:bg-gray-800 ${previews.length === 1 ? "max-h-80" : "max-h-48"}`} />
                                        {!posting && (
                                            <button
                                                onClick={() => removeImage(idx)}
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
                                ))}
                                {!posting && previews.length < 10 && imageFiles.length < 10 && (
                                    <button
                                        onClick={() => fileRef.current?.click()}
                                        className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors min-h-[80px] sm:min-h-[120px]"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-400">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                            {posting && uploadProgress > 0 && uploadProgress < 100 && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700 overflow-hidden rounded-b-2xl">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-200"
                                        style={{ width: `${uploadProgress}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {audioUrl && previews.length === 0 && (
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
                                        // text-base on mobile, sm:text-sm from
                                        // there up: 14px makes iOS Safari zoom
                                        // the page the moment this field takes
                                        // focus, and layout.js pins
                                        // maximumScale: 1, so there is no way
                                        // back out.
                                        className="flex-1 min-w-0 bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-400 dark:focus:border-blue-500"
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

                    {/* Timing row. Previously this only appeared once a poll
                        existed or an expiry was already chosen, so the auto-delete
                        control was unreachable until you had added a poll — and
                        `expiresIn` was never read by the server, so choosing any
                        of these did nothing at all. */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            {showPoll ? "Poll closes:" : "Auto-delete:"}
                        </span>
                        {[null, 60000, 180000, 600000, 1800000, 3600000].map((ms) => {
                            const label = ms === null ? "Never" : ms < 3600000 ? `${ms / 60000}m` : `${ms / 3600000}h`;
                            return (
                                <button
                                    key={label}
                                    onClick={() => setPollExpiry(ms)}
                                    className={`text-[11px] font-medium px-2 py-1 rounded-full transition-colors min-h-[28px] ${
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

                    {/* Schedule. The server has accepted `scheduledAt` and run a
                        publisher on an interval since before this existed, but no
                        client had ever sent it, so scheduled posting was a feature
                        with no way to reach it. */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">Schedule:</span>
                        <button
                            onClick={() => setScheduleOpen((v) => !v)}
                            aria-expanded={scheduleOpen}
                            className={`text-[11px] font-medium px-2 py-1 rounded-full transition-colors min-h-[28px] ${
                                scheduleOpen || scheduledAt
                                    ? "bg-blue-500 text-white"
                                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                            }`}
                        >
                            {scheduledAt ? formatScheduleLabel(scheduledAt) : "Set a time"}
                        </button>
                        {scheduledAt && (
                            <button
                                onClick={() => { setScheduledAt(null); setScheduleOpen(false); }}
                                className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-1 rounded-full min-h-[28px]"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {scheduleOpen && (
                        <SchedulePicker
                            value={scheduledAt}
                            onChange={(iso) => {
                                setScheduledAt(iso);
                                if (iso) setScheduleOpen(false);
                            }}
                        />
                    )}

                    {/* Storage hint. This used to live INSIDE the toolbar row,
                        between the icon strip and the Post button, which is
                        where it did the most damage: the row is a non-wrapping
                        `justify-between` flex line and the hint is a
                        non-wrapping flex line of its own, so the moment media was
                        staged (the hint renders nothing until then) it would
                        claim 70-240px of a ~200px-wide toolbar and shove the
                        `shrink-0` Post button off the right edge — where
                        `body { overflow-x: hidden }` clipped it, so it was
                        simply gone. Its own doc comment said "one line, above
                        the toolbar"; that is now literally true, and it gets the
                        full column width to lay out in. */}
                    {media.status && (
                        <div className="-mb-2">
                            <StorageHint
                                media={media}
                                hasMedia={imageFiles.length > 0 || !!video || previews.some((u) => !u.includes("media.giphy.com"))}
                            />
                        </div>
                    )}

                    <div className="relative flex items-center justify-between gap-1 p-1 border-t border-gray-100 dark:border-gray-800">
                        {/* scrollbar-hide so the overflow below `sm` is at least
                        discoverable. Seven controls plus the Post button need
                        ~290px and the strip gets ~188px at 320px, so the
                        Close-Friends toggle — the last `sm:hidden` control —
                        genuinely sits past the right edge; a visible scrollbar
                        is the only cue there is anything over there, and on
                        touch there is no cursor to find the edge with. The
                        spacing below `sm` is already at its tightest (gap-0.5 =
                        2px, p-1.5 on the icons), so what is left to give is the
                        Post button's horizontal padding, dropped from px-3 to
                        px-2 while it shows nothing but the word "Post".

                        This strip scrolls on x, which forces `overflow-y` to
                        `auto` as well — so it also acts as a containing block for
                        the absolutely-positioned Emoji/GIF panels further down,
                        which are 340px wide and were being clipped by it. `sticky
                        top-0` on each panel pins them to the strip's top edge so
                        they stay reachable while it scrolls. */}
                    <div className="flex items-center gap-0.5 sm:gap-1 relative overflow-x-auto scrollbar-hide flex-1 min-w-0">
                            <button
                                onClick={() => { setShowEmoji(!showEmoji); setShowGif(false); }}
                                aria-label="Add emoji"
                                disabled={!user || posting}
                                className={`p-1.5 sm:p-2 rounded-full transition-colors disabled:opacity-40 ${showEmoji ? "text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20" : "text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4.5 h-4.5 sm:w-5 sm:h-5">
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
                                className={`px-1.5 sm:px-2 py-1 rounded-full transition-colors disabled:opacity-40 text-[10px] sm:text-xs font-bold ${showGif ? "text-purple-500 bg-purple-50 dark:bg-purple-900/20" : "text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20"}`}
                            >
                                GIF
                            </button>
                            <button
                                onClick={() => { setShowPoll(!showPoll); setShowEmoji(false); setShowGif(false); }}
                                aria-label="Add poll"
                                disabled={!user || posting}
                                className={`p-1.5 sm:p-2 rounded-full transition-colors disabled:opacity-40 ${showPoll ? "text-orange-500 bg-orange-50 dark:bg-orange-900/20" : "text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20"}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4.5 h-4.5 sm:w-5 sm:h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                                </svg>
                            </button>
                            <button
                                onClick={() => fileRef.current?.click()}
                                aria-label="Add image"
                                disabled={!user || posting || !!video}
                                className="p-1.5 sm:p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors disabled:opacity-40"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                    strokeWidth={1.8} stroke="currentColor" className="w-4.5 h-4.5 sm:w-5 sm:h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round"
                                        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                                </svg>
                            </button>
                            <button
                                onClick={() => {
                                    // Guarded here for a clear message, but the
                                    // server re-checks on POST /api/posts - this
                                    // is a courtesy, not the enforcement.
                                    if (!canUploadVideo) {
                                        setVideoError(
                                            "Uploading video isn't enabled on your account. You can still post a YouTube, TikTok, Instagram, Facebook or Reddit link and it will play inline.",
                                        );
                                        return;
                                    }
                                    videoRef.current?.click();
                                }}
                                aria-label="Add video"
                                title={
                                    canUploadVideo
                                        ? "Add a video (max 3 minutes)"
                                        : "Video upload is limited on this account — post a link instead"
                                }
                                disabled={!user || posting || !!video || hasMedia || !!audioUrl}
                                // relative is load-bearing: the lock dot below is
                                // absolutely positioned, and without a positioned
                                // ancestor it resolved against the whole toolbar
                                // strip instead of this button, landing ~90px to
                                // the right of the video control it annotates.
                                className="relative p-1.5 sm:p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors disabled:opacity-40 shrink-0 touch-manipulation"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                    strokeWidth={1.8} stroke="currentColor" className="w-4.5 h-4.5 sm:w-5 sm:h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round"
                                        d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H15.75Z" />
                                </svg>
                                {!canUploadVideo && (
                                    // Small lock so the disabled state reads as
                                    // "not your account" rather than "broken".
                                    <span className="absolute -bottom-0.5 -right-0.5 block h-1.5 w-1.5 rounded-full bg-amber-400" />
                                )}
                            </button>
                            <VoiceRecorder
                                onRecorded={(url) => setAudioUrl(url)}
                                maxDuration={60}
                            />
                            <button
                                onClick={() => setVisibility(visibility === "public" ? "closeFriends" : "public")}
                                className={`hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
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
                            <button
                                onClick={() => setVisibility(visibility === "public" ? "closeFriends" : "public")}
                                className={`sm:hidden p-1.5 rounded-full transition-colors ${
                                    visibility === "closeFriends"
                                        ? "text-green-500 bg-green-50 dark:bg-green-900/20"
                                        : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                                }`}
                                title={visibility === "closeFriends" ? "Close Friends only" : "Public"}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4.5 h-4.5 sm:w-5 sm:h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                                </svg>
                            </button>
                            </div>

                        {/* Emoji and GIF panels. These are siblings of the icon
                            strip above, not children of it: that strip is
                            `overflow-x-auto`, and a non-visible overflow-x forces
                            overflow-y to compute to `auto` too, so a 340px-wide
                            panel anchored inside it was being clipped to the
                            strip's ~60px scroll width. Anchored to the toolbar row
                            (which is `relative` and does not clip) they open at
                            full width, and they no longer scroll away sideways
                            when the strip does. */}
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
                                    onSelect={(url) => {
                                        // GIFs live in the same `previews`
                                        // list as picked images; the submit
                                        // path distinguishes them by their
                                        // giphy URL. `setPreview` never
                                        // existed, so picking a GIF threw.
                                        setPreviews(prev => (prev.length < 10 ? [...prev, url] : prev));
                                        setShowGif(false);
                                    }}
                                    onClose={() => setShowGif(false)}
                                />
                            </div>
                        )}

                        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFile} />
                <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={handleVideo} />

                        <button
                            onClick={handlePost}
                            disabled={!canPost}
                            className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs sm:text-sm font-bold px-2 sm:px-5 py-1.5 rounded-full hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center justify-center ml-0.5 sm:ml-1 touch-manipulation"
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
