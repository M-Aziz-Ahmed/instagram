"use client";

import { useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const BG_COLORS = ["#1a1a2e", "#16213e", "#0f3460", "#533483", "#e94560", "#1b1b2f", "#162447", "#1f4068", "#1b1b2f", "#4a0e4e"];

export default function CreateStory({ onClose }) {
    const { user } = useUser();
    const { showToast } = useToast();
    const [mode, setMode] = useState("text");
    const [text, setText] = useState("");
    const [bgColor, setBgColor] = useState("#1a1a2e");
    const [imageUrl, setImageUrl] = useState("");
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const fileRef = useRef(null);
    const abortControllerRef = useRef(null);

    const uploadToCloudinary = (file) =>
        new Promise((resolve, reject) => {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("upload_preset", UPLOAD_PRESET);
            fd.append("folder", "anon-feed");
            const xhr = new XMLHttpRequest();
            
            // Store XHR in ref so we can abort it
            abortControllerRef.current = xhr;
            
            xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
            xhr.onload = () => xhr.status === 200 ? resolve(JSON.parse(xhr.responseText).secure_url) : reject(new Error("Upload failed"));
            xhr.onerror = () => reject(new Error("Network error"));
            xhr.onabort = () => reject(new Error("Upload cancelled"));
            xhr.send(fd);
        });

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            setImageUrl(await uploadToCloudinary(file));
            setMode("image");
        } catch (err) {
            if (err.message !== "Upload cancelled") {
                showToast("Upload failed", "error");
            }
        }
        setUploading(false);
        abortControllerRef.current = null;
    };

    const handleCancel = () => {
        // Abort ongoing upload if any
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        onClose();
    };

    const handlePost = async () => {
        if ((!text.trim() && !imageUrl) || submitting) return;
        setSubmitting(true);
        try {
            const res = await fetch("/api/stories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sender: user.username,
                    color: user.avatarColor,
                    text: mode === "text" ? text.trim() : "",
                    imageUrl,
                    bgColor,
                }),
            });
            if (res.ok) {
                showToast("Story posted!", "success");
                onClose();
            } else {
                showToast("Failed to post story", "error");
            }
        } catch {
            showToast("Failed to post story", "error");
        }
        setSubmitting(false);
    };

    return (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col">
            <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                <button 
                    onClick={handleCancel} 
                    disabled={submitting}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium text-sm disabled:opacity-40"
                >
                    Cancel
                </button>
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">New Story</span>
                <button
                    onClick={handlePost}
                    disabled={submitting || uploading || (!text.trim() && !imageUrl)}
                    className="text-blue-500 hover:text-blue-600 font-semibold text-sm disabled:opacity-40"
                >
                    {submitting ? "Posting..." : "Share"}
                </button>
            </header>

            <div className="flex-1 flex items-center justify-center p-6">
                {mode === "text" && !imageUrl ? (
                    <div className="w-full max-w-sm aspect-[9/16] rounded-2xl flex flex-col items-center justify-center p-6" style={{ backgroundColor: bgColor }}>
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Type something..."
                            className="w-full bg-transparent text-white text-xl font-medium text-center placeholder-white/40 outline-none resize-none"
                            rows={4}
                            maxLength={300}
                            autoFocus
                        />
                        <p className="text-white/30 text-xs mt-2">{text.length}/300</p>
                    </div>
                ) : (
                    <div className="w-full max-w-sm aspect-[9/16] rounded-2xl overflow-hidden bg-gray-900 flex items-center justify-center relative">
                        {uploading ? (
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <button
                                    onClick={handleCancel}
                                    className="text-white/70 hover:text-white text-sm font-medium"
                                >
                                    Cancel upload
                                </button>
                            </div>
                        ) : (
                            <>
                                <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                                <button
                                    onClick={() => { setImageUrl(""); setMode("text"); }}
                                    className="absolute top-3 right-3 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/70 transition-colors"
                                >
                                    &#x2715;
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-3 mb-3">
                    <button
                        onClick={() => setMode("text")}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${mode === "text" ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}
                    >
                        Text
                    </button>
                    <button
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${mode === "image" ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}
                    >
                        {uploading ? "Uploading..." : "Photo"}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                </div>

                {mode === "text" && !imageUrl && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {BG_COLORS.map((c) => (
                            <button
                                key={c}
                                onClick={() => setBgColor(c)}
                                className={`w-8 h-8 rounded-full shrink-0 border-2 transition-colors ${bgColor === c ? "border-white" : "border-transparent"}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
