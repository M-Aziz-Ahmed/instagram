"use client";

import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/context/ToastContext";
import { useAdminData, PanelCard, Spinner, ErrBox, RefreshBtn } from "./power";

function Toggle({ checked, onChange }) {
    return (
        <button onClick={() => onChange(!checked)} aria-pressed={checked}
            className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
        </button>
    );
}

export default function SettingsPanel() {
    const { showToast } = useToast();
    const { data, loading, error, reload } = useAdminData("/api/admin/settings");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState("");

    const save = async (next) => {
        if (!data) return;
        setSaving(true);
        try {
            const res = await fetch("/api/admin/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(next),
            });
            const json = await res.json();
            if (res.ok) { showToast("Settings saved", "success"); reload(); }
            else showToast(json.error || "Failed", "error");
        } catch { showToast("Network error", "error"); } finally { setSaving(false); }
    };

    if (loading && !data) return <div className="flex justify-center py-16"><Spinner /></div>;
    if (error && !data) return <ErrBox error={error} onReload={reload} />;
    if (!data) return null;

    const toggleSignup = () => save({ signupsOpen: !data.signupsOpen });
    const toggleMaintenance = () => save({ "maintenance.active": !data.maintenance.active });
    const saveMessage = () => save({ "maintenance.message": msg });

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Full Settings page</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Account, privacy, broadcast, data and system controls.</p>
                </div>
                <Link href="/admin/settings" className="shrink-0 text-xs font-semibold text-blue-500 hover:text-blue-600 inline-flex items-center gap-0.5">
                    Open full page &rarr;
                </Link>
            </div>

            <PanelCard title="Signups" subtitle="Control whether new accounts can be created" right={<RefreshBtn onClick={reload} />}>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Allow new signups</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {data.signupsOpen
                                ? "Anyone with a valid email can create an account — enforced at OTP verification."
                                : "New signups blocked (your admin email still works). Existing users are unaffected."}
                        </p>
                    </div>
                    <Toggle checked={data.signupsOpen} onChange={toggleSignup} />
                </div>
            </PanelCard>

            <PanelCard title="Maintenance mode" subtitle="Full-screen notice shown to everyone except the admin area">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Maintenance active</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">You can still reach /admin while it is on.</p>
                    </div>
                    <Toggle checked={data.maintenance.active} onChange={toggleMaintenance} />
                </div>
                <div className="flex gap-2">
                    <input value={msg} maxLength={300}
                        onChange={(e) => setMsg(e.target.value)}
                        placeholder={data.maintenance.message || "Message shown to users (e.g. 'Back soon — fixing things!')"}
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400"
                    />
                    <button onClick={saveMessage} disabled={saving}
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-black dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-80 disabled:opacity-50 transition-opacity shrink-0">
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                    Currently saved: <span className="text-gray-600 dark:text-gray-300">{data.maintenance.message || "—"}</span>
                </p>
            </PanelCard>

            <PanelCard title="Feature flags" subtitle="More toggles land here as they ship">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    No other flags exist yet. The <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">signupsOpen</code> and <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">maintenance</code> flags above are wired end-to-end now.
                </p>
            </PanelCard>
        </div>
    );
}