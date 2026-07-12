"use client";

import { useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import Image from "next/image";

export default function Compose({ onPosted }) {
    const { user } = useUser();
    const [text, setText]         = useState("");
    const [preview, setPreview]   = useState(null);  // base64 data URL for preview
    const [imageData, setImageData] = useState(null); // base64 data URL for upload
    const [posting, setPosting]   = useState(false);
    const [error, setError]       = useState("");
    const fileRef                 = useRef(null);

    const handleFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) {
            setError("Image must be under 8 MB.");
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            setPreview(ev.target.result);
            setImageData(ev.target.result);
        };
        reader.readAsDataURL(file);
    };

    const removeImage = () => {
        setPreview(null);
        setImageData(null);
        if (fileRef.current) fileRef.current.value = "";
    };

    const handlePost = async () => {
        if ((!text.trim() && !imageData) || posting || !user) return;
        setPosting(true);
        setError("");
        try {
            const res = await fetch("/api/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text:      text.trim(),
                    imageData: imageData ?? undefined,
                    sender:    user.username,
                    color:     user.color,
                }),
            });
            if (!res.ok) {
                const d = await res.json();
                setError(d.error ?? "Failed to post.");
                return;
            }
            setText("");
            removeImage();
            if (onPosted) onPosted();
        } catch {
            setError("Something went wrong. Try again.");
        } finally {
            setPosting(false);
        }
    };

    const canPost = (text.trim().length > 0 || !!imageData) && !posting;

    return (
        <div className="border-b border-gray-200 px-4 py-4">
            <div className="flex gap-3">
                {/* Avatar */}
                <div
                    className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm select-none mt-0.5"
                    style={{ backgroundColor: user?.color ?? "#94a3b8" }}
                >
                    {user?.username?.[0]?.toUpperCase() ?? "?"}
                </div>

                <div className="flex-1 flex flex-col gap-3">
                    {/* Text input */}
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="What's happening?"
                        rows={2}
                        maxLength={500}
                        disabled={!user}
                        className="w-full resize-none text-gray-900 placeholder-gray-400 text-base outline-none bg-transparent disabled:cursor-not-allowed"
                        onInput={(e) => {
                            e.target.style.height = "auto";
                            e.target.style.height = e.target.scrollHeight + "px";
                        }}
                    />

                    {/* Image preview */}
                    {preview && (
                        <div className="relative w-full rounded-2xl overflow-hidden border border-gray-200">
                            <img
                                src={preview}
                                alt="Preview"
                                className="w-full max-h-80 object-cover"
                            />
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
                        </div>
                    )}

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    {/* Toolbar */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                        <div className="flex items-center gap-1">
                            {/* Image upload */}
                            <button
                                onClick={() => fileRef.current?.click()}
                                aria-label="Add image"
                                disabled={!user}
                                className="p-2 text-blue-500 hover:bg-blue-50 rounded-full transition-colors disabled:opacity-40"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                    strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round"
                                        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                                </svg>
                            </button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFile}
                            />

                            {/* Char count */}
                            {text.length > 400 && (
                                <span className={`text-xs ml-1 ${text.length >= 500 ? "text-red-500" : "text-gray-400"}`}>
                                    {500 - text.length}
                                </span>
                            )}
                        </div>

                        <button
                            onClick={handlePost}
                            disabled={!canPost}
                            className="bg-black text-white text-sm font-bold px-5 py-1.5 rounded-full hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {posting ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-2" />
                            ) : "Post"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
