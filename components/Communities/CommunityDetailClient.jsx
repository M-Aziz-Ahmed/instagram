"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { useVoiceChat } from "@/context/VoiceChatContext";
import Link from "next/link";
import InviteModal from "./InviteModal";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

const ROLE_BADGES = { owner: "Owner", admin: "Admin", moderator: "Mod", member: "" };
const ROLE_COLORS = { owner: "text-yellow-500", admin: "text-blue-500", moderator: "text-green-500" };
const ROLE_OPTIONS = ["owner", "admin", "moderator", "member"];
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
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [uploadingImg, setUploadingImg] = useState(false);
    const fileRef = useRef(null);

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

    const uploadToCloudinary = (file) => {
        return new Promise((resolve, reject) => {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("upload_preset", UPLOAD_PRESET);
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
            xhr.onload = () => xhr.status === 200 ? resolve(JSON.parse(xhr.responseText).secure_url) : reject(new Error("Upload failed"));
            xhr.onerror = () => reject(new Error("Network error"));
            xhr.send(fd);
        });
    };

    const handleImageSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) return;
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const submitPost = async (e) => {
        e.preventDefault();
        if ((!newPost.trim() && !imageFile) || posting) return;
        setPosting(true);
        try {
            let imageUrl = "";
            let imageUrls = [];
            if (imageFile) {
                setUploadingImg(true);
                imageUrl = await uploadToCloudinary(imageFile);
                imageUrls = [imageUrl];
                setUploadingImg(false);
            }
            const body = {
                text: newPost.trim(),
                imageUrl,
                imageUrls,
                communityId: id,
            };
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
                setImageFile(null);
                setImagePreview(null);
                load();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setPosting(false);
            setUploadingImg(false);
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
    const isOwner = myMember?.role === "owner";
    const isAdmin = myMember && ["owner", "admin"].includes(myMember.role);
    const isMod = myMember && ["owner", "admin", "moderator"].includes(myMember.role);

    const tabs = ["feed", "voice", "rules", "members"];
    if (isAdmin) tabs.push("settings");

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            {/* Banner */}
            <div className="h-32 rounded-xl overflow-hidden mb-4 bg-gray-100 dark:bg-gray-800">
                {community.bannerUrl ? (
                    <img src={community.bannerUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${community.color || "#3b82f6"}, ${community.color || "#3b82f6"}88)` }} />
                )}
            </div>

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
            <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto">
                {tabs.map((t) => (
                    <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors capitalize whitespace-nowrap ${tab === t ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                        {t}
                    </button>
                ))}
            </div>

            {/* Feed tab */}
            {tab === "feed" && (
                <div>
                    {isMember && (
                        <form onSubmit={submitPost} className="mb-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3">
                            <textarea
                                value={newPost}
                                onChange={(e) => setNewPost(e.target.value)}
                                placeholder="What's on your mind?"
                                rows={3}
                                className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none outline-none"
                            />
                            {imagePreview && (
                                <div className="relative mt-2 mb-2">
                                    <img src={imagePreview} alt="" className="rounded-lg max-h-40 object-cover" />
                                    <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white text-xs hover:bg-black/80">
                                        ✕
                                    </button>
                                </div>
                            )}
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
                            <div className="flex items-center justify-between mt-1">
                                <div className="flex items-center gap-1">
                                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                                    <button type="button" onClick={() => fileRef.current?.click()} className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Add image">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                                        </svg>
                                    </button>
                                </div>
                                <button type="submit" disabled={(!newPost.trim() && !imageFile) || posting || uploadingImg} className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                    {uploadingImg ? "Uploading..." : posting ? "Posting..." : "Post"}
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="flex gap-1 mb-3">
                        {SORT_OPTIONS.map((opt) => (
                            <button key={opt.value} onClick={() => setSort(opt.value)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${sort === opt.value ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                                {opt.label}
                            </button>
                        ))}
                    </div>

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
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => openVoiceChat()}
                                                className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shrink-0"
                                            >
                                                Join
                                            </button>
                                            {isAdmin && (
                                                <button
                                                    onClick={async () => {
                                                        await fetch(`/api/communities/${id}/voice-channels/${ch.id}`, { method: "DELETE", credentials: "include" });
                                                        load();
                                                    }}
                                                    className="px-2 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
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
                <MembersTab members={members} community={community} user={user} isOwner={isOwner} isAdmin={isAdmin} onRefresh={load} />
            )}

            {/* Settings tab (owner/admin only) */}
            {tab === "settings" && isAdmin && (
                <SettingsTab community={community} user={user} isOwner={isOwner} onRefresh={load} uploadToCloudinary={uploadToCloudinary} />
            )}

            {showInvite && <InviteModal community={community} onClose={() => setShowInvite(false)} />}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Members Tab — role management                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

function MembersTab({ members, community, user, isOwner, isAdmin, onRefresh }) {
    const [editingRole, setEditingRole] = useState(null);

    const changeRole = async (username, newRole) => {
        const res = await fetch(`/api/communities/${community._id}/members/${username}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ role: newRole }),
        });
        if (res.ok) {
            setEditingRole(null);
            onRefresh();
        }
    };

    const removeMember = async (username) => {
        if (!confirm(`Remove ${username} from this community?`)) return;
        const res = await fetch(`/api/communities/${community._id}/members/${username}`, {
            method: "DELETE",
            credentials: "include",
        });
        if (res.ok) onRefresh();
    };

    return (
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

                                {editingRole === m.username ? (
                                    <div className="flex items-center gap-1">
                                        {ROLE_OPTIONS.filter((r) => isOwner || r !== "owner").map((r) => (
                                            <button key={r} onClick={() => changeRole(m.username, r)}
                                                className={`px-2 py-1 text-[10px] font-medium rounded-lg transition-colors ${m.role === r ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
                                                {ROLE_BADGES[r] || "Member"}
                                            </button>
                                        ))}
                                        <button onClick={() => setEditingRole(null)} className="px-1.5 py-1 text-[10px] text-gray-400 hover:text-gray-600">✕</button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5">
                                        {ROLE_BADGES[m.role] && (
                                            <span className={`text-[10px] font-medium ${ROLE_COLORS[m.role] || "text-gray-400"}`}>
                                                {ROLE_BADGES[m.role]}
                                            </span>
                                        )}
                                        {isAdmin && m.username !== user?.username && m.role !== "owner" && (
                                            <>
                                                <button onClick={() => setEditingRole(m.username)} className="text-[10px] text-gray-400 hover:text-blue-500 px-1" title="Change role">
                                                    ✎
                                                </button>
                                                <button onClick={() => removeMember(m.username)} className="text-[10px] text-gray-400 hover:text-red-500 px-1" title="Remove">
                                                    ✕
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Settings Tab — owner/admin settings                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SettingsTab({ community, user, isOwner, onRefresh, uploadToCloudinary }) {
    const router = useRouter();
    const [name, setName] = useState(community.name || "");
    const [description, setDescription] = useState(community.description || "");
    const [color, setColor] = useState(community.color || "#3b82f6");
    const [isPublic, setIsPublic] = useState(community.settings?.isPublic !== false);
    const [whoCanPost, setWhoCanPost] = useState(community.settings?.whoCanPost || "all");
    const [whoCanInvite, setWhoCanInvite] = useState(community.settings?.whoCanInvite || "all");
    const [requirePostFlair, setRequirePostFlair] = useState(community.settings?.requirePostFlair || false);
    const [rules, setRules] = useState(community.rules || []);
    const [flairs, setFlairs] = useState(community.flairs || []);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [uploadingBanner, setUploadingBanner] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const bannerRef = useRef(null);
    const logoRef = useRef(null);

    const uploadBanner = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingBanner(true);
        try {
            const url = await uploadToCloudinary(file);
            await fetch(`/api/communities/${community._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ bannerUrl: url }),
            });
            onRefresh();
        } catch (e) {
            console.error(e);
        } finally {
            setUploadingBanner(false);
        }
    };

    const uploadLogo = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingLogo(true);
        try {
            const url = await uploadToCloudinary(file);
            await fetch(`/api/communities/${community._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ avatarUrl: url }),
            });
            onRefresh();
        } catch (e) {
            console.error(e);
        } finally {
            setUploadingLogo(false);
        }
    };

    const saveAll = async () => {
        setSaving(true);
        try {
            await fetch(`/api/communities/${community._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim(),
                    color,
                    rules,
                    flairs,
                    settings: { whoCanPost, whoCanInvite, isPublic, requirePostFlair },
                }),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            onRefresh();
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const addRule = () => setRules([...rules, { title: "", description: "" }]);
    const updateRule = (i, field, val) => setRules(rules.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
    const removeRule = (i) => setRules(rules.filter((_, idx) => idx !== i));

    const addFlair = () => setFlairs([...flairs, { id: `flair-${Date.now()}`, name: "", color: "#3b82f6", emoji: "" }]);
    const updateFlair = (i, field, val) => setFlairs(flairs.map((f, idx) => idx === i ? { ...f, [field]: val } : f));
    const removeFlair = (i) => setFlairs(flairs.filter((_, idx) => idx !== i));

    return (
        <div className="space-y-4">
            {/* Banner preview & upload */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                <div className="h-24 bg-gray-100 dark:bg-gray-800 relative">
                    {community.bannerUrl ? (
                        <img src={community.bannerUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${color}, ${color}88)` }} />
                    )}
                    <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={uploadBanner} />
                    <button onClick={() => bannerRef.current?.click()} disabled={uploadingBanner}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity text-white text-xs font-medium">
                        {uploadingBanner ? "Uploading..." : "Change Banner"}
                    </button>
                </div>
                <div className="p-4 flex items-center gap-3">
                    <div className="relative -mt-8">
                        <div className="w-16 h-16 rounded-full border-4 border-white dark:border-gray-900 flex items-center justify-center text-white font-bold text-xl overflow-hidden" style={{ backgroundColor: color }}>
                            {community.avatarUrl ? (
                                <img src={community.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                community.name?.[0]?.toUpperCase()
                            )}
                        </div>
                        <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
                        <button onClick={() => logoRef.current?.click()} disabled={uploadingLogo}
                            className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs hover:bg-blue-700 transition-colors">
                            {uploadingLogo ? "..." : "📷"}
                        </button>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Community Logo</p>
                        <p className="text-[11px] text-gray-400">Click camera icon to upload</p>
                    </div>
                </div>
            </div>

            {/* Basic info */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Basic Info</h3>
                <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={100}
                        className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Description</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3}
                        className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Color</label>
                    <div className="flex items-center gap-2">
                        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded-lg border-0 cursor-pointer" />
                        <input type="text" value={color} onChange={(e) => setColor(e.target.value)}
                            className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 font-mono outline-none" />
                    </div>
                </div>
            </div>

            {/* Settings */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Settings</h3>
                <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Public community</span>
                    <div className="relative">
                        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="sr-only peer" />
                        <div className="w-10 h-5 bg-gray-300 dark:bg-gray-700 rounded-full peer peer-checked:bg-blue-600 transition-colors" />
                        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full peer-checked:translate-x-5 transition-transform" />
                    </div>
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Require flair on posts</span>
                    <div className="relative">
                        <input type="checkbox" checked={requirePostFlair} onChange={(e) => setRequirePostFlair(e.target.checked)} className="sr-only peer" />
                        <div className="w-10 h-5 bg-gray-300 dark:bg-gray-700 rounded-full peer peer-checked:bg-blue-600 transition-colors" />
                        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full peer-checked:translate-x-5 transition-transform" />
                    </div>
                </label>
                <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Who can post</label>
                    <select value={whoCanPost} onChange={(e) => setWhoCanPost(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none">
                        <option value="all">All members</option>
                        <option value="admin">Admins only</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Who can invite</label>
                    <select value={whoCanInvite} onChange={(e) => setWhoCanInvite(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none">
                        <option value="all">All members</option>
                        <option value="admin">Admins only</option>
                    </select>
                </div>
            </div>

            {/* Rules */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Rules</h3>
                    <button onClick={addRule} className="text-xs font-medium text-blue-500 hover:text-blue-600">+ Add Rule</button>
                </div>
                {rules.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No rules yet</p>}
                {rules.map((rule, i) => (
                    <div key={i} className="flex gap-2 items-start">
                        <span className="text-xs text-gray-400 mt-2.5 shrink-0">{i + 1}.</span>
                        <div className="flex-1 space-y-1.5">
                            <input type="text" value={rule.title} onChange={(e) => updateRule(i, "title", e.target.value)} placeholder="Rule title"
                                className="w-full px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none" />
                            <input type="text" value={rule.description} onChange={(e) => updateRule(i, "description", e.target.value)} placeholder="Description (optional)"
                                className="w-full px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs text-gray-900 dark:text-gray-100 outline-none" />
                        </div>
                        <button onClick={() => removeRule(i)} className="text-gray-400 hover:text-red-500 mt-2 text-sm">✕</button>
                    </div>
                ))}
            </div>

            {/* Flairs */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Flairs</h3>
                    <button onClick={addFlair} className="text-xs font-medium text-blue-500 hover:text-blue-600">+ Add Flair</button>
                </div>
                {flairs.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No flairs yet</p>}
                {flairs.map((flair, i) => (
                    <div key={i} className="flex gap-2 items-center">
                        <input type="color" value={flair.color} onChange={(e) => updateFlair(i, "color", e.target.value)} className="w-8 h-8 rounded border-0 cursor-pointer shrink-0" />
                        <input type="text" value={flair.emoji} onChange={(e) => updateFlair(i, "emoji", e.target.value)} placeholder="😀" maxLength={4}
                            className="w-12 px-2 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-center outline-none" />
                        <input type="text" value={flair.name} onChange={(e) => updateFlair(i, "name", e.target.value)} placeholder="Flair name"
                            className="flex-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none" />
                        <button onClick={() => removeFlair(i)} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
                    </div>
                ))}
            </div>

            {/* Save */}
            <button onClick={saveAll} disabled={saving}
                className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-colors ${saved ? "bg-green-500 text-white" : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"}`}>
                {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
            </button>

            {/* Danger zone (owner only) */}
            {isOwner && (
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-red-600 dark:text-red-400 mb-2">Danger Zone</h3>
                    <p className="text-xs text-red-500/70 dark:text-red-400/70 mb-3">These actions cannot be undone.</p>
                    <button onClick={async () => {
                        if (!confirm("Delete this community permanently?")) return;
                        const res = await fetch(`/api/communities/${community._id}`, { method: "DELETE", credentials: "include" });
                        if (res.ok) router.push("/communities");
                    }} className="px-4 py-2 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                        Delete Community
                    </button>
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

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
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Channel name" autoFocus
                className="flex-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none" />
            <button type="submit" disabled={loading || !name.trim()} className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
                {loading ? "..." : "Create"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-2 py-1.5 text-gray-400 hover:text-gray-600 text-xs">
                Cancel
            </button>
        </form>
    );
}
