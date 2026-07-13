"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import UserBadges from "@/components/shared/UserBadges";
import Link from "next/link";
import { useRouter } from "next/navigation";

const EMOJI_PRESETS = ["⭐","🛡️","👑","💎","🔥","🎯","🏆","🎨","🧪","🤖","💡","🌟"];

export default function AdminClient() {
    const { user: me, ready } = useUser();
    const router = useRouter();
    const [tab, setTab] = useState("users");

    useEffect(() => {
        if (ready && (!me || !me.isAdmin)) router.replace("/");
    }, [me, ready, router]);

    if (!ready || !me) {
        return <div className="flex h-dvh items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        </div>;
    }

    if (!me.isAdmin) return null;

    return (
        <div className="min-h-dvh bg-gray-50">
            <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
                <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
                    <Link href="/" className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </Link>
                    <span className="font-bold text-base text-gray-900">Admin Dashboard</span>
                </div>
            </header>

            <div className="max-w-5xl mx-auto px-4 py-6">
                <div className="flex gap-1 mb-6 bg-white rounded-xl border border-gray-200 p-1 w-fit">
                    <button onClick={() => setTab("users")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "users" ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                        Users
                    </button>
                    <button onClick={() => setTab("roles")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "roles" ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                        Roles
                    </button>
                </div>

                {tab === "users" ? <UsersPanel /> : <RolesPanel />}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Users Panel                                                               */
/* ═══════════════════════════════════════════════════════════════════════════ */

function UsersPanel() {
    const [users, setUsers]       = useState([]);
    const [roles, setRoles]       = useState([]);
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState("");
    const [editing, setEditing]   = useState(null);
    const [saving, setSaving]     = useState(false);

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
        } catch (e) { console.error(e); refresh(); }
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
        } catch (e) { console.error(e); refresh(); }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200">
            <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search users…"
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-black transition-colors" />
                <span className="text-xs text-gray-400 whitespace-nowrap">{filtered.length} user{filtered.length !== 1 && "s"}</span>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                </div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {filtered.map((u) => (
                        <div key={u.id} className="relative px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                            {/* Avatar */}
                            {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt={u.username} className="w-10 h-10 rounded-full object-cover shrink-0" />
                            ) : (
                                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                                    style={{ backgroundColor: u.avatarColor }}>
                                    {u.username?.[0]?.toUpperCase() ?? "?"}
                                </div>
                            )}

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-sm text-gray-900 truncate">{u.username || "(no username)"}</span>
                                    <UserBadges isVerified={u.isVerified} roles={u.roles} />
                                </div>
                                <p className="text-xs text-gray-400 truncate">{u.email}</p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                {/* Verified toggle */}
                                <button onClick={() => toggleField(u.id, "isVerified", !u.isVerified)}
                                    title={u.isVerified ? "Remove verified" : "Give verified"}
                                    className={`p-1.5 rounded-lg transition-colors ${u.isVerified ? "text-blue-500 bg-blue-50 hover:bg-blue-100" : "text-gray-400 hover:bg-gray-100"}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0 1 12 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 0 1 3.498 1.307 4.491 4.491 0 0 1 1.307 3.497A4.49 4.49 0 0 1 21.75 12a4.49 4.49 0 0 1-1.549 3.397 4.491 4.491 0 0 1-1.307 3.497 4.491 4.491 0 0 1-3.497 1.307A4.49 4.49 0 0 1 12 21.75a4.49 4.49 0 0 1-3.397-1.549 4.49 4.49 0 0 1-3.498-1.306 4.491 4.491 0 0 1-1.307-3.498A4.49 4.49 0 0 1 2.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 0 1 1.307-3.497 4.49 4.49 0 0 1 3.497-1.307Zm7.007 6.387a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                                    </svg>
                                </button>

                                {/* Admin toggle */}
                                <button onClick={() => toggleField(u.id, "isAdmin", !u.isAdmin)}
                                    title={u.isAdmin ? "Remove admin" : "Make admin"}
                                    className={`p-1.5 rounded-lg transition-colors ${u.isAdmin ? "text-amber-500 bg-amber-50 hover:bg-amber-100" : "text-gray-400 hover:bg-gray-100"}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                                    </svg>
                                </button>

                                {/* Edit roles */}
                                <button onClick={() => setEditing(editing === u.id ? null : u.id)}
                                    title="Manage roles"
                                    className={`p-1.5 rounded-lg transition-colors ${editing === u.id ? "text-purple-500 bg-purple-50 hover:bg-purple-100" : "text-gray-400 hover:bg-gray-100"}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                    </svg>
                                </button>
                            </div>

                            {/* Role picker dropdown */}
                            {editing === u.id && (
                                <div onClick={(e) => e.stopPropagation()} className="absolute right-4 top-full z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-56">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Assign roles</p>
                                    {roles.length === 0 ? (
                                        <p className="text-xs text-gray-400">No roles created yet.</p>
                                    ) : (
                                        <div className="flex flex-col gap-1">
                                            {roles.map((r) => {
                                                const has = u.roles.some((ur) => ur.id === r.id);
                                                return (
                                                    <button key={r.id} onClick={() => handleRole(u.id, r.id, !has)}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${has ? "bg-gray-100 font-semibold" : "hover:bg-gray-50"}`}>
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
        } catch {
            setError("Failed to create role.");
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
        } catch (e) { console.error(e); }
    };

    return (
        <div className="space-y-4">
            {/* Create form */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="font-bold text-sm text-gray-900 mb-4">Create new role</h2>
                <form onSubmit={handleCreate} className="flex flex-col gap-4">
                    {/* Badge emoji picker */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Badge icon</label>
                        <div className="flex gap-1.5 flex-wrap">
                            {EMOJI_PRESETS.map((e) => (
                                <button key={e} type="button" onClick={() => setBadge(e)}
                                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${badge === e ? "bg-black text-white scale-110" : "bg-gray-100 hover:bg-gray-200"}`}>
                                    {e}
                                </button>
                            ))}
                            <input value={badge} onChange={(e) => setBadge(e.target.value.slice(0, 2))}
                                placeholder="?" maxLength={2}
                                className="w-9 h-9 rounded-lg border border-gray-200 text-center text-lg outline-none focus:border-black transition-colors" />
                        </div>
                    </div>

                    <div className="flex gap-3">
                        {/* Name */}
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Name</label>
                            <input value={name} onChange={(e) => { setName(e.target.value); setError(""); }}
                                placeholder="e.g. Moderator"
                                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-black transition-colors" />
                        </div>

                        {/* Color */}
                        <div className="w-28">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Color</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                                    className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                                <input value={color} onChange={(e) => setColor(e.target.value)}
                                    className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-xs font-mono outline-none focus:border-black transition-colors" />
                            </div>
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">Preview:</span>
                        <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-white text-xs font-bold select-none"
                            style={{ backgroundColor: color }}>
                            {badge} {name || "Role"}
                        </span>
                    </div>

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <button type="submit" disabled={!name.trim() || creating}
                        className="bg-black text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-40 hover:bg-gray-800 transition-colors w-fit">
                        {creating ? "Creating…" : "Create role"}
                    </button>
                </form>
            </div>

            {/* Roles list */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Existing roles</span>
                    <span className="text-xs text-gray-400">{roles.length}</span>
                </div>

                {loading ? (
                    <div className="flex justify-center py-8">
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    </div>
                ) : roles.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400">No roles yet. Create one above.</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {roles.map((r) => (
                            <div key={r.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                                <span className="w-9 h-9 rounded-lg flex items-center justify-center text-lg text-white font-bold"
                                    style={{ backgroundColor: r.color }}>
                                    {r.badge}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm text-gray-900">{r.name}</p>
                                    <p className="text-xs text-gray-400 font-mono">{r.color}</p>
                                </div>
                                <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-white text-xs font-bold"
                                    style={{ backgroundColor: r.color }}>
                                    {r.badge} {r.name}
                                </span>
                                <button onClick={() => handleDelete(r.id)}
                                    title="Delete role"
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
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
