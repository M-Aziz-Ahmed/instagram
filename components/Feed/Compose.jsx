"use client";

import { useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";
import MentionInput from "@/components/shared/MentionInput";

const CLOUD_NAME     = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET  = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export default function Compose({ onPosted }) {
    const { user } = useUser();
    const { showToast } = useToast();
    const [text, setText]                 = useState("");
    const [preview, setPreview]           = useState(null);
    const [imageFile, setImageFile]       = useState(null);
    const [posting, setPosting]           = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError]               = useState("");
    const [visibility, setVisibility]     = useState("public");
    const fileRef                         = useRef(null);

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
        if ((!trimmedText && !imageFile) || posting || !user) return;
        
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
            }
            const res = await fetch("/api/posts", {
                method:  "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({
                    text:     trimmedText,
                    imageUrl,
                    sender:   user.username,
                    color:    user.color,
                    visibility,
                }),
            });
            if (!res.ok) {
                const d = await res.json();
                setError(d.error ?? "Failed to post.");
                return;
            }
            setText("");
            removeImage();
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

    const canPost = (text.trim().length > 0 || !!imageFile) && !posting;

    return (
        <div className="border-b border-gray-200 dark:border-gray-800 p-4">
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

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <div className="flex items-center justify-between p-1 border-t border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-1">
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
                        </div>

                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

                        <button
                            onClick={handlePost}
                            disabled={!canPost}
                            className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-bold px-5 py-1.5 rounded-full hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-16 flex items-center justify-center"
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
