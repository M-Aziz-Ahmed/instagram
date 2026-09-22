"use client";

import { useState } from "react";
import { useToast } from "@/context/ToastContext";
import { useAdminData, PanelCard, Spinner, ErrBox, RefreshBtn, fmtDate } from "./power";

const COLORS = ["#1cb0f6", "#48c774", "#ff6b6b", "#f5a623", "#a55eea", "#2d3436", "#e056fd", "#00b894"];

const emptyForm = { title: "", body: "", link: "", color: "#1cb0f6", audience: "all", dismissible: true, active: true };

export default function AnnouncePanel() {
    const { showToast } = useToast();
    const { data, loading, error, reload } = useAdminData("/api/admin/announcements");
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState(null);

    const create = async () => {
        if (!form.title.trim()) { showToast("Title required", "error"); return; }
        setSaving(true);
        try {
            const res = await fetch("/api/admin/announcements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const json = await res.json();
            if (res.ok) { showToast("Announcement created", "success"); setForm(emptyForm); reload(); }
            else showToast(json.error || "Failed", "error");
        } catch { showToast("Network error", "error"); } finally { setSaving(false); }
    };

    const patch = async (id, body) => {
        setBusyId(id);
        try {
            const res = await fetch(`/api/admin/announcements/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (res.ok) showToast("Updated", "success");
            else showToast(json.error || "Failed", "error");
            reload();
        } catch { showToast("Network error", "error"); } finally { setBusyId(null); }
    };

    const remove = async (id) => {
        if (!confirm("Delete this announcement?")) return;
        try {
            await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
            showToast("Deleted", "success");
            reload();
        } catch { showToast("Network error", "error"); }
    };

    const broadcast = async (id) => {
        try {
            const res = await fetch(`/api/admin/announcements/${id}/broadcast`, { method: "POST" });
            const json = await res.json();
            if (res.ok) showToast(`Broadcast sent — web ${json.webOk}/${json.webTotal} · app ${json.fcmOk}/${json.fcmTotal}`, "success");
            else showToast(json.error || "Failed", "error");
        } catch { showToast("Network error", "error"); }
    };

    if (loading && !data) return <div className="flex justify-center py-16"><Spinner /></div>;
    if (error && !data) return <ErrBox error={error} onReload={reload} />;
    const items = data || [];

    return (
        <div className="space-y-6">
            <PanelCard title="New announcement" subtitle="Shown to users in the app banner, and can be pushed to everyone">
                <div className="space-y-3">
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200}
                        placeholder="Title *" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400" />
                    <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={2000} rows={2}
                        placeholder="Body (optional)" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 resize-none" />
                    <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} maxLength={500}
                        placeholder="Link (optional, /path or https://…)" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400" />
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex gap-1.5">
                            {COLORS.map((c) => (
                                <button key={c} onClick={() => setForm({ ...form, color: c })}
                                    className={`w-6 h-6 rounded-full border-2 transition-transform ${form.color === c ? "scale-110 border-gray-900 dark:border-gray-100" : "border-transparent"}`}
                                    style={{ backgroundColor: c }} aria-label={c} />
                            ))}
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                            Active now
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                            <input type="checkbox" checked={form.dismissible} onChange={(e) => setForm({ ...form, dismissible: e.target.checked })} />
                            Dismissible
                        </label>
                        <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}
                            className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none">
                            <option value="all">Everyone</option>
                            <option value="guests">Guests only</option>
                        </select>
                        <button onClick={create} disabled={saving}
                            className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold bg-black dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-80 disabled:opacity-50 transition-opacity">
                            {saving ? "Creating…" : "Create"}
                        </button>
                    </div>
                </div>
            </PanelCard>

            <PanelCard title={`Announcements (${items.length})`} subtitle="Active ones are served via /api/app/config" right={<RefreshBtn onClick={reload} />}>
                {items.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500">No announcements yet.</p>
                ) : (
                    <div className="space-y-2.5">
                        {items.map((a) => (
                            <div key={a.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3" style={{ borderLeft: `3px solid ${a.color || "#1cb0f6"}` }}>
                                <div className="flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{a.title}</span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${a.active ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"}`}>{a.active ? "ACTIVE" : "INACTIVE"}</span>
                                        </div>
                                        {a.body && <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{a.body}</p>}
                                        {a.link && <p className="text-[11px] text-blue-500 mt-0.5">{a.link}</p>}
                                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                                            {fmtDate(a.createdAt)}{a.pushedAt ? ` · pushed ${fmtDate(a.pushedAt)}` : ""} · audience: {a.audience}
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-1.5 shrink-0">
                                        <button onClick={() => patch(a.id, { active: !a.active })} disabled={busyId === a.id}
                                            className="text-xs font-semibold text-blue-500 hover:text-blue-600 disabled:opacity-50">
                                            {a.active ? "Deactivate" : "Activate"}
                                        </button>
                                        <button onClick={() => broadcast(a.id)} className="text-xs font-semibold text-purple-500 hover:text-purple-600">Push notify</button>
                                        <button onClick={() => remove(a.id)} className="text-xs font-semibold text-red-500 hover:text-red-600 text-left">Delete</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </PanelCard>
        </div>
    );
}