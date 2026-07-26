"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { useVoiceChat } from "@/context/VoiceChatContext";
import Link from "next/link";
import InviteModal from "./InviteModal";
import CreateChannelModal from "./CreateChannelModal";

const ROLE_BADGES = { owner: "Owner", admin: "Admin", moderator: "Mod", member: "" };
const ROLE_COLORS = { owner: "text-yellow-500", admin: "text-blue-500", moderator: "text-green-500" };

export default function CommunityDetailClient() {
    const { id } = useParams();
    const router = useRouter();
    const { user } = useUser();
    const { openVoiceChat } = useVoiceChat();
    const [community, setCommunity] = useState(null);
    const [members, setMembers] = useState([]);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("channels");
    const [showInvite, setShowInvite] = useState(false);
    const [showCreateChannel, setShowCreateChannel] = useState(false);
    const [selectedChannel, setSelectedChannel] = useState(null);

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
                const pRes = await fetch(`/api/communities/${id}/posts`, { credentials: "include" });
                const p = await pRes.json();
                setPosts(Array.isArray(p) ? p : []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const join = async () => {
        const res = await fetch(`/api/communities/${id}/join`, { method: "POST", credentials: "include" });
        if (res.ok) load();
    };

    const leave = async () => {
        const res = await fetch(`/api/communities/${id}/leave`, { method: "POST", credentials: "include" });
        if (res.ok) router.push("/communities");
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
    const textChannels = (community.channels || []).filter((c) => c.type === "text" || c.type === "announcement");
    const voiceChannels = (community.channels || []).filter((c) => c.type === "voice");

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="rounded-xl overflow-hidden mb-4">
                <div className="h-24" style={{ backgroundColor: community.color || "#3b82f6" }} />
                <div className="bg-white dark:bg-gray-900 p-4 -mt-8 relative">
                    <div className="flex items-end gap-3">
                        <div className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-xl shrink-0 border-4 border-white dark:border-gray-900 overflow-hidden" style={{ backgroundColor: community.color || "#3b82f6" }}>
                            {community.avatarUrl ? (
                                <img src={community.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                community.name?.[0]?.toUpperCase()
                            )}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                            <h1 className="font-bold text-lg text-gray-900 dark:text-gray-100 truncate">{community.name}</h1>
                            <p className="text-xs text-gray-500">{community.memberCount} member{community.memberCount !== 1 ? "s" : ""} · {community.channels?.length || 0} channels</p>
                        </div>
                    </div>
                    {community.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">{community.description}</p>
                    )}
                    <div className="flex gap-2 mt-3">
                        {isMember ? (
                            <>
                                {isAdmin && (
                                    <button onClick={() => setShowInvite(true)} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                                        Invite
                                    </button>
                                )}
                                <button onClick={leave} className="px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                                    Leave
                                </button>
                            </>
                        ) : (
                            <button onClick={join} className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                                Join Community
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                {["channels", "members", "posts"].map((t) => (
                    <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors capitalize ${tab === t ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                        {t}
                    </button>
                ))}
            </div>

            {/* Channels */}
            {tab === "channels" && (
                <div className="space-y-3">
                    {isAdmin && (
                        <button onClick={() => setShowCreateChannel(true)} className="w-full py-2 text-sm font-medium text-blue-600 bg-blue-50 dark:bg-blue-500/10 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors">
                            + Create Channel
                        </button>
                    )}

                    {textChannels.length > 0 && (
                        <div>
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1 mb-1">Text Channels</p>
                            <div className="space-y-1">
                                {textChannels.map((ch) => (
                                    <Link
                                        key={ch.id}
                                        href={isMember ? `/communities/${id}/channels/${ch.id}` : "#"}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${isMember ? "hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer" : "opacity-60 cursor-default"}`}
                                    >
                                        <span className="text-gray-400">#</span>
                                        <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{ch.name}</span>
                                        {ch.type === "announcement" && <span className="text-[10px] bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded-full font-medium">Announce</span>}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {voiceChannels.length > 0 && (
                        <div>
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1 mb-1">Voice Channels</p>
                            <div className="space-y-1">
                                {voiceChannels.map((ch) => {
                                    const channelKey = `community-${id}-${ch.id}`;
                                    return (
                                        <button
                                            key={ch.id}
                                            onClick={() => openVoiceChat()}
                                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-purple-400">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                                            </svg>
                                            <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{ch.name}</span>
                                            <span className="ml-auto text-[10px] text-gray-400">Voice</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {textChannels.length === 0 && voiceChannels.length === 0 && (
                        <p className="text-center text-gray-400 text-sm py-6">No channels yet</p>
                    )}
                </div>
            )}

            {/* Members */}
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

            {/* Posts */}
            {tab === "posts" && (
                <div className="space-y-3">
                    {!isMember ? (
                        <p className="text-center text-gray-400 text-sm py-6">Join to see posts</p>
                    ) : posts.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-6">No posts yet. Be the first!</p>
                    ) : (
                        posts.map((p) => (
                            <div key={p._id} className="p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                                <div className="flex items-center gap-2 mb-2">
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

            {showInvite && <InviteModal community={community} onClose={() => setShowInvite(false)} />}
            {showCreateChannel && <CreateChannelModal communityId={id} onClose={() => { setShowCreateChannel(false); load(); }} />}
        </div>
    );
}
