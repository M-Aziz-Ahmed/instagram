"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { useVoiceChat } from "@/context/VoiceChatContext";
import Link from "next/link";
import InviteModal from "./InviteModal";

const ROLE_BADGES = { owner: "Owner", admin: "Admin", moderator: "Mod", member: "" };
const ROLE_COLORS = { owner: "text-yellow-500", admin: "text-blue-500", moderator: "text-green-500" };
const SORT_OPTIONS = [
    { value: "hot", label: "Hot" },
    { value: "new", label: "New" },
    { value: "top", label: "Top" },
];

export default function CommunityDetailClient() {
    const { id } = useParams();
    const router = useRouter();
    const { user } = useUser();
    const { openVoiceChat } = useVoiceChat();
    const [community, setCommunity] = useState(null);
    const [members, setMembers] = useState([]);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("feed");
    const [sort, setSort] = useState("hot");
    const [showInvite, setShowInvite] = useState(false);
    const [selectedFlair, setSelectedFlair] = useState(null);
    const [newPost, setNewPost] = useState("");
    const [posting, setPosting] = useState(false);

    const load = useCallback(async () => {
        try {
            const [cRes, mRes] = await Promise.all([
                fetch(`/api/communities/${id}`, { credentials: "include" }),
                fetch(`/api/communities/${id}/members`, { credentials: "include" }),
            ]);
            const c = await cRes.json();
            const m = await mRes.json();
            setCommunity(c);
            setMembers(Array.isArray(m) ? m : []);
            if (c.isMember) {
                const pRes = await fetch(`/api/communities/${id}/posts?sort=${sort}`, { credentials: "include" });
                const p = await pRes.json();
                setPosts(Array.isArray(p) ? p : []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [id, sort]);

    useEffect(() => { load(); }, [load]);

    const join = async () => {
        const res = await fetch(`/api/communities/${id}/join`, { method: "POST", credentials: "include" });
        if (res.ok) load();
    };

    const leave = async () => {
        const res = await fetch(`/api/communities/${id}/leave`, { method: "POST", credentials: "include" });
        if (res.ok) router.push("/communities");
    };

    const vote = async (postId, direction) => {
        const res = await fetch(`/api/posts/${postId}/vote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ direction }),
        });
        if (res.ok) {
            const data = await res.json();
            setPosts((prev) => prev.map((p) => p._id === postId ? { ...p, score: data.score, upvotes: Array(data.upvotes).fill("_"), downvotes: Array(data.downvotes).fill("_"), _userVote: data.userVote } : p));
        }
    };

    const submitPost = async (e) => {
        e.preventDefault();
        if (!newPost.trim() || posting) return;
        setPosting(true);
        try {
            const body = { content: newPost.trim(), communityId: id };
            if (selectedFlair) body.flair = selectedFlair;
            const res = await fetch("/api/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });
            if (res.ok) {
                setNewPost("");
                setSelectedFlair(null);
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
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
                <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                <div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            </div>
        );
    }

    if (!community || community.error) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-12 text-center">
                <p className="text-gray-400 text-sm">Community not found</p>
                <Link href="/communities" className="text-blue-500 text-sm mt-2 inline-block hover:underline">Browse communities</Link>
            </div>
        );
    }

    const isMember = community.isMember;
    const myMember = community.members?.find((m) => m.username === user?.username);
    const isAdmin = myMember && ["owner", "admin"].includes(myMember.role);
    const isMod = myMember && ["owner", "admin", "moderator"].includes(myMember.role);

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            {/* Banner */}
            {community.bannerUrl && (
                <div className="h-32 rounded-xl overflow-hidden mb-4">
                    <img src={community.bannerUrl} alt="" className="w-full h-full object-cover" />
                </div>
            )}

            {/* Header */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-4">
                <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0 border-4 border-white dark:border-gray-900 overflow-hidden" style={{ backgroundColor: community.color || "#3b82f6" }}>
                        {community.avatarUrl ? (
                            <img src={community.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            community.name?.[0]?.toUpperCase()
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="font-bold text-lg text-gray-900 dark:text-gray-100">{community.name}</h1>
                        <p className="text-xs text-gray-500">
                            {community.memberCount} member{community.memberCount !== 1 ? "s" : ""} · Created {new Date(community.createdAt).toLocaleDateString()}
                        </p>
                    </div>
                </div>
                {community.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">{community.description}</p>
                )}
                <div className="flex gap-2 mt-3">
                    {isMember ? (
                        <>
                            <button onClick={() => setShowInvite(true)} className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                                Invite
                            </button>
                            {community.creator !== user?.username && (
                                <button onClick={leave} className="px-4 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                                    Leave
                                </button>
                            )}
                        </>
                    ) : (
                        <button onClick={join} className="px-5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                            Join
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                {["feed", "voice", "rules", "members"].map((t) => (
                    <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors capitalize ${tab === t ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                        {t}
                    </button>
                ))}
            </div>

            {/* Feed tab */}
            {tab === "feed" && (
                <div>
                    {/* New post */}
                    {isMember && (
                        <form onSubmit={submitPost} className="mb-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3">
                            <textarea
                                value={newPost}
                                onChange={(e) => setNewPost(e.target.value)}
                                placeholder="What's on your mind?"
                                rows={3}
                                className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none outline-none"
                            />
                            {/* Flair picker */}
                            {community.flairs?.length > 0 && (
                                <div className="flex gap-1.5 flex-wrap mt-2 mb-2">
                                    {community.flairs.map((f) => (
                                        <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => setSelectedFlair(selectedFlair?.id === f.id ? null : f)}
                                            className={`px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors ${selectedFlair?.id === f.id ? "border-transparent text-white" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300"}`}
                                            style={selectedFlair?.id === f.id ? { backgroundColor: f.color } : {}}
                                        >
                                            {f.emoji && `${f.emoji} `}{f.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex justify-end">
                                <button type="submit" disabled={!newPost.trim() || posting} className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                    {posting ? "Posting..." : "Post"}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Sort buttons */}
                    <div className="flex gap-1 mb-3">
                        {SORT_OPTIONS.map((opt) => (
                            <button key={opt.value} onClick={() => setSort(opt.value)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${sort === opt.value ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Posts */}
                    {!isMember ? (
                        <p className="text-center text-gray-400 text-sm py-8">Join to see posts</p>
                    ) : posts.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-8">No posts yet. Be the first!</p>
                    ) : (
                        <div className="space-y-2">
                            {posts.map((p) => (
                                <PostCard key={p._id} post={p} user={user} onVote={vote} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Voice tab */}
            {tab === "voice" && (
                <div className="space-y-2">
                    {!isMember ? (
                        <p className="text-center text-gray-400 text-sm py-8">Join to access voice channels</p>
                    ) : (
                        <>
                            {isAdmin && (
                                <CreateVoiceChannelButton communityId={id} onCreated={load} />
                            )}
                            {(!community.voiceChannels || community.voiceChannels.length === 0) ? (
                                <p className="text-center text-gray-400 text-sm py-8">No voice channels yet</p>
                            ) : (
                                community.voiceChannels.map((ch) => (
                                    <div key={ch.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                                        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-purple-500">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{ch.name}</p>
                                        </div>
                                        <button
                                            onClick={() => openVoiceChat()}
                                            className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shrink-0"
                                        >
                                            Join
                                        </button>
                                    </div>
                                ))
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Rules tab */}
            {tab === "rules" && (
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                    {(!community.rules || community.rules.length === 0) ? (
                        <p className="text-center text-gray-400 text-sm py-8">No rules set yet</p>
                    ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-800">
                            {community.rules.map((rule, i) => (
                                <div key={i} className="px-4 py-3">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        <span className="text-gray-400 mr-2">{i + 1}.</span>
                                        {rule.title}
                                    </p>
                                    {rule.description && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-5">{rule.description}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Members tab */}
            {tab === "members" && (
                <div className="space-y-1">
                    {["owner", "admin", "moderator", "member"].map((role) => {
                        const roleMembers = members.filter((m) => m.role === role);
                        if (roleMembers.length === 0) return null;
                        return (
                            <div key={role}>
                                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1 mb-1 mt-3 first:mt-0">
                                    {role === "member" ? `Members (${roleMembers.length})` : `${ROLE_BADGES[role]}s (${roleMembers.length})`}
                                </p>
                                {roleMembers.map((m) => (
                                    <div key={m.username} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                                        <Link href={`/profile/${m.username}`} className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden" style={{ backgroundColor: m._profile?.avatarColor || "#6b7280" }}>
                                            {m._profile?.avatarUrl ? (
                                                <img src={m._profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                m.username?.[0]?.toUpperCase()
                                            )}
                                        </Link>
                                        <div className="flex-1 min-w-0">
                                            <Link href={`/profile/${m.username}`} className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:underline truncate block">
                                                {m.username}
                                            </Link>
                                        </div>
                                        {ROLE_BADGES[m.role] && (
                                            <span className={`text-[10px] font-medium ${ROLE_COLORS[m.role] || "text-gray-400"}`}>
                                                {ROLE_BADGES[m.role]}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}

            {showInvite && <InviteModal community={community} onClose={() => setShowInvite(false)} />}
        </div>
    );
}

function PostCard({ post: p, user, onVote }) {
    const [userVote, setUserVote] = useState(p._userVote || "none");

    const handleVote = async (dir) => {
        const newDir = userVote === dir ? "none" : dir;
        setUserVote(newDir);
        onVote(p._id, newDir);
    };

    const score = p.score || 0;

    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="flex">
                {/* Vote column */}
                <div className="flex flex-col items-center gap-0.5 px-2 py-3 bg-gray-50 dark:bg-gray-800/50">
                    <button onClick={() => handleVote("up")} className={`p-1 rounded transition-colors ${userVote === "up" ? "text-orange-500" : "text-gray-400 hover:text-orange-500"}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M12 20.25a.75.75 0 0 1-.75-.75V6.31l-5.47 5.47a.75.75 0 0 1-1.06-1.06l6.75-6.75a.75.75 0 0 1 1.06 0l6.75 6.75a.75.75 0 1 1-1.06 1.06l-5.47-5.47v13.19a.75.75 0 0 1-.75.75Z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <span className={`text-xs font-bold ${userVote === "up" ? "text-orange-500" : userVote === "down" ? "text-blue-500" : "text-gray-700 dark:text-gray-300"}`}>
                        {score}
                    </span>
                    <button onClick={() => handleVote("down")} className={`p-1 rounded transition-colors ${userVote === "down" ? "text-blue-500" : "text-gray-400 hover:text-blue-500"}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M11.75 3.75a.75.75 0 0 1 .75.75v13.19l5.47-5.47a.75.75 0 1 1 1.06 1.06l-6.75 6.75a.75.75 0 0 1-1.06 0l-6.75-6.75a.75.75 0 1 1 1.06-1.06l5.47 5.47V4.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-3 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        <Link href={`/profile/${p.sender}`} className="text-xs font-medium text-gray-900 dark:text-gray-100 hover:underline">{p.sender}</Link>
                        <span className="text-[10px] text-gray-400">{new Date(p.timeStamp).toLocaleDateString()}</span>
                        {p.flair?.name && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full text-white" style={{ backgroundColor: p.flair.color || "#3b82f6" }}>
                                {p.flair.emoji && `${p.flair.emoji} `}{p.flair.name}
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">{p.text || p.content}</p>
                    {p.imageUrl && <img src={p.imageUrl} alt="" className="mt-2 rounded-lg max-h-60 object-cover" />}
                    {p.imageUrls?.length > 1 && (
                        <div className="flex gap-1 mt-2 overflow-x-auto">
                            {p.imageUrls.slice(1, 4).map((url, i) => (
                                <img key={i} src={url} alt="" className="h-20 rounded-lg object-cover shrink-0" />
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-gray-400">
                        <Link href={`/post/${p._id}`} className="text-[10px] hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                            {p.comments?.length || 0} comment{(p.comments?.length || 0) !== 1 ? "s" : ""}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CreateVoiceChannelButton({ communityId, onCreated }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);

    const create = async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/communities/${communityId}/voice-channels`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ name: name.trim() }),
            });
            if (res.ok) {
                setName("");
                setOpen(false);
                onCreated();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="w-full py-2.5 text-sm font-medium text-purple-600 bg-purple-50 dark:bg-purple-500/10 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors">
                                + Create Voice Channel
                            </button>
        );
    }

    return (
        <form onSubmit={create} className="flex gap-2 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
            <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Channel name"
                autoFocus
                className="flex-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
            />
            <button type="submit" disabled={loading || !name.trim()} className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
                {loading ? "..." : "Create"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-2 py-1.5 text-gray-400 hover:text-gray-600 text-xs">
                Cancel
            </button>
        </form>
    );
}
