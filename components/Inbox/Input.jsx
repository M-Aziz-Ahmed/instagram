"use client";

import { useRef, useState } from "react";
import { useUser } from "@/context/UserContext";

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export default function Input({ onMessageSent, recipient }) {
    const { user } = useUser();
    const [text, setText]           = useState("");
    const [sending, setSending]     = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [uploading, setUploading] = useState(false);
    const fileRef                   = useRef(null);
    const inputRef                  = useRef(null);

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

    const canSend = (text.trim() || imagePreview) && !sending && !uploading && user && recipient;

    const handleSend = async () => {
        if (!canSend) return;

        const snapshotText = text.trim();
        const snapshotImage = imagePreview;
        setText("");
        setImagePreview(null);
        setSending(true);

        const tempId = `temp_${Date.now()}_${Math.random()}`;

        if (onMessageSent) {
            onMessageSent({
                _tempId: tempId,
                text: snapshotText,
                imageUrl: snapshotImage || "",
                sender: user.username,
                recipient,
                color: user.color,
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
                    sender: user.username,
                    recipient,
                    color: user.color,
                }),
            });
            if (!res.ok) throw new Error("Send failed");
            const msg = await res.json();
            if (onMessageSent) onMessageSent({ ...msg, _sending: false });
        } catch (err) {
            console.error("Failed to send:", err);
            setText(snapshotText);
            setImagePreview(snapshotImage);
            if (onMessageSent) onMessageSent({ _tempId: tempId, _remove: true });
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e) => {
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

            {/* Input row */}
            <div className="flex items-end gap-2">
                {/* Attach button */}
                <button
                    onClick={() => fileRef.current?.click()}
                    disabled={!user || !recipient}
                    aria-label="Attach image"
                    className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

                {/* Text input */}
                <div className="flex-1 flex items-center bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2 min-h-[44px] focus-within:ring-1 focus-within:ring-gray-300 dark:focus-within:ring-gray-600 transition-shadow">
                    <input
                        ref={inputRef}
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={recipient ? "Message\u2026" : "Select a conversation\u2026"}
                        disabled={!user || !recipient}
                        className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none disabled:cursor-not-allowed"
                    />
                </div>

                {/* Send / Mic button */}
                {canSend ? (
                    <button
                        onClick={handleSend}
                        disabled={sending || uploading}
                        aria-label="Send"
                        className="shrink-0 w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 dark:hover:bg-blue-400 flex items-center justify-center text-white transition-colors disabled:opacity-50"
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
                    <button
                        aria-label="Voice message"
                        disabled={!user || !recipient}
                        className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3z" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}
