"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";
import UserBadges from "@/components/shared/UserBadges";
import { useSidebar } from "@/context/SidebarContext";
import Link from "next/link";
import { useRouter } from "next/navigation";

const EMOJI_PRESETS = ["⭐","🛡️","👑","💎","🔥","🎯","🏆","🎨","🧪","🤖","💡","🌟"];

export default function AdminClient() {
    const { user: me, ready } = useUser();
    const router = useRouter();
    const [tab, setTab] = useState("users");
    const { openSidebar } = useSidebar();

    if (!ready || !me) {
        return <div className="flex h-dvh items-center justify-center bg-white dark:bg-gray-950">
            <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
        </div>;
    }

    if (!me.isAdmin) {
        return <div className="flex h-dvh items-center justify-center bg-white dark:bg-gray-950">
            <p className="text-gray-500 dark:text-gray-400 text-sm">Access denied.</p>
        </div>;
    }

    return (
        <div className="min-h-dvh bg-gray-50 dark:bg-gray-950">
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-5xl mx-auto px-4 h-12 sm:h-14 flex items-center gap-3">
                    <Link href="/" className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </Link>
                    <span className="font-bold text-base text-gray-900 dark:text-gray-100 flex-1">Admin Dashboard</span>
                    <button
                        onClick={openSidebar}
                        aria-label="Open menu"
                        className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                    </button>
                </div>
            </header>

            <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6">
                <div className="flex gap-1 mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-1 w-fit overflow-x-auto max-w-full">
                    <button onClick={() => setTab("users")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "users" ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                        Users
                    </button>
                    <button onClick={() => setTab("roles")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "roles" ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                        Roles
                    </button>
                    <button onClick={() => setTab("analytics")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "analytics" ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                        Analytics
                    </button>
                    <button onClick={() => setTab("voice")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "voice" ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                        Voice Chat
                    </button>
                    <button onClick={() => setTab("ads")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "ads" ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                        Ads
                    </button>
                    <button onClick={() => setTab("logs")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "logs" ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                        Logs
                    </button>
                    <button onClick={() => setTab("adult")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "adult" ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                        18+ Manga
                    </button>
                </div>

                {tab === "users" && <UsersPanel />}
                {tab === "roles" && <RolesPanel />}
                {tab === "analytics" && <AnalyticsPanel />}
                {tab === "voice" && <VoicePanel />}
                {tab === "ads" && <AdsPanel />}
                {tab === "logs" && <LogsPanel />}
                {tab === "adult" && <AdultMangaPanel />}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Voice Chat Panel                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

function VoicePanel() {
    const { showToast } = useToast();
    const [bans, setBans] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchBans = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/users");
            if (res.ok) {
                const users = await res.json();
                setBans(users.filter((u) => u.voiceChatBanned));
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchBans(); }, [fetchBans]);

    const unbanUser = async (userId, username) => {
        setBans((prev) => prev.filter((u) => u.id !== userId));
        try {
            await fetch("/api/admin/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, voiceChatBanned: false, voiceChatBannedUntil: null, voiceChatBannedReason: "" }),
            });
            showToast(`Unbanned ${username} from voice chat`, "success");
        } catch (e) {
            showToast("Failed to unban user", "error");
            fetchBans();
        }
    };

    const banUser = async (userId, username) => {
        try {
            await fetch("/api/admin/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, voiceChatBanned: true, voiceChatBannedUntil: null, voiceChatBannedReason: "Banned by admin" }),
            });
            showToast(`Banned ${username} from voice chat`, "success");
            fetchBans();
        } catch (e) {
            showToast("Failed to ban user", "error");
        }
    };

    return (
        <div className="space-y-6">
            {/* Banned Users */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Banned from Voice Chat</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Users who are banned or timed out from using voice channels</p>
                </div>

                {loading ? (
                    <div className="flex justify-center py-10">
                        <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                    </div>
                ) : bans.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-600">
                        No users are currently banned from voice chat.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {bans.map((u) => (
                            <div key={u.id} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                {u.avatarUrl ? (
                                    <img src={u.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                                        style={{ backgroundColor: u.avatarColor || "#3b82f6" }}>
                                        {u.username?.[0]?.toUpperCase()}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{u.username}</p>
                                        {u.voiceChatBannedUntil && (
                                            <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-[10px] font-medium rounded-full">Timeout</span>
                                        )}
                                        {!u.voiceChatBannedUntil && (
                                            <span className="px-1.5 py-0.5 bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-medium rounded-full">Banned</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {u.voiceChatBannedReason || "No reason"}
                                        {u.voiceChatBannedUntil && ` · Until ${new Date(u.voiceChatBannedUntil).toLocaleString()}`}
                                    </p>
                                </div>
                                <button
                                    onClick={() => unbanUser(u.id, u.username)}
                                    className="px-3 py-1.5 bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 text-xs font-medium rounded-lg transition-colors shrink-0"
                                >
                                    Unban
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Quick Ban by Username */}
            <QuickBanSection onBan={banUser} />
        </div>
    );
}

function QuickBanSection({ onBan }) {
    const { showToast } = useToast();
    const [username, setUsername] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    const searchUsers = async (q) => {
        if (!q.trim()) { setSearchResults([]); return; }
        setSearching(true);
        try {
            const res = await fetch(`/api/admin/users`);
            if (res.ok) {
                const users = await res.json();
                setSearchResults(users.filter((u) => u.username?.toLowerCase().includes(q.toLowerCase())).slice(0, 5));
            }
        } catch {}
        setSearching(false);
    };

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-3">Ban User from Voice Chat</h3>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); searchUsers(e.target.value); }}
                    placeholder="Search username..."
                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-gray-100"
                />
            </div>
            {searchResults.length > 0 && (
                <div className="mt-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {searchResults.map((u) => (
                        <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                    style={{ backgroundColor: u.avatarColor || "#3b82f6" }}>
                                    {u.username?.[0]?.toUpperCase()}
                                </div>
                            )}
                            <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{u.username}</span>
                            <button
                                onClick={() => { onBan(u.id, u.username); setUsername(""); setSearchResults([]); }}
                                className="px-3 py-1 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 text-xs font-medium rounded-lg transition-colors"
                            >
                                Ban
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Users Panel                                                               */
/* ═══════════════════════════════════════════════════════════════════════════ */

function UsersPanel() {
    const { showToast } = useToast();
    const [users, setUsers]       = useState([]);
    const [roles, setRoles]       = useState([]);
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState("");
    const [editing, setEditing]   = useState(null);
    const [saving, setSaving]     = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [createEmail, setCreateEmail] = useState("");
    const [createPin, setCreatePin]     = useState("");
    const [createUser, setCreateUser]   = useState("");
    const [creating, setCreating]       = useState(false);

    useEffect(() => {
        if (!editing) return;
        const close = (e) => setEditing(null);
        document.addEventListener("click", close);
        return () => document.removeEventListener("click", close);
    }, [editing]);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [uRes, rRes] = await Promise.all([
                fetch("/api/admin/users"),
                fetch("/api/admin/roles"),
            ]);
            if (uRes.ok) setUsers(await uRes.json());
            if (rRes.ok) setRoles(await rRes.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const filtered = users.filter((u) => {
        const q = search.toLowerCase();
        return !q || u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    });

    const toggleField = async (userId, field, value) => {
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, [field]: value } : u));
        try {
            await fetch("/api/admin/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, [field]: value }),
            });
            const label = field === "isVerified" ? "Verified" : "Admin";
            showToast(`${label} ${value ? "granted" : "revoked"}`, "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to update user", "error");
            refresh();
        }
    };

    const handleRole = async (userId, roleId, add) => {
        setUsers((prev) => prev.map((u) => {
            if (u.id !== userId) return u;
            return { ...u, roles: add
                ? [...u.roles, roles.find((r) => r.id === roleId)].filter(Boolean)
                : u.roles.filter((r) => r.id !== roleId) };
        }));
        try {
            await fetch("/api/admin/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, [add ? "addRole" : "removeRole"]: roleId }),
            });
            const roleName = roles.find((r) => r.id === roleId)?.name || "role";
            showToast(`${add ? "Assigned" : "Removed"} ${roleName}`, "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to update role", "error");
            refresh();
        }
    };

    const toggleLive = async (userId, value) => {
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, liveStreamAllowed: value } : u));
        try {
            await fetch("/api/admin/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, liveStreamAllowed: value }),
            });
            showToast(`Live access ${value ? "granted" : "revoked"}`, "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to update user", "error");
            refresh();
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!createEmail.trim() || !createPin.trim() || !createUser.trim() || creating) return;
        setCreating(true);
        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: createEmail.trim(), pin: createPin.trim(), username: createUser.trim() }),
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.error, "error"); return; }
            showToast(`User ${data.user.email} created`, "success");
            setCreateEmail(""); setCreatePin(""); setCreateUser("");
            setShowCreate(false);
            refresh();
        } catch (e) {
            console.error(e);
            showToast("Failed to create user", "error");
        } finally { setCreating(false); }
    };

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search users\u2026"
                    className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-black dark:focus:border-gray-500 transition-colors" />
                <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{filtered.length} user{filtered.length !== 1 && "s"}</span>
                <button onClick={() => setShowCreate(!showCreate)}
                    className="shrink-0 px-3 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors">
                    {showCreate ? "Cancel" : "+ Create"}
                </button>
            </div>

            {showCreate && (
                <form onSubmit={handleCreateUser} className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex flex-col gap-3">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Create user with PIN</p>
                    <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                        <input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)}
                            placeholder="Email" required autoFocus
                            className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-black dark:focus:border-gray-500" />
                        <input type="text" value={createUser} onChange={(e) => setCreateUser(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30))}
                            placeholder="Username" required
                            className="w-40 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-black dark:focus:border-gray-500" />
                        <input type="text" value={createPin} onChange={(e) => setCreatePin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                            placeholder="PIN (4-8 digits)" required
                            className="w-36 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-black dark:focus:border-gray-500" />
                        <button type="submit" disabled={creating || !createEmail.trim() || !createPin.trim() || !createUser.trim()}
                            className="shrink-0 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                            {creating ? "Creating\u2026" : "Create"}
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                </div>
            ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filtered.map((u) => (
                        <div key={u.id} className="relative px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt={u.username} className="w-10 h-10 rounded-full object-cover shrink-0" />
                            ) : (
                                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                                    style={{ backgroundColor: u.avatarColor }}>
                                    {u.username?.[0]?.toUpperCase() ?? "?"}
                                </div>
                            )}

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{u.username || "(no username)"}</span>
                                    <UserBadges isVerified={u.isVerified} isAdmin={u.isAdmin} roles={u.roles} />
                                    {u.hasPin && <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">PIN</span>}
                                </div>
                                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{u.email}</p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                                <button onClick={() => toggleField(u.id, "isVerified", !u.isVerified)}
                                    title={u.isVerified ? "Remove verified" : "Give verified"}
                                    className={`p-1.5 rounded-lg transition-colors ${u.isVerified ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0 1 12 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 0 1 3.498 1.307 4.491 4.491 0 0 1 1.307 3.497A4.49 4.49 0 0 1 21.75 12a4.49 4.49 0 0 1-1.549 3.397 4.491 4.491 0 0 1-1.307 3.497 4.491 4.491 0 0 1-3.497 1.307A4.49 4.49 0 0 1 12 21.75a4.49 4.49 0 0 1-3.397-1.549 4.49 4.49 0 0 1-3.498-1.306 4.491 4.491 0 0 1-1.307-3.498A4.49 4.49 0 0 1 2.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 0 1 1.307-3.497 4.49 4.49 0 0 1 3.497-1.307Zm7.007 6.387a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                                    </svg>
                                </button>

                                <button onClick={() => toggleField(u.id, "isAdmin", !u.isAdmin)}
                                    title={u.isAdmin ? "Remove admin" : "Make admin"}
                                    className={`p-1.5 rounded-lg transition-colors ${u.isAdmin ? "text-amber-500 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                                    </svg>
                                </button>

                                <button onClick={() => toggleLive(u.id, !u.liveStreamAllowed)}
                                    title={u.liveStreamAllowed ? "Revoke live access" : "Grant live access"}
                                    className={`p-1.5 rounded-lg transition-colors ${u.liveStreamAllowed ? "text-rose-500 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                        <circle cx="12" cy="12" r="5" fill={u.liveStreamAllowed ? "currentColor" : "none"} />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                                    </svg>
                                </button>

                                <button onClick={() => setEditing(editing === u.id ? null : u.id)}
                                    title="Manage roles"
                                    className={`p-1.5 rounded-lg transition-colors ${editing === u.id ? "text-purple-500 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                    </svg>
                                </button>
                            </div>

                            {editing === u.id && (
                                <div onClick={(e) => e.stopPropagation()} className="absolute right-4 top-full z-30 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 w-56 max-w-[calc(100vw-2rem)]">
                                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Assign roles</p>
                                    {roles.length === 0 ? (
                                        <p className="text-xs text-gray-400 dark:text-gray-500">No roles created yet.</p>
                                    ) : (
                                        <div className="flex flex-col gap-1">
                                            {roles.map((r) => {
                                                const has = u.roles.some((ur) => ur.id === r.id);
                                                return (
                                                    <button key={r.id} onClick={() => handleRole(u.id, r.id, !has)}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${has ? "bg-gray-100 dark:bg-gray-800 font-semibold" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"}`}>
                                                        <span className="text-base">{r.badge}</span>
                                                        <span className="flex-1 text-left">{r.name}</span>
                                                        {has && <span className="text-xs text-green-500">✓</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Roles Panel                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

function RolesPanel() {
    const { showToast } = useToast();
    const [roles, setRoles]         = useState([]);
    const [loading, setLoading]     = useState(true);
    const [creating, setCreating]   = useState(false);
    const [name, setName]           = useState("");
    const [badge, setBadge]         = useState("⭐");
    const [color, setColor]         = useState("#6b7280");
    const [error, setError]         = useState("");

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/roles");
            if (res.ok) setRoles(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!name.trim() || creating) return;
        setCreating(true);
        setError("");
        try {
            const res = await fetch("/api/admin/roles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), badge, color }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            setRoles((prev) => [data, ...prev]);
            setName("");
            setBadge("⭐");
            setColor("#6b7280");
            showToast("Role created", "success");
        } catch {
            setError("Failed to create role.");
            showToast("Failed to create role", "error");
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("Delete this role? It will be removed from all users.")) return;
        try {
            await fetch("/api/admin/roles", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            setRoles((prev) => prev.filter((r) => r.id !== id));
            showToast("Role deleted", "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to delete role", "error");
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                <h2 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-4">Create new role</h2>
                <form onSubmit={handleCreate} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Badge icon</label>
                        <div className="flex gap-1.5 flex-wrap">
                            {EMOJI_PRESETS.map((e) => (
                                <button key={e} type="button" onClick={() => setBadge(e)}
                                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${badge === e ? "bg-black dark:bg-gray-100 text-white dark:text-gray-900 scale-110" : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
                                    {e}
                                </button>
                            ))}
                            <input value={badge} onChange={(e) => setBadge(e.target.value.slice(0, 2))}
                                placeholder="?" maxLength={2}
                                className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center text-lg outline-none focus:border-black dark:focus:border-gray-500 transition-colors" />
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Name</label>
                            <input value={name} onChange={(e) => { setName(e.target.value); setError(""); }}
                                placeholder="e.g. Moderator"
                                className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-black dark:focus:border-gray-500 transition-colors" />
                        </div>

                        <div className="w-28">
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Color</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                                    className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer p-0.5" />
                                <input value={color} onChange={(e) => setColor(e.target.value)}
                                    className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-2 text-xs font-mono outline-none focus:border-black dark:focus:border-gray-500 transition-colors" />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 dark:text-gray-500">Preview:</span>
                        <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-white text-xs font-bold select-none"
                            style={{ backgroundColor: color }}>
                            {badge} {name || "Role"}
                        </span>
                    </div>

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <button type="submit" disabled={!name.trim() || creating}
                        className="bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold py-2.5 rounded-xl text-sm disabled:opacity-40 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors w-fit">
                        {creating ? "Creating\u2026" : "Create role"}
                    </button>
                </form>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Existing roles</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{roles.length}</span>
                </div>

                {loading ? (
                    <div className="flex justify-center py-8">
                        <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                    </div>
                ) : roles.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No roles yet. Create one above.</div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {roles.map((r) => (
                            <div key={r.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                <span className="w-9 h-9 rounded-lg flex items-center justify-center text-lg text-white font-bold"
                                    style={{ backgroundColor: r.color }}>
                                    {r.badge}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{r.name}</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{r.color}</p>
                                </div>
                                <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-white text-xs font-bold"
                                    style={{ backgroundColor: r.color }}>
                                    {r.badge} {r.name}
                                </span>
                                <button onClick={() => handleDelete(r.id)}
                                    title="Delete role"
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Analytics Panel                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

function StatCard({ label, value, icon }) {
    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400">
                    {icon}
                </div>
                <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                </div>
            </div>
        </div>
    );
}

function MiniChart({ data, color = "#3b82f6" }) {
    const values = Object.values(data);
    const max = Math.max(...values, 1);
    
    return (
        <div className="flex items-end gap-1 h-16">
            {values.slice(-7).map((v, i) => (
                <div
                    key={i}
                    className="flex-1 rounded-t transition-all"
                    style={{
                        height: `${(v / max) * 100}%`,
                        backgroundColor: color,
                        opacity: 0.2 + (i / values.length) * 0.8,
                    }}
                />
            ))}
        </div>
    );
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function AnalyticsPanel() {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const res = await fetch("/api/admin/analytics");
                if (res.ok) setAnalytics(await res.json());
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        fetchAnalytics();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    if (!analytics) {
        return <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">Failed to load analytics</p>;
    }

    const { stats, charts, topPosters, topLikers, topHashtags, topPosts } = analytics;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                <StatCard label="Users" value={stats.totalUsers}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>} />
                <StatCard label="Posts" value={stats.totalPosts}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" /></svg>} />
                <StatCard label="Likes" value={stats.totalLikes}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>} />
                <StatCard label="Comments" value={stats.totalComments}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" /></svg>} />
                <StatCard label="Views" value={stats.totalViews}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-4">Posts (Last 7 Days)</h3>
                    <MiniChart data={charts.postsByDay} color="#3b82f6" />
                    <div className="flex justify-between mt-2">
                        {Object.keys(charts.postsByDay).slice(-7).map((date) => (
                            <span key={date} className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(date)}</span>
                        ))}
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-4">New Users (Last 7 Days)</h3>
                    <MiniChart data={charts.usersByDay} color="#10b981" />
                    <div className="flex justify-between mt-2">
                        {Object.keys(charts.usersByDay).slice(-7).map((date) => (
                            <span key={date} className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(date)}</span>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-4">Top Posters</h3>
                    {topPosters.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No data</p>
                    ) : (
                        <div className="space-y-2">
                            {topPosters.map((item, i) => (
                                <div key={item.username} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5">{i + 1}</span>
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.username}</span>
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">{item.count} posts</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-4">Top Likers</h3>
                    {topLikers.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No data</p>
                    ) : (
                        <div className="space-y-2">
                            {topLikers.map((item, i) => (
                                <div key={item.username} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5">{i + 1}</span>
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.username}</span>
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">{item.count} likes</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-4">Top Hashtags</h3>
                    {topHashtags.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No data</p>
                    ) : (
                        <div className="space-y-2">
                            {topHashtags.map((item) => (
                                <div key={item.tag} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <span className="text-sm font-medium text-blue-500 dark:text-blue-400">#{item.tag}</span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">{item.count} posts</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-4">Top Posts</h3>
                {topPosts.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No posts yet</p>
                ) : (
                    <div className="overflow-x-auto -mx-5 px-5">
                        <table className="w-full text-left min-w-[500px]">
                            <thead>
                                <tr className="border-b border-gray-100 dark:border-gray-800">
                                    <th className="pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                                    <th className="pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Post</th>
                                    <th className="pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Likes</th>
                                    <th className="pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Comments</th>
                                    <th className="pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Views</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                {topPosts.map((post) => (
                                    <tr key={post.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className="py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{post.sender}</td>
                                        <td className="py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">{post.text || "Image post"}</td>
                                        <td className="py-3 text-sm text-gray-600 dark:text-gray-400 text-right">{post.likes}</td>
                                        <td className="py-3 text-sm text-gray-600 dark:text-gray-400 text-right">{post.comments}</td>
                                        <td className="py-3 text-sm text-gray-600 dark:text-gray-400 text-right">{post.views}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Ads Panel                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

function AdsPanel() {
    const { showToast } = useToast();
    const [ads, setAds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingAd, setEditingAd] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);

    const emptyAd = {
        title: "", description: "", imageUrl: "", linkUrl: "", ctaText: "Learn More",
        adType: "custom", adsterraCode: "", adsenseSlot: "", startDate: "", endDate: "", isActive: true,
    };
    const [form, setForm] = useState(emptyAd);

    const fetchAds = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/ads");
            if (res.ok) setAds(await res.json());
        } catch {}
        setLoading(false);
    }, []);

    useEffect(() => { fetchAds(); }, [fetchAds]);

    const openCreate = () => { setForm(emptyAd); setEditingAd(null); setShowForm(true); };
    const openEdit = (ad) => {
        setForm({
            title: ad.title || "", description: ad.description || "", imageUrl: ad.imageUrl || "",
            linkUrl: ad.linkUrl || "", ctaText: ad.ctaText || "Learn More", adType: ad.adType || "custom",
            adsterraCode: ad.adsterraCode || "", adsenseSlot: ad.adsenseSlot || "",
            startDate: ad.startDate ? new Date(ad.startDate).toISOString().slice(0, 16) : "",
            endDate: ad.endDate ? new Date(ad.endDate).toISOString().slice(0, 16) : "",
            isActive: ad.isActive !== false,
        });
        setEditingAd(ad); setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.title.trim()) { showToast("Title is required", "error"); return; }
        setSaving(true);
        try {
            const body = { ...form };
            if (body.startDate) body.startDate = new Date(body.startDate).toISOString();
            if (body.endDate) body.endDate = new Date(body.endDate).toISOString();
            const url = editingAd ? `/api/admin/ads/${editingAd._id}` : "/api/admin/ads";
            const res = await fetch(url, {
                method: editingAd ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (res.ok) { showToast(editingAd ? "Ad updated" : "Ad created", "success"); setShowForm(false); fetchAds(); }
            else { const d = await res.json(); showToast(d.error || "Failed", "error"); }
        } catch { showToast("Network error", "error"); }
        setSaving(false);
    };

    const handleDelete = async (ad) => {
        if (!confirm(`Delete ad "${ad.title}"?`)) return;
        try {
            const res = await fetch(`/api/admin/ads/${ad._id}`, { method: "DELETE" });
            if (res.ok) { showToast("Ad deleted", "success"); fetchAds(); }
            else showToast("Failed to delete", "error");
        } catch { showToast("Network error", "error"); }
    };

    const toggleActive = async (ad) => {
        try {
            await fetch(`/api/admin/ads/${ad._id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !ad.isActive }),
            });
            fetchAds();
        } catch {}
    };

    const typeLabels = { custom: "Custom", adsense: "AdSense", adsterra: "Adsterra" };

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Ad Management</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Create and manage feed ads</p>
                    </div>
                    <button onClick={openCreate}
                        className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors">
                        + New Ad
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-10">
                        <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                    </div>
                ) : ads.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-600">No ads yet.</div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {ads.map((ad) => (
                            <div key={ad._id} className="px-4 sm:px-5 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                {ad.imageUrl ? (
                                    <img src={ad.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                                ) : (
                                    <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
                                        </svg>
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{ad.title}</p>
                                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${ad.isActive ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                                            {ad.isActive ? "Active" : "Paused"}
                                        </span>
                                        <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-[10px] font-medium rounded-full text-gray-500 dark:text-gray-400">
                                            {typeLabels[ad.adType] || "Custom"}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                        {ad.linkUrl || "No link"}{ad.impressions ? ` · ${ad.impressions} views` : ""}{ad.clicks ? ` · ${ad.clicks} clicks` : ""}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => toggleActive(ad)}
                                        className={`px-2 py-1 text-xs font-medium rounded-lg transition-colors ${ad.isActive ? "text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10" : "text-green-600 dark:text-green-400 hover:bg-green-500/10"}`}>
                                        {ad.isActive ? "Pause" : "Activate"}
                                    </button>
                                    <button onClick={() => openEdit(ad)}
                                        className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">Edit</button>
                                    <button onClick={() => handleDelete(ad)}
                                        className="px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
                    <div className="bg-white dark:bg-gray-950 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-950 z-10">
                            <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">{editingAd ? "Edit Ad" : "Create Ad"}</h3>
                            <button onClick={() => setShowForm(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Ad Type</label>
                                <div className="flex gap-2">
                                    {["custom", "adsense", "adsterra"].map((t) => (
                                        <button key={t} onClick={() => setForm({ ...form, adType: t })}
                                            className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${form.adType === t ? "bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                                            {typeLabels[t]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Title</label>
                                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors" placeholder="Ad title" maxLength={100} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Description</label>
                                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors resize-none" placeholder="Short description" rows={2} maxLength={300} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Image URL</label>
                                <input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors" placeholder="https://..." />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Link URL</label>
                                    <input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors" placeholder="https://..." />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">CTA Text</label>
                                    <input value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors" placeholder="Learn More" maxLength={30} />
                                </div>
                            </div>
                            {form.adType === "adsterra" && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Adsterra Code (HTML)</label>
                                    <textarea value={form.adsterraCode} onChange={(e) => setForm({ ...form, adsterraCode: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors resize-none font-mono" placeholder={"<script src=\"...\"></script>"} rows={4} />
                                </div>
                            )}
                            {form.adType === "adsense" && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">AdSense Slot ID</label>
                                    <input value={form.adsenseSlot} onChange={(e) => setForm({ ...form, adsenseSlot: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors" placeholder="1234567890" />
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Start Date</label>
                                    <input type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">End Date</label>
                                    <input type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors" />
                                </div>
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <div className={`w-10 h-5 rounded-full relative transition-colors ${form.isActive ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`}
                                    onClick={() => setForm({ ...form, isActive: !form.isActive })}>
                                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${form.isActive ? "translate-x-5" : "translate-x-0.5"}`} />
                                </div>
                                <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
                            </label>
                            {form.title && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Preview</label>
                                    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden bg-gray-50 dark:bg-gray-900/50">
                                        <div className="flex items-center gap-1.5 px-3 pt-2.5"><span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Sponsored</span></div>
                                        {form.imageUrl && <img src={form.imageUrl} alt="" className="w-full h-32 object-cover mt-2" />}
                                        <div className="p-3">
                                            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{form.title}</h4>
                                            {form.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{form.description}</p>}
                                            {form.linkUrl && <span className="inline-block mt-2 text-xs font-semibold text-blue-500">{form.ctaText || "Learn More"}</span>}
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
                                <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                                    {saving ? "Saving..." : editingAd ? "Update" : "Create"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Logs Panel                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

function LogsPanel() {
    const [source, setSource] = useState("next");
    const [logs, setLogs] = useState([]);
    const [levelFilter, setLevelFilter] = useState("");
    const [autoRefresh, setAutoRefresh] = useState(true);
    const logContainerRef = useRef(null);

    const fetchLogs = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (levelFilter) params.set("level", levelFilter);
            params.set("limit", "300");

            let res;
            if (source === "next") {
                res = await fetch(`/api/admin/logs?${params}`);
            } else if (source === "live") {
                const url = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;
                if (!url) return;
                res = await fetch(`${url}/api/logs?${params}`);
            } else {
                res = await fetch(`/api/admin/logs/client?${params}`);
            }

            const data = await res.json();
            if (Array.isArray(data)) setLogs(data);
        } catch {
            // silent
        }
    }, [source, levelFilter]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(fetchLogs, 3000);
        return () => clearInterval(id);
    }, [autoRefresh, fetchLogs]);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const levelColor = (l) => {
        if (l === "error") return "text-red-500";
        if (l === "warn") return "text-yellow-500";
        return "text-gray-600 dark:text-gray-400";
    };

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                    <button onClick={() => setSource("next")}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${source === "next" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
                        Vercel / Next.js
                    </button>
                    <button onClick={() => setSource("live")}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${source === "live" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
                        Live Server
                    </button>
                    <button onClick={() => setSource("client")}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${source === "client" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
                        Frontend
                    </button>
                </div>
                <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}
                    className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-700 dark:text-gray-300 outline-none">
                    <option value="">All Levels</option>
                    <option value="info">Info</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                </select>
                <label className="flex items-center gap-2 cursor-pointer ml-auto">
                    <div className={`w-9 h-5 rounded-full relative transition-colors ${autoRefresh ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`}
                        onClick={() => setAutoRefresh(!autoRefresh)}>
                        <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${autoRefresh ? "translate-x-4" : "translate-x-0.5"}`} />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Auto-refresh</span>
                </label>
                <button onClick={fetchLogs} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                    </svg>
                </button>
            </div>

            <div ref={logContainerRef} className="h-[500px] overflow-y-auto overflow-x-auto bg-gray-950 rounded-xl p-3 font-mono text-xs space-y-0.5">
                {logs.length === 0 && (
                    <p className="text-gray-500 text-center py-8">No logs yet.</p>
                )}
                {logs.map((log, i) => (
                    <div key={i} className="flex gap-2 leading-relaxed whitespace-nowrap">
                        <span className="text-gray-500 shrink-0">{new Date(log.ts).toLocaleTimeString()}</span>
                        <span className={`font-bold shrink-0 uppercase w-10 text-center ${levelColor(log.level)}`}>{log.level}</span>
                        <span className="text-gray-300 break-all whitespace-pre-wrap">{log.msg}</span>
                    </div>
                ))}
            </div>

            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-right">{logs.length} entries</p>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  18+ Manga Panel                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

function AdultMangaPanel() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [pages, setPages] = useState([]);
    const [currentPage, setCurrentPage] = useState(0);
    const [pageNum, setPageNum] = useState(1);
    const [total, setTotal] = useState(0);
    const [chLoading, setChLoading] = useState(false);
    const searchTimer = useRef(null);
    const LIMIT = 30;

    const getTitle = (m) => {
        const t = m.attributes?.title;
        if (!t) return "";
        return t.en || t["ja-ro"] || t.ja || Object.values(t)[0] || "";
    };

    const getCoverFileName = (m) => {
        const rel = (m.relationships || []).find((r) => r.type === "cover_art");
        return rel?.attributes?.fileName || "";
    };

    const getCover = (m) => {
        const fn = getCoverFileName(m);
        if (!fn) return "";
        return `/api/adult-manga/cover?url=${encodeURIComponent(`https://uploads.mangadex.org/covers/${m.id}/${fn}.256.jpg`)}`;
    };

    const doSearch = async (q) => {
        if (!q.trim()) return;
        setLoading(true);
        setPageNum(1);
        try {
            const res = await fetch(`/api/adult-manga/search?q=${encodeURIComponent(q)}&limit=${LIMIT}`);
            const data = await res.json();
            setResults(data?.data || []);
            setTotal(data?.total || 0);
        } catch {}
        setLoading(false);
    };

    const loadBrowse = async (p = 0) => {
        setLoading(true);
        const offset = p * LIMIT;
        try {
            const res = await fetch(`/api/adult-manga/browse?limit=${LIMIT}&offset=${offset}`);
            const data = await res.json();
            setResults(data?.data || []);
            setTotal(data?.total || 0);
            setPageNum(p + 1);
        } catch {}
        setLoading(false);
    };

    useEffect(() => { loadBrowse(0); }, []);

    const handleSearchChange = (val) => {
        setQuery(val);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            if (val.trim()) doSearch(val);
            else loadBrowse(0);
        }, 400);
    };

    const handleSelect = async (item) => {
        setSelected(item);
        setChapters([]);
        setPages([]);
        setCurrentPage(0);
        setChLoading(true);
        try {
            const res = await fetch(`/api/adult-manga/chapters/${item.id}?lang=en&limit=500&order=asc`);
            const data = await res.json();
            setChapters(data?.data || []);
        } catch {}
        setChLoading(false);
    };

    const handleReadChapter = async (chapterId) => {
        setPages([]);
        setCurrentPage(0);
        setLoading(true);
        try {
            const res = await fetch(`/api/adult-manga/chapter/${chapterId}`);
            const data = await res.json();
            const pageList = (data.pages || []).map((p) => `/api/adult-manga/page?url=${encodeURIComponent(p)}`);
            setPages(pageList);
        } catch {}
        setLoading(false);
    };

    const totalPages = Math.ceil(total / LIMIT);

    if (pages.length > 0) {
        return (
            <div>
                <button onClick={() => { setPages([]); setCurrentPage(0); }} className="mb-4 px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                    ← Back to chapters
                </button>
                <div className="flex flex-col items-center gap-4">
                    <img src={pages[currentPage]} alt={`Page ${currentPage + 1}`} className="max-h-[70vh] object-contain rounded-lg" />
                    <div className="flex items-center gap-3">
                        <button onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm disabled:opacity-30">Prev</button>
                        <span className="text-sm text-gray-500">{currentPage + 1} / {pages.length}</span>
                        <button onClick={() => setCurrentPage((p) => Math.min(pages.length - 1, p + 1))} disabled={currentPage >= pages.length - 1} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm disabled:opacity-30">Next</button>
                    </div>
                </div>
            </div>
        );
    }

    if (selected) {
        return (
            <div>
                <button onClick={() => { setSelected(null); setChapters([]); }} className="mb-4 px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                    ← Back to browse
                </button>
                <div className="flex gap-4 mb-6">
                    <img src={getCover(selected)} alt="" className="w-24 sm:w-32 aspect-[3/4] object-cover rounded-xl bg-gray-100 dark:bg-gray-800" />
                    <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg line-clamp-2">{getTitle(selected)}</h2>
                        <div className="flex flex-wrap gap-1 mt-2">
                            {(selected.attributes?.tags || []).slice(0, 8).map((t, i) => (
                                <span key={i} className="px-2 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 text-[10px] rounded-full">{t.attributes?.name?.en || ""}</span>
                            ))}
                        </div>
                    </div>
                </div>
                {chLoading ? (
                    <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" /></div>
                ) : chapters.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">No chapters available</p>
                ) : (
                    <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
                        {chapters.map((ch) => (
                            <button key={ch.id} onClick={() => handleReadChapter(ch.id)} disabled={loading} className="w-full text-left px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50 text-xs">
                                <span className="font-medium text-gray-900 dark:text-gray-100">Ch. {ch.attributes?.chapter || "?"}</span>
                                {ch.attributes?.title && <span className="text-gray-500 ml-2">— {ch.attributes.title}</span>}
                                <span className="float-right text-gray-400">{ch.attributes?.translatedLanguage?.toUpperCase()}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div>
            <input
                type="text"
                placeholder="Search uncensored manga..."
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-pink-400 mb-4"
            />
            {loading && results.length === 0 ? (
                <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" /></div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {results.map((item) => (
                        <button key={item.id} onClick={() => handleSelect(item)} className="group text-left">
                            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                                <img src={getCover(item)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                            </div>
                            <p className="mt-1.5 text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                                {getTitle(item)}
                            </p>
                        </button>
                    ))}
                </div>
            )}
            {results.length === 0 && !loading && (
                <p className="text-sm text-gray-400 text-center py-12">No results</p>
            )}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                    <button onClick={() => query ? doSearch(query) : loadBrowse(pageNum - 2)} disabled={pageNum <= 1} className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-lg disabled:opacity-30">Prev</button>
                    <span className="text-xs text-gray-500 px-2">Page {pageNum} / {totalPages}</span>
                    <button onClick={() => query ? doSearch(query) : loadBrowse(pageNum)} disabled={pageNum >= totalPages} className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-lg disabled:opacity-30">Next</button>
                </div>
            )}
        </div>
    );
}
