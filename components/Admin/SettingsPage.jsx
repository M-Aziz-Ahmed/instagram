"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useToast } from "@/context/ToastContext";
import { useAdminData, Spinner, fmtBytes } from "./power";

const MB = fmtBytes;

function Toggle({ checked, onChange }) {
    return (
        <button onClick={() => onChange(!checked)} aria-pressed={checked}
            className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
        </button>
    );
}

function Section({ icon, title, subtitle, children, right }) {
    return (
        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span className="text-xl leading-none mt-0.5">{icon}</span>
                    <div>
                        <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{title}</h3>
                        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
                    </div>
                </div>
                {right}
            </div>
            <div className="px-4 sm:px-5 py-4">{children}</div>
        </section>
    );
}

function Row({ children }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
            {children}
        </div>
    );
}

function Info({ title, sub }) {
    return (
        <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
            {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
        </div>
    );
}

function GoLink({ href, label }) {
    return (
        <Link href={href} className="shrink-0 text-xs font-semibold text-blue-500 hover:text-blue-600 inline-flex items-center gap-0.5">
            {label} &rarr;
        </Link>
    );
}

export default function SettingsPage() {
    const { showToast } = useToast();
    const system = useAdminData("/api/admin/system", { refresh: 30000 });
    const settings = useAdminData("/api/admin/settings");
    const reports = useAdminData("/api/admin/reports/stats");
    const invites = useAdminData("/api/admin/invites");
    const audit = useAdminData("/api/admin/audit?days=14");

    const [maintMsg, setMaintMsg] = useState("");
    const [annTitle, setAnnTitle] = useState("");
    const [annPush, setAnnPush] = useState(false);
    const [saving, setSaving] = useState(false);
    const [busy, setBusy] = useState(null);

    const patchSettings = useCallback(async (body) => {
        setSaving(true);
        try {
            const res = await fetch("/api/admin/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (res.ok) { showToast("Saved", "success"); settings.reload(); }
            else showToast(json.error || "Failed", "error");
        } catch { showToast("Network error", "error"); } finally { setSaving(false); }
    }, [settings, showToast]);

    const createAnnouncement = useCallback(async () => {
        if (!annTitle.trim()) { showToast("Title required", "error"); return; }
        setBusy("announce");
        try {
            const res = await fetch("/api/admin/announcements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: annTitle.trim(), body: "", link: "", color: "#1cb0f6", audience: "all", dismissible: true, active: true }),
            });
            const json = await res.json();
            if (res.ok) {
                if (annPush) {
                    try {
                        const b = await fetch(`/api/admin/announcements/${json._id}/broadcast`, { method: "POST" });
                        const bj = await b.json();
                        showToast(`Announcement created + pushed (web ${bj.webOk}/${bj.webTotal} · app ${bj.fcmOk}/${bj.fcmTotal})`, "success");
                    } catch { showToast("Announcement created (push failed)", "success"); }
                } else {
                    showToast("Announcement created", "success");
                }
                setAnnTitle("");
                setAnnPush(false);
            } else {
                showToast(json.error || "Failed", "error");
            }
        } catch { showToast("Network error", "error"); } finally { setBusy(null); }
    }, [annTitle, annPush, showToast]);

    const pingOrRestart = async (path) => {
        setBusy(path);
        try {
            const res = await fetch(path, { method: "POST" });
            const json = await res.json();
            if (res.ok) showToast(json.message || json.note || "OK", "success");
            else showToast(json.error || "Failed", "error");
            system.reload();
        } catch { showToast("Network error", "error"); } finally { setBusy(null); }
    };

    const s = settings.data;
    const sys = system.data;
    const loading = settings.loading && !settings.data && system.loading && !system.data;
    if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Site-wide account, privacy, broadcast, data and system controls.</p>
            </div>

            {/* Account */}
            <Section icon="👤" title="Account" subtitle="Signups, invite codes and account pool">
                <Row>
                    <Info title="Allow new signups" sub={s?.signupsOpen ? "Anyone with a valid email can register — enforced at OTP verification." : "New signups blocked; your admin email still bypasses the gate."} />
                    <Toggle checked={!!s?.signupsOpen} onChange={(v) => patchSettings({ signupsOpen: v })} />
                </Row>
                <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />
                <Row>
                    <Info title="Invite codes" sub={invites.data ? `${invites.data.stats.withCodes} codes held · ${invites.data.stats.codesUsed} codes used · ${invites.data.list.length} issued` : "Loading invite stats…"} />
                    <GoLink href="/admin/manage" label="Manage invites" />
                </Row>
                <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />
                <Row>
                    <Info title="Registered users" sub={sys != null ? `${sys.counts.users} users · ${sys.counts.posts} posts · ${sys.counts.events24h} events in 24h` : "Loading totals…"} />
                    <GoLink href="/admin" label="Dashboard" />
                </Row>
            </Section>

            {/* Privacy & Safety */}
            <Section icon="🛡" title="Privacy & Safety" subtitle="Reports queue, moderation and removal pipeline">
                <Row>
                    <Info title="Open reports" sub={reports.data ? `${reports.data.open} open · ${reports.data.resolved} resolved · ${reports.data.dismissed} dismissed` : "Loading…"} />
                    <GoLink href="/admin/manage" label="Reports inbox" />
                </Row>
                <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />
                <Row>
                    <Info title="Content filter" sub="Flagged words / patched content moderation in the Manage panel" />
                    <GoLink href="/admin/manage" label="Content filter" />
                </Row>
                <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />
                <Row>
                    <Info title="Community moderation" sub="Take-downs and restores logged to the audit trail" />
                    <GoLink href="/admin/manage" label="Moderation" />
                </Row>
            </Section>

            {/* Notifications & Broadcast */}
            <Section icon="📢" title="Notifications & Broadcast" subtitle="Announcements shown in the app banner and pushed to every device">
                <Row>
                    <Info title="Active announcements" sub="Shown to users on load via /api/app/config" />
                    <GoLink href="/admin/manage" label="Announce tab" />
                </Row>
                <div className="pt-3">
                    <div className="flex flex-wrap gap-2 items-center">
                        <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} maxLength={200}
                            placeholder="New announcement title"
                            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400" />
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                            <input type="checkbox" checked={annPush} onChange={(e) => setAnnPush(e.target.checked)} />
                            Push to everyone
                        </label>
                        <button onClick={createAnnouncement} disabled={busy === "announce"}
                            className="px-4 py-2 rounded-lg text-sm font-semibold bg-black dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-80 disabled:opacity-50 transition-opacity">
                            {busy === "announce" ? "Creating…" : "Create"}
                        </button>
                    </div>
                </div>
            </Section>

            {/* Data & Exports */}
            <Section icon="📦" title="Data & Exports" subtitle="Raw CSV dumps downloaded from the live server">
                <div className="grid sm:grid-cols-2 gap-3 pt-1">
                    {[
                        ["users", "👥", "Users", "Emails, invites, flags (full dump)"],
                        ["posts", "💬", "Posts", "Latest 2,000 posts"],
                        ["events", "📈", "Analytics events", "Latest 5,000 events"],
                        ["growth", "📅", "Daily growth", "Users / posts / events per day (90d)"],
                        ["locations", "📍", "Locations", "Country + city tallies (30d)"],
                    ].map(([key, icon, label, desc]) => (
                        <div key={key} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
                            <span className="text-lg">{icon}</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">{desc}</p>
                            </div>
                            <a href={`/api/admin/exports/${key}`} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-black dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-80 transition-opacity shrink-0">
                                Download
                            </a>
                        </div>
                    ))}
                </div>
            </Section>

            {/* Security & Audit */}
            <Section icon="🔐" title="Security & Audit" subtitle="Failed logins, frequent IPs and the access audit trail">
                <Row>
                    <Info title="Failed logins (14 days)" sub={audit.data != null ? `${audit.data.failed} blocked attempts tracked` : "Loading…"} />
                    <GoLink href="/admin/manage" label="Full audit" />
                </Row>
            </Section>

            {/* System & Maintenance */}
            <Section icon="⚙️" title="System & Maintenance" subtitle="Health, flags and the danger zone (admins can always reach /admin)">
                <Row>
                    <Info title="Maintenance mode" sub="Full-screen notice for everyone except the admin area" />
                    <Toggle checked={!!(s && s.maintenance.active)} onChange={(v) => patchSettings({ ["maintenance.active"]: v })} />
                </Row>
                <div className="pt-3 flex gap-2">
                    <input value={maintMsg} onChange={(e) => setMaintMsg(e.target.value)} maxLength={300}
                        placeholder={s?.maintenance?.message || "Maintenance message shown to users"}
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400" />
                    <button onClick={() => patchSettings({ ["maintenance.message"]: maintMsg })} disabled={saving || !maintMsg.trim()}
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-black dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-80 disabled:opacity-50 transition-opacity shrink-0">
                        {saving ? "Saving…" : "Save message"}
                    </button>
                </div>
                {s?.maintenance.message && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">Currently saved: <span className="text-gray-600 dark:text-gray-300">{s.maintenance.message}</span></p>
                )}
                <div className="h-px bg-gray-100 dark:bg-gray-800 my-3" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">Uptime</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{sys?.uptime ? `${Math.floor(sys.uptime / 3600)}h ${Math.floor((sys.uptime % 3600) / 60)}m` : "…"}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">MongoDB</p>
                        <p className={`text-sm font-bold ${sys?.mongo?.state === "connected" ? "text-green-500" : "text-red-500"}`}>{sys?.mongo?.state ?? "…"}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">DB latency</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{sys?.mongo?.latency != null ? `${sys.mongo.latency}ms` : "…"}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">Heap (RSS)</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{sys ? `${MB(sys.memory.heapUsed)} / ${MB(sys.memory.heapTotal)}` : "…"}</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={() => pingOrRestart("/api/admin/system/ping")} disabled={busy}
                        className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
                        {busy === "/api/admin/system/ping" ? "Pinging…" : "Ping DB"}
                    </button>
                    <button onClick={() => { if (confirm("Restart the server? ~30s downtime.")) pingOrRestart("/api/admin/system/restart"); }} disabled={busy}
                        className="px-4 py-2 rounded-lg text-sm font-semibold border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors">
                        {busy === "/api/admin/system/restart" ? "Restarting…" : "Restart server"}
                    </button>
                    <GoLink href="/admin/manage" label="Full system panel" />
                </div>
            </Section>
        </div>
    );
}