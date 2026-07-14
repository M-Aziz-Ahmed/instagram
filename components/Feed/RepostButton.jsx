"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";

export default function RepostButton({ postId, onReposted, className = "" }) {
    const { user } = useUser();
    const { showToast } = useToast();
    const [showModal, setShowModal] = useState(false);
    const [comment, setComment] = useState("");
    const [reposting, setReposting] = useState(false);

    const handleRepost = async () => {
        if (!user || reposting) return;
        
        setReposting(true);
        try {
            const res = await fetch(`/api/posts/${postId}/repost`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    comment: comment.trim(),
                }),
            });

            if (res.ok) {
                showToast("Reposted!", "success");
                setShowModal(false);
                setComment("");
                onReposted?.();
            } else {
                const data = await res.json();
                showToast(data.error || "Failed to repost", "error");
            }
        } catch (error) {
            showToast("Network error", "error");
        } finally {
            setReposting(false);
        }
    };

    if (!user) return null;

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className={`flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-green-500 transition-colors min-h-[44px] px-2 py-1 rounded-lg ${className}`}
                aria-label="Repost"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3 3-3" />
                </svg>
            </button>

            {showModal && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100">Repost</h2>
                            <button 
                                onClick={() => setShowModal(false)} 
                                className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                aria-label="Close"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Add a comment (optional)
                            </label>
                            <textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Share your thoughts..."
                                maxLength={280}
                                rows={4}
                                className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-3 text-sm outline-none focus:border-black dark:focus:border-gray-500 transition-colors resize-none"
                            />
                            <p className="text-right text-xs text-gray-400 dark:text-gray-500 mt-1">
                                {comment.length}/280
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRepost}
                                disabled={reposting}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {reposting ? "Reposting..." : "Repost"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
