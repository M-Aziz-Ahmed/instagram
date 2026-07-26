"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

export default function CommunityChannelClient() {
    const { id, channelId } = useParams();
    const router = useRouter();
    const { user } = useUser();
    const [community, setCommunity] = useState(null);
    const [channel, setChannel] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newPost, setNewPost] = useState("");
    const [posting, setPosting] = useState(false);

    const load = useCallback(async () => {
        try {
            const cRes = await fetch(`/api/communities/${id}`, { credentials: "include" });
            const c = await cRes.json();
            setCommunity(c);
            const ch = (c.channels || []).find((ch) => ch.id === channelId);
            setChannel(ch);

            if (c.isMember) {
                const pRes = await fetch(`/api/communities/${id}/posts?channelId=${channelId}`, { credentials: "include" });
                const p = await pRes.json();
                setPosts(Array.isArray(p) ? p : []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [id, channelId]);

    useEffect(() => { load(); }, [load]);

    const submitPost = async (e) => {
        e.preventDefault();
        if (!newPost.trim() || posting) return;
        setPosting(true);

        try {
            const res = await fetch("/api/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ content: newPost.trim(), communityId: id, channelId }),
            });
            if (res.ok) {
                setNewPost("");
                load();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setPosting(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
                <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse w-48" />
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                ))}
            </div>
        );
    }

    if (!community || !channel) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-12 text-center">
                <p className="text-gray-400 text-sm">Channel not found</p>
                <Link href={`/communities/${id}`} className="text-blue-500 text-sm mt-2 inline-block hover:underline">Back to community</Link>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <button onClick={() => router.push(`/communities/${id}`)} className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                </button>
                <div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">#</span>
                        <h1 className="font-bold text-gray-900 dark:text-gray-100">{channel.name}</h1>
                    </div>
                    {channel.description && <p className="text-xs text-gray-500">{channel.description}</p>}
                </div>
            </div>

            {/* Posts */}
            {!community.isMember ? (
                <p className="text-center text-gray-400 text-sm py-8">Join this community to view posts</p>
            ) : (
                <div className="space-y-2 mb-4">
                    {posts.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-8">No posts in this channel yet</p>
                    ) : (
                        posts.map((p) => (
                            <div key={p._id} className="p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <Link href={`/profile/${p.username}`} className="text-xs font-medium text-gray-900 dark:text-gray-100 hover:underline">{p.username}</Link>
                                    <span className="text-[10px] text-gray-400">{new Date(p.timeStamp).toLocaleDateString()}</span>
                                </div>
                                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">{p.content}</p>
                                {p.mediaUrl && <img src={p.mediaUrl} alt="" className="mt-2 rounded-lg max-h-60 object-cover" />}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* New post input */}
            {community.isMember && (channel.type === "text" || channel.type === "announcement") && (
                <form onSubmit={submitPost} className="flex gap-2">
                    <input
                        type="text"
                        value={newPost}
                        onChange={(e) => setNewPost(e.target.value)}
                        placeholder={`Post in #${channel.name}...`}
                        className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button type="submit" disabled={!newPost.trim() || posting} className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        Send
                    </button>
                </form>
            )}
        </div>
    );
}
