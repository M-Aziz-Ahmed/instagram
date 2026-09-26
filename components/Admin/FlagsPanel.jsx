"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/context/ToastContext";

// Server-enforced kill switches.
//
// Every toggle here is checked on the server, not hidden in the UI. That is the
// point: flipping "Posting" off does not just grey out the button, it makes
// POST /api/posts answer 503, so a stale tab or a direct API call is refused
// too. A switch that only lives in the frontend is not a switch.
//
// Maintenance mode blocks writes across the whole API. Reads keep working so
// the app still renders and can show the message, and /api/admin plus /api/auth
// stay exempt - otherwise the switch would be a one-way door with no way to
// undo it from the UI that turned it on.
const FLAGS = [
    {
        id: "maintenance",
        label: "Maintenance mode",
        hint: "Blocks all writes app-wide. Reads keep working. Admin and login stay reachable so you can turn this off.",
        danger: true,
    },
    {
        id: "signupsOpen",
        label: "Allow new signups",
        hint: "Off closes registration. Existing accounts are unaffected.",
    },
    {
        id: "posting",
        label: "Creating posts",
        hint: "Off returns 503 on new posts and reposts.",
        danger: true,
    },
    { id: "uploads", label: "Media uploads", hint: "Off blocks image and video uploads.", danger: true },
    { id: "comments", label: "Comments", hint: "Off blocks posting, liking and reacting to comments.", danger: true },
    { id: "dms", label: "Direct messages", hint: "Off blocks sending new messages.", danger: true },
    { id: "liveStreams", label: "Live streams", hint: "Off blocks starting or ending a stream.", danger: true },
    { id: "voiceChat", label: "Voice chat", hint: "Off blocks joining voice channels.", danger: true },
];

export default function FlagsPanel() {
    const { showToast } = useToast();
    const [flags, setFlags] = useState(null);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState("");
    const [confirmMaintenance, setConfirmMaintenance] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/flags", { cache: "no-store" });
            if (res.ok) {
                const d = await res.json();
                setFlags(d.flags || {});
                setMessage(d.flags?.maintenanceMessage || "");
            }
        } catch {
            showToast("Could not load flags", "error");
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        load();
    }, [load]);

    const save = async (patch) => {
        setSaving("saving");
        try {
            const res = await fetch("/api/admin/flags", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                showToast(d.error || "Failed to save", "error");
                return;
            }
            setFlags(d.flags || {});
            showToast("Saved", "success");
        } catch {
            showToast("Network error", "error");
        } finally {
            setSaving("");
        }
    };

    const toggle = (flag) => {
        const next = !flags?.[flag];
        // Maintenance takes the whole site down for writes, so it gets an
        // explicit confirmation rather than being one stray click away.
        if (flag === "maintenance" && next) {
            setConfirmMaintenance(true);
            return;
        }
        save({ [flag]: next });
    };

    if (loading) return <p className="text-sm text-gray-500">Loading flags…</p>;
    if (!flags) return <p className="text-sm text-gray-500">Flags unavailable.</p>;

    return (
        <div className="space-y-4">
            {flags.maintenance && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                        Maintenance mode is active
                    </p>
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        All writes are being refused. Login and admin still work, so you can
                        turn this off below.
                    </p>
                </div>
            )}

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] divide-y divide-[var(--border-subtle)]">
                {FLAGS.map((f) => (
                    <div key={f.id} className="flex items-start justify-between gap-4 px-4 py-3.5">
                        <div className="min-w-0">
                            <p
                                className={`text-sm font-semibold ${
                                    flags[f.id]
                                        ? "text-gray-900 dark:text-gray-100"
                                        : "text-gray-500 dark:text-gray-400"
                                }`}
                            >
                                {f.label}
                            </p>
                            <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                                {f.hint}
                            </p>
                        </div>
                        <button
                            onClick={() => toggle(f.id)}
                            disabled={!!saving}
                            aria-pressed={!!flags[f.id]}
                            aria-label={`${f.label}: ${flags[f.id] ? "on" : "off"}`}
                            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
                                flags[f.id]
                                    ? f.danger
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                    : "bg-gray-300 dark:bg-gray-700"
                            }`}
                        >
                            <span
                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                                    flags[f.id] ? "translate-x-[22px]" : "translate-x-0.5"
                                }`}
                            />
                        </button>
                    </div>
                ))}
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                    Maintenance message
                </p>
                <div className="flex gap-2">
                    <input
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={300}
                        placeholder="We'll be right back — scheduled maintenance."
                        className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-amber-500 transition-colors"
                    />
                    <button
                        onClick={() => save({ maintenance: { message } })}
                        disabled={!!saving}
                        className="px-4 py-2 text-sm font-semibold rounded-xl bg-black dark:bg-gray-100 text-white dark:text-gray-900 disabled:opacity-50"
                    >
                        Save
                    </button>
                </div>
                <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                    Shown to users while maintenance is active.
                </p>
            </div>

            {confirmMaintenance && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-5 space-y-4">
                        <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">
                            Turn on maintenance mode?
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Every write across the app will start returning{" "}
                            <code className="text-xs">503</code> — posts, comments, messages,
                            uploads, streams. Reading and logging in keep working, and you can
                            still reach this panel to turn it back off.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setConfirmMaintenance(false)}
                                className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setConfirmMaintenance(false);
                                    save({ maintenance: true });
                                }}
                                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-amber-600 text-white hover:bg-amber-700"
                            >
                                Turn on
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
